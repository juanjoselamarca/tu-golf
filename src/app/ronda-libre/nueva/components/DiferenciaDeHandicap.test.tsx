// Match play neto al crear la ronda: la ventaja sale de los golpes de la vuelta
// (en 9 hoyos, los de 9) y el rótulo "HCP cancha" muestra SIEMPRE el de 18
// (regla de Juanjo, 12-nov-2026). Como en 9 hoyos los dos números no cuadran a
// simple vista, la frase dice "en 9 hoyos".

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiferenciaDeHandicap } from './DiferenciaDeHandicap'

describe('DiferenciaDeHandicap', () => {
  it('9 hoyos: ventaja con los golpes de 9, HCP de 18 en el rótulo', () => {
    render(
      <DiferenciaDeHandicap
        hoyos={9}
        jugadorA={{ nombre: 'Juan', golpes: 8, hcp: 15 }}
        jugadorB={{ nombre: 'Pedro', golpes: 4, hcp: 8 }}
      />,
    )
    expect(screen.getByText(/de ventaja en 9 hoyos/)).toBeTruthy()
    expect(screen.getByText('4 strokes')).toBeTruthy()
    expect(screen.getByText(/HCP cancha: 15 \(Juan\) vs 8 \(Pedro\)/)).toBeTruthy()
  })

  it('18 hoyos: sin la aclaración de 9', () => {
    render(
      <DiferenciaDeHandicap
        hoyos={18}
        jugadorA={{ nombre: 'Juan', golpes: 15, hcp: 15 }}
        jugadorB={{ nombre: 'Pedro', golpes: 8, hcp: 8 }}
      />,
    )
    expect(screen.queryByText(/en 9 hoyos/)).toBeNull()
    expect(screen.getByText(/HCP cancha: 15 \(Juan\) vs 8 \(Pedro\)/)).toBeTruthy()
  })

  it('sin HCP de 18 todavía, no muestra los golpes de 9 como si fueran el HCP', () => {
    render(
      <DiferenciaDeHandicap
        hoyos={9}
        jugadorA={{ nombre: 'Juan', golpes: 8, hcp: null }}
        jugadorB={{ nombre: 'Pedro', golpes: 4, hcp: 8 }}
      />,
    )
    expect(screen.queryByText(/HCP cancha/)).toBeNull()
  })

  it('9 hoyos sin ventaja con HCP distintos: no afirma "mismo handicap"', () => {
    render(
      <DiferenciaDeHandicap
        hoyos={9}
        jugadorA={{ nombre: 'Juan', golpes: 8, hcp: 17 }}
        jugadorB={{ nombre: 'Pedro', golpes: 8, hcp: 16 }}
      />,
    )
    expect(screen.queryByText(/Mismo handicap/)).toBeNull()
    expect(screen.getByText(/Sin strokes de ventaja en 9 hoyos/)).toBeTruthy()
    expect(screen.getByText(/HCP cancha: 17 \(Juan\) vs 16 \(Pedro\)/)).toBeTruthy()
  })

  it('18 hoyos sin ventaja: "Mismo handicap"', () => {
    render(
      <DiferenciaDeHandicap
        hoyos={18}
        jugadorA={{ nombre: 'Juan', golpes: 15, hcp: 15 }}
        jugadorB={{ nombre: 'Pedro', golpes: 15, hcp: 15 }}
      />,
    )
    expect(screen.getByText(/Mismo handicap/)).toBeTruthy()
  })
})
