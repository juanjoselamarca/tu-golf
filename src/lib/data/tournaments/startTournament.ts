// src/lib/data/tournaments/startTournament.ts
//
// Iniciar un torneo (POST /api/torneos/[slug]/start): validar que se puede y
// materializar la ronda 1 — una tarjeta `rounds` por jugador aprobado y, por
// cada grupo de salida, la ronda libre compartida donde el grupo anota
// (`rondas_libres` + `ronda_libre_jugadores` + equipo si el formato es por
// equipos).
//
// Regla: TODO O NADA. Antes un fallo a mitad (código de ronda
// repetido, insert de un jugador que no entró) se anotaba como warning y el
// torneo pasaba igual a 'in_progress' con un grupo sin tarjeta o con un jugador
// fuera de ella — y como el grupo ya quedaba enlazado a su ronda, reintentar
// nunca lo completaba (así quedó `lb-open-2026-padre-e-hijo`, mayo 2026). Ahora
// cada grupo se enlaza AL FINAL de armarse, y si un grupo falla la ruta deshace
// TAMBIÉN los grupos que ya armó en esa llamada (`deshacerGrupo`) y reintentar
// arma todo de nuevo. Nunca queda 'in_progress' con un grupo sin tarjeta.
// Límite conocido (sin bloqueo por torneo, pendiente con migración): si dos
// inicios corren a la vez y uno sale por conflicto, sus grupos completos quedan
// enlazados con el torneo en borrador; editar ese grupo antes de reintentar lo
// deja "incompleto" (el inicio lo bloquea y pide soporte).

import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'
import { modoDeJuego } from '@/golf/core/rules'
import { isSharedBallFormat, resolveFormatoJuego } from '@/golf/formats'
import { hcpPctDelTorneo } from '@/golf/core/playing-handicap'
import { parDeLaRondaDelTorneo } from '@/golf/core/course-handicap'
import type { PlayerForCourseHcp } from '@/golf/core/compute-player-course-hcp'
import type { LegacyHcpContext } from '@/golf/leaderboard/types'
import { leerHandicapDeEquipo } from '@/lib/draft/team-config-legacy'
import { formatoDeLaTarjetaDelGrupo } from '@/golf/ronda-libre/formato-tarjeta-de-grupo'
import { TORNEO_SIN_EMPEZAR_STATUSES, torneoAceptaScores, torneoSinEmpezar } from '@/golf/tournament-status'
import { fetchCourseHoles, fetchLegacyHcpContext, type Client } from './leaderboard'
import {
  handicapsDeEquipoDelGrupo,
  isProducerTeamFormat,
  resolvePlayerHandicap,
} from './teamRounds'
import { grupoEnlazadoIncompleto, playerName } from './motivo-para-no-iniciar'

// El motivo para no iniciar vive en un módulo PURO (lo usa también el panel del
// organizador en el cliente). Se re-exporta para no romper los imports existentes.
export {
  grupoEnlazadoIncompleto,
  motivoParaNoIniciar,
  soloAprobados,
} from './motivo-para-no-iniciar'

/**
 * Jugador del torneo al iniciarlo. `tee_id`, `genero` y `categories` resuelven
 * su tee (`PlayerForCourseHcp`): el handicap de equipo sale del course handicap
 * de cada jugador con su tee, igual que su handicap individual en el board.
 */
export interface StartPlayer extends PlayerForCourseHcp {
  id: string
  user_id: string | null
  player_name: string | null
  status: string
  profiles: { name: string; indice: number | null } | null
}

/** Columnas de `players` que lee el inicio del torneo. */
export const START_PLAYER_SELECT =
  'id, user_id, player_name, handicap_at_registration, status, tee_id, genero, ' +
  'profiles(name, indice), categories(default_tee_color, gender)'

export interface StartGroup {
  id: string
  name: string
  ronda_libre_id: string | null
  /** `jugador_ronda_id`: su fila en la tarjeta del grupo, si el grupo ya se armó. */
  players: Array<{ id: string; player_id: string; jugador_ronda_id?: string | null }>
}

/** Lo que la ronda 1 necesita de la tarjeta compartida (sale de `fetchRoundPlayConfig`). */
export interface StartRoundConfig {
  courseId: string | null
  holeCount: number
  date: string | null
}

export interface StartTournamentInfo {
  format: string | null
  formato_juego?: string | null
  modo_juego?: string | null
  /** `tournaments.hcp_pct`: la tarjeta del grupo hereda el % EFECTIVO (`hcpPctDelTorneo`). */
  hcp_pct?: number | null
  tees: string | null
  course_name: string | null
  courses: { nombre?: string } | null
  /** `tournaments.team_config` (JSONB, forma vieja o nueva): de acá sale el handicap de equipo. */
  team_config?: unknown
}

/**
 * Lo que el handicap de equipo necesita de la ronda 1, leído UNA vez por inicio
 * (`fetchContextoHcpDeEquipos`): el contexto del gate WHS (modo, tees, ratings)
 * y el par de la ronda. Es el mismo que usa el board para el handicap
 * individual: el equipo y sus jugadores se miden contra la misma cancha.
 */
export interface ContextoHcpDeEquipos {
  ctx: LegacyHcpContext
  parTotal: number
  /** Par de una ronda de 18 en la misma cancha: mide el handicap completo. */
  parDe18Hoyos: number
}

const UNIQUE_VIOLATION = '23505'

/** Copy cuando otro inicio del mismo torneo corre en paralelo (doble toque, reintento con mala señal). */
export const ERROR_OTRO_INICIO = 'El torneo se está iniciando en otra sesión. Espera unos segundos y recarga.'
/** Reintentos si el código aleatorio de la ronda ya existe (`rondas_libres_codigo_key`). */
const CODIGO_INTENTOS = 3

/**
 * Contexto del handicap de equipo para la ronda 1, o null si el formato no
 * tiene handicap de equipo (best ball y formatos individuales). Lanza si la
 * base falla (`fetchLegacyHcpContext`): sin ratings el handicap del equipo
 * saldría del índice crudo; la ruta responde error y reintentar es seguro.
 */
export async function fetchContextoHcpDeEquipos(
  svc: SupabaseClient,
  tournament: StartTournamentInfo & { id: string },
  ronda1: StartRoundConfig,
): Promise<ContextoHcpDeEquipos | null> {
  if (!isSharedBallFormat(resolveFormatoJuego(tournament))) return null
  // El cast es sólo de tipos (mismo patrón que tvBoard): los helpers del board
  // están tipados contra el cliente de servidor; la query es la misma.
  const client = svc as unknown as Client
  const [ctx, hoyos] = await Promise.all([
    fetchLegacyHcpContext(client, tournament.id),
    ronda1.courseId ? fetchCourseHoles(client, ronda1.courseId) : Promise.resolve([]),
  ])
  return {
    ctx,
    parTotal: parDeLaRondaDelTorneo(hoyos, ronda1.holeCount, ctx.course?.par_total),
    parDe18Hoyos: parDeLaRondaDelTorneo(hoyos, 18, ctx.course?.par_total),
  }
}

/** Grupos con jugadores que todavía no tienen su tarjeta completa (sin ronda o con alguien fuera). */
export function gruposSinTarjeta(groups: StartGroup[]): StartGroup[] {
  return groups.filter((g) => g.players.length > 0 && (!g.ronda_libre_id || grupoEnlazadoIncompleto(g)))
}

/** Grupos del torneo con sus integrantes y el enlace de cada uno a la tarjeta. */
export async function fetchStartGroups(
  svc: SupabaseClient,
  tournamentId: string,
): Promise<{ groups: StartGroup[]; error: unknown }> {
  const { data, error } = await svc
    .from('tournament_groups')
    .select('id, name, ronda_libre_id, tournament_group_players(id, player_id, jugador_ronda_id)')
    .eq('tournament_id', tournamentId)
    .order('sort_order', { ascending: true })
  const groups: StartGroup[] = ((data ?? []) as Array<Record<string, unknown>>).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    ronda_libre_id: g.ronda_libre_id as string | null,
    players: (g.tournament_group_players as StartGroup['players']) || [],
  }))
  return { groups, error }
}

/**
 * Una tarjeta `rounds` (ronda 1) por jugador aprobado. Idempotente: el UNIQUE
 * (tournament_id, player_id, round_number) ignora las que ya existen, también
 * si dos inicios corren a la vez.
 */
export async function ensureRound1Cards(
  svc: SupabaseClient,
  tournamentId: string,
  approvedPlayers: StartPlayer[],
): Promise<boolean> {
  if (approvedPlayers.length === 0) return true
  const { error } = await svc.from('rounds').upsert(
    approvedPlayers.map((p) => ({
      tournament_id: tournamentId,
      player_id: p.id,
      round_number: 1,
      status: 'in_progress',
    })),
    { onConflict: 'tournament_id,player_id,round_number', ignoreDuplicates: true },
  )
  if (error) {
    void captureError(error, { context: 'start-tournament.crear-rounds', level: 'error' })
    return false
  }
  return true
}

function nuevoCodigo(): string {
  return 'T' + Math.random().toString(36).substring(2, 8).toUpperCase()
}

/**
 * Deshace la tarjeta compartida de un grupo que no terminó de armarse. Primero
 * suelta las referencias SIN cascada que apuntan a ESTA ronda (el grupo y los
 * jugadores del grupo enlazados a filas de esta tarjeta; nunca los de otro
 * inicio simultáneo) y después borra la ronda, que arrastra en cascada a sus
 * jugadores y equipos.
 */
export async function deshacerGrupo(
  svc: SupabaseClient,
  groupId: string,
  rondaId: string,
  jugadorRondaIds: string[],
): Promise<boolean> {
  let ok = true
  const pasos = [
    ...(jugadorRondaIds.length > 0
      ? [svc.from('tournament_group_players').update({ jugador_ronda_id: null }).eq('group_id', groupId).in('jugador_ronda_id', jugadorRondaIds)]
      : []),
    svc.from('tournament_groups').update({ ronda_libre_id: null }).eq('id', groupId).eq('ronda_libre_id', rondaId),
  ]
  for (const paso of pasos) {
    const { error } = await paso
    if (error) {
      ok = false
      void captureError(error, { context: 'start-tournament.deshacer-enlace', level: 'error', meta: { groupId, rondaId } })
    }
  }
  const { error } = await svc.from('rondas_libres').delete().eq('id', rondaId)
  if (error) {
    ok = false
    void captureError(error, { context: 'start-tournament.deshacer-ronda', level: 'error', meta: { groupId, rondaId } })
  }
  return ok
}

/** No se pudo leer el estado antes de deshacer: no se deshace nada y reintentar es seguro. */
export const ERROR_ESTADO_DESCONOCIDO =
  'No se pudo confirmar el estado del torneo. Recarga la página: si no quedó en juego, vuelve a intentar.'

/** El torneo pasó a otro estado (cerrado, cancelado) mientras se iniciaba. */
export const ERROR_CAMBIO_DE_ESTADO = 'El torneo cambió de estado mientras se iniciaba. Recarga la página.'

/**
 * ¿El torneo sigue sin iniciar? Se pregunta justo antes de deshacer: si otro
 * inicio en paralelo ya lo puso en juego, las tarjetas de esta llamada ya son
 * las que se están usando en la cancha y NO se tocan.
 */
export async function estadoAntesDeDeshacer(
  svc: SupabaseClient,
  tournamentId: string,
): Promise<'sin-iniciar' | 'en-juego' | 'otro-estado' | 'desconocido'> {
  const { data, error } = await svc.from('tournaments').select('status').eq('id', tournamentId).maybeSingle()
  if (error || !data) {
    void captureError(error ?? new Error('torneo no encontrado'), { context: 'start-tournament.releer-status', level: 'error', meta: { tournamentId } })
    return 'desconocido'
  }
  const status = (data as { status: string }).status
  if (torneoSinEmpezar(status)) return 'sin-iniciar'
  return torneoAceptaScores(status) ? 'en-juego' : 'otro-estado'
}

/**
 * Pone el torneo en juego solo si sigue sin iniciar (compare-and-set, igual que
 * `publishDraft`). 'otro-gano' = otro inicio lo puso en juego primero (o cambió de
 * estado entretanto): lo armado aquí no se deshace.
 */
export async function ponerEnJuego(
  svc: SupabaseClient,
  tournamentId: string,
): Promise<'ok' | 'otro-gano' | 'error'> {
  const { data, error } = await svc
    .from('tournaments')
    .update({ status: 'in_progress' })
    .eq('id', tournamentId)
    .in('status', [...TORNEO_SIN_EMPEZAR_STATUSES])
    .select('id')
  if (error) {
    void captureError(error, { context: 'start-tournament.set-status', level: 'error' })
    return 'error'
  }
  return (data ?? []).length > 0 ? 'ok' : 'otro-gano'
}

/** Lo que hace falta para deshacer un grupo ya armado (`deshacerGrupo`). */
export interface GrupoArmado {
  groupId: string
  rondaId: string
  jugadorRondaIds: string[]
}

export type GroupResult =
  | ({ ok: true } & GrupoArmado)
  | { ok: false; error: string; conflicto?: boolean; sinDeshacer?: boolean }

/** Copy cuando el deshacer mismo falló: reintentar podría saltarse ese grupo. */
export const ERROR_SIN_DESHACER =
  'No se pudo iniciar y quedó una tarjeta a medio armar. No reintentes: escríbenos a soporte para dejarlo listo.'

/**
 * Arma la tarjeta compartida de UN grupo. Orden: ronda → jugadores → equipo →
 * enlazar el grupo (solo si nadie lo enlazó antes) → enlazar a cada jugador del
 * grupo con su fila en la tarjeta. Cualquier fallo deshace lo creado.
 */
export async function materializeGroupScorecard(
  svc: SupabaseClient,
  args: {
    tournament: StartTournamentInfo
    group: StartGroup
    players: StartPlayer[]
    ronda1: StartRoundConfig
    creatorId: string
    /** Obligatorio en scramble/foursome (`fetchContextoHcpDeEquipos`); sin él, el grupo no se arma. */
    hcpEquipos?: ContextoHcpDeEquipos | null
  },
): Promise<GroupResult> {
  const { tournament: t, group, players, ronda1, creatorId, hcpEquipos } = args
  // La tarjeta del grupo juega lo mismo que el torneo: formato (fuente única, no la columna vieja `format`)
  // y modo. Antes no copiaba el modo y el scorer del grupo mostraba gross en un torneo neto (#510).
  const formato = resolveFormatoJuego(t)
  const teamFormat = isProducerTeamFormat(formato)
  const fallo = (context: string, err: unknown, deshecho = true): GroupResult => {
    void captureError(err ?? new Error(context), {
      context: `start-tournament.${context}`,
      level: 'error',
      meta: { group: group.name },
    })
    if (!deshecho) return { ok: false, error: ERROR_SIN_DESHACER, sinDeshacer: true }
    return { ok: false, error: `No se pudo preparar la tarjeta del grupo "${group.name}". Intenta iniciar de nuevo.` }
  }

  // 1. Ronda compartida (el código es aleatorio y UNIQUE: si choca, otro código)
  let rondaId: string | null = null
  let rondaErr: unknown = null
  for (let i = 0; i < CODIGO_INTENTOS && !rondaId; i++) {
    const { data, error } = await svc
      .from('rondas_libres')
      .insert({
        codigo: nuevoCodigo(),
        creador_id: creatorId,
        course_id: ronda1.courseId,
        course_name: t.courses?.nombre || t.course_name || 'Cancha',
        tees: t.tees || 'blanco',
        holes: ronda1.holeCount,
        fecha: ronda1.date || new Date().toISOString().split('T')[0],
        estado: 'en_curso',
        formato_juego: formatoDeLaTarjetaDelGrupo(formato, group.players.length),
        modo_juego: modoDeJuego(t.modo_juego),
        // Handicap de juego: el % con que puntúa la tarjeta (scramble/foursome y gross → 100).
        hcp_pct: hcpPctDelTorneo(t),
      })
      .select('id')
      .single()
    rondaErr = error
    if (data && !error) rondaId = (data as { id: string }).id
    else if ((error as { code?: string } | null)?.code !== UNIQUE_VIOLATION) break
  }
  if (!rondaId) return fallo('crear-ronda-libre', rondaErr)

  // 2. Un jugador de la tarjeta por cada jugador del grupo
  const members: Array<{ playerId: string; jugadorRondaId: string; player: StartPlayer }> = []
  const ronda = rondaId
  const abortar = async (context: string, err: unknown): Promise<GroupResult> =>
    fallo(context, err, await deshacerGrupo(svc, group.id, ronda, members.map((m) => m.jugadorRondaId)))
  // Cualquier excepción a mitad (red, datos raros) también deshace: si no, la
  // ronda quedaría huérfana o el grupo enlazado a medias.
  try {
    for (const gp of group.players) {
      const player = players.find((p) => p.id === gp.player_id)
      if (!player) {
        return abortar('jugador-del-grupo-no-existe', new Error(`player ${gp.player_id} no está en el torneo`))
      }
      const handicap = resolvePlayerHandicap(player)
      const { data: jugador, error } = await svc
        .from('ronda_libre_jugadores')
        .insert({
          ronda_id: rondaId,
          nombre: playerName(player),
          user_id: player.user_id || null,
          ...((teamFormat || !player.user_id) ? { handicap } : {}),
          scores: {},
        })
        .select('id')
        .single()
      if (error || !jugador) {
        return abortar('crear-jugador-ronda', error)
      }
      members.push({ playerId: gp.player_id, jugadorRondaId: (jugador as { id: string }).id, player })
    }

    // 3. Formato por equipos: el grupo es el equipo
    if (teamFormat && members.length > 0) {
      // Scramble/foursome: handicap completo (18 hoyos, el que se muestra) y de
      // juego (hoyos de la ronda, el que reparte golpes). Best ball: ambos null.
      let hcp: { completo: number | null; juego: number | null } = { completo: null, juego: null }
      if (isSharedBallFormat(formato)) {
        if (!hcpEquipos) return abortar('sin-contexto-hcp-equipo', new Error('falta el contexto del handicap de equipo'))
        hcp = handicapsDeEquipoDelGrupo({
          formato,
          members: members.map((m) => m.player),
          handicap: leerHandicapDeEquipo(t.team_config),
          ctx: hcpEquipos.ctx,
          parTotal: hcpEquipos.parTotal,
          holeCount: ronda1.holeCount,
          parDe18Hoyos: hcpEquipos.parDe18Hoyos,
        })
        // `motivoParaNoIniciar` ya bloquea las configuraciones sin handicap: si
        // igual llega acá, no se arma un equipo que puntuaría con 0 golpes.
        if (hcp.completo === null) {
          return abortar('hcp-equipo-incalculable', new Error(`sin handicap de equipo para "${group.name}"`))
        }
      }
      const { data: equipo, error: equipoErr } = await svc
        .from('ronda_equipos')
        .insert({
          ronda_id: rondaId,
          nombre: group.name,
          // Ya redondeados (WHS, `handicapDeEquipo`): las dos columnas son smallint.
          handicap_equipo: hcp.completo,
          handicap_equipo_juego: hcp.juego,
          scores: {},
        })
        .select('id')
        .single()
      if (equipoErr || !equipo) {
        return abortar('crear-ronda-equipo', equipoErr)
      }
      const { error: membersErr } = await svc.from('ronda_equipo_jugadores').insert(
        members.map((m, idx) => ({ equipo_id: (equipo as { id: string }).id, jugador_id: m.jugadorRondaId, orden: idx })),
      )
      if (membersErr) {
        return abortar('crear-ronda-equipo-jugadores', membersErr)
      }
    }

    // 4. Enlazar el grupo. Solo si sigue sin ronda: si otro inicio simultáneo lo
    //    enlazó primero, gana ese y esta copia se borra.
    const { data: claimed, error: claimErr } = await svc
      .from('tournament_groups')
      .update({ ronda_libre_id: rondaId })
      .eq('id', group.id)
      .is('ronda_libre_id', null)
      .select('id')
    if (claimErr) {
      return abortar('enlazar-grupo', claimErr)
    }
    if (!claimed || claimed.length === 0) {
      // Otro inicio (doble toque, dos pestañas) lo enlazó primero: esta copia se
      // borra y este intento NO sigue — si siguiera, podría poner el torneo en
      // juego mientras el otro todavía arma (o deshace) ese grupo.
      const { error } = await svc.from('rondas_libres').delete().eq('id', rondaId)
      if (error) void captureError(error, { context: 'start-tournament.borrar-copia', level: 'warning', meta: { group: group.name } })
      return { ok: false, conflicto: true, error: ERROR_OTRO_INICIO }
    }

    // 5. Cada jugador del grupo apunta a su fila en la tarjeta (el scorer del torneo lo lee)
    for (const m of members) {
      const { error } = await svc
        .from('tournament_group_players')
        .update({ jugador_ronda_id: m.jugadorRondaId })
        .eq('group_id', group.id)
        .eq('player_id', m.playerId)
      if (error) {
        return abortar('enlazar-jugador-grupo', error)
      }
    }
  } catch (err) {
    return abortar('excepcion', err)
  }

  return { ok: true, groupId: group.id, rondaId, jugadorRondaIds: members.map((m) => m.jugadorRondaId) }
}
