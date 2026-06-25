import { describe, it, expect } from 'vitest'
import { buildLeaderboard } from './leaderboard'
import {
  normalizeStrokeIndexMap,
  isValidStrokeIndexPermutation,
} from '@/golf/core/stroke-index'
import { strokesRecibidosEnHoyo } from '@/golf/core/stableford-score'
import type { Jugador } from '@/types/ronda'

/**
 * Regresión del bug de campo 24-jun-2026 (inbox e6408e3c): "Error en net +12
 * para Don Jorge". El stroke index de Los Leones (y de 47/69 canchas chilenas)
 * tenía DUPLICADOS y HUECOS en el catálogo → `strokesRecibidosEnHoyo` contaba mal
 * los hoyos con SI bajo → el course handicap 25 solo alocaba 23 golpes → el net
 * 18h salía +12 (84) en vez de +10 (82). El fix normaliza el SI por rango antes
 * de alocar, restaurando el invariante "net 18h total = gross − courseHandicap".
 */

// Datos reales de la ronda reportada (Los Leones, dorado, par 72, CH 25).
const PAR: Record<number, number> = {
  1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5,
  10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5,
}
// SI CORRUPTO tal cual estaba en course_holes: dups (10,14,15), faltan (3,6,12).
const SI_CORRUPTO: Record<number, number> = {
  1: 17, 2: 7, 3: 15, 4: 1, 5: 13, 6: 15, 7: 5, 8: 9, 9: 11,
  10: 14, 11: 18, 12: 14, 13: 2, 14: 16, 15: 4, 16: 8, 17: 10, 18: 10,
}
const DON_JORGE_SCORES: Record<string, number> = {
  '1': 5, '2': 8, '3': 5, '4': 7, '5': 5, '6': 4, '7': 7, '8': 5, '9': 7,
  '10': 7, '11': 4, '12': 8, '13': 6, '14': 4, '15': 5, '16': 6, '17': 7, '18': 7,
}

function jugador(id: string, scores: Record<string, number>, handicap: number): Jugador {
  return { id, nombre: id, user_id: null, scores, handicap }
}

describe('stroke index corrupto → normalización del net (bug Don Jorge)', () => {
  it('detecta el SI corrupto de Los Leones como permutación inválida', () => {
    expect(isValidStrokeIndexPermutation(SI_CORRUPTO, 18)).toBe(false)
  })

  it('normaliza a una permutación válida 1..18 (no-op si ya era válida)', () => {
    const norm = normalizeStrokeIndexMap(SI_CORRUPTO, 18)
    expect(isValidStrokeIndexPermutation(norm, 18)).toBe(true)
    // Un siMap ya válido queda idéntico (rank == SI).
    const valido = { 1: 1, 2: 2, 3: 3 }
    expect(normalizeStrokeIndexMap(valido, 3)).toEqual(valido)
  })

  it('con SI normalizado, la alocación suma EXACTAMENTE el course handicap (25)', () => {
    const norm = normalizeStrokeIndexMap(SI_CORRUPTO, 18)
    let total = 0
    for (let h = 1; h <= 18; h++) total += strokesRecibidosEnHoyo(25, norm[h], 18)
    expect(total).toBe(25)
  })

  it('con el SI crudo corrupto se perdían golpes (solo 23 de 25) — la causa raíz', () => {
    let total = 0
    for (let h = 1; h <= 18; h++) total += strokesRecibidosEnHoyo(25, SI_CORRUPTO[h], 18)
    expect(total).toBe(23) // ← el bug: 2 golpes de hándicap no se alocaban
  })

  it('buildLeaderboard: el net de Don Jorge es +10 (82), no +12 (84)', () => {
    const lb = buildLeaderboard({
      jugadores: [jugador('dj', DON_JORGE_SCORES, 25)],
      holes: 18,
      parMap: PAR,
      siMap: SI_CORRUPTO,
      courseHcpMap: { dj: 25 },
      modoJuego: 'neto',
      formatoJuego: 'stroke_play',
    })
    expect(lb[0].vsParGross).toBe(35) // 107 vs par 72
    expect(lb[0].vsParNeto).toBe(10) // 82 net (= 107 − 25), NO 12
  })

  it('invariante WHS: net 18h total = gross − courseHandicap, sin importar el SI', () => {
    // El mismo gross y CH con DOS stroke index distintos (uno corrupto, uno limpio)
    // deben dar el MISMO net total. Antes del fix, el corrupto daba +2.
    const limpio: Record<number, number> = {}
    for (let h = 1; h <= 18; h++) limpio[h] = h
    const base = {
      jugadores: [jugador('dj', DON_JORGE_SCORES, 25)],
      holes: 18, parMap: PAR, courseHcpMap: { dj: 25 },
      modoJuego: 'neto' as const, formatoJuego: 'stroke_play' as const,
    }
    const conCorrupto = buildLeaderboard({ ...base, siMap: SI_CORRUPTO })
    const conLimpio = buildLeaderboard({ ...base, siMap: limpio })
    expect(conCorrupto[0].vsParNeto).toBe(conLimpio[0].vsParNeto)
    expect(conCorrupto[0].vsParNeto).toBe(10)
  })
})
