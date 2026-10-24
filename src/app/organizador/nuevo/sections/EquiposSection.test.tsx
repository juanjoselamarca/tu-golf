// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TournamentConfig } from '@/lib/draft/types'
import { EquiposSection } from './EquiposSection'

const cfg = (format: string, modo: 'gross' | 'neto' = 'neto') =>
  ({ format, modo, prizes: [] } as unknown as TournamentConfig)
const pctEquipo = () => screen.queryByRole('group', { name: '% de handicap' })

afterEach(cleanup)

describe('EquiposSection — % de handicap del equipo', () => {
  it('scramble y foursome: muestra el % del equipo', () => {
    for (const f of ['scramble', 'foursome']) {
      render(<EquiposSection config={cfg(f)} applyChange={vi.fn()} />)
      expect(pctEquipo()).not.toBeNull()
      cleanup()
    }
  })

  it('best ball: sin % de equipo (cada jugador usa el handicap de juego de Cómo juegan)', () => {
    render(<EquiposSection config={cfg('best_ball')} applyChange={vi.fn()} />)
    expect(pctEquipo()).toBeNull()
    expect(screen.getByLabelText('Tamaño de equipo')).toBeTruthy()
    expect(screen.getByText(/El porcentaje se elige en Cómo juegan/)).toBeTruthy()
  })

  it('best ball gross: sin % y sin la referencia al handicap de juego', () => {
    render(<EquiposSection config={cfg('best_ball', 'gross')} applyChange={vi.fn()} />)
    expect(pctEquipo()).toBeNull()
    expect(screen.queryByText(/El porcentaje se elige/)).toBeNull()
  })

  it('formato individual: no se muestra la sección', () => {
    render(<EquiposSection config={cfg('stroke_play')} applyChange={vi.fn()} />)
    expect(screen.queryByText('Equipos')).toBeNull()
  })
})
