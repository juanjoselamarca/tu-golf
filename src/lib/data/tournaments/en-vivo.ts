// src/lib/data/tournaments/en-vivo.ts
//
// Datos del leaderboard EN VIVO de un torneo (`/torneo/[slug]/en-vivo`). FUENTE
// ÚNICA: la usan el server component (render inicial, con la sesión de quien mira)
// y la ruta pública cacheable `/api/torneo/[slug]/live` (polling de los
// espectadores; reemplazo de Supabase Realtime, incidente Los Leones 04-oct-2026).
//
// Sólo orquesta lecturas y delega TODO el cálculo al motor (`src/golf/`) y lo que
// ve cada visor a la regla canónica de #509 (`vista-publica.ts`), la misma que
// /torneo/[slug]:
//  - camino de RONDA LIBRE (grupos con ronda_libre_id): `boardPublicoRondaLibre` con
//    la `vistaPublica` del visor (sin sesión: nada neto; torneo neto: sólo bruto);
//  - torneos LEGACY: `buildLeaderboardFromLegacy`, completos para cualquier visor
//    (decisión de producto 2 de #509: quedan como están).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LivePlayer, LiveTournament, LiveFormat, LiveMode, LiveTeam } from '@/app/torneo/[slug]/en-vivo/types'
import type { Player } from '@/lib/golf-data'
import type { LeerIndicesDePerfil } from '@/lib/data/indices-de-perfil-lectura'
import { boardPublicoRondaLibre, vistaPublica, type VistaPublica } from './vista-publica'
import { normalizeStatus } from '@/app/torneo/[slug]/en-vivo/normalize-status'
import { scrambleResultsToLiveTeams, bestBallResultsToLiveTeams } from '@/app/torneo/[slug]/en-vivo/scrambleTeamsToLive'
import { torneoEnVivo } from '@/golf/tournament-live-status'
import { fetchScrambleTeams, fetchBestBallTeams } from './teamLeaderboard'
import { computeScrambleStandings, computeFoursomeStandings, computeBestBallStandings } from '@/golf/leaderboard/team-standings'
import { buildLeaderboardFromLegacy } from '@/golf/leaderboard/build-from-legacy'
import type { TournamentLeaderboardContext } from '@/golf/leaderboard/types'
import {
  fetchCourseHoles, fetchLegacyHcpContext, fetchLegacyPlayers, fetchRondaLibreJugadoresConCourseHcp, fetchRoundContexts, type Client,
} from './leaderboard'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { parDeLaRondaDelTorneo } from '@/golf/core/course-handicap'
import { captureError } from '@/lib/error-tracking'

const VALID_FORMATS: LiveFormat[] = ['stroke_play', 'stableford', 'best_ball', 'scramble', 'match_play', 'foursome']

function normalizeFormat(raw: unknown): LiveFormat {
  if (typeof raw === 'string' && (VALID_FORMATS as string[]).includes(raw)) return raw as LiveFormat
  return 'stroke_play'
}

function normalizeModo(raw: unknown): LiveMode {
  if (raw === 'neto' || raw === 'gross') return raw
  return 'gross'
}

/** Fila del torneo que necesita la vista en vivo (un solo round-trip con cancha, categorías y grupos). */
export interface TorneoEnVivoRow {
  id: string
  slug: string
  name: string
  format: string | null
  formato_juego: string | null
  modo_juego: string | null
  hole_count: number | null
  total_rounds: number | null
  status: string | null
  date_start: string | null
  date_end: string | null
  course_id: string | null
  tees: string | null
  hcp_calc_mode: string | null
  courses: { nombre: string | null; par_total: number | null } | null
  categories: Array<{ id: string; name: string }> | null
  tournament_groups: Array<{ id: string; name: string; ronda_libre_id: string | null; tournament_group_players: Array<{ player_id: string }> | null }> | null
}

const TORNEO_EN_VIVO_SELECT =
  'id, slug, name, format, formato_juego, modo_juego, hole_count, total_rounds, status, date_start, date_end, course_id, tees, hcp_calc_mode, ' +
  'courses(nombre, par_total), categories(id, name), tournament_groups(id, name, ronda_libre_id, tournament_group_players(player_id))'

/**
 * El torneo por slug. `null` = no existe (o, con el cliente anónimo, no es
 * público: RLS sólo muestra open/in_progress/closed/published). Un error de la
 * base se PROPAGA: "no pude preguntar" no es "no existe".
 */
export async function fetchTorneoEnVivoRow(supabase: Pick<SupabaseClient, 'from'>, slug: string): Promise<TorneoEnVivoRow | null> {
  const { data, error } = await supabase.from('tournaments').select(TORNEO_EN_VIVO_SELECT).eq('slug', slug).maybeSingle()
  if (error) throw error
  return (data as unknown as TorneoEnVivoRow | null) ?? null
}

export type JugadorEnVivo = LivePlayer & { group_id?: string | null; category_id?: string | null }

/** Todo lo que muestra la vista en vivo. Sólo derivados: ni course handicap ni índice de perfil. */
export interface TorneoEnVivo {
  /**
   * `vista`: qué puede ver el visor para el que se armó (regla canónica `vistaPublica`):
   * `modo`/`format` ya son los de la vista (en la bruta, gross); `modoReal` es la
   * modalidad del torneo. `caminoRondaLibre`: la respuesta pública oculta cosas
   * (sin sesión, nada neto), así que un visor con sesión pide la privada (`/neto`).
   */
  tournament: LiveTournament & { vista: VistaPublica; modoReal: LiveMode; caminoRondaLibre: boolean }
  players: JugadorEnVivo[]
  teams: LiveTeam[]
  /** La tabla de equipos no se pudo armar (se reportó): la vista lo dice, nunca un 0 silencioso. */
  equiposNoDisponibles?: boolean
  categories: Array<{ id: string; name: string }>
  groups: Array<{ id: string; name: string }>
}

/**
 * Fila del board (`Player` del motor, ya filtrada por `filaPublica` si corresponde)
 * proyectada a la vista en vivo. Lo que el visor no puede ver ni existe como clave
 * (sin centinelas): `hcp`/`hcpDisplay` null → sin `handicap_index`; sin `netTotal`
 * o `stablefordTotal` → sin `net_total`/`points_total`.
 */
function filaEnVivo(p: Player, meta: { categoryId?: string | null; categoryName?: string; groupId?: string | null }): JugadorEnVivo {
  const hcp = p.hcpDisplay ?? p.hcp
  return {
    id: p.id ?? '',
    name: p.name,
    category_name: meta.categoryName,
    scores_per_hole: p.scores.map((x) => x ?? 0),
    gross_total: p.grossTotal ?? 0,
    // Columna "HCP": el índice de INSCRIPCIÓN (`hcpDisplay`), no el de scoring.
    ...(hcp != null ? { handicap_index: hcp } : {}),
    ...(p.netTotal !== undefined ? { net_total: p.netTotal } : {}),
    ...(p.stablefordTotal !== undefined ? { points_total: p.stablefordTotal } : {}),
    vs_par: p.total,
    thru: p.holes,
    group_id: meta.groupId ?? null,
    category_id: meta.categoryId ?? null,
  }
}

/**
 * Arma el leaderboard en vivo del torneo `row` para un visor `visorConSesion`.
 *
 * `leerIndices` (canónica de #509, `LeerIndicesDePerfil`): el índice de los
 * jugadores con cuenta que no lo fijaron en su tarjeta. Las pantallas públicas
 * inyectan `indicesDePerfil` (servicio, server-only): sólo entra al cálculo.
 */
export async function armarTorneoEnVivo(
  supabase: Client,
  row: TorneoEnVivoRow,
  opciones: { visorConSesion: boolean; leerIndices: LeerIndicesDePerfil },
): Promise<TorneoEnVivo> {
  const holeCount = row.hole_count ?? 18
  const modoReal = normalizeModo(row.modo_juego)
  // Formato canónico: `formato_juego` (nuevo) y si no, `format` legacy.
  const formatoReal = normalizeFormat(row.formato_juego ?? row.format ?? 'stroke_play')
  const grupos = row.tournament_groups ?? []
  const caminoRondaLibre = grupos.some((g) => g.ronda_libre_id != null)
  // Qué puede ver este visor (regla canónica). Legacy: completo (decisión 2 de #509).
  const vista = vistaPublica({
    visorConSesion: opciones.visorConSesion,
    caminoRondaLibre,
    modoJuego: modoReal as ModoJuego,
    formatoJuego: formatoReal as FormatoJuego,
  })

  // El par de la ronda sale del catálogo y lo necesitan las tres ramas (board
  // individual, equipos y cabecera): una sola respuesta para la misma pregunta.
  const individualHoles = row.course_id ? await fetchCourseHoles(supabase, row.course_id) : []
  const parTotal = parDeLaRondaDelTorneo(individualHoles, holeCount, row.courses?.par_total)
  const boardHoles = hoyosDeLaVuelta(individualHoles, holeCount)
  const ctx: TournamentLeaderboardContext = {
    parTotal,
    totalHoyos: holeCount,
    modoJuego: modoReal as ModoJuego,
    formatoJuego: formatoReal as FormatoJuego,
    courseHoles: boardHoles,
  }

  let players: JugadorEnVivo[]
  if (caminoRondaLibre) {
    // MISMA cadena que /torneo/[slug] (camino de ronda libre).
    const rondaIds = grupos.map((g) => g.ronda_libre_id).filter(Boolean) as string[]
    const grupoPorRonda = new Map(grupos.filter((g) => g.ronda_libre_id).map((g) => [g.ronda_libre_id as string, g.id]))
    const jugadores = await fetchRondaLibreJugadoresConCourseHcp(supabase, rondaIds, parTotal, opciones.leerIndices)
    const rondaDeJugador = new Map(jugadores.map((j) => [j.id, j.ronda_id]))
    const out = boardPublicoRondaLibre(jugadores, ctx, vista)
    players = out.players.map((p) =>
      filaEnVivo(p, { groupId: (p.id && grupoPorRonda.get(rondaDeJugador.get(p.id) ?? '')) || null }))
  } else {
    // Legacy: MISMA query y MISMO motor que el board de /torneo.
    const [hcp, rounds, dbPlayers] = await Promise.all([
      fetchLegacyHcpContext(supabase, row.id),
      // Rondas en otra cancha que la 1 (vacío si no hay). Misma fuente que /torneo.
      fetchRoundContexts(supabase, row),
      fetchLegacyPlayers(supabase, row.id),
    ])
    const grupoDeJugador = new Map<string, string>()
    for (const g of grupos) for (const gp of g.tournament_group_players ?? []) grupoDeJugador.set(gp.player_id, g.id)
    const metaPorId = new Map(dbPlayers.map((p) => [p.id, { categoryId: p.category_id ?? null, categoryName: p.categories?.name ?? undefined }]))
    const board = buildLeaderboardFromLegacy(dbPlayers, { ...ctx, hcp, rounds }, row.total_rounds ?? 1)
    players = board.players.map((p) =>
      filaEnVivo(p, { ...(p.id ? metaPorId.get(p.id) : {}), groupId: (p.id && grupoDeJugador.get(p.id)) || null }))
  }

  const tournament: TorneoEnVivo['tournament'] = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    format: normalizeFormat(vista.formato),
    modo: vista.modo as LiveMode,
    modoReal,
    vista,
    caminoRondaLibre,
    hole_count: holeCount,
    total_rounds: row.total_rounds ?? 1,
    par_total: parTotal,
    course_name: row.courses?.nombre ?? undefined,
    status: normalizeStatus(row.status),
    // Fuente única de liveness (misma que /torneo): date-aware, no solo status.
    live: torneoEnVivo(row.status, row.date_start, row.date_end, new Date()),
  }

  // Equipos: scramble/foursome = score COMPARTIDO por hoyo; best_ball = mejor bola.
  // Se arman en el modo/formato de la VISTA (bruta: gross): el total que viaja ya no
  // permite deducir handicaps.
  let teams: LiveTeam[] = []
  // Si la lectura de equipos o de índices falla (p. ej. statement timeout en
  // profiles), NO se cae la página entera ni se publica un neto con índice 0: se
  // reporta, los equipos quedan vacíos y la vista lo dice (`equiposNoDisponibles`).
  let equiposNoDisponibles = false
  try {
    const sb = supabase as unknown as SupabaseClient
    const formato = vista.formato
    const modo = vista.modo
    if ((formatoReal === 'scramble' || formatoReal === 'foursome') && row.course_id) {
      const { teams: t, memberNames } = await fetchScrambleTeams(sb, row.id, opciones.leerIndices)
      if (t.length > 0) {
        const ordered = formatoReal === 'foursome'
          ? computeFoursomeStandings(t, memberNames, boardHoles, parTotal, formato, modo, holeCount)
          : computeScrambleStandings(t, boardHoles, parTotal, formato, modo, holeCount)
        teams = scrambleResultsToLiveTeams(ordered, memberNames, modo as LiveMode)
      }
    } else if (formatoReal === 'best_ball' && row.course_id) {
      const { teams: t, memberNames } = await fetchBestBallTeams(sb, row.id, parTotal, opciones.leerIndices)
      if (t.length > 0) {
        const ordered = computeBestBallStandings(t, boardHoles, parTotal, formato, modo, holeCount)
        teams = bestBallResultsToLiveTeams(ordered, memberNames, modo as LiveMode)
      }
    }
  } catch (err) {
    void captureError(err, { context: 'torneo.en-vivo.equipos', meta: { torneo: row.slug } })
    teams = []
    equiposNoDisponibles = true
  }

  return {
    tournament,
    players,
    teams,
    ...(equiposNoDisponibles ? { equiposNoDisponibles } : {}),
    categories: row.categories ?? [],
    groups: grupos.map((g) => ({ id: g.id, name: g.name })),
  }
}
