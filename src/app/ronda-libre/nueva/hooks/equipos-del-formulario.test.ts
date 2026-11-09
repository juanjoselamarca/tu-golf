import { describe, it, expect } from 'vitest'
import { equiposSirvenPara, repartirEnEquipos } from './equipos-del-formulario'

describe('repartirEnEquipos', () => {
  it('dos personas son un equipo contra el par', () => {
    expect(repartirEnEquipos('scramble', ['creador', 'r1'])).toEqual([
      { nombre: 'Equipo 1', miembros: ['creador', 'r1'] },
    ])
  })

  it('tres en scramble siguen en un equipo (hay tabla de handicap para 3)', () => {
    expect(repartirEnEquipos('scramble', ['creador', 'r1', 'r2'])).toEqual([
      { nombre: 'Equipo 1', miembros: ['creador', 'r1', 'r2'] },
    ])
  })

  it('tres en foursome abren el segundo equipo: la pareja es de dos exactos', () => {
    expect(repartirEnEquipos('foursome', ['creador', 'r1', 'r2'])).toEqual([
      { nombre: 'Equipo 1', miembros: ['creador', 'r1'] },
      { nombre: 'Equipo 2', miembros: ['r2'] },
    ])
  })

  it('cuatro se reparten 2+2 con el creador en el primero: con rival hay ganador', () => {
    expect(repartirEnEquipos('best_ball', ['creador', 'r1', 'r2', 'r3'])).toEqual([
      { nombre: 'Equipo 1', miembros: ['creador', 'r1'] },
      { nombre: 'Equipo 2', miembros: ['r2', 'r3'] },
    ])
  })

  it('conserva los nombres que el usuario ya puso', () => {
    const previos = [{ nombre: 'Los Cóndores', miembros: ['x'] }, { nombre: '  ', miembros: [] }]
    expect(repartirEnEquipos('scramble', ['creador', 'r1', 'r2', 'r3'], previos).map(e => e.nombre)).toEqual([
      'Los Cóndores',
      'Equipo 2',
    ])
  })

  it('un formato individual no tiene equipos', () => {
    expect(repartirEnEquipos('stroke_play', ['creador', 'r1'])).toEqual([])
    expect(repartirEnEquipos('match_play', ['creador', 'r1'])).toEqual([])
  })
})

describe('equiposSirvenPara', () => {
  const dosYDos = [
    { nombre: 'A', miembros: ['creador', 'r1'] },
    { nombre: 'B', miembros: ['r2', 'r3'] },
  ]

  it('equipos completos que cubren a todos sirven para otro formato de equipo', () => {
    expect(equiposSirvenPara('best_ball', dosYDos, ['creador', 'r1', 'r2', 'r3'])).toBe(true)
    expect(equiposSirvenPara('foursome', dosYDos, ['creador', 'r1', 'r2', 'r3'])).toBe(true)
  })

  it('un equipo de tres no sirve para foursome', () => {
    const tres = [{ nombre: 'A', miembros: ['creador', 'r1', 'r2'] }]
    expect(equiposSirvenPara('scramble', tres, ['creador', 'r1', 'r2'])).toBe(true)
    expect(equiposSirvenPara('foursome', tres, ['creador', 'r1', 'r2'])).toBe(false)
  })

  it('si falta alguien, sobra alguien o se repite, no sirven', () => {
    expect(equiposSirvenPara('scramble', dosYDos, ['creador', 'r1', 'r2'])).toBe(false)
    expect(equiposSirvenPara('scramble', dosYDos, ['creador', 'r1', 'r2', 'r3', 'r4'])).toBe(false)
    expect(
      equiposSirvenPara('scramble', [{ nombre: 'A', miembros: ['creador', 'creador'] }], ['creador', 'r1']),
    ).toBe(false)
  })

  it('sin equipos o en formato individual no sirven', () => {
    expect(equiposSirvenPara('scramble', [], ['creador', 'r1'])).toBe(false)
    expect(equiposSirvenPara('stroke_play', dosYDos, ['creador', 'r1', 'r2', 'r3'])).toBe(false)
  })
})
