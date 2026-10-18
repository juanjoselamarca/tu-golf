// src/lib/data/tournaments/startTournament.ts
//
// Iniciar un torneo (POST /api/torneos/[slug]/start): validar que se puede y
// materializar la ronda 1 — una tarjeta `rounds` por jugador aprobado y, por
// cada grupo de salida, la ronda libre compartida donde el grupo anota
// (`rondas_libres` + `ronda_libre_jugadores` + equipo si el formato es por
// equipos).
//
// Regla: TODO O NADA por grupo. Antes un fallo a mitad (código de ronda
// repetido, insert de un jugador que no entró) se anotaba como warning y el
// torneo pasaba igual a 'in_progress' con un grupo sin tarjeta o con un jugador
// fuera de ella — y como el grupo ya quedaba enlazado a su ronda, reintentar
// nunca lo completaba (así quedó `lb-open-2026-padre-e-hijo`, mayo 2026). Ahora
// el grupo se enlaza AL FINAL; si algo falla se deshace lo creado y el inicio
// devuelve error sin tocar el estado, y reintentar es seguro.

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
  players: Array<{ id: string; player_id: string }>
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
async function deshacerGrupo(
  svc: SupabaseClient,
  groupId: string,
  rondaId: string,
  jugadorRondaIds: string[],
): Promise<void> {
  const pasos = [
    ...(jugadorRondaIds.length > 0
      ? [svc.from('tournament_group_players').update({ jugador_ronda_id: null }).eq('group_id', groupId).in('jugador_ronda_id', jugadorRondaIds)]
      : []),
    svc.from('tournament_groups').update({ ronda_libre_id: null }).eq('id', groupId).eq('ronda_libre_id', rondaId),
  ]
  for (const paso of pasos) {
    const { error } = await paso
    if (error) void captureError(error, { context: 'start-tournament.deshacer-enlace', level: 'error', meta: { groupId, rondaId } })
  }
  const { error } = await svc.from('rondas_libres').delete().eq('id', rondaId)
  if (error) void captureError(error, { context: 'start-tournament.deshacer-ronda', level: 'error', meta: { groupId, rondaId } })
}

export type GroupResult = { ok: true } | { ok: false; error: string }

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
  const fallo = (context: string, err: unknown): GroupResult => {
    void captureError(err ?? new Error(context), {
      context: `start-tournament.${context}`,
      level: 'error',
      meta: { group: group.name },
    })
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
  for (const gp of group.players) {
    const player = players.find((p) => p.id === gp.player_id)
    if (!player) {
      await deshacerGrupo(svc, group.id, rondaId, members.map((m) => m.jugadorRondaId))
      return fallo('jugador-del-grupo-no-existe', new Error(`player ${gp.player_id} no está en el torneo`))
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
      await deshacerGrupo(svc, group.id, rondaId, members.map((m) => m.jugadorRondaId))
      return fallo('crear-jugador-ronda', error)
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
      await deshacerGrupo(svc, group.id, rondaId, members.map((m) => m.jugadorRondaId))
      return fallo('crear-ronda-equipo', equipoErr)
    }
    const { error: membersErr } = await svc.from('ronda_equipo_jugadores').insert(
      members.map((m, idx) => ({ equipo_id: (equipo as { id: string }).id, jugador_id: m.jugadorRondaId, orden: idx })),
    )
    if (membersErr) {
      await deshacerGrupo(svc, group.id, rondaId, members.map((m) => m.jugadorRondaId))
      return fallo('crear-ronda-equipo-jugadores', membersErr)
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
    await deshacerGrupo(svc, group.id, rondaId, members.map((m) => m.jugadorRondaId))
    return fallo('enlazar-grupo', claimErr)
  }
  if (!claimed || claimed.length === 0) {
    const { error } = await svc.from('rondas_libres').delete().eq('id', rondaId)
    if (error) void captureError(error, { context: 'start-tournament.borrar-copia', level: 'warning', meta: { group: group.name } })
    return { ok: true }
  }

  // 5. Cada jugador del grupo apunta a su fila en la tarjeta (el scorer del torneo lo lee)
  for (const m of members) {
    const { error } = await svc
      .from('tournament_group_players')
      .update({ jugador_ronda_id: m.jugadorRondaId })
      .eq('group_id', group.id)
      .eq('player_id', m.playerId)
    if (error) {
      await deshacerGrupo(svc, group.id, rondaId, members.map((m) => m.jugadorRondaId))
      return fallo('enlazar-jugador-grupo', error)
    }
  }

  return { ok: true }
}
