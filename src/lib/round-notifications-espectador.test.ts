/**
 * showSpectatorNotification — el aviso local del espectador (app abierta,
 * botón "Seguir" y marcador) obedece la misma condición que el push del
 * servidor: una ronda en curso sin puntajes no se avisa (decisión de producto
 * 23-oct-2026; álbum de la ronda del 16-oct con "Por comenzar · Aún sin
 * puntajes" a las 10:05).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./error-tracking', () => ({ captureError: vi.fn(async () => {}) }))
vi.mock('./push-notifications', () => ({
  isPushSupported: () => true,
  getNotifPrefs: () => ({ enabled: true, spectator: true, player: true }),
  setNotifPrefs: vi.fn(),
  ensurePushSubscription: vi.fn(),
  getCurrentPushSubscription: vi.fn(),
}))

import { showSpectatorNotification, type SpectatorPlayer } from './round-notifications'

const postMessage = vi.fn()
const p = (nombre: string, holesCompleted: number): SpectatorPlayer => ({ nombre, vsPar: 0, holesCompleted, totalHoles: 9 })
const base = { courseName: 'Club de Polo', codigo: '6665J4', totalHoles: 9 }

beforeEach(() => {
  postMessage.mockClear()
  vi.stubGlobal('Notification', { permission: 'granted' })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ active: { postMessage } }) },
  })
})

describe('showSpectatorNotification — primer aviso con el primer puntaje', () => {
  it('al seguir una ronda sin puntajes NO manda nada al Service Worker', async () => {
    await showSpectatorNotification({ ...base, players: [p('Alberto Chadwick', 0), p('Papa', 0)] })
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('con el primer hoyo terminado sí avisa, con el avance real', async () => {
    await showSpectatorNotification({ ...base, players: [p('Alberto Chadwick', 1), p('Papa', 0)] })
    expect(postMessage).toHaveBeenCalledTimes(1)
    const payload = postMessage.mock.calls[0][0].payload
    expect(payload.title).toBe('Club de Polo · Thru 1')
    expect(payload.body).not.toContain('Aún sin puntajes')
  })

  it('el resultado final sale aunque no haya puntajes', async () => {
    await showSpectatorNotification({ ...base, players: [p('Alberto Chadwick', 0)], finished: true })
    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage.mock.calls[0][0].payload.finished).toBe(true)
  })
})
