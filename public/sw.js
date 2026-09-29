// Golfers+ Service Worker v4 — Persistent Round Notifications
// Supports: ongoing player notification, spectator table, push events
//
// Contrato con el servidor y el cliente: la notificación de una ronda seguida
// usa SIEMPRE el tag `golfers-spectator-<codigo>` (src/golf/notifications/
// spectator.ts). Mismo tag ⇒ el SO REEMPLAZA la notificación anterior en vez
// de apilar una nueva; `renotify: false` + `silent: true` ⇒ sin vibrar.
// El push del servidor y el mensaje local del cliente arman las opciones con
// la misma función (buildOptions) para que se comporten igual.

const CACHE_NAME = 'golfers-v4'

// ── Tags for notification types ──
const TAG_PLAYER = 'golfers-player-round'
const TAG_SPECTATOR_PREFIX = 'golfers-spectator-'
const TAG_DEFAULT = 'golfers-default'
const DEFAULT_ICON = '/icon-192.svg'

// Install
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// Activate — clean old caches, take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

/**
 * Opciones de showNotification para un payload (push del servidor o mensaje
 * del cliente — misma forma: title, body, tag, url|data.url, rondaCodigo,
 * type, finished, icon?, badge?, image?).
 */
function buildOptions(p) {
  const tag = p.tag || TAG_DEFAULT
  const isSpectator = tag.startsWith(TAG_SPECTATOR_PREFIX)
  const isPlayer = tag === TAG_PLAYER
  const isPersistent = isPlayer || isSpectator
  const finished = p.finished === true

  const options = {
    body: p.body || '',
    icon: p.icon || DEFAULT_ICON,
    badge: p.badge || DEFAULT_ICON,
    tag: tag,
    // Persistent notifications: silent update, no re-alert.
    // Event notifications (birdie, eagle): vibrate + renotify.
    renotify: !isPersistent,
    silent: isPersistent,
    // Keep persistent notifications visible until dismissed (not once finished).
    requireInteraction: isPersistent && !finished,
    data: {
      url: (p.data && p.data.url) || p.url || '/',
      type: p.type || 'default',
      rondaCodigo: p.rondaCodigo || (p.data && p.data.rondaCodigo) || null,
      timestamp: Date.now(),
    },
  }

  if (finished) {
    options.actions = [{ action: 'open', title: 'Ver resultado' }]
  } else if (isSpectator) {
    options.actions = [
      { action: 'open', title: 'Ver ronda' },
      { action: 'unfollow', title: 'Dejar de seguir' },
    ]
  } else if (isPlayer) {
    options.actions = [{ action: 'open', title: 'Volver al scorer' }]
  }

  if (p.image) options.image = p.image
  return options
}

// Push — receive push notifications from Golfers+ server
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Golfers+', body: event.data?.text() || '' }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Golfers+', buildOptions(data))
  )
})

// Click — navigate to the relevant page
self.addEventListener('notificationclick', (event) => {
  const { action } = event
  const data = event.notification.data || {}
  const url = data.url || '/'

  // "Dejar de seguir" action — dismiss + tell client to unfollow
  if (action === 'unfollow' && data.rondaCodigo) {
    event.notification.close()
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          client.postMessage({
            type: 'UNFOLLOW_ROUND',
            rondaCodigo: data.rondaCodigo,
          })
        }
      })
    )
    return
  }

  // Default: close and navigate
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Try to focus an existing Golfers+ window
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // No existing window — open new
      return self.clients.openWindow(url)
    })
  )
})

// Message from client — handle local notification updates
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {}

  if (type === 'SHOW_NOTIFICATION' && payload) {
    event.waitUntil(
      self.registration.showNotification(payload.title || 'Golfers+', buildOptions(payload))
    )
  }

  if (type === 'CLEAR_NOTIFICATION' && payload?.tag) {
    event.waitUntil(
      self.registration.getNotifications({ tag: payload.tag }).then((notifications) => {
        notifications.forEach((n) => n.close())
      })
    )
  }
})
