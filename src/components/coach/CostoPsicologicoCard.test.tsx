import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CostoPsicologicoCard } from './CostoPsicologicoCard'

const base = {
  evitables: 5,
  promedioReal: 84,
  promedioContenido: 83,
  realScore: 84,
  ghostScore: 83,
  delta: 1,
  espirales: [{ desde: 5, hasta: 6, hoyos: 2, golpesEvitables: 1 }],
}

describe('CostoPsicologicoCard — ventana rotulada con su bucket', () => {
  it('18 hoyos: "últimas 5 rondas de 18 hoyos" y la espiral por hoyos', () => {
    render(<CostoPsicologicoCard {...base} windowSize={5} bucket={18} />)
    expect(screen.getByText(/Costo psicológico · últimas 5 rondas de 18 hoyos/)).toBeTruthy()
    expect(screen.getByText(/\(H6–H7\)/)).toBeTruthy()
  })

  it('9 hoyos: nunca se presenta como ronda de 18', () => {
    render(<CostoPsicologicoCard {...base} windowSize={4} bucket={9} />)
    expect(screen.getByText(/Costo psicológico · últimas 4 rondas de 9 hoyos/)).toBeTruthy()
    expect(screen.queryByText(/18 hoyos/)).toBeNull()
  })
})
