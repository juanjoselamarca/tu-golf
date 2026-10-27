import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('@/lib/push-notifications', () => ({
  isPushSupported: () => true,
  setupPushNotifications: vi.fn(async () => true),
  getPermissionState: () => 'default',
}))

import { PushPermissionPrompt } from './PushPermissionPrompt'

describe('PushPermissionPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  const visible = () => document.body.textContent?.includes('Activar') ?? false

  it('aparece tras el retardo inicial si no hay otro diálogo', () => {
    render(<PushPermissionPrompt />)
    expect(visible()).toBe(false)
    act(() => { vi.advanceTimersByTime(1200) })
    expect(visible()).toBe(true)
  })

  it('no se monta detrás de un diálogo modal abierto: espera a que se cierre', () => {
    const modal = document.createElement('div')
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    document.body.appendChild(modal)

    render(<PushPermissionPrompt />)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(visible()).toBe(false)

    modal.remove()
    act(() => { vi.advanceTimersByTime(500) })
    expect(visible()).toBe(true)
    expect(screen.getByRole('button', { name: /activar/i })).toBeTruthy()
  })
})
