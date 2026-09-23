/**
 * Round Notifications — Golfers+
 *
 * Manages persistent OS notifications for active rounds:
 * - Tipo A (Player): "Hoyo 7 · Par 4" with deep link back to scorer
 * - Tipo B (Spectator): PGA-style table of all players
 *
 * Uses Service Worker message API for local updates (no server push needed
 * for the player's own notification). Spectator notifications use the same
 * SW message API when the app is open, plus server push when closed.
 *
 * All notifications can be disabled via notification preferences.
 */

import { isPushSupported, getNotifPrefs } from './push-notifications'

// ── Tags (must match sw.js) ──
export const TAG_PLAYER = 'golfers-player-round'
export const TAG_SPECTATOR_PREFIX = 'golfers-spectator-'

// ── Tipo A: Player Persistent Notification ──

interface PlayerNotifPayload {
  courseName: string
  hole: number
  par: number
  codigo: string
}

/**
 * Show or update the player's persistent notification.
 * Called when entering the scorer and on each hole change.
 * Silent update — no vibration, no sound.
 */
export async function showPlayerNotification(payload: PlayerNotifPayload): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return
  if (!getNotifPrefs().player) return

  const sw = await navigator.serviceWorker.ready
  sw.active?.postMessage({
    type: 'SHOW_NOTIFICATION',
    payload: {
      title: `Hoyo ${payload.hole} · Par ${payload.par}`,
      body: payload.courseName,
      tag: TAG_PLAYER,
      url: `/ronda-libre/${payload.codigo}/score?hole=${payload.hole}`,
      rondaCodigo: payload.codigo,
      type: 'player',
    },
  })
}

/**
 * Mutate the player notification to show final result.
 * Called when the round is finalized.
 */
export async function showPlayerFinishedNotification(payload: {
  courseName: string
  grossScore: number
  vsPar: string
  codigo: string
}): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return
  if (!getNotifPrefs().player) return

  const sw = await navigator.serviceWorker.ready
  sw.active?.postMessage({
    type: 'SHOW_NOTIFICATION',
    payload: {
      title: `Ronda terminada · ${payload.vsPar}`,
      body: `${payload.courseName} · ${payload.grossScore} golpes`,
      tag: TAG_PLAYER,
      url: `/ronda-libre/${payload.codigo}?finished=true`,
      rondaCodigo: payload.codigo,
      type: 'player',
      finished: true,
    },
  })
}

/**
 * Remove the player notification (e.g., when discarding a round).
 */
export async function clearPlayerNotification(): Promise<void> {
  if (!isPushSupported()) return
  const sw = await navigator.serviceWorker.ready
  sw.active?.postMessage({
    type: 'CLEAR_NOTIFICATION',
    payload: { tag: TAG_PLAYER },
  })
}

// ── Tipo B: Spectator Persistent Notification ──

export interface SpectatorPlayer {
  nombre: string
  vsPar: number
  holesCompleted: number
  totalHoles: number
}

interface SpectatorNotifPayload {
  courseName: string
  codigo: string
  players: SpectatorPlayer[]
  maxHole: number
}

function formatVsPar(vsPar: number): string {
  if (vsPar === 0) return 'E'
  if (vsPar > 0) return `+${vsPar}`
  return `${vsPar}`
}

/**
 * Build the collapsed one-liner for the notification body.
 * Format: "Lamarca -3 | González -1 | Silva E | Torres +2"
 */
function buildCollapsedBody(players: SpectatorPlayer[]): string {
  return players
    .slice(0, 4)
    .map(p => {
      const lastName = p.nombre.split(' ').pop() ?? p.nombre
      return `${lastName} ${formatVsPar(p.vsPar)}`
    })
    .join(' | ')
}

/**
 * Show or update the spectator's persistent notification for a round.
 * Uses a per-round tag so multiple rounds can be followed simultaneously.
 */
export async function showSpectatorNotification(payload: SpectatorNotifPayload): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return
  if (!getNotifPrefs().spectator) return

  const tag = `${TAG_SPECTATOR_PREFIX}${payload.codigo}`
  const sorted = [...payload.players].sort((a, b) => a.vsPar - b.vsPar)

  const sw = await navigator.serviceWorker.ready
  sw.active?.postMessage({
    type: 'SHOW_NOTIFICATION',
    payload: {
      title: `${payload.courseName} · H${payload.maxHole}`,
      body: buildCollapsedBody(sorted),
      tag,
      url: `/ronda-libre/${payload.codigo}`,
      rondaCodigo: payload.codigo,
      type: 'spectator',
    },
  })
}

/**
 * Show the spectator finished notification with final results.
 */
export async function showSpectatorFinishedNotification(payload: {
  courseName: string
  codigo: string
  players: SpectatorPlayer[]
}): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return

  const tag = `${TAG_SPECTATOR_PREFIX}${payload.codigo}`
  const sorted = [...payload.players].sort((a, b) => a.vsPar - b.vsPar)

  const sw = await navigator.serviceWorker.ready
  sw.active?.postMessage({
    type: 'SHOW_NOTIFICATION',
    payload: {
      title: `Resultado final · ${payload.courseName}`,
      body: buildCollapsedBody(sorted),
      tag,
      url: `/ronda-libre/${payload.codigo}?finished=true`,
      rondaCodigo: payload.codigo,
      type: 'spectator',
      finished: true,
    },
  })
}

/**
 * Clear spectator notification for a specific round.
 */
export async function clearSpectatorNotification(codigo: string): Promise<void> {
  if (!isPushSupported()) return
  const sw = await navigator.serviceWorker.ready
  sw.active?.postMessage({
    type: 'CLEAR_NOTIFICATION',
    payload: { tag: `${TAG_SPECTATOR_PREFIX}${codigo}` },
  })
}

// ── Followed rounds storage ──

const FOLLOWED_ROUNDS_KEY = 'golfers-followed-rounds'

export interface FollowedRound {
  codigo: string
  courseName: string
  followedAt: number
}

export function getFollowedRounds(): FollowedRound[] {
  try {
    const stored = localStorage.getItem(FOLLOWED_ROUNDS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function followRound(codigo: string, courseName: string): void {
  const rounds = getFollowedRounds().filter(r => r.codigo !== codigo)
  rounds.push({ codigo, courseName, followedAt: Date.now() })
  localStorage.setItem(FOLLOWED_ROUNDS_KEY, JSON.stringify(rounds))
}

export function unfollowRound(codigo: string): void {
  const rounds = getFollowedRounds().filter(r => r.codigo !== codigo)
  localStorage.setItem(FOLLOWED_ROUNDS_KEY, JSON.stringify(rounds))
  void clearSpectatorNotification(codigo)
}

export function isFollowingRound(codigo: string): boolean {
  return getFollowedRounds().some(r => r.codigo === codigo)
}

/**
 * Clean up followed rounds that are no longer active.
 * Called periodically to prevent stale entries.
 */
export function cleanupFollowedRounds(activeCodigos: string[]): void {
  const rounds = getFollowedRounds().filter(r => activeCodigos.includes(r.codigo))
  localStorage.setItem(FOLLOWED_ROUNDS_KEY, JSON.stringify(rounds))
}
