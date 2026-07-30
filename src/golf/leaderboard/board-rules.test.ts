// src/golf/leaderboard/board-rules.test.ts
//
// Los tres conceptos que el board individual contestaba de N formas distintas
// (regla "un concepto, una fuente"). Cada uno tiene UNA definición acá.

import { describe, it, expect } from 'vitest'
import { resolveLegacyPlayerName, parOfPlayedHoles, hasPlayData } from './board-rules'
import type { CourseHole } from './types'

const HOLES_9: CourseHole[] = [
  { numero: 1, par: 4, stroke_index: 5 },
  { numero: 2, par: 3, stroke_index: 9 },
  { numero: 3, par: 5, stroke_index: 1 },
  { numero: 4, par: 4, stroke_index: 3 },
  { numero: 5, par: 4, stroke_index: 7 },
  { numero: 6, par: 3, stroke_index: 8 },
  { numero: 7, par: 5, stroke_index: 2 },
  { numero: 8, par: 4, stroke_index: 4 },
  { numero: 9, par: 4, stroke_index: 6 },
]

describe('resolveLegacyPlayerName — una sola regla de nombre', () => {
  it('prefiere el nombre del perfil cuando el jugador está registrado', () => {
    expect(resolveLegacyPlayerName({ profiles: { name: 'Juanjo Lamarca' }, player_name: 'JJ' }))
      .toBe('Juanjo Lamarca')
  })

  it('cae a player_name para INVITADOS (sin perfil) — antes decían "Sin nombre"/"Jugador"', () => {
    expect(resolveLegacyPlayerName({ profiles: null, player_name: 'Paty Demo' })).toBe('Paty Demo')
  })

  it('ignora el nombre de perfil vacío y usa player_name', () => {
    expect(resolveLegacyPlayerName({ profiles: { name: '   ' }, player_name: 'Nacho' })).toBe('Nacho')
  })

  it('último recurso "Jugador" cuando no hay ningún nombre', () => {
    expect(resolveLegacyPlayerName({ profiles: null, player_name: null })).toBe('Jugador')
    expect(resolveLegacyPlayerName({})).toBe('Jugador')
  })
})

describe('parOfPlayedHoles — "a par" se mide contra los hoyos JUGADOS', () => {
  it('suma sólo el par de los hoyos con score (P0: thru 3 no vale par 36)', () => {
    // Hoyos 1,2,3 → par 4+3+5 = 12. NO 36.
    expect(parOfPlayedHoles(HOLES_9, [1, 2, 3])).toBe(12)
  })

  it('con la vuelta completa iguala el par total de la cancha', () => {
    expect(parOfPlayedHoles(HOLES_9, [1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(36)
  })

  it('sin hoyos jugados es 0', () => {
    expect(parOfPlayedHoles(HOLES_9, [])).toBe(0)
  })

  it('multi-ronda: el mismo hoyo jugado dos veces suma su par dos veces', () => {
    expect(parOfPlayedHoles(HOLES_9, [1, 1])).toBe(8)
  })

  it('un hoyo sin par en catálogo no rompe: cae al par-4 estándar', () => {
    expect(parOfPlayedHoles(HOLES_9, [1, 99])).toBe(8)
  })

  it('cancha multi-recorrido con filas duplicadas usa el par del hoyo una vez por juego', () => {
    const dupes: CourseHole[] = [...HOLES_9, { numero: 1, par: 4, stroke_index: 5 }]
    expect(parOfPlayedHoles(dupes, [1])).toBe(4)
  })
})

describe('hasPlayData — un solo predicado de "¿hay datos?"', () => {
  it('sin hoyos jugados no hay datos (la UI muestra "—", no "E" ni un bajo par falso)', () => {
    expect(hasPlayData({ holesPlayed: 0 })).toBe(false)
  })

  it('con al menos un hoyo hay datos', () => {
    expect(hasPlayData({ holesPlayed: 1 })).toBe(true)
  })
})
