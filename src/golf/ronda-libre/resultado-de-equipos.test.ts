import { describe, it, expect } from 'vitest'
import {
  equiposEnElPrimerLugar,
  etiquetaDelResultadoDeEquipos,
  hayEmpateDeEquipos,
  juegaContraElPar,
  nombrarEquipos,
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
      { nombre: 'Uno', score: 70, diff: -2, holesPlayed: 18 },
      { nombre: 'Dos', score: 68, diff: -2, holesPlayed: 17 },
      { nombre: 'Tres', score: 74, diff: 2, holesPlayed: 18 },
    ]
    expect(hayEmpateDeEquipos(ranking)).toBe(true)
    expect(equiposEnElPrimerLugar(ranking).map(t => t.nombre)).toEqual(['Uno', 'Dos'])
  })

  it('sin rival o con un líder claro no hay empate', () => {
    expect(hayEmpateDeEquipos([{ diff: 0, holesPlayed: 9 }])).toBe(false)
    expect(hayEmpateDeEquipos([])).toBe(false)
    expect(hayEmpateDeEquipos([{ diff: -1, holesPlayed: 9 }, { diff: 0, holesPlayed: 9 }])).toBe(false)
    expect(equiposEnElPrimerLugar([{ diff: -1, holesPlayed: 9 }, { diff: 0, holesPlayed: 9 }])).toEqual([{ diff: -1, holesPlayed: 9 }])
  })

  it('un equipo que no anotó nada no empata ni gana, aunque su diff sea 0', () => {
    // El ranking canónico lo deja al final; acá se defiende igual por si llega primero.
    const alFinal = [{ nombre: 'Jugó', diff: 0, holesPlayed: 9 }, { nombre: 'Vacío', diff: 0, holesPlayed: 0 }]
    expect(hayEmpateDeEquipos(alFinal)).toBe(false)
    expect(equiposEnElPrimerLugar(alFinal).map(t => t.nombre)).toEqual(['Jugó'])

    // Si nadie anotó no hay primer lugar: ni cuadro ganador ni imagen.
    const nadieAnoto = [{ nombre: 'Vacío 1', diff: 0, holesPlayed: 0 }, { nombre: 'Vacío 2', diff: 0, holesPlayed: 0 }]
    expect(hayEmpateDeEquipos(nadieAnoto)).toBe(false)
    expect(equiposEnElPrimerLugar(nadieAnoto)).toEqual([])
  })
})

describe('nombrarEquipos', () => {
  it('uno, dos y tres equipos', () => {
    expect(nombrarEquipos(['Equipo 1'])).toBe('Equipo 1')
    expect(nombrarEquipos(['Equipo 1', 'Equipo 2'])).toBe('Equipo 1 y Equipo 2')
    expect(nombrarEquipos(['Uno', 'Dos', 'Tres'])).toBe('Uno, Dos y Tres')
    expect(nombrarEquipos([])).toBe('')
  })
})
