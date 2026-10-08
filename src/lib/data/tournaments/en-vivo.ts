// src/lib/data/tournaments/en-vivo.ts
//
// Datos del leaderboard EN VIVO de un torneo (`/torneo/[slug]/en-vivo`). FUENTE
// ÚNICA: la usan el server component (render inicial, con la sesión de quien mira)
// y la ruta pública cacheable `/api/torneo/[slug]/live` (polling de los
// espectadores; reemplazo de Supabase Realtime, incidente Los Leones 04-oct-2026).
//
// Sólo orquesta lecturas y delega TODO el cálculo al motor (`src/golf/`): el
// board individual es `buildLeaderboardFromLegacy` y los equipos, los standings
// de `@/golf/leaderboard/team-standings`. Antes esta lógica vivía en page.tsx.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LivePlayer, LiveTournament, LiveFormat, LiveMode, LiveTeam } from '@/app/torneo/[slug]/en-vivo/types'
import { normalizeStatus } from '@/app/torneo/[slug]/en-vivo/normalize-status'
import { scrambleResultsToLiveTeams, bestBallResultsToLiveTeams } from '@/app/torneo/[slug]/en-vivo/scrambleTeamsToLive'
import { torneoEnVivo } from '@/golf/tournament-live-status'
import { fetchScrambleTeams, fetchBestBallTeams } from './teamLeaderboard'
import { computeScrambleStandings, computeFoursomeStandings, computeBestBallStandings } from '@/golf/leaderboard/team-standings'
import { buildLeaderboardFromLegacy } from '@/golf/leaderboard/build-from-legacy'
import type { TournamentLeaderboardContext } from '@/golf/leaderboard/types'
import { fetchCourseHoles, fetchLegacyHcpContext, fetchLegacyPlayers, fetchRoundContexts, type Client } from './leaderboard'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { parDeLaRondaDelTorneo } from '@/golf/core/course-handicap'

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
  tournament_groups: Array<{ id: string; name: string }> | null
}

const TORNEO_EN_VIVO_SELECT =
  'id, slug, name, format, formato_juego, modo_juego, hole_count, total_rounds, status, date_start, date_end, course_id, tees, hcp_calc_mode, courses(nombre, par_total), categories(id, name), tournament_groups(id, name)'

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
   * `soloGross`: respuesta PÚBLICA de un torneo neto (decisión de Juanjo, 08-oct):
   * sólo golpes y vs par gross, sin HCP, neto ni puntos (de ellos se deduce el
   * handicap). `modoReal` dice la modalidad del torneo.
   */
  tournament: LiveTournament & { soloGross?: boolean; modoReal?: LiveMode }
  players: JugadorEnVivo[]
  teams: LiveTeam[]
  categories: Array<{ id: string; name: string }>
  groups: Array<{ id: string; name: string }>
}

/**
 * Arma el leaderboard en vivo del torneo `row`.
 *
 * `clienteIndices` lee `profiles(id, indice)` de los miembros de equipos con cuenta
 * (best ball / scramble / foursome). En torneos los puntos y totales netos YA
 * dependen del índice; de acá sólo salen esos derivados (`team_total`, `vs_par`,
 * `net_total`, `points_total`) y el HCP de inscripción (`players.handicap_at_registration`,
 * legible por anon): nunca el course handicap ni el índice del perfil.
 */
export async function armarTorneoEnVivo(
  supabase: Client,
  row: TorneoEnVivoRow,
  clienteIndices: Pick<SupabaseClient, 'from'> = supabase as unknown as SupabaseClient,
  opciones: { soloGross?: boolean } = {},
): Promise<TorneoEnVivo> {
  const holeCount = row.hole_count ?? 18
  // Torneo neto para el público: se arma como stroke play gross (stableford y match
  // play se juegan con handicap; su versión bruta sería otro juego).
  const modoReal = normalizeModo(row.modo_juego)
  const soloGross = !!opciones.soloGross && modoReal === 'neto'
  const formatoVisto = (raw: unknown): LiveFormat => {
    const f = normalizeFormat(raw)
    return soloGross && (f === 'stableford' || f === 'match_play') ? 'stroke_play' : f
  }

  // El par de la ronda sale del catálogo y lo necesitan las tres ramas (board
  // individual, equipos y cabecera): una sola respuesta para la misma pregunta.
  const [individualHoles, hcpContext, roundContexts, dbPlayers] = await Promise.all([
    row.course_id ? fetchCourseHoles(supabase, row.course_id) : Promise.resolve([]),
    fetchLegacyHcpContext(supabase, row.id),
    // Rondas en otra cancha que la 1 (vacío si no hay). Misma fuente que /torneo.
    fetchRoundContexts(supabase, row),
    // MISMA query y MISMO motor que el board de /torneo.
    fetchLegacyPlayers(supabase, row.id),
  ])
  const parTotal = parDeLaRondaDelTorneo(individualHoles, holeCount, row.courses?.par_total)
  const playerIds = dbPlayers.map((p) => p.id)

  // Mapping player_id -> group_id (filtro "solo mi grupo").
  const playerGroupMap = new Map<string, string>()
  if (playerIds.length > 0) {
    const { data: groupPlayersRaw } = await supabase
      .from('tournament_group_players')
      .select('group_id, player_id')
      .in('player_id', playerIds)
    for (const gp of (groupPlayersRaw ?? []) as unknown as Array<{ group_id: string; player_id: string }>) {
      playerGroupMap.set(gp.player_id, gp.group_id)
    }
  }

  // Formato canónico: `formato_juego` (nuevo) y si no, `format` legacy.
  const rawFormat = row.formato_juego ?? row.format ?? 'stroke_play'
  const tournament: TorneoEnVivo['tournament'] = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    format: formatoVisto(rawFormat),
    modo: soloGross ? 'gross' : modoReal,
    ...(soloGross ? { soloGross: true, modoReal } : {}),
    hole_count: holeCount,
    total_rounds: row.total_rounds ?? 1,
    par_total: parTotal,
    course_name: row.courses?.nombre ?? undefined,
    status: normalizeStatus(row.status),
    // Fuente única de liveness (misma que /torneo): date-aware, no solo status.
    live: torneoEnVivo(row.status, row.date_start, row.date_end, new Date()),
  }

  // Board individual: UNA sola computación, la del motor; acá sólo se proyecta.
  const boardHoles = hoyosDeLaVuelta(individualHoles, holeCount)
  const boardCtx: TournamentLeaderboardContext = {
    parTotal,
    totalHoyos: holeCount,
    modoJuego: tournament.modo as ModoJuego,
    formatoJuego: formatoVisto(rawFormat) as FormatoJuego,
    courseHoles: boardHoles,
    hcp: hcpContext,
    rounds: roundContexts,
  }
  const board = buildLeaderboardFromLegacy(dbPlayers, boardCtx, tournament.total_rounds)
  const playerMetaById = new Map(
    dbPlayers.map((p) => [p.id, { categoryId: p.category_id ?? null, categoryName: p.categories?.name ?? undefined }]),
  )
  const players: JugadorEnVivo[] = board.players.map((p) => {
    const meta = p.id ? playerMetaById.get(p.id) : undefined
    return {
      id: p.id ?? '',
      name: p.name,
      category_name: meta?.categoryName,
      // Columna "HCP": el índice de INSCRIPCIÓN (`hcpDisplay`), no el de scoring.
      // `soloGross`: ni HCP, ni neto, ni puntos (se deduce el handicap).
      handicap_index: soloGross ? 0 : p.hcpDisplay ?? p.hcp,
      scores_per_hole: p.scores.map((s) => s ?? 0),
      gross_total: p.grossTotal ?? 0,
      net_total: soloGross ? undefined : p.netTotal,
      points_total: soloGross ? undefined : p.stablefordTotal,
      vs_par: p.total,
      thru: p.holes,
      group_id: (p.id && playerGroupMap.get(p.id)) || null,
      category_id: meta?.categoryId ?? null,
    }
  })

  // Equipos: scramble/foursome = score COMPARTIDO por hoyo; best_ball = mejor bola neta.
  let teams: LiveTeam[] = []
  const sb = supabase as unknown as SupabaseClient
  // En gross el handicap no entra: ni se leen perfiles.
  const indices = soloGross ? null : clienteIndices
  const sinPerfiles = { from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) } as unknown as Pick<SupabaseClient, 'from'>
  if ((tournament.format === 'scramble' || tournament.format === 'foursome') && row.course_id) {
    const { teams: t, memberNames } = await fetchScrambleTeams(sb, row.id, indices ?? sinPerfiles)
    if (t.length > 0) {
      const formato = tournament.format as FormatoJuego
      const modo = tournament.modo as ModoJuego
      const ordered = tournament.format === 'foursome'
        ? computeFoursomeStandings(t, memberNames, boardHoles, parTotal, formato, modo, holeCount)
        : computeScrambleStandings(t, boardHoles, parTotal, formato, modo, holeCount)
      teams = scrambleResultsToLiveTeams(ordered, memberNames, tournament.modo)
    }
  } else if (tournament.format === 'best_ball' && row.course_id) {
    const { teams: t, memberNames } = await fetchBestBallTeams(sb, row.id, parTotal, indices ?? sinPerfiles)
    if (t.length > 0) {
      const ordered = computeBestBallStandings(t, boardHoles, parTotal, tournament.format as FormatoJuego, tournament.modo as ModoJuego, holeCount)
      teams = bestBallResultsToLiveTeams(ordered, memberNames, tournament.modo)
    }
  }

  return {
    tournament,
    players,
    teams,
    categories: row.categories ?? [],
    groups: row.tournament_groups ?? [],
  }
}
