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

describe('ComoJueganSection — handicap de juego (hcp_pct)', () => {
  const conPct = (format: string, modo: 'gross' | 'neto', hcp_pct?: number) =>
    ({ ...cfg(format, modo), hcp_pct } as unknown as TournamentConfig)
  const grupo = () => screen.queryByRole('group', { name: 'Handicap de juego' })

  it('neto individual: muestra los 6 porcentajes, marca el elegido y cambia con un toque', () => {
    acceso.pro = true
    const applyChange = vi.fn()
    render(<ComoJueganSection config={conPct('stroke_play', 'neto', 90)} applyChange={applyChange} />)
    expect(grupo()).not.toBeNull()
    for (const p of [100, 95, 90, 85, 80, 75]) {
      const chip = screen.getByRole('button', { name: `${p} %` })
      expect(chip.getAttribute('aria-pressed')).toBe(p === 90 ? 'true' : 'false')
      expect(chip.style.minHeight).toBe('44px')
    }
    fireEvent.click(screen.getByRole('button', { name: '85 %' }))
    expect(applyChange).toHaveBeenCalledWith({ hcp_pct: 85 })
    expect(screen.getByText(/100 % de la diferencia entre handicaps de juego/)).toBeTruthy()
  })

  it('sin hcp_pct en el borrador marca 100 %', () => {
    acceso.pro = true
    render(<ComoJueganSection config={conPct('stableford', 'neto')} applyChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '100 %' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('best ball neto: se muestra con su propia explicación y conserva el % al venir de un individual', () => {
    acceso.pro = true
    render(<ComoJueganSection config={conPct('best_ball', 'neto', 85)} applyChange={vi.fn()} />)
    expect(grupo()).not.toBeNull()
    expect(screen.getByRole('button', { name: '85 %' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/mejor bola neta del equipo/)).toBeTruthy()
    cleanup()
    const applyChange = vi.fn()
    render(<ComoJueganSection config={conPct('stroke_play', 'neto', 85)} applyChange={applyChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Best Ball' }))
    expect(applyChange).toHaveBeenCalledWith({ format: 'best_ball' })
  })

  it('gross o bola compartida (scramble, foursome): no se muestra', () => {
    acceso.pro = true
    render(<ComoJueganSection config={conPct('stroke_play', 'gross')} applyChange={vi.fn()} />)
    expect(grupo()).toBeNull()
    cleanup()
    render(<ComoJueganSection config={conPct('scramble', 'neto')} applyChange={vi.fn()} />)
    expect(grupo()).toBeNull()
    cleanup()
    render(<ComoJueganSection config={conPct('foursome', 'neto')} applyChange={vi.fn()} />)
    expect(grupo()).toBeNull()
  })

  it('pasar a Gross vuelve el porcentaje a 100 en el mismo cambio', () => {
    acceso.pro = true
    const applyChange = vi.fn()
    render(<ComoJueganSection config={conPct('stroke_play', 'neto', 85)} applyChange={applyChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gross' }))
    expect(applyChange).toHaveBeenCalledWith({ modo: 'gross', hcp_pct: 100 })
  })

  it('pasar a scramble vuelve el porcentaje a 100', () => {
    acceso.pro = true
    const applyChange = vi.fn()
    render(<ComoJueganSection config={conPct('stroke_play', 'neto', 85)} applyChange={applyChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Scramble' }))
    expect(applyChange).toHaveBeenCalledWith({ format: 'scramble', hcp_pct: 100 })
  })

  it('entre formatos individuales neto el porcentaje se conserva', () => {
    acceso.pro = true
    const applyChange = vi.fn()
    render(<ComoJueganSection config={conPct('stroke_play', 'neto', 85)} applyChange={applyChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Match Play' }))
    expect(applyChange).toHaveBeenCalledWith({ format: 'match_play' })
  })

  it('el plan corrige un neto guardado a gross: también el porcentaje', () => {
    const applyChange = vi.fn()
    render(<ComoJueganSection config={conPct('match_play', 'neto', 85)} applyChange={applyChange} />)
    expect(applyChange).toHaveBeenCalledWith({ modo: 'gross', hcp_pct: 100 })
  })
})
