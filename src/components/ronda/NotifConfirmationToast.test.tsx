/**
 * NotifConfirmationToast — el scorer anunciaba "Notificación activa" a todos (hunter 16-oct-2026), aunque la
 * notificación fija del jugador solo existe con permiso concedido y "Mientras scoreo" encendido.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const activa = { value: false }
vi.mock('@/lib/round-notifications', () => ({
  notificacionJugadorActiva: () => activa.value,
}))

import { NotifConfirmationToast } from './NotifConfirmationToast'

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
})

const tras = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('NotifConfirmationToast', () => {
  it('jugador sin notificación activa: no anuncia nada', () => {
    activa.value = false
    render(<NotifConfirmationToast type="player" />)
    tras(1000)
    expect(screen.queryByText(/Notificación activa/)).toBeNull()
  })

  it('jugador con notificación activa: la anuncia', () => {
    activa.value = true
    render(<NotifConfirmationToast type="player" />)
    tras(1000)
    expect(screen.getByText(/Notificación activa/)).toBeTruthy()
  })

  it('sin notificación activa no gasta el aviso de la sesión: si la activa después, se anuncia', () => {
    activa.value = false
    const { unmount } = render(<NotifConfirmationToast type="player" />)
    tras(1000)
    unmount()
    activa.value = true
    render(<NotifConfirmationToast type="player" />)
    tras(1000)
    expect(screen.getByText(/Notificación activa/)).toBeTruthy()
  })

  it('espectador: el aviso de seguir no depende de la preferencia del jugador', () => {
    activa.value = false
    render(<NotifConfirmationToast type="spectator" />)
    tras(1000)
    expect(screen.getByText(/Siguiendo ronda/)).toBeTruthy()
  })
})
