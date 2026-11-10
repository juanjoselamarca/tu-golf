// Ronda libre: la columna HCP (golpes de cancha) de un plus dice "+2", y crearHcpAMostrar redondea
// como el motor (redondearHandicapWHS, el mismo de los golpes que reparte el leaderboard).
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { HcpCelda } from './HcpCelda'
import { crearHcpAMostrar, SIN_INDICE } from '@/lib/data/ronda-libre-live-api'
import { redondearHandicapWHS } from '@/golf/core/stroke-index'

describe('HcpCelda — plus', () => {
  it('−2 se pinta "+2"; 12 queda "12"; "S/Ind" sigue igual', () => {
    expect(render(<HcpCelda hcp={-2} />).container.textContent).toBe('+2')
    expect(render(<HcpCelda hcp={12} />).container.textContent).toBe('12')
    expect(render(<HcpCelda hcp={SIN_INDICE} />).container.textContent).toContain(SIN_INDICE)
  })
})

describe('crearHcpAMostrar — redondeo del motor', () => {
  it.each([-1.5, -2.5, 12.5, 12.4])('handicap %s sin display → redondearHandicapWHS', h => {
    const hcp = crearHcpAMostrar([{ id: 'a', handicap: h }], {}, [], 'todos')
    expect(hcp('a')).toBe(redondearHandicapWHS(h))
  })
  it('−1.5 → −1 ("+1"), no −2', () => {
    expect(crearHcpAMostrar([{ id: 'a', handicap: -1.5 }], {}, [], 'todos')('a')).toBe(-1)
  })
})

describe('HcpCelda enLinea (header del scorer)', () => {
  it('"S/Ind" y "—" heredan tamaño y color de la línea: sin 11px ni --text-3 propios', () => {
    const sinIndice = render(<HcpCelda hcp={SIN_INDICE} enLinea />).container.firstElementChild as HTMLElement
    expect(sinIndice.getAttribute('style')).toBeNull()
    const oculto = render(<HcpCelda hcp={null} enLinea />).container.firstElementChild as HTMLElement
    expect(oculto.getAttribute('style')).toBeNull()
  })

  it('sin enLinea, la celda conserva su estilo', () => {
    const celda = render(<HcpCelda hcp={SIN_INDICE} />).container.firstElementChild as HTMLElement
    expect(celda.style.fontSize).toBe('11px')
  })
})
