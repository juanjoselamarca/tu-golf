/**
 * Push Notifications v2 — Golfers+
 * Real Web Push with VAPID keys + server-side delivery
 */

import { captureError } from './error-tracking'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

// Validate VAPID key at module load (server-side only)
if (typeof window === 'undefined' && !VAPID_PUBLIC_KEY) {
  throw new Error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set. Push notifications require a valid VAPID key.')
}

// ── Support checks ──────────────────────────────────────────────

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    // iPadOS 13+ reports as "Mac" — detect via touch support
    || (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
}

export function getIOSVersion(): number | null {
  if (typeof navigator === 'undefined') return null
  const match = navigator.userAgent.match(/OS (\d+)_(\d+)/)
  if (!match) return null
  return parseFloat(`${match[1]}.${match[2]}`)
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari: navigator.standalone. Modern browsers: matchMedia display-mode.
  const navStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  const mqStandalone = typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false
  return navStandalone || mqStandalone
}

/**
 * Status detallado de soporte de push. iOS tiene requisitos extra:
 * 16.4+ obligatorio + app debe estar instalada como PWA (add to home screen).
 */
export type PushSupportStatus =
  | { supported: true }
  | { supported: false; reason: 'no_browser_api' | 'ios_too_old' | 'ios_not_pwa'; minIOSVersion?: number }

export function getPushSupportStatus(): PushSupportStatus {
  if (typeof window === 'undefined'
      || !('serviceWorker' in navigator)
      || !('PushManager' in window)
      || !('Notification' in window)) {
    return { supported: false, reason: 'no_browser_api' }
  }
  if (isIOS()) {
    const v = getIOSVersion()
    if (v != null && v < 16.4) {
      return { supported: false, reason: 'ios_too_old', minIOSVersion: 16.4 }
    }
    if (!isStandalonePWA()) {
      return { supported: false, reason: 'ios_not_pwa' }
    }
  }
  return { supported: true }
}

export function isPushSupported(): boolean {
  return getPushSupportStatus().supported
}

export function getPermissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

// ── Permission + Subscribe ──────────────────────────────────────

/** Forma serializable de la suscripción del dispositivo (PushSubscription.toJSON con keys presentes). */
export interface PushSubscriptionPayload {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

function toPayload(sub: PushSubscription | null): PushSubscriptionPayload | null {
  if (!sub) return null
  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) return null
  return { endpoint: json.endpoint, keys: { p256dh, auth } }
}

/**
 * Suscripción push actual del dispositivo, sin pedir permiso ni crear una
 * nueva. null si no hay soporte, permiso o suscripción.
 */
export async function getCurrentPushSubscription(): Promise<PushSubscriptionPayload | null> {
  if (!isPushSupported() || Notification.permission !== 'granted') return null
  try {
    const registration = await navigator.serviceWorker.ready
    return toPayload(await registration.pushManager.getSubscription())
  } catch {
    return null
  }
}

/**
 * Garantiza una suscripción push del dispositivo: pide permiso si hace falta,
 * reutiliza la existente o crea una con la VAPID key. Es la identidad con la
 * que el servidor sabe a qué dispositivo empujar (con o sin cuenta).
 */
export async function ensurePushSubscription(): Promise<PushSubscriptionPayload | null> {
  if (!isPushSupported()) return null

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permission !== 'granted') return null

  if (!VAPID_PUBLIC_KEY) {
    void captureError('NEXT_PUBLIC_VAPID_PUBLIC_KEY no configurada', { context: 'push.ensure-subscription', level: 'warning' })
    return null
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const existing = toPayload(await registration.pushManager.getSubscription())
    if (existing) return existing
    const created = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
    return toPayload(created)
  } catch (err) {
    void captureError(err, { context: 'push.ensure-subscription', level: 'warning' })
    return null
  }
}

/**
 * Request permission, subscribe to push, and save subscription to server
 * (usuario autenticado). Returns true if fully set up.
 */
export async function setupPushNotifications(): Promise<boolean> {
  const subscription = await ensurePushSubscription()
  if (!subscription) return false

  try {
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription }),
    })

    // Save local preference — enable all types by default on first setup
    setNotifPrefs({ enabled: true, player: true, spectator: true })

    return true
  } catch (err) {
    void captureError(err, { context: 'push.setup', level: 'warning' })
    return false
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribePush(): Promise<boolean> {
  if (!isPushSupported()) return false

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      // Remove from server
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
      // Unsubscribe locally
      await subscription.unsubscribe()
    }

    setNotifPrefs({ enabled: false })
    return true
  } catch {
    return false
  }
}

/**
 * Check if user is currently subscribed to push
 */
export async function isSubscribedToPush(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return !!subscription
  } catch {
    return false
  }
}

// ── Send push via server ────────────────────────────────────────

// El envío masivo (/api/push/send) es solo para broadcast del admin desde el
// servidor. El navegador NUNCA lo llama: un birdie de un admin sin `userIds`
// llegaba a TODOS los usuarios (bug 29-sep-2026). Los avisos de una ronda van
// a sus seguidores vía /api/push/round-update.

// ── Local notification fallback ─────────────────────────────────

export async function sendLocalNotification(
  title: string,
  body: string,
  options?: { tag?: string; url?: string }
): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== 'granted') return false
  try {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification(title, {
      body,
      icon: '/icon-192.svg',
      tag: options?.tag || 'golfers-local',
      data: { url: options?.url || '/' },
    } as NotificationOptions & Record<string, unknown>)
    return true
  } catch {
    return false
  }
}

// ── Event-specific notifications ────────────────────────────────

export async function notifyScoreEvent(
  playerName: string,
  event: 'birdie' | 'eagle' | 'leader_change' | 'round_finished',
  details: string,
  rondaUrl: string
): Promise<boolean> {
  const titles: Record<string, string> = {
    birdie: 'Birdie',
    eagle: 'Eagle',
    leader_change: 'Cambio de lider',
    round_finished: 'Ronda finalizada',
  }
  return sendLocalNotification(
    `${titles[event]} — ${playerName}`,
    details,
    { tag: `ronda-${event}`, url: rondaUrl }
  )
}

// ── Preferences ─────────────────────────────────────────────────

interface NotifPrefs {
  enabled?: boolean
  spectator?: boolean
  player?: boolean
}

export function getNotifPrefs(): { enabled: boolean; spectator: boolean; player: boolean } {
  try {
    const stored = localStorage.getItem('golfers-notif-prefs')
    return stored ? { enabled: false, spectator: false, player: false, ...JSON.parse(stored) } : { enabled: false, spectator: false, player: false }
  } catch {
    return { enabled: false, spectator: false, player: false }
  }
}

export function setNotifPrefs(prefs: NotifPrefs): void {
  const current = getNotifPrefs()
  const updated = { ...current, ...prefs }
  localStorage.setItem('golfers-notif-prefs', JSON.stringify(updated))
}

// ── Helpers ─────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Backwards compatibility
export async function requestPermission(): Promise<boolean> {
  return setupPushNotifications()
}
