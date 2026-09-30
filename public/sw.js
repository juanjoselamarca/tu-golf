// Golfers+ Service Worker v5 — Persistent Round Notifications
// Supports: ongoing player notification, spectator table, push events
//
// Contrato con el servidor y el cliente: la notificación de una ronda seguida
// usa SIEMPRE el tag `golfers-spectator-<codigo>` (src/golf/notifications/
// spectator.ts). Mismo tag ⇒ el SO REEMPLAZA la notificación anterior en vez
// de apilar una nueva; `renotify: false` + `silent: true` ⇒ sin vibrar.
// El push del servidor y el mensaje local del cliente arman las opciones con
// la misma función (buildOptions) para que se comporten igual.

const CACHE_NAME = 'golfers-v5'

// ── Tags for notification types ──
const TAG_PLAYER = 'golfers-player-round'
const TAG_SPECTATOR_PREFIX = 'golfers-spectator-'
const TAG_DEFAULT = 'golfers-default'
const DEFAULT_ICON = '/icon-192.svg'

// Tags cuyo "Resultado final" ya se mostró: un push de avance que llegue
// después (carrera con un envío lento o retenido por el servicio de push) no
// debe volver a tapar el resultado. Vive en memoria del SW: si el SO lo mata,
// el `topic` del servicio de push ya colapsó los pendientes.
const finishedTags = new Set()

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

/** Muestra (o reemplaza) la notificación; ignora un avance posterior al resultado final. */
function showFromPayload(p) {
  const tag = p.tag || TAG_DEFAULT
  const finished = p.finished === true
  if (!finished && finishedTags.has(tag)) return Promise.resolve()
  if (finished) finishedTags.add(tag)
  return self.registration.showNotification(p.title || 'Golfers+', buildOptions(p))
}

// Push — receive push notifications from Golfers+ server
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Golfers+', body: event.data?.text() || '' }
  }

  event.waitUntil(showFromPayload(data))
})

/**
 * "Dejar de seguir" desde la notificación con la app CERRADA: avisar a las
 * ventanas abiertas (si las hay) no alcanza — el servidor seguiría empujando.
 * El SW borra el watcher de este dispositivo con la prueba de posesión
 * (endpoint + secreto `auth` de su suscripción).
 */
function unfollowOnServer(codigo) {
  return self.registration.pushManager.getSubscription()
    .then((sub) => {
      if (!sub) return
      const json = sub.toJSON()
      if (!json.endpoint || !json.keys || !json.keys.auth) return
      return fetch('/api/push/follow', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo,
          subscription: { endpoint: json.endpoint, keys: { auth: json.keys.auth } },
        }),
      })
    })
    .catch(() => { /* la app lo reintenta al abrirse (cleanupFollowedRounds) */ })
}

function notifyClientsUnfollow(codigo) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      client.postMessage({ type: 'UNFOLLOW_ROUND', rondaCodigo: codigo })
    }
  })
}

// Click — navigate to the relevant page
self.addEventListener('notificationclick', (event) => {
  const { action } = event
  const data = event.notification.data || {}
  const url = data.url || '/'

  // "Dejar de seguir" action — dismiss + unfollow on server + tell open clients
  if (action === 'unfollow' && data.rondaCodigo) {
    event.notification.close()
    event.waitUntil(Promise.all([
      unfollowOnServer(data.rondaCodigo),
      notifyClientsUnfollow(data.rondaCodigo),
    ]))
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

// El servicio de push rotó la suscripción (el SO lo hace sin avisar a la app).
// Se re-suscribe con la misma VAPID key y se actualiza la fila en el servidor
// con la prueba de posesión de la vieja: los watchers sobreviven.
self.addEventListener('pushsubscriptionchange', (event) => {
  const oldSub = event.oldSubscription
  const oldJson = oldSub ? oldSub.toJSON() : null
  const key = (oldSub && oldSub.options && oldSub.options.applicationServerKey) || null
  if (!oldJson || !oldJson.endpoint || !oldJson.keys || !oldJson.keys.auth || !key) return
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then((next) => fetch('/api/push/resubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old: { endpoint: oldJson.endpoint, keys: { auth: oldJson.keys.auth } },
          subscription: next.toJSON(),
        }),
      }))
      .catch(() => { /* la app re-registra al abrirse (followRound / setupPushNotifications) */ })
  )
})

// Message from client — handle local notification updates
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {}

  if (type === 'SHOW_NOTIFICATION' && payload) {
    event.waitUntil(showFromPayload(payload))
  }

  if (type === 'CLEAR_NOTIFICATION' && payload?.tag) {
    finishedTags.delete(payload.tag)
    event.waitUntil(
      self.registration.getNotifications({ tag: payload.tag }).then((notifications) => {
        notifications.forEach((n) => n.close())
      })
    )
  }
})
