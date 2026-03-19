// Golfers+ Service Worker — Push notifications + offline caching

const CACHE_NAME = 'golfers-v1'

// Install — cache essential assets
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

// Push notification received
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}

  const options = {
    body: data.body || '',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: data.tag || 'golfers-notification',
    renotify: true,
    data: {
      url: data.url || '/dashboard',
      rondaId: data.rondaId || null,
    },
    actions: data.actions || [],
    vibrate: [100, 50, 100],
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Golfers+', options)
  )
})

// Notification click — open the right page
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes('tu-golf') && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Otherwise open new window
      return clients.openWindow(url)
    })
  )
})
