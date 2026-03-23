// Golfers+ Service Worker v2 — Real Push Notifications
// Receives push events from server via Web Push Protocol

const CACHE_NAME = 'golfers-v2'

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

// Push — receive real push notifications from Golfers+ server
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Golfers+', body: event.data?.text() || '' }
  }

  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.svg',
    badge: data.badge || '/icon-192.svg',
    tag: data.tag || 'golfers-default',
    renotify: true,
    vibrate: [100, 50, 100],
    data: {
      url: data.data?.url || data.url || '/',
      timestamp: Date.now(),
    },
  }

  if (data.image) options.image = data.image

  event.waitUntil(
    self.registration.showNotification(data.title || 'Golfers+', options)
  )
})

// Click — navigate to the relevant page
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
