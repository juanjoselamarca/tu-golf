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
import { FORMAT_META } from '@/golf/core/rules'
import type { FormatoJuego } from '@/golf/core/rules'
import {
  computeStoredTeamHandicap,
  isProducerTeamFormat,
  resolvePlayerHandicap,
} from './teamRounds'

export interface StartPlayer {
  id: string
  user_id: string | null
  player_name: string | null
  handicap_at_registration: number | null
  status: string
  profiles: { name: string; indice: number | null } | null
}

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
  tees: string | null
  course_name: string | null
  courses: { nombre?: string } | null
}

const UNIQUE_VIOLATION = '23505'

/** Copy cuando otro inicio del mismo torneo corre en paralelo (doble toque, reintento con mala señal). */
export const ERROR_OTRO_INICIO = 'El torneo se está iniciando en otra sesión. Espera unos segundos y recarga.'
/** Reintentos si el código aleatorio de la ronda ya existe (`rondas_libres_codigo_key`). */
const CODIGO_INTENTOS = 3

function playerName(p: StartPlayer): string {
  return p.profiles?.name || p.player_name || 'Jugador'
}

function listaCorta(items: string[]): string {
  const extra = items.length > 5 ? ` y ${items.length - 5} más` : ''
  return items.slice(0, 5).join(', ') + extra
}

/**
 * Por qué no se puede iniciar (mensaje para el organizador) o `null` si se puede.
 * Pura: recibe lo ya leído de la base.
 */
export function motivoParaNoIniciar(
  format: string | null,
  approvedPlayers: StartPlayer[],
  groups: StartGroup[],
): string | null {
  if (approvedPlayers.length < 1) return 'Se necesita al menos 1 jugador aprobado'

  const groupedIds = new Set<string>()
  for (const g of groups) for (const gp of g.players) groupedIds.add(gp.player_id)
  const ungrouped = approvedPlayers.filter((p) => !groupedIds.has(p.id))
  if (ungrouped.length > 0) {
    return `Jugadores sin grupo: ${listaCorta(ungrouped.map(playerName))}. Asigna a un grupo antes de iniciar.`
  }

  // Un grupo enlazado con un integrante fuera de la tarjeta: o lo está armando
  // otro inicio en este momento, o viene de un intento anterior al todo-o-nada.
  // Saltarlo (ya tiene ronda) iniciaría el torneo con ese jugador sin poder anotar.
  const incompletos = groups.filter(grupoEnlazadoIncompleto)
  if (incompletos.length > 0) {
    return `La tarjeta de ${listaCorta(incompletos.map((g) => `"${g.name}"`))} está incompleta. Si alguien más está iniciando el torneo, espera unos segundos y recarga; si sigue así, escríbenos a soporte.`
  }

  if (isProducerTeamFormat(format)) {
    const meta = FORMAT_META[format as FormatoJuego]
    const rango = meta?.jugadoresPorEquipo
    if (rango) {
      const fueraDeRango = groups.filter(
        (g) => g.players.length > 0 && (g.players.length < rango.min || g.players.length > rango.max),
      )
      if (fueraDeRango.length > 0) {
        const exigido = rango.min === rango.max ? `${rango.min}` : `${rango.min} a ${rango.max}`
        const detalle = listaCorta(fueraDeRango.map((g) => `"${g.name}" (${g.players.length})`))
        return `Tamaño de equipo incorrecto. En ${meta.label}, cada equipo debe tener ${exigido} jugadores. Corrige: ${detalle}.`
      }
    }
  }
  return null
}

/**
 * Los grupos con solo sus integrantes aprobados. Un inscrito pendiente o retirado
 * que quedó en un grupo no juega: no recibe tarjeta, no cuenta para el tamaño del
 * equipo y no deja una tarjeta "incompleta" por no estar en ella.
 */
export function soloAprobados(groups: StartGroup[], approvedPlayers: StartPlayer[]): StartGroup[] {
  const aprobados = new Set(approvedPlayers.map((p) => p.id))
  return groups.map((g) => ({ ...g, players: g.players.filter((gp) => aprobados.has(gp.player_id)) }))
}

/** Grupo con tarjeta pero con algún integrante fuera de ella. */
export function grupoEnlazadoIncompleto(g: StartGroup): boolean {
  return Boolean(g.ronda_libre_id) && g.players.some((gp) => !gp.jugador_ronda_id)
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

/** Estados desde los que se puede iniciar un torneo. */
export const ESTADOS_INICIABLES = ['draft', 'open'] as const

/**
 * ¿El torneo sigue sin iniciar? Se pregunta justo antes de deshacer: si otro
 * inicio en paralelo ya lo puso en juego, las tarjetas de esta llamada ya son
 * las que se están usando en la cancha y NO se tocan.
 */
export async function estadoAntesDeDeshacer(
  svc: SupabaseClient,
  tournamentId: string,
): Promise<'sin-iniciar' | 'en-juego' | 'desconocido'> {
  const { data, error } = await svc.from('tournaments').select('status').eq('id', tournamentId).maybeSingle()
  if (error || !data) {
    void captureError(error ?? new Error('torneo no encontrado'), { context: 'start-tournament.releer-status', level: 'error', meta: { tournamentId } })
    return 'desconocido'
  }
  const status = (data as { status: string }).status
  return (ESTADOS_INICIABLES as readonly string[]).includes(status) ? 'sin-iniciar' : 'en-juego'
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
    .in('status', [...ESTADOS_INICIABLES])
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
  },
): Promise<GroupResult> {
  const { tournament: t, group, players, ronda1, creatorId } = args
  const teamFormat = isProducerTeamFormat(t.format)
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
        ...(teamFormat ? { formato_juego: t.format } : {}),
      })
      .select('id')
      .single()
    rondaErr = error
    if (data && !error) rondaId = (data as { id: string }).id
    else if ((error as { code?: string } | null)?.code !== UNIQUE_VIOLATION) break
  }
  if (!rondaId) return fallo('crear-ronda-libre', rondaErr)

  // 2. Un jugador de la tarjeta por cada jugador del grupo
  const members: Array<{ playerId: string; jugadorRondaId: string; handicap: number }> = []
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
      members.push({ playerId: gp.player_id, jugadorRondaId: (jugador as { id: string }).id, handicap })
    }

    // 3. Formato por equipos: el grupo es el equipo
    if (teamFormat && members.length > 0) {
      const { data: equipo, error: equipoErr } = await svc
        .from('ronda_equipos')
        .insert({
          ronda_id: rondaId,
          nombre: group.name,
          handicap_equipo: computeStoredTeamHandicap(t.format ?? '', members.map((m) => m.handicap)),
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
