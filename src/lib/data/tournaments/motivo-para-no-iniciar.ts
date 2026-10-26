// src/lib/data/tournaments/motivo-para-no-iniciar.ts
//
// Por qué un torneo NO se puede iniciar todavía — fuente ÚNICA. La usan:
//   - la ruta POST /api/torneos/[slug]/start (servidor, bloquea con 400), y
//   - el panel del organizador (cliente), que muestra el MISMO motivo junto al
//     botón "Iniciar" antes de apretarlo. Antes el panel habilitaba el botón con
//     1 jugador y el motivo real llegaba como toast del 400 (caso LB OPEN: un
//     scramble con 5 jugadores, cada uno en su grupo).
//
// Módulo PURO: sin Supabase ni imports de servidor, para que el cliente lo use.

import { FORMAT_META } from '@/golf/core/rules'
import type { FormatoJuego } from '@/golf/core/rules'
import { isSharedBallFormat, isTeamFormat } from '@/golf/formats'
import { handicapDeEquipo, type TeamHandicapConfig } from '@/golf/formats/team-handicap'
import { leerHandicapDeEquipo } from '@/lib/draft/team-config-legacy'

/** Lo que el motivo necesita de un jugador aprobado. `StartPlayer` lo cumple. */
export interface JugadorParaIniciar {
  id: string
  player_name?: string | null
  profiles: { name: string } | null
}

/** Lo que el motivo necesita de un grupo de salida. `StartGroup` lo cumple. */
export interface GrupoParaIniciar {
  name: string
  ronda_libre_id: string | null
  /** `jugador_ronda_id`: su fila en la tarjeta del grupo, si el grupo ya se armó. */
  players: Array<{ player_id: string; jugador_ronda_id?: string | null }>
}

export function playerName(p: JugadorParaIniciar): string {
  return p.profiles?.name || p.player_name || 'Jugador'
}

export function listaCorta(items: string[]): string {
  const extra = items.length > 5 ? ` y ${items.length - 5} más` : ''
  return items.slice(0, 5).join(', ') + extra
}

/**
 * Los grupos con solo sus integrantes aprobados. Un inscrito pendiente o retirado
 * que quedó en un grupo no juega: no recibe tarjeta, no cuenta para el tamaño del
 * equipo y no deja una tarjeta "incompleta" por no estar en ella.
 */
export function soloAprobados<G extends GrupoParaIniciar>(
  groups: G[],
  approvedPlayers: Array<{ id: string }>,
): G[] {
  const aprobados = new Set(approvedPlayers.map((p) => p.id))
  return groups.map((g) => ({ ...g, players: g.players.filter((gp) => aprobados.has(gp.player_id)) }))
}

/** Grupo con tarjeta pero con algún integrante fuera de ella. */
export function grupoEnlazadoIncompleto(g: GrupoParaIniciar): boolean {
  return Boolean(g.ronda_libre_id) && g.players.some((gp) => !gp.jugador_ronda_id)
}

/**
 * Por qué no se puede iniciar (mensaje para el organizador) o `null` si se puede.
 * Pura: recibe lo ya leído de la base. `format` es el formato RESUELTO
 * (`resolveFormatoJuego`) y `groups` ya pasó por `soloAprobados`.
 */
export function motivoParaNoIniciar(
  format: string | null,
  approvedPlayers: JugadorParaIniciar[],
  groups: GrupoParaIniciar[],
  /** `tournaments.team_config` tal como está guardado (JSONB). */
  teamConfig?: unknown,
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

  // `isTeamFormat` = `isProducerTeamFormat` (teamRounds.ts es su alias).
  if (isTeamFormat(format)) {
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
    const motivoHcp = motivoHandicapDeEquipo(format, groups, leerHandicapDeEquipo(teamConfig))
    if (motivoHcp) return motivoHcp
  }
  return null
}

/**
 * Scramble y foursome: cada equipo tiene que poder calcular su handicap con la
 * configuración guardada. El caso real: un personalizado de scramble definido
 * para 4 jugadores y un equipo que quedó de 3. No se inventa el % que falta ni
 * se cae al oficial en silencio (el organizador eligió otra cosa).
 */
export function motivoHandicapDeEquipo(
  format: string | null,
  groups: GrupoParaIniciar[],
  handicap: TeamHandicapConfig | null,
): string | null {
  if (!isSharedBallFormat(format)) return null
  const sinHandicap = groups.filter(
    (g) => g.players.length > 0 && handicapDeEquipo(format, g.players.map(() => 0), handicap) === null,
  )
  if (sinHandicap.length === 0) return null
  const primero = sinHandicap[0]
  if (
    format === 'scramble' &&
    handicap?.modo === 'personalizado' &&
    'porcentajes' in handicap &&
    Array.isArray(handicap.porcentajes) &&
    handicap.porcentajes.length !== primero.players.length
  ) {
    return `El equipo "${primero.name}" tiene ${primero.players.length} jugadores y el handicap personalizado está definido para ${handicap.porcentajes.length}. Ajusta los porcentajes o el equipo antes de iniciar.`
  }
  return `No se puede calcular el handicap de ${listaCorta(sinHandicap.map((g) => `"${g.name}"`))} con la configuración del torneo. Revisa el handicap de equipo antes de iniciar.`
}

/**
 * El motivo calculado desde lo que tiene el panel del organizador: TODOS los
 * inscritos (con su `status`) y los grupos con todos sus integrantes. Filtra a
 * aprobados igual que la ruta de inicio, así el panel y el 400 dicen lo mismo.
 */
export function motivoParaNoIniciarDesdeInscritos(
  format: string | null,
  players: Array<JugadorParaIniciar & { status: string }>,
  groups: GrupoParaIniciar[],
  teamConfig?: unknown,
): string | null {
  const aprobados = players.filter((p) => p.status === 'approved')
  return motivoParaNoIniciar(format, aprobados, soloAprobados(groups, aprobados), teamConfig)
}
