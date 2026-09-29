/**
 * Round Notifications — Golfers+ (plomería cliente)
 *
 * Notificaciones persistentes del SO para rondas libres:
 * - Tipo A (jugador): "Hoyo 7 · Par 4 · Score: +3" con deep link al scorer.
 * - Tipo B (espectador): tabla PGA de la ronda seguida.
 *
 * El CONTENIDO de la notificación del espectador (título, cuerpo, tag, url) se
 * arma en src/golf/notifications/spectator.ts — la misma función que usa el
 * servidor. Acá sólo vive lo que habla con el browser: Service Worker,
 * localStorage y los endpoints /api/push/*.
 *
 * Seguir una ronda funciona con y sin cuenta: la identidad del seguidor es la
 * suscripción push del dispositivo (ver /api/push/follow).
 */

import {
  isPushSupported,
  getNotifPrefs,
  setNotifPrefs,
  ensurePushSubscription,
  getCurrentPushSubscription,
} from './push-notifications'
import { captureError } from './error-tracking'
import {
  buildSpectatorNotification,
  spectatorTag,
  TAG_PLAYER,
  type SpectatorPlayer,
} from '@/golf/notifications/spectator'

export { TAG_PLAYER, TAG_SPECTATOR_PREFIX, spectatorTag } from '@/golf/notifications/spectator'
export type { SpectatorPlayer } from '@/golf/notifications/spectator'

async function postToServiceWorker(message: unknown): Promise<void> {
  const sw = await navigator.serviceWorker.ready
  sw.active?.postMessage(message)
}

// ── Tipo A: jugador ──

interface PlayerNotifPayload {
  courseName: string
  hole: number
  par: number
  codigo: string
  /** vs-par actual (+3, E, -2) */
  vsPar: string
}

/** Muestra o actualiza la notificación persistente del jugador (silenciosa). */
export async function showPlayerNotification(payload: PlayerNotifPayload): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return
  if (!getNotifPrefs().player) return

  await postToServiceWorker({
    type: 'SHOW_NOTIFICATION',
    payload: {
      title: `Hoyo ${payload.hole} · Par ${payload.par} · Score: ${payload.vsPar}`,
      body: payload.courseName,
      tag: TAG_PLAYER,
      url: `/ronda-libre/${payload.codigo}/score?hole=${payload.hole}`,
      rondaCodigo: payload.codigo,
      type: 'player',
    },
  })
}

/** Convierte la notificación del jugador en el resultado final. */
export async function showPlayerFinishedNotification(payload: {
  courseName: string
  grossScore: number
  vsPar: string
  codigo: string
}): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return
  if (!getNotifPrefs().player) return

  await postToServiceWorker({
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

export async function clearPlayerNotification(): Promise<void> {
  if (!isPushSupported()) return
  await postToServiceWorker({ type: 'CLEAR_NOTIFICATION', payload: { tag: TAG_PLAYER } })
}

// ── Tipo B: espectador ──

export interface SpectatorNotifPayload {
  courseName: string
  codigo: string
  players: SpectatorPlayer[]
  /** Hoyos de la ronda (9/18). */
  totalHoles: number
  finished?: boolean
}

/**
 * Muestra o actualiza la notificación del espectador para una ronda (tag por
 * ronda: se pueden seguir varias a la vez). Mismo contenido que el push del
 * servidor, por construcción.
 */
export async function showSpectatorNotification(payload: SpectatorNotifPayload): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return
  if (!getNotifPrefs().spectator) return

  const notif = buildSpectatorNotification(payload)
  await postToServiceWorker({
    type: 'SHOW_NOTIFICATION',
    payload: {
      title: notif.title,
      body: notif.body,
      tag: notif.tag,
      url: notif.url,
      rondaCodigo: payload.codigo,
      type: 'spectator',
      finished: notif.finished,
    },
  })
}

export async function showSpectatorFinishedNotification(payload: Omit<SpectatorNotifPayload, 'finished'>): Promise<void> {
  return showSpectatorNotification({ ...payload, finished: true })
}

export async function clearSpectatorNotification(codigo: string): Promise<void> {
  if (!isPushSupported()) return
  await postToServiceWorker({ type: 'CLEAR_NOTIFICATION', payload: { tag: spectatorTag(codigo) } })
}

// ── Rondas seguidas (este dispositivo) ──

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

function saveFollowedRounds(rounds: FollowedRound[]): void {
  try { localStorage.setItem(FOLLOWED_ROUNDS_KEY, JSON.stringify(rounds)) } catch { /* privado / sin storage */ }
}

export function isFollowingRound(codigo: string): boolean {
  return getFollowedRounds().some(r => r.codigo === codigo)
}

export type FollowOutcome = 'ok' | 'unsupported' | 'permission_denied' | 'round_over' | 'error'

/**
 * Seguir una ronda en ESTE dispositivo (con o sin cuenta).
 *
 * 1. Asegura la suscripción push del dispositivo (pide permiso si hace falta;
 *    reutiliza o crea la suscripción). Siempre — antes sólo se registraba la
 *    primera vez y un endpoint rotado dejaba al seguidor sin push.
 * 2. La registra en el servidor junto con el watcher (/api/push/follow).
 * 3. Recién con el servidor OK marca la ronda como seguida localmente.
 */
export async function followRound(codigo: string, courseName: string): Promise<FollowOutcome> {
  if (!isPushSupported()) return 'unsupported'

  const subscription = await ensurePushSubscription()
  if (!subscription) {
    return Notification.permission === 'denied' ? 'permission_denied' : 'error'
  }

  try {
    const res = await fetch('/api/push/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, subscription }),
    })
    if (res.status === 409) return 'round_over'
    if (!res.ok) return 'error'
  } catch (err) {
    void captureError(err, { context: 'notif.follow', level: 'warning', meta: { codigo } })
    return 'error'
  }

  if (!getNotifPrefs().spectator) setNotifPrefs({ spectator: true, enabled: true })
  const rounds = getFollowedRounds().filter(r => r.codigo !== codigo)
  rounds.push({ codigo, courseName, followedAt: Date.now() })
  saveFollowedRounds(rounds)
  return 'ok'
}

/** Avisa al servidor que este dispositivo (y el usuario, si hay sesión) deja de seguir. */
async function unfollowOnServer(codigos: string[]): Promise<void> {
  const subscription = await getCurrentPushSubscription()
  await Promise.allSettled(codigos.map(codigo =>
    fetch('/api/push/follow', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo,
        subscription: subscription
          ? { endpoint: subscription.endpoint, keys: { auth: subscription.keys.auth } }
          : undefined,
      }),
      keepalive: true,
    }),
  ))
}

export function unfollowRound(codigo: string): void {
  saveFollowedRounds(getFollowedRounds().filter(r => r.codigo !== codigo))
  void clearSpectatorNotification(codigo)
  void unfollowOnServer([codigo]).catch(() => {})
}

/**
 * Limpia las rondas seguidas que ya no están activas: localStorage y
 * watchers en el servidor (el servidor también borra los watchers al empujar
 * el resultado final).
 */
export function cleanupFollowedRounds(activeCodigos: string[]): void {
  const current = getFollowedRounds()
  const stale = current.filter(r => !activeCodigos.includes(r.codigo))
  if (stale.length === 0) return
  saveFollowedRounds(current.filter(r => activeCodigos.includes(r.codigo)))
  void unfollowOnServer(stale.map(r => r.codigo)).catch(() => {})
}

// ── Disparo del push del servidor (desde el scorer) ──

const PUSH_THROTTLE_KEY = 'golfers-push-throttle'
const PUSH_THROTTLE_MS = 15_000 // Máximo 1 push cada 15s por ronda

/**
 * ¿Hay que frenar el push de esta ronda? Máximo 1 cada 15s: 4 jugadores × 18
 * hoyos son 72 guardados, el espectador necesita actualizaciones periódicas.
 */
export function shouldThrottlePush(codigo: string): boolean {
  try {
    const key = `${PUSH_THROTTLE_KEY}-${codigo}`
    const last = parseInt(sessionStorage.getItem(key) ?? '0')
    const now = Date.now()
    if (now - last < PUSH_THROTTLE_MS) return true
    sessionStorage.setItem(key, String(now))
    return false
  } catch {
    return false
  }
}

/**
 * Pide al servidor que empuje el estado ACTUAL de la ronda (lo lee de la BD)
 * a quienes la siguen. `force` salta el throttle (ronda finalizada).
 */
export function triggerRoundUpdatePush(codigo: string, opts: { force?: boolean } = {}): void {
  if (!opts.force && shouldThrottlePush(codigo)) return
  fetch('/api/push/round-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo }),
    keepalive: true,
  }).catch(() => {})
}
