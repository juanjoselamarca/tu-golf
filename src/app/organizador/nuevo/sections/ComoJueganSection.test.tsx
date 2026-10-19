// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TournamentConfig } from '@/lib/draft/types'

const acceso = vi.hoisted(() => ({ loading: false, pro: false }))
vi.mock('@/hooks/useAccesoNeto', () => ({
  useAccesoNeto: () => ({ loading: acceso.loading, puedeUsar: () => acceso.pro }),
}))

import { ComoJueganSection } from './ComoJueganSection'

const cfg = (format: string, modo: 'gross' | 'neto') =>
  ({ format, modo, prizes: [] } as unknown as TournamentConfig)

beforeEach(() => {
  acceso.loading = false
  acceso.pro = false
})
afterEach(cleanup)

describe('ComoJueganSection — modo según plan', () => {
  it('free: Match Play Gross se puede elegir (ya no es "neto obligatorio")', () => {
    const applyChange = vi.fn()
    render(<ComoJueganSection config={cfg('match_play', 'gross')} applyChange={applyChange} />)
    const gross = screen.getByRole('button', { name: 'Gross' })
    expect((gross as HTMLButtonElement).disabled).toBe(false)
    expect(gross.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText(/obligatorio/)).toBeNull()
    expect(applyChange).not.toHaveBeenCalled() // nada que corregir: no rebota
  })

  it('free: pasar de Stroke Play Neto a Match Play baja el modo a gross en el mismo cambio', () => {
    const applyChange = vi.fn()
    render(<ComoJueganSection config={cfg('stroke_play', 'neto')} applyChange={applyChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Match Play' }))
    expect(applyChange).toHaveBeenCalledWith({ format: 'match_play', modo: 'gross' })
  })

  it('free: un borrador guardado con Match Play Neto se corrige a gross', () => {
    const applyChange = vi.fn()
    render(<ComoJueganSection config={cfg('match_play', 'neto')} applyChange={applyChange} />)
    expect(applyChange).toHaveBeenCalledWith({ modo: 'gross' })
    expect(screen.getByRole('button', { name: /Neto, requiere plan Pro/ }).getAttribute('aria-disabled')).toBe('true')
  })

  it('mientras el plan carga no corrige nada', () => {
    acceso.loading = true
    const applyChange = vi.fn()
    render(<ComoJueganSection config={cfg('match_play', 'neto')} applyChange={applyChange} />)
    expect(applyChange).not.toHaveBeenCalled()
  })

  it('Pro: Match Play Neto se mantiene y se puede elegir', () => {
    acceso.pro = true
    const applyChange = vi.fn()
    render(<ComoJueganSection config={cfg('match_play', 'gross')} applyChange={applyChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Neto' }))
    expect(applyChange).toHaveBeenCalledWith({ modo: 'neto' })
  })
})
