import { describe, it, expect } from 'vitest'
import { etiquetasDePosicion } from './posiciones'

interface Fila { nombre: string; vsPar: number; hoyos: number; pts?: number }
const mismoVsPar = (a: Fila, b: Fila) => a.vsPar === b.vsPar
const sinHoyos = { sinPosicion: (f: Fila) => f.hoyos === 0 }
const f = (nombre: string, vsPar: number, hoyos = 18, pts?: number): Fila => ({ nombre, vsPar, hoyos, pts })

describe('etiquetasDePosicion', () => {
  it('sin empates numera 1..n', () => {
    expect(etiquetasDePosicion([f('A', -2), f('B', 0), f('C', 3)], mismoVsPar)).toEqual(['1', '2', '3'])
  })

  it('el caso que lo destapó: Diego y María en +14 son T2 y T2, y el siguiente es 4', () => {
    const filas = [f('Ana', 10), f('Diego', 14), f('María', 14), f('Pedro', 17)]
    expect(etiquetasDePosicion(filas, mismoVsPar)).toEqual(['1', 'T2', 'T2', '4'])
  })

  it('empate en el primer lugar: T1, T1 y el siguiente 3', () => {
    expect(etiquetasDePosicion([f('A', -1), f('B', -1), f('C', 2)], mismoVsPar)).toEqual(['T1', 'T1', '3'])
  })

  it('todos empatados: todos T1', () => {
    expect(etiquetasDePosicion([f('A', 0), f('B', 0), f('C', 0)], mismoVsPar)).toEqual(['T1', 'T1', 'T1'])
  })

  it('dos grupos de empate seguidos no se mezclan', () => {
    const filas = [f('A', 1), f('B', 1), f('C', 2), f('D', 2), f('E', 5)]
    expect(etiquetasDePosicion(filas, mismoVsPar)).toEqual(['T1', 'T1', 'T3', 'T3', '5'])
  })

  it('empate al final de la tabla', () => {
    expect(etiquetasDePosicion([f('A', 0), f('B', 4), f('C', 4)], mismoVsPar)).toEqual(['1', 'T2', 'T2'])
  })

  it('un solo jugador y tabla vacía', () => {
    expect(etiquetasDePosicion([f('A', 3)], mismoVsPar)).toEqual(['1'])
    expect(etiquetasDePosicion([] as Fila[], mismoVsPar)).toEqual([])
  })

  it('jugadores sin hoyos jugados no tienen posición ni empatan con el que va en par', () => {
    // Sin `sinPosicion`, el que no jugó (vsPar 0) quedaría "T2" con el que va en par.
    const filas = [f('A', -1), f('B', 0), f('C', 0, 0), f('D', 0, 0)]
    expect(etiquetasDePosicion(filas, mismoVsPar, sinHoyos)).toEqual(['1', '2', null, null])
  })

  it('nadie empezó: ninguna posición (no "T1" para el field entero)', () => {
    const filas = [f('A', 0, 0), f('B', 0, 0)]
    expect(etiquetasDePosicion(filas, mismoVsPar, sinHoyos)).toEqual([null, null])
  })

  it('una fila sin posición en medio no consume lugar ni corta un empate de los que compiten', () => {
    const filas = [f('A', 1), f('X', 0, 0), f('B', 1), f('C', 3)]
    expect(etiquetasDePosicion(filas, mismoVsPar, sinHoyos)).toEqual(['T1', null, 'T1', '3'])
  })

  it('Stableford: empate por puntos (más es mejor), mismo formato de etiqueta', () => {
    const filas = [f('A', 0, 18, 38), f('B', 0, 18, 36), f('C', 0, 18, 36), f('D', 0, 18, 30)]
    const mismosPuntos = (a: Fila, b: Fila) => a.pts === b.pts
    expect(etiquetasDePosicion(filas, mismosPuntos)).toEqual(['1', 'T2', 'T2', '4'])
  })

  it('un desempate de golf (countback) separa: el caller lo expresa en mismoScore', () => {
    // A y B empatan en score pero el countback los separó (claves distintas); C y D siguen iguales.
    const filas = [{ clave: '-2#0' }, { clave: '-2#1' }, { clave: '0#0' }, { clave: '0#0' }]
    expect(etiquetasDePosicion(filas, (a, b) => a.clave === b.clave)).toEqual(['1', '2', 'T3', 'T3'])
  })

  it('tabla larga: el lugar sigue contando las filas de arriba (T10 tras nueve)', () => {
    const filas = [...Array.from({ length: 9 }, (_, i) => f(`J${i}`, i)), f('K', 20), f('L', 20)]
    expect(etiquetasDePosicion(filas, mismoVsPar).slice(-2)).toEqual(['T10', 'T10'])
  })
})
