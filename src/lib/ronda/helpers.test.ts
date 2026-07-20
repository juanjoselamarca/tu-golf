import { describe, it, expect } from 'vitest'
import {
  generarOrdenHoyos,
  getTeeYardageColumn,
  getChipLabel,
  getVsPar,
  getVsParNeto,
  getHolesPlayed,
  buildTimelineEvents,
  getMissingHoles,
  fillMissingHolesWithPar,
} from './helpers'
import type { Jugador } from '@/types/ronda'

describe('generarOrdenHoyos', () => {
  it('empieza en 1 para ronda 18 hoyos desde hoyo 1', () => {
    expect(generarOrdenHoyos(1, 18)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])
  })
  it('empieza en 10 para ronda 18 hoyos (shotgun back)', () => {
    expect(generarOrdenHoyos(10, 18)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('maneja ronda 9 hoyos desde hoyo 1', () => {
    expect(generarOrdenHoyos(1, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('rota correctamente desde hoyo 4 en 18 hoyos', () => {
    expect(generarOrdenHoyos(4, 18)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3])
  })
  // P0 Máquina de Verdad (16-jul): 'Back 9 (10-18)' jugaba y puntuaba el FRONT 9.
  // El módulo usaba totalHoles (9, los jugados) en vez del tamaño de la cancha (18),
  // así que (10,9) colapsaba a [1..9]. Debe ser [10..18].
  it('Back 9: (10,9) juega los hoyos 10-18, NO el front 9', () => {
    expect(generarOrdenHoyos(10, 9)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
  })
  it('shotgun 18h desde hoyo 12 (multi-loop combinado): rota sobre los 18', () => {
    expect(generarOrdenHoyos(12, 18)).toEqual([12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })
  it('cancha de ≤9 hoyos con shotgun: courseHoles explícito evita hoyos inexistentes', () => {
    // Único caso donde el default 18 no sirve — el caller pasa el tamaño real.
    expect(generarOrdenHoyos(5, 9, 9)).toEqual([5, 6, 7, 8, 9, 1, 2, 3, 4])
  })
})

describe('getTeeYardageColumn', () => {
  it('mapea tees negras + aliases (campeonato/black/negro) → yardaje_negras', () => {
    expect(getTeeYardageColumn('negras')).toBe('yardaje_negras')
    expect(getTeeYardageColumn('black')).toBe('yardaje_negras')
    expect(getTeeYardageColumn('campeonato')).toBe('yardaje_negras')
    expect(getTeeYardageColumn('negro')).toBe('yardaje_negras')
  })
  it('mapea tees azules → yardaje_azul', () => {
    expect(getTeeYardageColumn('blue')).toBe('yardaje_azul')
    expect(getTeeYardageColumn('azul')).toBe('yardaje_azul')
  })
  it('mapea tees blancos → yardaje_blanco', () => {
    expect(getTeeYardageColumn('white')).toBe('yardaje_blanco')
    expect(getTeeYardageColumn('blanco')).toBe('yardaje_blanco')
  })
  it('mapea tees rojos → yardaje_rojo', () => {
    expect(getTeeYardageColumn('red')).toBe('yardaje_rojo')
    expect(getTeeYardageColumn('rojo')).toBe('yardaje_rojo')
  })
  it('es case-insensitive', () => {
    expect(getTeeYardageColumn('BLUE')).toBe('yardaje_azul')
    expect(getTeeYardageColumn('Blanco')).toBe('yardaje_blanco')
  })
  it('default → yardaje_azul para tees desconocidos', () => {
    expect(getTeeYardageColumn('amarillo')).toBe('yardaje_azul')
    expect(getTeeYardageColumn('gold')).toBe('yardaje_azul')
    expect(getTeeYardageColumn('')).toBe('yardaje_azul')
  })
})

describe('getChipLabel', () => {
  it('retorna "Par" para score igual al par', () => {
    expect(getChipLabel(4, 4)).toBe('Par')
    expect(getChipLabel(3, 3)).toBe('Par')
    expect(getChipLabel(5, 5)).toBe('Par')
  })
  it('retorna "Birdie  −1" para birdie', () => {
    expect(getChipLabel(3, 4)).toBe('Birdie  −1')
  })
  it('retorna "Bogey  +1" para bogey', () => {
    expect(getChipLabel(5, 4)).toBe('Bogey  +1')
  })
  it('retorna "Doble  +2" para doble bogey', () => {
    expect(getChipLabel(6, 4)).toBe('Doble  +2')
  })
  it('retorna "Eagle  -2" para eagle o mejor', () => {
    expect(getChipLabel(2, 4)).toBe('Eagle  -2')
    expect(getChipLabel(1, 4)).toBe('Eagle  -3')
  })
  it('retorna "+N" para triple bogey o peor', () => {
    expect(getChipLabel(7, 4)).toBe('+3')
    expect(getChipLabel(8, 4)).toBe('+4')
  })
})

describe('getVsPar', () => {
  it('0 para ronda sin hoyos jugados', () => {
    expect(getVsPar({}, 18, { 1: 4, 2: 4 })).toBe(0)
  })
  it('suma diferencial cuando hay scores (birdie + bogey = par)', () => {
    expect(getVsPar({ '1': 5, '2': 3 }, 18, { 1: 4, 2: 4 })).toBe(0)
  })
  it('retorna +N cuando todo está sobre par', () => {
    expect(getVsPar({ '1': 5, '2': 6 }, 18, { 1: 4, 2: 4 })).toBe(3)
  })
  it('retorna -N cuando todo está bajo par', () => {
    expect(getVsPar({ '1': 3, '2': 3 }, 18, { 1: 4, 2: 4 })).toBe(-2)
  })
})

describe('getVsParNeto', () => {
  it('0 para ronda sin hoyos jugados', () => {
    expect(getVsParNeto({}, 18, { 1: 4 }, { 1: 1 }, 18)).toBe(0)
  })
  it('resta 1 stroke en el SI=1 cuando courseHandicap=18', () => {
    // gross=5, par=4, strokes=1 (hcp 18 en SI 1 de 18 hoyos → 1 stroke)
    // neto = 5 - 1 = 4, diff vs par = 0
    expect(getVsParNeto({ '1': 5 }, 18, { 1: 4 }, { 1: 1 }, 18)).toBe(0)
  })
  it('no aplica strokes cuando courseHandicap=0', () => {
    expect(getVsParNeto({ '1': 5 }, 18, { 1: 4 }, { 1: 1 }, 0)).toBe(1)
  })
})

describe('getHolesPlayed', () => {
  it('cuenta solo hoyos con score registrado', () => {
    // Los scores con valor 0 siguen "presentes" (0 != null), se cuentan.
    expect(getHolesPlayed({ '1': 4, '2': 0, '3': 5 }, 18)).toBe(3)
  })
  it('ignora hoyos sin score', () => {
    expect(getHolesPlayed({ '1': 4, '5': 5 }, 18)).toBe(2)
  })
  it('retorna 0 para objeto vacío', () => {
    expect(getHolesPlayed({}, 18)).toBe(0)
  })
  it('respeta el límite de holes', () => {
    // hoyo 10 registrado pero la ronda es de 9 → no se cuenta
    expect(getHolesPlayed({ '1': 4, '10': 5 }, 9)).toBe(1)
  })
})

describe('buildTimelineEvents', () => {
  const parMap = { 1: 4, 2: 4, 3: 4, 4: 4 }
  it('retorna vacío cuando nadie tiene scores', () => {
    const jugadores: Jugador[] = [
      { id: 'a', nombre: 'Ana', user_id: null, scores: {} },
    ]
    expect(buildTimelineEvents(jugadores, 18, parMap)).toEqual([])
  })
  it('retorna el hoyo más alto con score por jugador', () => {
    const jugadores: Jugador[] = [
      { id: 'a', nombre: 'Ana', user_id: null, scores: { '1': 4, '2': 3 } },
    ]
    const events = buildTimelineEvents(jugadores, 18, parMap)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ jugador: 'Ana', hole: 2, score: 3, diff: -1 })
  })
  it('ordena por hoyo descendente y limita a 4 eventos', () => {
    const jugadores: Jugador[] = [
      { id: '1', nombre: 'P1', user_id: null, scores: { '1': 4 } },
      { id: '2', nombre: 'P2', user_id: null, scores: { '1': 4, '2': 4 } },
      { id: '3', nombre: 'P3', user_id: null, scores: { '1': 4, '2': 4, '3': 4 } },
      { id: '4', nombre: 'P4', user_id: null, scores: { '4': 5 } },
      { id: '5', nombre: 'P5', user_id: null, scores: { '1': 4, '2': 4, '3': 4, '4': 4, '5': 4 } },
    ]
    const events = buildTimelineEvents(jugadores, 18, parMap)
    expect(events).toHaveLength(4)
    // Ordenado por hoyo descendente
    expect(events[0].hole).toBeGreaterThanOrEqual(events[1].hole)
    expect(events[1].hole).toBeGreaterThanOrEqual(events[2].hole)
    expect(events[2].hole).toBeGreaterThanOrEqual(events[3].hole)
  })
})

/* ── getMissingHoles ─────────────────────────────────────────────────── */
describe('getMissingHoles', () => {
  it('retorna [] cuando todos los hoyos tienen score', () => {
    const scores = { 1: 4, 2: 5, 3: 4, 4: 5, 5: 5, 6: 3, 7: 3, 8: 4, 9: 5 }
    expect(getMissingHoles(scores, 9)).toEqual([])
  })

  // Regression: bug del 30-abr-2026 que reportó Juanjo.
  // Score=par en último hoyo de 9 → goToNextHole no rellena (no hay siguiente)
  // → finalizar guarda 8/9 y el handicap calc descarta la ronda.
  it('detecta el último hoyo faltante (regresión bug 30-abr Juanjo)', () => {
    const scores = { 1: 4, 2: 5, 3: 4, 4: 5, 5: 5, 6: 3, 7: 3, 8: 4 }
    expect(getMissingHoles(scores, 9)).toEqual([9])
  })

  it('detecta múltiples hoyos faltantes', () => {
    const scores = { 1: 4, 5: 5, 9: 4 }
    expect(getMissingHoles(scores, 9)).toEqual([2, 3, 4, 6, 7, 8])
  })

  it('soporta ronda 18h con varios huecos', () => {
    const scores = { 1: 4, 18: 5 }
    expect(getMissingHoles(scores, 18)).toHaveLength(16)
  })

  it('tolera keys string y number', () => {
    const scores = { 1: 4, '2': 5, 3: 4 } as Record<string | number, number>
    expect(getMissingHoles(scores, 3)).toEqual([])
  })

  it('retorna 1..N para objeto vacío', () => {
    expect(getMissingHoles({}, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('cuenta score=0 como presente (no missing)', () => {
    // 0 es valor válido en algunos formatos (Match Play "Pickup"), no es null
    expect(getMissingHoles({ 1: 0, 2: 4 }, 2)).toEqual([])
  })
})

/* ── fillMissingHolesWithPar ─────────────────────────────────────────── */
describe('fillMissingHolesWithPar', () => {
  it('rellena los hoyos faltantes con el par del parMap', () => {
    const scores = { 1: 4, 2: 5 }
    const parMap = { 1: 4, 2: 5, 3: 4, 4: 5 }
    expect(fillMissingHolesWithPar(scores, [3, 4], parMap)).toEqual({ 1: 4, 2: 5, 3: 4, 4: 5 })
  })

  it('default a par 4 si parMap no tiene el hoyo', () => {
    expect(fillMissingHolesWithPar({}, [5], {})).toEqual({ 5: 4 })
  })

  it('no muta el input', () => {
    const scores = { 1: 4 }
    const next = fillMissingHolesWithPar(scores, [2], { 2: 3 })
    expect(scores).toEqual({ 1: 4 })
    expect(next).toEqual({ 1: 4, 2: 3 })
  })

  it('preserva scores existentes', () => {
    const scores = { 1: 4, 2: 6, 3: 3 }
    const parMap = { 1: 4, 2: 4, 3: 4, 4: 5 }
    expect(fillMissingHolesWithPar(scores, [4], parMap)).toEqual({ 1: 4, 2: 6, 3: 3, 4: 5 })
  })

  it('lista vacía de missing → mismo objeto efectivo', () => {
    const scores = { 1: 4 }
    expect(fillMissingHolesWithPar(scores, [], { 1: 4 })).toEqual({ 1: 4 })
  })
})
