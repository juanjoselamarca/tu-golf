import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import IndividualLeaderboard from './IndividualLeaderboard'
import type { LivePlayer } from '../types'

const j = (id: string, vs_par: number, thru: number, clave_empate: string | null): LivePlayer => ({
  id, name: id, scores_per_hole: [], gross_total: 0, vs_par, thru, clave_empate,
})
/** Primera celda (Pos) de cada fila del cuerpo de la tabla. */
const columnaPos = () =>
  Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)

afterEach(cleanup)

describe('IndividualLeaderboard del torneo en vivo — posiciones con empate', () => {
  it('usa la clave del motor: mismo score en vivo = T2/T2; separados por countback = sin T; sin hoyos = —', () => {
    render(
      <IndividualLeaderboard
        format="stroke_play"
        modo="gross"
        players={[
          j('Ana', -2, 18, '0#0'),
          j('Diego', 4, 9, '1#0'),
          j('María', 4, 10, '1#0'),
          // Mismo vs par que el siguiente, pero el countback los separó (subgrupos distintos).
          j('Pedro', 6, 18, '2#0'),
          j('Rosa', 6, 18, '2#1'),
          j('Sin salir', 0, 0, null),
        ]}
      />,
    )
    expect(columnaPos()).toEqual(['1', 'T2', 'T2', '4', '5', '—'])
  })

  it('con filtro de categoría (filas parciales) la posición es dentro de lo mostrado', () => {
    render(
      <IndividualLeaderboard format="stroke_play" modo="gross" players={[j('Diego', 4, 9, '1#0'), j('Rosa', 6, 18, '2#1')]} />,
    )
    expect(columnaPos()).toEqual(['1', '2'])
  })
})
