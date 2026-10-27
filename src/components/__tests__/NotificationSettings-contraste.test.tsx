import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import NotificationSettings from '../NotificationSettings'

// Push soportado pero sin suscripción: las filas "Mientras scoreo" y "Rondas que sigo" quedan deshabilitadas.
vi.mock('@/lib/push-notifications', () => ({
  isPushSupported: () => true,
  getPushSupportStatus: () => ({ supported: true }),
  setupPushNotifications: async () => false,
  unsubscribePush: async () => undefined,
  isSubscribedToPush: async () => false,
  getNotifPrefs: () => ({ enabled: false, player: false, spectator: false }),
  setNotifPrefs: () => undefined,
}))

describe('NotificationSettings — filas deshabilitadas legibles (WCAG AA, DESIGN.md §1)', () => {
  it('no atenúa el texto con opacity: el label baja a --text-3 y la descripción conserva su color', async () => {
    render(<NotificationSettings />)
    const label = await screen.findByText('Mientras scoreo')
    const descripcion = screen.getByText(/Notificación fija con el hoyo actual/)
    // Con opacity 0.4 la descripción medía 1,70:1 en claro y 1,98:1 en oscuro (auditoría 23-oct-2026).
    for (let el: HTMLElement | null = label; el; el = el.parentElement) {
      expect(el.style.opacity === '' || Number(el.style.opacity) === 1, `opacity en <${el.tagName}>`).toBe(true)
    }
    expect(label.style.color).toBe('var(--text-3)')
    expect(descripcion.style.color).toBe('var(--text-3)')
  })

  it('la fila habilitada mantiene el label en --text', async () => {
    render(<NotificationSettings />)
    const label = await screen.findByText('Notificaciones push')
    expect(label.style.color).toBe('var(--text)')
  })
})
