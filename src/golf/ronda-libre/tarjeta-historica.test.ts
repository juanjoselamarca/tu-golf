import { describe, it, expect } from 'vitest'
import { hoyosDeLaRonda, mitadJugada } from '@/golf/core/hoyos-jugados'
import {
  armarTarjetaHistorica,
  completarHoyosSinMarcarConPar,
  filaHistorialRondaLibre,
  hoyosSinMarcar,
  scoreDelHoyo,
} from './tarjeta-historica'

// Los Leones: par real hoyo por hoyo (1..18).
const PAR: Record<number, number> = {
  1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5,
  10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5,
}

describe('hoyosDeLaRonda', () => {
  it('front 9, back 9, 18 y shotgun', () => {
    expect(hoyosDeLaRonda(1, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(hoyosDeLaRonda(10, 9)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
    expect(hoyosDeLaRonda(1, 18)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
    expect(hoyosDeLaRonda(10, 18)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('hoyo de inicio nulo o inválido parte en el 1', () => {
    expect(hoyosDeLaRonda(null, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(hoyosDeLaRonda(0, 9)[0]).toBe(1)
  })

  it('mitadJugada', () => {
    expect(mitadJugada(hoyosDeLaRonda(1, 9))).toBe('front')
    expect(mitadJugada(hoyosDeLaRonda(10, 9))).toBe('back')
    expect(mitadJugada(hoyosDeLaRonda(1, 18))).toBeNull()
    expect(mitadJugada(hoyosDeLaRonda(15, 9))).toBeNull() // cruza del 18 al 1
  })
})

describe('completarHoyosSinMarcarConPar — ronda de 9 desde el 10', () => {
  const back = hoyosDeLaRonda(10, 9)
  // Último hoyo (18) hecho en par sin tocar +/-: no quedó marcado.
  const marcados = { 10: 4, 11: 4, 12: 4, 13: 5, 14: 3, 15: 4, 16: 5, 17: 4 }

  it('rellena SOLO el 18, nunca los hoyos 1..9', () => {
    const { scores, rellenados } = completarHoyosSinMarcarConPar(marcados, back, PAR)
    expect(rellenados).toEqual([18])
    expect(scores[18]).toBe(5)
    for (let h = 1; h <= 9; h++) expect(scores[h]).toBeUndefined()
  })

  it('acepta claves string (así vienen de la BD)', () => {
    const conString = Object.fromEntries(Object.entries(marcados).map(([k, v]) => [String(k), v]))
    expect(hoyosSinMarcar(conString, back)).toEqual([18])
  })

  it('par 4 si el mapa no trae el par del hoyo', () => {
    expect(completarHoyosSinMarcarConPar({}, [5], {}).scores).toEqual({ 5: 4 })
  })

  it('no muta el input', () => {
    const copia = { ...marcados }
    completarHoyosSinMarcarConPar(marcados, back, PAR)
    expect(marcados).toEqual(copia)
  })
})

describe('armarTarjetaHistorica', () => {
  it('back 9: guarda los golpes reales del 10..18 y sus pares, posicionales', () => {
    const scores = { 10: 4, 11: 4, 12: 4, 13: 5, 14: 3, 15: 4, 16: 5, 17: 4, 18: 6 }
    const t = armarTarjetaHistorica({ scores, hoyos: hoyosDeLaRonda(10, 9), roundHoles: 9, parMap: PAR })
    expect(t.scores).toEqual([4, 4, 4, 5, 3, 4, 5, 4, 6])
    expect(t.totalGross).toBe(39)
    expect(t.holesPlayed).toBe(9)
    expect(t.parPerHole).toEqual({ 1: 4, 2: 3, 3: 4, 4: 4, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5 })
    expect(t.hoyos).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
  })

  it('front 9 y 18 sin hoyos: igual que antes (1..N)', () => {
    const scores = { 1: 5, 2: 4, 3: 3 }
    const t = armarTarjetaHistorica({ scores, roundHoles: 9, parMap: PAR })
    expect(t.scores).toEqual([5, 4, 3, null, null, null, null, null, null])
    expect(t.holesPlayed).toBe(3)
    expect(t.hoyos).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('18 desde el 10: posición = número de hoyo, igual que desde el 1 (convención de historical_rounds)', () => {
    const scores: Record<number, number> = {}
    for (let h = 1; h <= 18; h++) scores[h] = h === 10 ? 7 : 4
    const desdeEl10 = armarTarjetaHistorica({ scores, hoyos: hoyosDeLaRonda(10, 18), roundHoles: 18, parMap: PAR })
    const desdeEl1 = armarTarjetaHistorica({ scores, hoyos: hoyosDeLaRonda(1, 18), roundHoles: 18, parMap: PAR })
    expect(desdeEl10).toEqual(desdeEl1)
    expect(desdeEl10.scores[9]).toBe(7) // hoyo 10 en la posición 10
    expect(desdeEl10.parPerHole?.['1']).toBe(PAR[1])
    expect(desdeEl10.hoyos[0]).toBe(1)
  })

  it('sin par de algún hoyo no inventa par_per_hole', () => {
    const t = armarTarjetaHistorica({ scores: { 1: 4 }, roundHoles: 9, parMap: { 1: 4 } })
    expect(t.parPerHole).toBeNull()
  })
})

describe('motor con hoyos jugados (back 9)', () => {
  it('calcularScoreRonda suma 10..18 y el par de esos hoyos', async () => {
    const { calcularScoreRonda } = await import('@/golf/core/round-score')
    const r = calcularScoreRonda({
      scores: { 10: 4, 11: 4, 12: 4, 13: 5, 14: 3, 15: 4, 16: 5, 17: 4, 18: 6 },
      roundHoles: 9, parMap: PAR, hoyos: hoyosDeLaRonda(10, 9),
    })
    expect(r).toMatchObject({ gross: 39, holesPlayed: 9, parJugado: 36, parTotalRonda: 36, vsPar: 3 })
  })

  it('normalizeStrokeIndexMap rankea sólo los hoyos jugados → permutación 1..9', async () => {
    const { normalizeStrokeIndexMap } = await import('@/golf/core/stroke-index')
    const si = { 10: 2, 11: 4, 12: 6, 13: 8, 14: 10, 15: 12, 16: 14, 17: 16, 18: 18 }
    const n = normalizeStrokeIndexMap(si, 9, hoyosDeLaRonda(10, 9))
    expect(Object.keys(n).map(Number).sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
    expect(Object.values(n).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(n[10]).toBe(1)
  })

  it('ratingsPublicadosDe9 elige la mitad jugada', async () => {
    const { ratingsPublicadosDe9 } = await import('@/golf/core/course-handicap')
    const tee = { rating: 72, slope: 130, front_course_rating: 35.5, front_slope_rating: 128, back_course_rating: 36.4, back_slope_rating: 133 }
    expect(ratingsPublicadosDe9(tee, 'back')).toEqual({ cr9h: 36.4, slope9h: 133 })
    expect(ratingsPublicadosDe9(tee, 'front')).toEqual({ cr9h: 35.5, slope9h: 128 })
    expect(ratingsPublicadosDe9({ rating: 72, slope: 130 }, 'back')).toBeNull()
    // CR de 9 publicado sin slope de 9 → slope de 18 (WHS).
    expect(ratingsPublicadosDe9({ rating: 72, slope: 130, back_course_rating: 36 }, 'back')).toEqual({ cr9h: 36, slope9h: 130 })
  })
})

describe('filaHistorialRondaLibre — fuente única de la fila de historical_rounds', () => {
  const ronda = { course_name: 'Los Leones', course_id: 'c1', fecha: '2026-09-30', formato_juego: 'stableford', modo_juego: 'neto' }
  const hoyos = hoyosDeLaRonda(10, 9)
  const tarjeta = armarTarjetaHistorica({ scores: { 10: 4, 11: 3, 12: 4, 13: 5, 14: 3, 15: 4, 16: 5, 17: 4, 18: 5 }, hoyos, roundHoles: 9, parMap: PAR })

  it('lleva exactamente las columnas que escribían los dos finalizadores', () => {
    const fila = filaHistorialRondaLibre({
      ronda, userId: 'u1', jugadorId: 'p1', tarjeta, tee: 'azul',
      ratings: { slope: 128, cr: 71.3, nineHole: { cr9h: 35.9, slope9h: 130 } }, diferencial: 12.3,
      matchResult: null, teamName: 'Los Cóndores',
    })
    expect(fila).toEqual({
      user_id: 'u1',
      course_name: 'Los Leones',
      course_id: 'c1',
      played_at: '2026-09-30',
      total_gross: 37,
      scores: tarjeta.scores,
      par_per_hole: tarjeta.parPerHole,
      metadata: { hoyos: [10, 11, 12, 13, 14, 15, 16, 17, 18], ronda_libre_jugador_id: 'p1' },
      holes_played: 9,
      tee_color: 'azul',
      privacy: 'private',
      slope_rating: 128,
      course_rating: 71.3,
      diferencial: 12.3,
      formato_juego: 'stableford',
      modo_juego: 'neto',
      match_result: null,
      team_name: 'Los Cóndores',
    })
  })

  it('defaults: sin fecha usa hoy, sin formato/modo stroke_play/gross, sin extras null', () => {
    const fila = filaHistorialRondaLibre({
      ronda: { course_name: 'X', fecha: null, formato_juego: null, modo_juego: null },
      userId: 'u1', jugadorId: 'p1', tarjeta, tee: null,
      ratings: { slope: null, cr: null, nineHole: null }, diferencial: null,
    })
    expect(fila.played_at).toBe(new Date().toISOString().split('T')[0])
    expect(fila.course_id).toBeNull()
    expect(fila.tee_color).toBeNull()
    expect(fila.formato_juego).toBe('stroke_play')
    expect(fila.modo_juego).toBe('gross')
    expect(fila.match_result).toBeNull()
    expect(fila.team_name).toBeNull()
    expect(fila.slope_rating).toBeNull()
    expect(fila.diferencial).toBeNull()
  })

  it('scoreDelHoyo acepta claves número y string y rechaza basura', () => {
    expect(scoreDelHoyo({ 3: 4 }, 3)).toBe(4)
    expect(scoreDelHoyo({ '3': 5 }, 3)).toBe(5)
    expect(scoreDelHoyo({ 3: NaN }, 3)).toBeUndefined()
    expect(scoreDelHoyo({}, 3)).toBeUndefined()
  })
})
