/**
 * Push Notifications — Golfers+
 * Handles subscription, permission requests, and notification sending
 */

// Check if push is supported
export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

// Check current permission state
export function getPermissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

// Request notification permission
export async function requestPermission(): Promise<boolean> {
  if (!isPushSupported()) return false
  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

// Subscribe to push notifications
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // For production, you'd use a VAPID key here
      // For now, we use local notifications via the SW
    })
    return subscription
  } catch {
    return null
  }
}

// Send a local notification (doesn't require push server)
export async function sendLocalNotification(
  title: string,
  body: string,
  options?: {
    tag?: string
    url?: string
    actions?: Array<{ action: string; title: string }>
  }
): Promise<boolean> {
  if (!isPushSupported()) return false
  if (Notification.permission !== 'granted') return false

  try {
    const registration = await navigator.serviceWorker.ready
    // Use Object.assign to bypass strict NotificationOptions type
    // (renotify, vibrate, actions are valid in ServiceWorkerRegistration.showNotification)
    const notifOptions: NotificationOptions & Record<string, unknown> = {
      body,
      icon: '/icon-192.svg',
      tag: options?.tag || 'golfers-local',
      data: { url: options?.url || '/dashboard' },
    }
    await registration.showNotification(title, notifOptions)
    return true
  } catch {
    return false
  }
}

// Spectator: notify on score event
export async function notifyScoreEvent(
  playerName: string,
  event: 'birdie' | 'eagle' | 'leader_change' | 'round_finished',
  details: string,
  rondaUrl: string
): Promise<boolean> {
  const titles: Record<string, string> = {
    birdie: '🐦 Birdie',
    eagle: '🦅 Eagle',
    leader_change: '🏆 Cambio de líder',
    round_finished: '✅ Ronda finalizada',
  }

  return sendLocalNotification(
    titles[event] || 'Golfers+',
    `${playerName} — ${details}`,
    { tag: `ronda-${event}`, url: rondaUrl }
  )
}

// Player: update persistent notification with current hole
export async function updatePlayerNotification(
  courseName: string,
  hole: number,
  par: number,
  totalVsPar: string,
  scoreUrl: string
): Promise<boolean> {
  return sendLocalNotification(
    `⛳ Hoyo ${hole} · Par ${par}`,
    `${courseName} · Score: ${totalVsPar}`,
    { tag: 'player-active-round', url: scoreUrl }
  )
}

// Player: remind to score
export async function remindToScore(
  hole: number,
  scoreUrl: string
): Promise<boolean> {
  return sendLocalNotification(
    '⏳ ¿Sigues en el hoyo ' + hole + '?',
    'Toca para continuar tu ronda',
    { tag: 'player-reminder', url: scoreUrl }
  )
}

// Clear all notifications for a round
export async function clearRoundNotifications(): Promise<void> {
  if (!isPushSupported()) return
  try {
    const registration = await navigator.serviceWorker.ready
    const notifications = await registration.getNotifications()
    notifications.forEach(n => n.close())
  } catch {}
}

// Storage helpers for notification preferences
export function getNotifPrefs(): { spectator: boolean; player: boolean } {
  try {
    const stored = localStorage.getItem('golfers-notif-prefs')
    return stored ? JSON.parse(stored) : { spectator: false, player: false }
  } catch {
    return { spectator: false, player: false }
  }
}

export function setNotifPrefs(prefs: { spectator?: boolean; player?: boolean }): void {
  const current = getNotifPrefs()
  const updated = { ...current, ...prefs }
  localStorage.setItem('golfers-notif-prefs', JSON.stringify(updated))
}
