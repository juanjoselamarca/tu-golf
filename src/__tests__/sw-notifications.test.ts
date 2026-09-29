/**
 * Contrato del Service Worker (public/sw.js) con la notificación del espectador.
 *
 * El SO reemplaza una notificación por otra con el MISMO tag. Para que la
 * notificación "se actualice sola" (app cerrada → push del servidor; app
 * abierta → mensaje local), ambos caminos tienen que producir el mismo tag y
 * las mismas opciones. Este test carga sw.js en un sandbox y lo verifica.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { buildSpectatorNotification, spectatorTag } from '@/golf/notifications/spectator'

type Listener = (event: unknown) => void

function loadServiceWorker() {
  const listeners = new Map<string, Listener>()
  const showNotification = vi.fn(async () => {})
  const getNotifications = vi.fn(async () => [])
  const self = {
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => []), openWindow: vi.fn() },
    registration: { showNotification, getNotifications },
    location: { origin: 'https://golfersplus.vercel.app' },
  }
  const caches = { keys: async () => [], delete: async () => true }
  const source = readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8')
  vm.runInNewContext(source, { self, caches, Date, Promise })
  return { listeners, showNotification }
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

let sw: ReturnType<typeof loadServiceWorker>
beforeEach(() => { sw = loadServiceWorker() })

describe('public/sw.js — la notificación del espectador se reemplaza por tag', () => {
  it('registra los handlers push / notificationclick / message', () => {
    expect([...sw.listeners.keys()]).toEqual(expect.arrayContaining(['push', 'notificationclick', 'message']))
  })

  it('push del servidor: mismo tag por ronda, silenciosa, sin renotify, con acciones', async () => {
    await dispatch(sw.listeners, 'push', { data: { json: () => serverPayload } })
    expect(sw.showNotification).toHaveBeenCalledTimes(1)
    const [title, options] = sw.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>]
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
    const [, options] = sw.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(options.icon).toBe('/icon-192.svg')
    expect(() => readFileSync(path.resolve(process.cwd(), 'public', String(options.icon).slice(1)))).not.toThrow()
  })

  it('resultado final: acción "Ver resultado" y ya no exige interacción', async () => {
    const done = buildSpectatorNotification({
      courseName: 'Los Leones', codigo: '4YDC3G', totalHoles: 9, finished: true,
      players: [{ nombre: 'Juan José Lamarca', vsPar: 4, holesCompleted: 9, totalHoles: 9 }],
    })
    await dispatch(sw.listeners, 'push', { data: { json: () => ({ ...serverPayload, title: done.title, finished: true, data: { url: done.url } }) } })
    const [title, options] = sw.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(title).toBe('Resultado final · Los Leones')
    expect(options.tag).toBe(spectatorTag('4YDC3G'))
    expect(options.requireInteraction).toBe(false)
    expect(options.actions).toEqual([{ action: 'open', title: 'Ver resultado' }])
  })

  it('un push sin JSON válido no rompe: muestra Golfers+', async () => {
    await dispatch(sw.listeners, 'push', { data: { json: () => { throw new Error('bad') }, text: () => 'hola' } })
    const [title, options] = sw.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(title).toBe('Golfers+')
    expect(options.body).toBe('hola')
  })
})
