// 19-oct (#602, revisión Fable) — Tarjeta de un 9h que se juega en la vuelta (hoyos 10-18):
//  - el neto reparte TODOS los golpes del course handicap: antes el SI se normalizaba sólo
//    sobre los hoyos 1-9 (ausentes) y con SI de catálogo 18h el jugador perdía golpes;
//  - la mitad se rotula "IN"; un 18h que sale del 10 muestra 1-9 en OUT y 10-18 en IN.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Scorecard from './Scorecard'
import { etiquetaDeMitad, hoyosPorNumero } from '@/golf/core/hoyos-jugados'

// SI de catálogo 18h de la vuelta: pares 2..18 (los impares son de la ida).
const back9 = Array.from({ length: 9 }, (_, i) => ({ numero: i + 10, par: 4, stroke_index: 2 * i + 2 }))
const cinco = Object.fromEntries(back9.map(h => [String(h.numero), 5]))

describe('Scorecard — 9 hoyos desde el 10', () => {
  it('neto con CH 5: 5 golpes (45 − 5 = 40), no 2 (43)', () => {
    render(<Scorecard holes={back9} scores={cinco} courseHandicap={5} modo="neto" formato="stroke_play" playerName="Alberto" />)
    const texto = document.body.textContent ?? ''
    expect(texto).toContain('40 +4 net')
    expect(texto).not.toContain('43 +7 net')
  })

  it('rotula la mitad como IN', () => {
    render(<Scorecard holes={back9} scores={cinco} courseHandicap={5} modo="gross" formato="stroke_play" playerName="Alberto" />)
    expect(screen.getAllByText('IN').length).toBeGreaterThan(0)
    expect(screen.queryByText('OUT')).toBeNull()
  })
})

describe('hoyosPorNumero / etiquetaDeMitad', () => {
  it('18h desde el 10 se pinta 1-9 (OUT) y 10-18 (IN)', () => {
    const orden = [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const n = hoyosPorNumero(orden)
    expect(n.slice(0, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(etiquetaDeMitad(n.slice(0, 9))).toBe('OUT')
    expect(etiquetaDeMitad(n.slice(9))).toBe('IN')
    expect(orden[0]).toBe(10) // no muta el orden de juego
  })
  it('vacío o mezcla (shotgun que cruza) → OUT', () => {
    expect(etiquetaDeMitad([])).toBe('OUT')
    expect(etiquetaDeMitad([1, 2, 16, 17])).toBe('OUT')
  })
})
