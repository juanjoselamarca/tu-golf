import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { DefaultTeeBanner } from './DefaultTeeBanner'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const realFetch = global.fetch
let lastPostBody: Record<string, unknown> | null = null

function mockFetch(status: { show: boolean; recoverableRounds?: number; genero?: 'M' | 'F' | null }, postResult = { ok: true, recomputed: 125 }) {
  lastPostBody = null
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('tee-prompt-status')) {
      return { ok: true, json: async () => ({ show: status.show, recoverableRounds: status.recoverableRounds ?? 0, genero: status.genero ?? null }) } as Response
    }
    if (u.includes('default-tee') && init?.method === 'POST') {
      lastPostBody = JSON.parse(String(init.body))
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
    expect(await screen.findByText('Calcula tu índice')).toBeTruthy()
    expect(screen.getByText('Azul')).toBeTruthy()
    expect(screen.getByText('Blanco')).toBeTruthy()
    expect(screen.getByText('Negro')).toBeTruthy()
    expect(screen.getByText('Rojo')).toBeTruthy()
  })

  it('con género ya en el perfil, un tap al color postea {color, genero} y confirma', async () => {
    mockFetch({ show: true, recoverableRounds: 125, genero: 'M' }, { ok: true, recomputed: 125 })
    render(<DefaultTeeBanner />)
    fireEvent.click(await screen.findByText('Azul'))
    expect(await screen.findByText(/recalculamos tu índice sobre 125 rondas/i)).toBeTruthy()
    expect(lastPostBody).toEqual({ color: 'azul', genero: 'M' })
  })

  it('sin género en el perfil: el color no postea hasta elegir Varones/Damas', async () => {
    mockFetch({ show: true, recoverableRounds: 50, genero: null })
    render(<DefaultTeeBanner />)
    // Botón de color deshabilitado → click no postea.
    fireEvent.click(await screen.findByText('Azul'))
    expect(lastPostBody).toBeNull()
    // Elijo Damas y recién ahí el color postea con genero F.
    fireEvent.click(screen.getByText('Damas'))
    fireEvent.click(screen.getByText('Azul'))
    await waitFor(() => expect(lastPostBody).toEqual({ color: 'azul', genero: 'F' }))
  })
})
