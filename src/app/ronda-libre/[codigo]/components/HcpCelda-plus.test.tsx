// Ronda libre: la columna HCP (golpes de cancha) de un plus dice "+2", y crearHcpAMostrar redondea
// simétrico (el plus 1.5 son 2 golpes; Math.round(-1.5) daba −1).
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { HcpCelda } from './HcpCelda'
import { crearHcpAMostrar, SIN_INDICE } from '@/lib/data/ronda-libre-live-api'

describe('HcpCelda — plus', () => {
  it('−2 se pinta "+2"; 12 queda "12"; "S/Ind" sigue igual', () => {
    expect(render(<HcpCelda hcp={-2} />).container.textContent).toBe('+2')
    expect(render(<HcpCelda hcp={12} />).container.textContent).toBe('12')
    expect(render(<HcpCelda hcp={SIN_INDICE} />).container.textContent).toContain(SIN_INDICE)
  })
})

describe('crearHcpAMostrar — redondeo simétrico', () => {
  it('handicap −1.5 sin display → −2 (no −1)', () => {
    const hcp = crearHcpAMostrar([{ id: 'a', handicap: -1.5 }], {}, [], 'todos')
    expect(hcp('a')).toBe(-2)
  })
})
