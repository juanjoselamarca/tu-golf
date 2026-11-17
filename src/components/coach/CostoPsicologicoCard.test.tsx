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
    expect(screen.getByText(/en tus últimas 5 rondas de 18 hoyos/)).toBeTruthy()
    expect(screen.getByText(/\(H6–H7\)/)).toBeTruthy()
  })

  it('9 hoyos: nunca se presenta como ronda de 18', () => {
    render(<CostoPsicologicoCard {...base} windowSize={4} bucket={9} />)
    expect(screen.getByText(/en tus últimas 4 rondas de 9 hoyos/)).toBeTruthy()
    expect(screen.queryByText(/18 hoyos/)).toBeNull()
  })
})

describe('CostoPsicologicoCard — copy (vuelta 1)', () => {
  it('el rótulo es solo "Costo psicológico": la ventana la dice el párrafo', () => {
    render(<CostoPsicologicoCard {...base} windowSize={5} bucket={18} />)
    expect(screen.getByText('Costo psicológico')).toBeTruthy()
  })

  it('"golpe evitable" en singular y "golpes evitables" en plural', () => {
    const { unmount } = render(<CostoPsicologicoCard {...base} evitables={1} windowSize={5} bucket={18} />)
    expect(screen.getByText('golpe evitable')).toBeTruthy()
    unmount()
    render(<CostoPsicologicoCard {...base} windowSize={5} bucket={18} />)
    expect(screen.getByText('golpes evitables')).toBeTruthy()
  })

  it('sin juicio: no dice "La cabeza paga"', () => {
    const { container } = render(<CostoPsicologicoCard {...base} windowSize={5} bucket={18} />)
    expect(container.textContent).not.toMatch(/cabeza paga/i)
  })
})
