/**
 * Contrato del Service Worker (public/sw.js) con la notificación del espectador.
 *
 * El SO reemplaza una notificación por otra con el MISMO tag. Para que la
 * notificación "se actualice sola" (app cerrada → push del servidor; app
 * abierta → mensaje local), ambos caminos tienen que producir el mismo tag y
 * las mismas opciones. Este test carga sw.js en un sandbox y lo verifica.
 * También: "Dejar de seguir" con la app cerrada llega al servidor (review C2) y
 * un avance que llegue después del resultado final no lo tapa (carrera).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { buildSpectatorNotification, spectatorTag } from '@/golf/notifications/spectator'

type Listener = (event: unknown) => void

const DEVICE = { endpoint: 'https://fcm.googleapis.com/fcm/send/dev1', keys: { p256dh: 'P', auth: 'AUTHSECRET' } }

function loadServiceWorker() {
  const listeners = new Map<string, Listener>()
  const showNotification = vi.fn(async () => {})
  const getNotifications = vi.fn(async () => [])
  const getSubscription = vi.fn(async () => ({ toJSON: () => DEVICE }))
  const fetch = vi.fn(async () => ({ ok: true }))
  const postMessage = vi.fn()
  const self = {
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => [{ postMessage, url: 'https://golfersplus.vercel.app/en-vivo', focus: vi.fn(), navigate: vi.fn() }]), openWindow: vi.fn() },
    registration: { showNotification, getNotifications, pushManager: { getSubscription } },
    location: { origin: 'https://golfersplus.vercel.app' },
  }
  const caches = { keys: async () => [], delete: async () => true }
  const source = readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8')
  vm.runInNewContext(source, { self, caches, Date, Promise, JSON, Set, fetch })
  return { listeners, showNotification, getSubscription, fetch, postMessage }
}

function dispatch(listeners: Map<string, Listener>, type: string, event: Record<string, unknown>) {
  const waited: Promise<unknown>[] = []
  listeners.get(type)?.({ ...event, waitUntil: (p: Promise<unknown>) => waited.push(p) })
  return Promise.all(waited)
}

const notif = buildSpectatorNotification({
  courseName: 'Club de Golf Los Leones', codigo: '4YDC3G', totalHoles: 9,
  players: [{ nombre: 'Juan José Lamarca', vsPar: 4, holesCompleted: 3, totalHoles: 9 }],
})

// Payload tal como lo manda /api/push/round-update.
const serverPayload = {
  title: notif.title, body: notif.body, tag: notif.tag, type: 'spectator',
  rondaCodigo: '4YDC3G', finished: false, data: { url: notif.url, rondaCodigo: '4YDC3G' },
}
// Payload tal como lo manda showSpectatorNotification (cliente).
const clientPayload = {
  title: notif.title, body: notif.body, tag: notif.tag, url: notif.url,
  rondaCodigo: '4YDC3G', type: 'spectator', finished: false,
}
const finalNotif = buildSpectatorNotification({
  courseName: 'Los Leones', codigo: '4YDC3G', totalHoles: 9, finished: true,
  players: [{ nombre: 'Juan José Lamarca', vsPar: 4, holesCompleted: 9, totalHoles: 9 }],
})
const finalPayload = { ...serverPayload, title: finalNotif.title, finished: true, data: { url: finalNotif.url } }

let sw: ReturnType<typeof loadServiceWorker>
beforeEach(() => { sw = loadServiceWorker() })

const lastCall = () => sw.showNotification.mock.calls.at(-1) as unknown as [string, Record<string, unknown>]

describe('public/sw.js — la notificación del espectador se reemplaza por tag', () => {
  it('registra los handlers push / notificationclick / message', () => {
    expect([...sw.listeners.keys()]).toEqual(expect.arrayContaining(['push', 'notificationclick', 'message']))
  })

  it('push del servidor: mismo tag por ronda, silenciosa, sin renotify, con acciones', async () => {
    await dispatch(sw.listeners, 'push', { data: { json: () => serverPayload } })
    expect(sw.showNotification).toHaveBeenCalledTimes(1)
    const [title, options] = lastCall()
    expect(title).toBe('Club de Golf Los Leones · Thru 3')
    expect(options.tag).toBe(spectatorTag('4YDC3G'))
    expect(options.renotify).toBe(false)
    expect(options.silent).toBe(true)
    expect(options.requireInteraction).toBe(true)
    expect(options.actions).toEqual([
      { action: 'open', title: 'Ver ronda' },
      { action: 'unfollow', title: 'Dejar de seguir' },
    ])
    expect((options.data as Record<string, unknown>).url).toBe('/ronda-libre/4YDC3G')
    expect((options.data as Record<string, unknown>).rondaCodigo).toBe('4YDC3G')
  })

  it('mensaje local del cliente produce el MISMO tag y las mismas opciones que el push', async () => {
    await dispatch(sw.listeners, 'push', { data: { json: () => serverPayload } })
    await dispatch(sw.listeners, 'message', { data: { type: 'SHOW_NOTIFICATION', payload: clientPayload } })
    const [, fromPush] = sw.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>]
    const [, fromClient] = sw.showNotification.mock.calls[1] as unknown as [string, Record<string, unknown>]
    const strip = (o: Record<string, unknown>) => ({ ...o, data: { ...(o.data as Record<string, unknown>), timestamp: 0 } })
    expect(strip(fromClient)).toEqual(strip(fromPush))
  })

  it('el ícono por defecto existe en /public (no /icons/icon-192x192.png)', async () => {
    await dispatch(sw.listeners, 'push', { data: { json: () => serverPayload } })
    const [, options] = lastCall()
    expect(options.icon).toBe('/icon-192.svg')
    expect(() => readFileSync(path.resolve(process.cwd(), 'public', String(options.icon).slice(1)))).not.toThrow()
  })

  it('resultado final: acción "Ver resultado" y ya no exige interacción', async () => {
    await dispatch(sw.listeners, 'push', { data: { json: () => finalPayload } })
    const [title, options] = lastCall()
    expect(title).toBe('Resultado final · Los Leones')
    expect(options.tag).toBe(spectatorTag('4YDC3G'))
    expect(options.requireInteraction).toBe(false)
    expect(options.actions).toEqual([{ action: 'open', title: 'Ver resultado' }])
  })

  it('un avance que llega DESPUÉS del resultado final no lo tapa (carrera con un push lento)', async () => {
    await dispatch(sw.listeners, 'push', { data: { json: () => finalPayload } })
    await dispatch(sw.listeners, 'push', { data: { json: () => serverPayload } })
    await dispatch(sw.listeners, 'message', { data: { type: 'SHOW_NOTIFICATION', payload: clientPayload } })
    expect(sw.showNotification).toHaveBeenCalledTimes(1)
    expect(lastCall()[0]).toBe('Resultado final · Los Leones')
    // Otra ronda (otro tag) no se ve afectada.
    await dispatch(sw.listeners, 'push', { data: { json: () => ({ ...serverPayload, tag: spectatorTag('OTRA'), rondaCodigo: 'OTRA' }) } })
    expect(sw.showNotification).toHaveBeenCalledTimes(2)
    // Al limpiar el tag (dejar de seguir / nueva ronda con el mismo código) se vuelve a aceptar.
    await dispatch(sw.listeners, 'message', { data: { type: 'CLEAR_NOTIFICATION', payload: { tag: notif.tag } } })
    await dispatch(sw.listeners, 'push', { data: { json: () => serverPayload } })
    expect(sw.showNotification).toHaveBeenCalledTimes(3)
  })

  it('un push sin JSON válido no rompe: muestra Golfers+', async () => {
    await dispatch(sw.listeners, 'push', { data: { json: () => { throw new Error('bad') }, text: () => 'hola' } })
    const [title, options] = lastCall()
    expect(title).toBe('Golfers+')
    expect(options.body).toBe('hola')
  })
})

describe('public/sw.js — "Dejar de seguir" desde la notificación con la app cerrada (review C2)', () => {
  it('borra el watcher en el servidor con la prueba de posesión del dispositivo y avisa a las ventanas', async () => {
    const close = vi.fn()
    await dispatch(sw.listeners, 'notificationclick', {
      action: 'unfollow',
      notification: { close, data: { url: '/ronda-libre/4YDC3G', rondaCodigo: '4YDC3G' } },
    })
    expect(close).toHaveBeenCalled()
    expect(sw.getSubscription).toHaveBeenCalled()
    expect(sw.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = sw.fetch.mock.calls[0] as unknown as [string, { method: string; body: string }]
    expect(url).toBe('/api/push/follow')
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body)).toEqual({
      codigo: '4YDC3G',
      subscription: { endpoint: DEVICE.endpoint, keys: { auth: DEVICE.keys.auth } },
    })
    // No manda la clave p256dh: sólo lo necesario para probar posesión.
    expect(init.body).not.toContain('p256dh')
    expect(sw.postMessage).toHaveBeenCalledWith({ type: 'UNFOLLOW_ROUND', rondaCodigo: '4YDC3G' })
  })

  it('sin suscripción en el dispositivo no llama al servidor (y no explota)', async () => {
    sw.getSubscription.mockResolvedValue(null as never)
    await dispatch(sw.listeners, 'notificationclick', {
      action: 'unfollow',
      notification: { close: vi.fn(), data: { rondaCodigo: '4YDC3G' } },
    })
    expect(sw.fetch).not.toHaveBeenCalled()
  })

  it('si el servidor falla, el click igual termina (la app lo reintenta al abrirse)', async () => {
    sw.fetch.mockRejectedValue(new Error('offline') as never)
    await expect(dispatch(sw.listeners, 'notificationclick', {
      action: 'unfollow',
      notification: { close: vi.fn(), data: { rondaCodigo: '4YDC3G' } },
    })).resolves.toBeDefined()
  })
})
