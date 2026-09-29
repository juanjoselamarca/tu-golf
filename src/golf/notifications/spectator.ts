// src/golf/notifications/spectator.ts
//
// Notificación persistente del ESPECTADOR de una ronda libre — fuente única.
//
// La misma función arma título, cuerpo, tag y URL tanto en el cliente (Service
// Worker local, app abierta) como en el servidor (/api/push/round-update, app
// cerrada). Antes el título se armaba en dos lugares con `H${maxHole}` y con
// cero hoyos jugados mostraba "H0" (inbox f6cca8e3, 25-sep-2026): "H0" no es
// un hoyo, es "todavía nadie terminó un hoyo".
//
// Avance con la convención del PGA Tour (src/golf/leaderboard/thru.ts):
// Thru = hoyos TERMINADOS. Vs-par con formatVsPar (src/golf/share/vs-par.ts).
//
// Puro: sin DOM, sin React, sin Supabase.

import { formatVsPar } from '@/golf/share/vs-par'
import { formatThru, THRU_LABEL } from '@/golf/leaderboard/thru'

// ── Tags (deben coincidir con public/sw.js) ──
export const TAG_PLAYER = 'golfers-player-round'
export const TAG_SPECTATOR_PREFIX = 'golfers-spectator-'

/** Tag por ronda: el SO reemplaza la notificación anterior con el mismo tag. */
export function spectatorTag(codigo: string): string {
  return `${TAG_SPECTATOR_PREFIX}${codigo}`
}

/** Cuántos jugadores caben en la línea colapsada de la notificación. */
export const MAX_PLAYERS_IN_BODY = 4

export const SPECTATOR_COPY = {
  notStarted: 'Por comenzar',
  noScoresYet: 'Aún sin puntajes',
  finalResult: 'Resultado final',
} as const

export interface SpectatorPlayer {
  nombre: string
  /** vs-par de los hoyos jugados (0 sin jugar: NO significa "even"). */
  vsPar: number
  /** Hoyos TERMINADOS. */
  holesCompleted: number
  totalHoles: number
}

export interface SpectatorNotificationInput {
  courseName: string
  codigo: string
  players: SpectatorPlayer[]
  /** Hoyos de la ronda (9/18). Si falta, se toma el máximo declarado por los jugadores. */
  totalHoles?: number
  finished?: boolean
}

export interface SpectatorNotification {
  title: string
  body: string
  tag: string
  url: string
  finished: boolean
}

function hasStarted(p: SpectatorPlayer): boolean {
  return p.holesCompleted > 0
}

/**
 * Orden PGA: los que ya juegan primero (mejor vs-par arriba); los que no
 * empezaron al final, en el orden en que vinieron.
 */
export function sortSpectatorPlayers(players: SpectatorPlayer[]): SpectatorPlayer[] {
  const started = players.filter(hasStarted).sort((a, b) => a.vsPar - b.vsPar)
  const pending = players.filter(p => !hasStarted(p))
  return [...started, ...pending]
}

function lastName(nombre: string): string {
  const parts = nombre.trim().split(/\s+/)
  return parts[parts.length - 1] || nombre
}

/**
 * Línea colapsada del cuerpo: "Lamarca -3 | González -1 | Silva —".
 * Sin nadie jugando → copy honesto, nunca "Lamarca E" (E sería mentir: no
 * está even, no empezó).
 *
 * Sin GWI: el servidor (app cerrada) no puede calcularlo barato (necesita
 * historial + patrones de cada jugador) y la notificación tiene que decir lo
 * mismo por los dos caminos. El GWI vive en el marcador.
 */
export function buildCollapsedBody(players: SpectatorPlayer[]): string {
  if (!players.some(hasStarted)) return SPECTATOR_COPY.noScoresYet
  return sortSpectatorPlayers(players)
    .slice(0, MAX_PLAYERS_IN_BODY)
    .map(p => hasStarted(p)
      ? `${lastName(p.nombre)} ${formatVsPar(p.vsPar)}`
      : `${lastName(p.nombre)} —`)
    .join(' | ')
}

/** Hoyos terminados por el jugador más avanzado. */
export function maxHolesCompleted(players: SpectatorPlayer[]): number {
  return players.reduce((m, p) => Math.max(m, p.holesCompleted), 0)
}

function resolveTotalHoles(input: SpectatorNotificationInput): number {
  if (input.totalHoles && input.totalHoles > 0) return input.totalHoles
  return input.players.reduce((m, p) => Math.max(m, p.totalHoles || 0), 0)
}

/**
 * Título de avance: "Club de Golf Los Leones · Thru 3". Sin hoyos terminados
 * → "· Por comenzar". Ronda completa → "· Thru F" (misma convención que el
 * marcador).
 */
export function buildSpectatorTitle(courseName: string, players: SpectatorPlayer[], totalHoles: number): string {
  const max = maxHolesCompleted(players)
  if (max <= 0) return `${courseName} · ${SPECTATOR_COPY.notStarted}`
  return `${courseName} · ${THRU_LABEL} ${formatThru(max, totalHoles)}`
}

export function buildSpectatorNotification(input: SpectatorNotificationInput): SpectatorNotification {
  const finished = input.finished === true
  const totalHoles = resolveTotalHoles(input)
  return {
    title: finished
      ? `${SPECTATOR_COPY.finalResult} · ${input.courseName}`
      : buildSpectatorTitle(input.courseName, input.players, totalHoles),
    body: buildCollapsedBody(input.players),
    tag: spectatorTag(input.codigo),
    url: `/ronda-libre/${input.codigo}${finished ? '?finished=true' : ''}`,
    finished,
  }
}
