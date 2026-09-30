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
    if (res.status === 409) {
      // Ronda terminada, o el endpoint pertenece a otro dispositivo (no debería pasar).
      const body = await res.json().catch(() => ({})) as { code?: string }
      return body.code === 'round_over' ? 'round_over' : 'error'
    }
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

const UNFOLLOW_RETRY_DELAYS_MS = [0, 500, 1500]

/**
 * Avisa al servidor que este dispositivo (y el usuario, si hay sesión) deja de
 * seguir. Reintenta 3 veces. Devuelve true si el servidor lo confirmó.
 */
async function unfollowOnServer(codigo: string): Promise<boolean> {
  const subscription = await getCurrentPushSubscription()
  const body = JSON.stringify({
    codigo,
    subscription: subscription
      ? { endpoint: subscription.endpoint, keys: { auth: subscription.keys.auth } }
      : undefined,
  })
  for (const delay of UNFOLLOW_RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay))
    try {
      const res = await fetch('/api/push/follow', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      })
      // 404 = el servidor ya no tiene el watcher: objetivo cumplido.
      if (res.ok || res.status === 404) return true
    } catch { /* red: reintentar */ }
  }
  return false
}

/**
 * Dejar de seguir. Estado honesto: si el servidor no confirmó (seguiría
 * empujando), la ronda vuelve a la lista local y se devuelve false para que la
 * UI lo diga.
 */
export async function unfollowRound(codigo: string): Promise<boolean> {
  const current = getFollowedRounds()
  const entry = current.find(r => r.codigo === codigo)
  saveFollowedRounds(current.filter(r => r.codigo !== codigo))
  void clearSpectatorNotification(codigo)

  const ok = await unfollowOnServer(codigo)
  if (!ok) {
    if (entry) saveFollowedRounds([...getFollowedRounds().filter(r => r.codigo !== codigo), entry])
    void captureError('unfollow no confirmado por el servidor', { context: 'notif.unfollow', level: 'warning', meta: { codigo } })
  }
  return ok
}

/**
 * Limpia las rondas seguidas que ya no están activas: localStorage y
 * watchers en el servidor (el servidor también borra los watchers al empujar
 * el resultado final; acá se reintenta lo que haya quedado).
 */
export function cleanupFollowedRounds(activeCodigos: string[]): void {
  const current = getFollowedRounds()
  const stale = current.filter(r => !activeCodigos.includes(r.codigo))
  if (stale.length === 0) return
  saveFollowedRounds(current.filter(r => activeCodigos.includes(r.codigo)))
  for (const r of stale) void unfollowOnServer(r.codigo)
}

// ── Disparo del push del servidor (desde la capa de datos, al guardar) ──

const PUSH_THROTTLE_KEY = 'golfers-push-throttle'
/** Máximo 1 push cada 15s por ronda: 4 jugadores × 18 hoyos son 72 guardados. */
export const PUSH_THROTTLE_MS = 15_000

/**
 * Milisegundos que faltan para poder empujar esta ronda. 0 = se puede ahora
 * (y deja la marca). Ventana por sessionStorage: sobrevive a recargas.
 */
export function pushThrottleRemainingMs(codigo: string, now: number = Date.now()): number {
  try {
    const key = `${PUSH_THROTTLE_KEY}-${codigo}`
    const last = parseInt(sessionStorage.getItem(key) ?? '0')
    const remaining = PUSH_THROTTLE_MS - (now - last)
    if (remaining > 0) return remaining
    sessionStorage.setItem(key, String(now))
    return 0
  } catch {
    return 0
  }
}

/** ¿Hay que frenar el push de esta ronda ahora mismo? */
export function shouldThrottlePush(codigo: string): boolean {
  return pushThrottleRemainingMs(codigo) > 0
}

export interface TriggerPushOptions {
  /** Ronda finalizada: salta el throttle y reintenta si el servidor no responde 2xx. */
  force?: boolean
  /** Fila del jugador que anota: un invitado sin cuenta prueba con él que participa. */
  jugadorId?: string
}

/** Reintentos del push FORZADO (resultado final): 0 / 500 / 1500 ms, como unfollowOnServer. */
export const FORCE_RETRY_DELAYS_MS = [0, 500, 1500]

/** Envío final pendiente por ronda (throttle), con las opciones del último guardado. */
const trailingTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; opts: TriggerPushOptions }>()

async function postRoundUpdate(codigo: string, opts: TriggerPushOptions): Promise<void> {
  if (typeof fetch !== 'function') return
  const body = JSON.stringify({ codigo, ...(opts.jugadorId ? { jugadorId: opts.jugadorId } : {}) })
  const delays = opts.force ? FORCE_RETRY_DELAYS_MS : [0]
  for (const delay of delays) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay))
    try {
      const res = await fetch('/api/push/round-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      })
      if (res.ok) return
    } catch { /* red: reintentar si es forzado */ }
  }
}

/**
 * Pide al servidor que empuje el estado ACTUAL de la ronda (lo lee de la BD)
 * a quienes la siguen.
 *
 * Throttle con envío final: el primer guardado de la ventana sale al instante;
 * si llegan más dentro de los 15s (4 jugadores en el mismo hoyo), se agenda UN
 * envío al cerrar la ventana — así el último puntaje siempre llega. Antes era
 * sólo "borde de entrada" y el resto de la ventana se perdía.
 *
 * `force` (ronda finalizada) salta el throttle, cancela el envío pendiente y
 * reintenta ante no-2xx: el "Resultado final" no se puede perder.
 */
export function triggerRoundUpdatePush(codigo: string, opts: TriggerPushOptions = {}): void {
  const pending = trailingTimers.get(codigo)
  // El jugadorId del envío pendiente no se pierde: si el forzado (o el último
  // guardado) no lo trae, se usa el del pendiente (invitado sin cuenta).
  const merged: TriggerPushOptions = { ...opts, jugadorId: opts.jugadorId ?? pending?.opts.jugadorId }
  if (opts.force) {
    if (pending) { clearTimeout(pending.timer); trailingTimers.delete(codigo) }
    void postRoundUpdate(codigo, merged)
    return
  }
  const wait = pushThrottleRemainingMs(codigo)
  if (wait === 0) { void postRoundUpdate(codigo, merged); return }
  if (pending) { pending.opts = merged; return }
  trailingTimers.set(codigo, {
    opts: merged,
    timer: setTimeout(() => {
      const entry = trailingTimers.get(codigo)
      trailingTimers.delete(codigo)
      triggerRoundUpdatePush(codigo, entry?.opts ?? merged)
    }, wait),
  })
}
