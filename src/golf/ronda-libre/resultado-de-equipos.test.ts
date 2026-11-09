import { describe, it, expect } from 'vitest'
import {
  equiposEnElPrimerLugar,
  etiquetaDelResultadoDeEquipos,
  hayEmpateDeEquipos,
  juegaContraElPar,
} from './resultado-de-equipos'

describe('etiquetaDelResultadoDeEquipos', () => {
  it('un solo equipo juega contra el par: no le gana a nadie, ni empata', () => {
    expect(etiquetaDelResultadoDeEquipos(1, false)).toBe('Contra el par')
    expect(etiquetaDelResultadoDeEquipos(1, true)).toBe('Contra el par')
    expect(juegaContraElPar(1)).toBe(true)
  })

  it('con rival hay ganador o empate', () => {
    expect(etiquetaDelResultadoDeEquipos(2, false)).toBe('Equipo ganador')
    expect(etiquetaDelResultadoDeEquipos(2, true)).toBe('Empate')
    expect(juegaContraElPar(2)).toBe(false)
  })
})

describe('hayEmpateDeEquipos / equiposEnElPrimerLugar', () => {
  it('se decide por diff (vs par), no por golpes brutos', () => {
    // En neto, con distinta cantidad de hoyos anotados, score y diff no van juntos.
    const ranking = [
      { nombre: 'Uno', score: 70, diff: -2 },
      { nombre: 'Dos', score: 68, diff: -2 },
      { nombre: 'Tres', score: 74, diff: 2 },
    ]
    expect(hayEmpateDeEquipos(ranking)).toBe(true)
    expect(equiposEnElPrimerLugar(ranking).map(t => t.nombre)).toEqual(['Uno', 'Dos'])
  })

  it('sin rival o con un líder claro no hay empate', () => {
    expect(hayEmpateDeEquipos([{ diff: 0 }])).toBe(false)
    expect(hayEmpateDeEquipos([])).toBe(false)
    expect(hayEmpateDeEquipos([{ diff: -1 }, { diff: 0 }])).toBe(false)
    expect(equiposEnElPrimerLugar([{ diff: -1 }, { diff: 0 }])).toEqual([{ diff: -1 }])
  })
})
