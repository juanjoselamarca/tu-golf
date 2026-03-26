/**
 * Push Notifications v2 — Golfers+
 * Real Web Push with VAPID keys + server-side delivery
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

// Validate VAPID key at module load (server-side only)
if (typeof window === 'undefined' && !VAPID_PUBLIC_KEY) {
  throw new Error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set. Push notifications require a valid VAPID key.')
}

// ── Support checks ──────────────────────────────────────────────

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export function getPermissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

// ── Permission + Subscribe ──────────────────────────────────────

/**
 * Request permission, subscribe to push, and save subscription to server.
 * Returns true if fully set up.
 */
export async function setupPushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false

  // Request permission
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  // Validate VAPID key before attempting subscription
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Push] VAPID_PUBLIC_KEY is not configured. Push notifications will not work.')
    return false
  }

  try {
    // Register/get service worker
    const registration = await navigator.serviceWorker.ready

    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription()

    // Create new subscription with VAPID key
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })
    }

    // Send subscription to our server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    })

    // Save local preference
    setNotifPrefs({ enabled: true })

    return true
  } catch (err) {
    console.error('[Push] Setup failed:', err)
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

/**
 * Trigger server to send push to specific users or all subscribers.
 * Called from client when an event happens (score update, etc.)
 */
export async function sendPushViaServer(payload: {
  title: string
  body: string
  tag?: string
  url?: string
  userIds?: string[]
  rondaCodigo?: string
}): Promise<boolean> {
  try {
    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userIds: payload.userIds,
        rondaCodigo: payload.rondaCodigo,
        payload: {
          title: payload.title,
          body: payload.body,
          tag: payload.tag || 'golfers-event',
          url: payload.url || '/',
          icon: '/icon-192.svg',
        },
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

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

export async function updatePlayerNotification(
  courseName: string,
  hole: number,
  par: number,
  totalVsPar: string,
  scoreUrl: string
): Promise<boolean> {
  return sendLocalNotification(
    `Hoyo ${hole} · Par ${par}`,
    `${courseName} · Score: ${totalVsPar}`,
    { tag: 'player-active-round', url: scoreUrl }
  )
}

export async function remindToScore(hole: number, scoreUrl: string): Promise<boolean> {
  return sendLocalNotification(
    `Sigues en el hoyo ${hole}?`,
    'Toca para continuar tu ronda',
    { tag: 'player-reminder', url: scoreUrl }
  )
}

export async function clearRoundNotifications(): Promise<void> {
  if (!isPushSupported()) return
  try {
    const registration = await navigator.serviceWorker.ready
    const notifications = await registration.getNotifications()
    notifications.forEach(n => n.close())
  } catch {}
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
