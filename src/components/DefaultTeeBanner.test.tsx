import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { DefaultTeeBanner } from './DefaultTeeBanner'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const realFetch = global.fetch

function mockFetch(status: { show: boolean; recoverableRounds?: number }, postResult = { ok: true, recomputed: 125 }) {
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('tee-prompt-status')) {
      return { ok: true, json: async () => ({ show: status.show, recoverableRounds: status.recoverableRounds ?? 0 }) } as Response
    }
    if (u.includes('default-tee') && init?.method === 'POST') {
      return { ok: postResult.ok, json: async () => ({ ok: postResult.ok, recomputed: postResult.recomputed }) } as Response
    }
    return { ok: false, json: async () => ({}) } as Response
  }) as typeof fetch
}

describe('DefaultTeeBanner — red de seguridad del tee', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => { global.fetch = realFetch })

  it('NO renderiza nada si el status dice show=false (ya fijó su tee)', async () => {
    mockFetch({ show: false })
    const { container } = render(<DefaultTeeBanner />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container.querySelector('[role="region"]')).toBeNull()
  })

  it('renderiza el prompt con las 4 opciones cuando show=true', async () => {
    mockFetch({ show: true, recoverableRounds: 125 })
    render(<DefaultTeeBanner />)
    expect(await screen.findByText('Calculá tu índice')).toBeTruthy()
    expect(screen.getByText('Azul')).toBeTruthy()
    expect(screen.getByText('Blanco')).toBeTruthy()
    expect(screen.getByText('Negro')).toBeTruthy()
    expect(screen.getByText('Rojo')).toBeTruthy()
  })

  it('al elegir un tee, postea y muestra la confirmación con el conteo recalculado', async () => {
    mockFetch({ show: true, recoverableRounds: 125 }, { ok: true, recomputed: 125 })
    render(<DefaultTeeBanner />)
    fireEvent.click(await screen.findByText('Azul'))
    expect(await screen.findByText(/recalculamos tu índice sobre 125 rondas/i)).toBeTruthy()
  })
})
