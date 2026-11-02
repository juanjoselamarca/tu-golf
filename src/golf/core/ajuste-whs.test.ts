import { describe, it, expect } from 'vitest'
import {
  ajustarTarjetaParaHistorial,
  estimarHoyoConcedido,
  maximoPorHoyo,
  parNeto,
  TOPE_SIN_INDICE_SOBRE_PAR,
  alcanzaMinimoDeHoyosJugados,
  hoyosNoJugadosEstimados,
  indiceDelDia,
  indiceGolfersAntesDe,
} from './ajuste-whs'
import { CONCEDE } from '../formats/match-play'

describe('maximoPorHoyo (WHS 3.1)', () => {
  it('doble bogey neto = par + 2 + golpes recibidos', () => {
    expect(maximoPorHoyo(4, 0)).toBe(6)
    expect(maximoPorHoyo(4, 1)).toBe(7)
    expect(maximoPorHoyo(5, 2)).toBe(9)
  })
  it('jugador plus (devuelve un golpe) → par + 1', () => {
    expect(maximoPorHoyo(4, -1)).toBe(5)
  })
  it('sin índice → par + 5 (3.1b)', () => {
    expect(TOPE_SIN_INDICE_SOBRE_PAR).toBe(5)
    expect(maximoPorHoyo(3, null)).toBe(8)
  })
})

describe('parNeto', () => {
  it('par + golpes recibidos; sin índice, par', () => {
    expect(parNeto(4, 1)).toBe(5)
    expect(parNeto(4, null)).toBe(4)
    expect(parNeto(4, -1)).toBe(3)
  })
})

describe('estimarHoyoConcedido (WHS 3.3, score más probable)', () => {
  it('rival hace doble bogey neto y concedo → doble bogey neto (el techo)', () => {
    expect(estimarHoyoConcedido({ par: 4, golpesRecibidos: 0, rival: { gross: 6, golpesRecibidos: 0 } })).toBe(6)
  })
  it('rival hace birdie y concedo (con putt para par) → par', () => {
    expect(estimarHoyoConcedido({ par: 4, golpesRecibidos: 0, rival: { gross: 3, golpesRecibidos: 0 } })).toBe(4)
  })
  it('lleva el neto del rival + 1 a golpes brutos del jugador', () => {
    // Rival 5 bruto con 1 golpe → neto 4; objetivo neto 5; yo recibo 2 → 7 bruto (techo 4+2+2 = 8).
    expect(estimarHoyoConcedido({ par: 4, golpesRecibidos: 2, rival: { gross: 5, golpesRecibidos: 1 } })).toBe(7)
  })
  it('sin score válido del rival (no anotó o también concedió) → techo', () => {
    expect(estimarHoyoConcedido({ par: 4, golpesRecibidos: 1, rival: { gross: null, golpesRecibidos: 0 } })).toBe(7)
    expect(estimarHoyoConcedido({ par: 4, golpesRecibidos: 1, rival: { gross: CONCEDE, golpesRecibidos: 0 } })).toBe(7)
    expect(estimarHoyoConcedido({ par: 4, golpesRecibidos: 1 })).toBe(7)
  })
  it('nunca menos de 1 golpe (hoyo en uno de un rival con muchos golpes)', () => {
    expect(estimarHoyoConcedido({ par: 3, golpesRecibidos: 0, rival: { gross: 1, golpesRecibidos: 2 } })).toBe(1)
  })
})

describe('ajustarTarjetaParaHistorial', () => {
  const hoyos = [1, 2, 3, 4]
  const parMap = { 1: 4, 2: 4, 3: 3, 4: 5 }
  const siPorHoyo = { 1: 1, 2: 2, 3: 3, 4: 4 }
  const base = { hoyos, parMap, siPorHoyo, courseHcp: 0, totalHoyos: 4 }

  it('sin concedidos ni hoyos sin terminar: la tarjeta queda igual', () => {
    const r = ajustarTarjetaParaHistorial({ ...base, scores: { 1: 5, 2: 4, 3: 3, 4: 6 } })
    expect(r).toEqual({ scores: { 1: 5, 2: 4, 3: 3, 4: 6 }, estimados: [] })
  })

  it('nunca devuelve un score menor que 1 (el -1 jamás llega al historial)', () => {
    const r = ajustarTarjetaParaHistorial({ ...base, scores: { 1: CONCEDE, 2: 0, 3: -3, 4: 5 } })
    expect(Object.values(r.scores).every(v => v >= 1)).toBe(true)
    expect(r.scores[1]).toBe(6)
    expect(r.scores[2]).toBeUndefined() // 0 no es un score: queda sin score
  })

  it('un score anotado nunca se pisa, aunque el hoyo esté en "no jugados"', () => {
    const r = ajustarTarjetaParaHistorial({ ...base, scores: { 1: 4, 2: 4, 3: 3, 4: 8 }, hoyosNoJugados: [4] })
    expect(r.scores[4]).toBe(8)
    expect(r.estimados).toEqual([])
  })

  it('reparte golpes por SI con el course handicap completo', () => {
    // CH 1 en 4 hoyos → golpe sólo en SI 1 (hoyo 1).
    const r = ajustarTarjetaParaHistorial({ ...base, courseHcp: 1, scores: { 1: CONCEDE, 2: CONCEDE } })
    expect(r.scores).toEqual({ 1: 7, 2: 6 })
  })

  it('claves string (JSONB de la base) y numéricas (estado del scorer) por igual', () => {
    const r = ajustarTarjetaParaHistorial({
      ...base, scores: { '1': CONCEDE, '2': 4 }, rival: { scores: { '1': 3, '2': CONCEDE }, courseHcp: 0 },
    })
    expect(r.scores[1]).toBe(4)
    expect(r.estimados).toEqual([{ hoyo: 1, motivo: 'concedido' }])
  })

  it('motivos en orden de hoyo: concedido, ganado sin terminar, no jugado', () => {
    const r = ajustarTarjetaParaHistorial({
      ...base,
      scores: { 1: CONCEDE },
      rival: { scores: { 1: 4, 2: CONCEDE }, courseHcp: 0 },
      hoyosNoJugados: [3, 4],
    })
    expect(r.scores).toEqual({ 1: 5, 2: 4, 3: 3, 4: 5 })
    expect(r.estimados.map(e => e.motivo)).toEqual(['concedido', 'ganado_sin_terminar', 'no_jugado', 'no_jugado'])
  })

  it('hoyo sin par en el mapa: no inventa', () => {
    const r = ajustarTarjetaParaHistorial({ ...base, parMap: { 2: 4 }, scores: { 1: CONCEDE } })
    expect(r.scores[1]).toBeUndefined()
    expect(r.estimados).toEqual([])
  })

  it('no muta el input', () => {
    const scores = { 1: CONCEDE }
    ajustarTarjetaParaHistorial({ ...base, scores })
    expect(scores).toEqual({ 1: CONCEDE })
  })
})

describe('alcanzaMinimoDeHoyosJugados (WHS 2.2)', () => {
  it('score de 9: los 9 jugados; un match de 9 decidido 5&4 no alcanza', () => {
    expect(alcanzaMinimoDeHoyosJugados(9, 0)).toBe(true)
    expect(alcanzaMinimoDeHoyosJugados(9, 4)).toBe(false)
  })
  it('score de 18: al menos 10 jugados', () => {
    expect(alcanzaMinimoDeHoyosJugados(18, 3)).toBe(true) // 4&3 → 15 jugados
    expect(alcanzaMinimoDeHoyosJugados(18, 8)).toBe(true) // 10 jugados
    expect(alcanzaMinimoDeHoyosJugados(18, 9)).toBe(false)
  })
  it('sólo los "no_jugado" restan: concedidos y ganados sin terminar se empezaron (3.3)', () => {
    expect(hoyosNoJugadosEstimados([{ motivo: 'concedido' }, { motivo: 'ganado_sin_terminar' }, { motivo: 'no_jugado' }])).toBe(1)
    expect(hoyosNoJugadosEstimados(null)).toBe(0)
  })
})

describe('ajustarTarjetaParaHistorial — los dos conceden el mismo hoyo', () => {
  it('cada uno queda en su máximo por hoyo (no hay score válido del rival)', () => {
    const r = ajustarTarjetaParaHistorial({
      hoyos: [1], parMap: { 1: 4 }, siPorHoyo: { 1: 1 }, courseHcp: 0, totalHoyos: 1,
      scores: { 1: CONCEDE }, rival: { scores: { 1: CONCEDE }, courseHcp: 0 },
    })
    expect(r.scores[1]).toBe(6)
    expect(r.estimados).toEqual([{ hoyo: 1, motivo: 'concedido' }])
  })
})

describe('indiceDelDia — índice vigente ANTES de la ronda', () => {
  const historial = [{ indice: 9.1, fecha: '2026-01-01T12:00:00Z' }, { indice: 8.6, fecha: '2026-08-01T12:00:00Z' }]
  it('federado: el registro más reciente hasta ese día; anterior a todos → el primero', () => {
    expect(indiceDelDia({ historial, playedAt: '2026-08-01', guardadaEn: null, federadoActual: 5, golfersAntes: 20 })).toBe(8.6)
    expect(indiceDelDia({ historial, playedAt: '2026-07-31', guardadaEn: null, federadoActual: 5, golfersAntes: 20 })).toBe(9.1)
    expect(indiceDelDia({ historial, playedAt: '2025-06-01', guardadaEn: null, federadoActual: 5, golfersAntes: 20 })).toBe(9.1)
  })
  it('el día es el de Chile, no el UTC', () => {
    const h = [{ indice: 9.1, fecha: '2026-07-01T12:00:00Z' }, { indice: 8.6, fecha: '2026-08-02T02:00:00Z' }] // 01-ago 22:00 en Chile
    expect(indiceDelDia({ historial: h, playedAt: '2026-08-01', guardadaEn: null, federadoActual: 5, golfersAntes: 20 })).toBe(8.6)
    expect(indiceDelDia({ historial: h, playedAt: '2026-07-31', guardadaEn: null, federadoActual: 5, golfersAntes: 20 })).toBe(9.1)
  })
  it('nunca un registro posterior a guardar la tarjeta: FedeGolf revisa el mismo día', () => {
    const h = [{ indice: 9.1, fecha: '2026-07-20T09:00:00Z' }, { indice: 8.6, fecha: '2026-07-26T23:00:00Z' }] // 26-jul 19:00 en Chile
    expect(indiceDelDia({ historial: h, playedAt: '2026-07-26', guardadaEn: '2026-07-26T21:00:00Z', federadoActual: 5, golfersAntes: 20 })).toBe(9.1)
    expect(indiceDelDia({ historial: h, playedAt: '2026-07-26', guardadaEn: '2026-07-27T01:00:00Z', federadoActual: 5, golfersAntes: 20 })).toBe(8.6)
    // Importada semanas después: manda el fin del día de la ronda.
    expect(indiceDelDia({ historial: h, playedAt: '2026-07-25', guardadaEn: '2026-09-01T12:00:00Z', federadoActual: 5, golfersAntes: 20 })).toBe(9.1)
  })
  it('sin historial: federado del perfil → Golfers+ de las rondas anteriores → null (par + 5)', () => {
    expect(indiceDelDia({ historial: [], playedAt: '2026-08-01', guardadaEn: null, federadoActual: 24, golfersAntes: 10 })).toBe(24)
    expect(indiceDelDia({ historial: [], playedAt: '2026-08-01', guardadaEn: null, federadoActual: null, golfersAntes: 10 })).toBe(10)
    expect(indiceDelDia({ historial: [], playedAt: '2026-08-01', guardadaEn: null, federadoActual: null, golfersAntes: null })).toBeNull()
  })
})

describe('indiceGolfersAntesDe — nunca el índice que salió de esa misma ronda', () => {
  const r = (played_at: string, diferencial: number) => ({ id: `${played_at}/${diferencial}`, played_at, created_at: null, diferencial, slope_rating: 128, course_rating: 71.3, excluded_from_handicap: false, total_gross: 90, holes_played: 18 })
  it('sólo cuentan las fechas anteriores (no las del mismo día)', () => {
    const filas = [r('2026-01-01', 20), r('2026-02-01', 22), r('2026-03-01', 15), r('2026-03-01', 10)]
    expect(indiceGolfersAntesDe(filas, '2026-03-01')).toBeNull()   // 2 anteriores < 3
    expect(indiceGolfersAntesDe(filas, '2026-03-02')).toBe(9)      // best of 4 = 10, WHS adjustment -1.0
  })
})
