import { describe, it, expect } from 'vitest'
import { cortarPorGrupoDeLugar, dentroDelCorte, esPrimerLugar, etiquetasConRespaldo, lugarConOrdinal, etiquetasDePosicion, etiquetasPorClaveDeEmpate, lugarDeEtiqueta } from './posiciones'

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

describe('etiquetasPorClaveDeEmpate', () => {
  it('misma clave = empate; null = sin posición', () => {
    const filas = [{ k: '-3#0' }, { k: '1#0' }, { k: '1#0' }, { k: '1#1' }, { k: null }]
    expect(etiquetasPorClaveDeEmpate(filas, (f) => f.k)).toEqual(['1', 'T2', 'T2', '4', null])
  })
})

describe('etiquetasConRespaldo / esPrimerLugar / lugarDeEtiqueta', () => {
  type F = { s: number; c?: string | null; h: number }
  const mismo = (a: F, b: F) => a.s === b.s
  const sin = (f: F) => f.h === 0

  it('con clave en todas las filas usa la clave (el countback manda)', () => {
    const filas: F[] = [{ s: 1, c: '0#0', h: 9 }, { s: 1, c: '0#1', h: 9 }, { s: 3, c: null, h: 0 }]
    expect(etiquetasConRespaldo(filas, (f) => f.c, mismo, sin)).toEqual(['1', '2', null])
  })

  it('respuesta cacheada sin clave: cae al score, no "—" para todos', () => {
    const filas: F[] = [{ s: 1, h: 9 }, { s: 1, h: 9 }, { s: 3, h: 9 }, { s: 0, h: 0 }]
    expect(etiquetasConRespaldo(filas, (f) => f.c, mismo, sin)).toEqual(['T1', 'T1', '3', null])
  })

  it('esPrimerLugar y lugarDeEtiqueta', () => {
    expect([esPrimerLugar('1'), esPrimerLugar('T1'), esPrimerLugar('T10'), esPrimerLugar(null)]).toEqual([true, true, false, false])
    expect([lugarDeEtiqueta('T2'), lugarDeEtiqueta('4'), lugarDeEtiqueta(null), lugarDeEtiqueta('')]).toEqual([2, 4, null, null])
  })
})

describe('dentroDelCorte / lugarConOrdinal', () => {
  it('corta por lugar: con 1, 2, T3, T3, 5 entran los dos T3 al top 3 y queda fuera el 5', () => {
    expect(['1', '2', 'T3', 'T3', '5'].filter((e) => dentroDelCorte(e, 3))).toEqual(['1', '2', 'T3', 'T3'])
  })
  it('sin lugar no entra', () => {
    expect(dentroDelCorte(null, 3)).toBe(false)
  })
  it('"1°" sin empate y "T1" con empate', () => {
    expect(lugarConOrdinal('1')).toBe('1°')
    expect(lugarConOrdinal('T1')).toBe('T1')
  })
})

describe('cortarPorGrupoDeLugar', () => {
  const filas = (etiquetas: string[]) => etiquetas.map((etiqueta, i) => ({ etiqueta, i }))
  it('si cabe todo, no corta', () => {
    expect(cortarPorGrupoDeLugar(filas(['1', '2', 'T3', 'T3']), 8)).toEqual({ filas: filas(['1', '2', 'T3', 'T3']), resto: null })
  })
  it('1, 2, 3, 4 + cinco T5 en 8 filas: no parte el T5, lo avisa entero', () => {
    const r = cortarPorGrupoDeLugar(filas(['1', '2', '3', '4', 'T5', 'T5', 'T5', 'T5', 'T5']), 8)
    expect(r.filas.map((f) => f.etiqueta)).toEqual(['1', '2', '3', '4'])
    expect(r.resto).toEqual({ cantidad: 5, texto: '+5 empatados en T5' })
  })
  it('un empate en el primer lugar más grande que la imagen: las filas que caben y el resto avisado', () => {
    const r = cortarPorGrupoDeLugar(filas(Array.from({ length: 10 }, () => 'T1')), 8)
    expect(r.filas).toHaveLength(7)
    expect(r.resto).toEqual({ cantidad: 3, texto: '+3 empatados en T1' })
  })
  it('si lo que queda no comparte lugar: "+N más"', () => {
    const r = cortarPorGrupoDeLugar(filas(['1', '2', '3', '4', '5', '6', 'T7', 'T7', '9']), 8)
    expect(r.filas.map((f) => f.etiqueta)).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(r.resto!.texto).toBe('+3 más')
  })
})
