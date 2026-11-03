import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CurvaMentalCard } from './CurvaMentalCard'

const base = {
  fecha: 'Ronda 22 oct',
  curso: 'Prince of Wales',
  totalScore: 37,
  overPar: 1,
  states: Array(9).fill('calm'),
  scores: [4, 4, 3, 5, 4, 4, 3, 5, 5],
  hole_pars: [4, 4, 3, 5, 4, 4, 3, 5, 4],
  espirales: 0,
}

// Dead-end del 25-oct: "hoyo a hoyo →" tenía cursor de enlace y no llevaba a ningún lado.
describe('CurvaMentalCard — enlace "hoyo a hoyo"', () => {
  it('lleva al detalle de la ronda con un objetivo táctil de 44px', () => {
    render(<CurvaMentalCard {...base} detalleHref="/perfil/historial/abc" />)
    const link = screen.getByRole('link', { name: /hoyo a hoyo/ })
    expect(link.getAttribute('href')).toBe('/perfil/historial/abc')
    expect(link.style.minHeight).toBe('44px')
  })

  it('sin destino no muestra un "hoyo a hoyo" que no hace nada', () => {
    render(<CurvaMentalCard {...base} />)
    expect(screen.queryByText(/hoyo a hoyo/)).toBeNull()
  })
})
