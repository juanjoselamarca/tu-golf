// Golfers+ Service Worker v3 — Persistent Round Notifications
// Supports: ongoing player notification, spectator table, push events

const CACHE_NAME = 'golfers-v3'

// ── Tags for notification types ──
const TAG_PLAYER = 'golfers-player-round'
const TAG_SPECTATOR_PREFIX = 'golfers-spectator-'
const TAG_DEFAULT = 'golfers-default'

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

// Push — receive push notifications from Golfers+ server
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Golfers+', body: event.data?.text() || '' }
  }

  const tag = data.tag || TAG_DEFAULT
  const isPersistent = tag === TAG_PLAYER || tag.startsWith(TAG_SPECTATOR_PREFIX)

  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.svg',
    badge: data.badge || '/icon-192.svg',
    tag: tag,
    // Persistent notifications: silent update, no re-alert
    // Event notifications (birdie, eagle): vibrate + renotify
    renotify: !isPersistent,
    silent: isPersistent,
    // Keep persistent notifications visible until dismissed
    requireInteraction: isPersistent,
    data: {
      url: data.data?.url || data.url || '/',
      type: data.type || 'default',
      rondaCodigo: data.rondaCodigo || null,
      timestamp: Date.now(),
    },
  }

  // Android action buttons for spectator notifications
  if (tag.startsWith(TAG_SPECTATOR_PREFIX)) {
    options.actions = [
      { action: 'open', title: 'Ver ronda' },
      { action: 'unfollow', title: 'Dejar de seguir' },
    ]
  }

  // Android action button for player notifications
  if (tag === TAG_PLAYER) {
    options.actions = [
      { action: 'open', title: 'Volver al scorer' },
    ]
  }

  if (data.image) options.image = data.image

  event.waitUntil(
    self.registration.showNotification(data.title || 'Golfers+', options)
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
    const tag = payload.tag || TAG_DEFAULT
    const isPersistent = tag === TAG_PLAYER || tag.startsWith(TAG_SPECTATOR_PREFIX)

    const options = {
      body: payload.body || '',
      icon: payload.icon || '/icon-192.svg',
      badge: payload.badge || '/icon-192.svg',
      tag: tag,
      renotify: !isPersistent,
      silent: isPersistent,
      requireInteraction: isPersistent,
      data: {
        url: payload.url || '/',
        type: payload.type || 'default',
        rondaCodigo: payload.rondaCodigo || null,
        timestamp: Date.now(),
      },
    }

    if (tag.startsWith(TAG_SPECTATOR_PREFIX) && !payload.finished) {
      options.actions = [
        { action: 'open', title: 'Ver ronda' },
        { action: 'unfollow', title: 'Dejar de seguir' },
      ]
    }

    if (tag === TAG_PLAYER && !payload.finished) {
      options.actions = [
        { action: 'open', title: 'Volver al scorer' },
      ]
    }

    // Finished round: different actions
    if (payload.finished) {
      options.actions = [
        { action: 'open', title: 'Ver resultado' },
      ]
      options.requireInteraction = false
    }

    event.waitUntil(
      self.registration.showNotification(payload.title || 'Golfers+', options)
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
