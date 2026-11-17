import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CurvaMentalCard } from './CurvaMentalCard'
import type { MentalState } from '@/golf/coach/mental-index'

const base = {
  fecha: 'Ronda 22 oct',
  curso: 'Prince of Wales',
  totalScore: 37,
  overPar: 1,
  states: Array(9).fill('calm'),
  scores: [4, 4, 3, 5, 4, 4, 3, 5, 5],
  pares: [4, 4, 3, 5, 4, 4, 3, 5, 4],
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

// PR3 Ola 1: la vista no inventa par 4 donde no hay par real.
describe('CurvaMentalCard — sin par inventado', () => {
  it('un hoyo sin par real no suma al sobre-par de la vuelta', () => {
    // H1: 7 golpes sin par conocido. Con el viejo "?? 4" sumaba +3 al front 9.
    const scores = [7, 4, 3, 5, 4, 4, 3, 5, 5]
    const pares = [null, 4, 3, 5, 4, 4, 3, 5, 4]
    render(<CurvaMentalCard {...base} scores={scores} pares={pares} />)
    expect(screen.getByText('Front 9').nextElementSibling?.textContent).toBe('+1')
  })
})

// Vuelta 1: número y sustantivo concuerdan ("1 espiral", nunca "1 espirales").
describe('CurvaMentalCard — singular y plural', () => {
  it('1 espiral, 1 calmo, 1 tenso, 1 tilt', () => {
    const states: Array<MentalState | null> = ['calm', 'tense', 'tilt', null, null, null, null, null, null]
    const { container } = render(<CurvaMentalCard {...base} states={states} espirales={1} />)
    const t = container.textContent ?? ''
    expect(t).toMatch(/1 espiral(?!es)/)
    expect(t).toMatch(/1 calmo(?!s)/)
    expect(t).toMatch(/1 tenso(?!s)/)
    expect(t).toMatch(/1 tilt/)
  })

  it('plural con 0 y con varios', () => {
    const { container } = render(<CurvaMentalCard {...base} espirales={2} />)
    const t = container.textContent ?? ''
    expect(t).toMatch(/2 espirales/)
    expect(t).toMatch(/9 calmos/)
    expect(t).toMatch(/0 tensos/)
    expect(t).toMatch(/0 tilt/)
  })
})
