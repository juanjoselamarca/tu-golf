import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TournamentResults } from '../TournamentResults'
import type { TournamentResultados } from '../../types'

afterEach(cleanup)

const base: TournamentResultados = {
  grossWinner: null, netoWinner: null, grossSecond: null, netoSecond: null, avgField: 0, totalEagles: 0, totalBirdies: 0,
}

describe('TournamentResults — empates', () => {
  it('podio de parejas con dos equipos empatados: dos "T1", sin "1°" y sin claves React duplicadas', () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<TournamentResults resultados={{ ...base, teamPodium: [
      { pos: 1, etiqueta: 'T1', name: 'Águilas', members: 'Juan / Pedro', score: '-3' },
      { pos: 1, etiqueta: 'T1', name: 'Cóndores', members: 'Ana / Luis', score: '-3' },
      { pos: 3, etiqueta: '3', name: 'Halcones', members: '', score: 'E' },
    ] }} />)
    expect(screen.getAllByText('T1')).toHaveLength(2)
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.queryByText(/1°/)).toBeNull()
    expect(errores.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false)
    errores.mockRestore()
  })

  it('1° y 2° individuales empatados se leen "T1 Gross" los dos', () => {
    render(<TournamentResults resultados={{
      ...base,
      grossWinner: { name: 'Juan', score: 72, etiqueta: 'T1' },
      grossSecond: { name: 'Pedro', score: 72, etiqueta: 'T1' },
    }} />)
    expect(screen.getAllByText('T1 Gross')).toHaveLength(2)
    expect(screen.queryByText('2° Gross')).toBeNull()
  })
})
