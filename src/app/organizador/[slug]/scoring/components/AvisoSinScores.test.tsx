import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AvisoSinScores } from './AvisoSinScores'

describe('AvisoSinScores', () => {
  it('sin empezar: dice cómo iniciarlo y lleva a Jugadores', () => {
    render(<AvisoSinScores motivo="no_empezo" status="open" slug="t" />)
    expect(screen.getByText('El torneo todavía no empieza')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ir a Jugadores' }).getAttribute('href')).toBe('/organizador/t/jugadores')
  })

  it('cerrado: ofrece reabrir (el servidor sólo reabre un torneo closed)', () => {
    render(<AvisoSinScores motivo="cerrado" status="closed" slug="t" />)
    expect(screen.getByText('Torneo cerrado')).toBeTruthy()
    expect(screen.getByText(/reábrelo desde Jugadores/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ir a Jugadores' })).toBeTruthy()
  })

  // Revisión del PR #588: un torneo publicado decía "reábrelo desde Jugadores" y allá no hay cómo.
  it('publicado: no promete reabrir', () => {
    render(<AvisoSinScores motivo="cerrado" status="published" slug="t" />)
    expect(screen.getByText('Publicado')).toBeTruthy()
    expect(screen.queryByText(/reábrelo/)).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
