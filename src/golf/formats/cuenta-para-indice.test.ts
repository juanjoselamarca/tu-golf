import { describe, it, expect } from 'vitest'
import { cuentaParaIndice, isSharedBallFormat, KNOWN_FORMAT_KEYS } from './index'

// Lo que se MUESTRA ("cuenta para tu índice") debe ser lo que hace el cálculo real:
// `calcular_indice_golfers` promedia toda fila no excluida con diferencial y slope/CR.
// Si no hay diferencial, la razón sale de las reglas de `diferencialDeTarjeta`.
// WHS 2024 Regla 2.1a: match play y four-ball (best ball) son formatos aceptables;
// scramble y foursome no.
const guardada = { slope_rating: 128, course_rating: 71.3, holes_played: 18, diferencial: 14.2 }
const sinDif = { ...guardada, diferencial: null }
/** Ninguna regla la rechaza: sólo le falta el diferencial. */
const SIN_RECHAZO = 'Sin diferencial calculado'

describe('cuentaParaIndice — el diferencial guardado decide (filtro de calcular_indice_golfers)', () => {
  it('con diferencial y slope/CR cuenta', () => {
    expect(cuentaParaIndice(guardada)).toEqual({ cuenta: true, razon: 'Cuenta para tu índice' })
  })
  it('fila guardada con reglas anteriores (12 hoyos con diferencial): cuenta, porque el índice la promedia', () => {
    expect(cuentaParaIndice({ ...guardada, holes_played: 12, scores: Array.from({ length: 12 }, () => 5) }).cuenta).toBe(true)
  })
  it('excluida manualmente no cuenta aunque tenga diferencial', () => {
    expect(cuentaParaIndice({ ...guardada, excluded_from_handicap: true })).toEqual({ cuenta: false, razon: 'Excluida manualmente' })
  })
  it('diferencial sin slope/CR no cuenta (el RPC también los exige)', () => {
    expect(cuentaParaIndice({ ...guardada, slope_rating: null }).razon).toBe('Sin datos de cancha (slope/CR)')
  })
  it('sin diferencial (ausente o null) y ninguna regla que la rechace: no cuenta', () => {
    expect(cuentaParaIndice(sinDif)).toEqual({ cuenta: false, razon: SIN_RECHAZO })
    expect(cuentaParaIndice({ slope_rating: 128, course_rating: 71.3, holes_played: 18 }).razon).toBe(SIN_RECHAZO)
  })
})

describe('cuentaParaIndice — razón cuando no hay diferencial', () => {
  it('match play y best ball no son la razón (WHS los acepta)', () => {
    expect(cuentaParaIndice({ ...sinDif, formato_juego: 'match_play' }).razon).toBe(SIN_RECHAZO)
    expect(cuentaParaIndice({ ...sinDif, formato_juego: 'best_ball' }).razon).toBe(SIN_RECHAZO)
  })

  it('bola compartida, con el nombre del formato en la razón', () => {
    expect(cuentaParaIndice({ ...sinDif, formato_juego: 'scramble' }).razon).toMatch(/no cuenta para índice/)
  })

  it('el predicado de formato es exactamente el de bola compartida (una fuente)', () => {
    for (const fmt of KNOWN_FORMAT_KEYS) {
      expect(/no cuenta para índice/.test(cuentaParaIndice({ ...sinDif, formato_juego: fmt }).razon)).toBe(isSharedBallFormat(fmt))
    }
  })

  it('sin slope/CR y menos de 9 hoyos', () => {
    expect(cuentaParaIndice({ ...sinDif, slope_rating: null }).razon).toBe('Sin datos de cancha (slope/CR)')
    expect(cuentaParaIndice({ ...sinDif, holes_played: 8 }).razon).toBe('Menos de 9 hoyos')
  })
})

describe('cuentaParaIndice — hoyos estimados por no jugarse', () => {
  const noJugados = (n: number) => Array.from({ length: n }, () => ({ motivo: 'no_jugado' }))
  it('match de 9 decidido 5&4: sólo 5 jugados', () => {
    const r = cuentaParaIndice({ ...sinDif, formato_juego: 'match_play', holes_played: 9, metadata: { estimados: noJugados(4) } })
    expect(r).toEqual({ cuenta: false, razon: 'Menos de 9 hoyos jugados' })
  })
  it('match de 18 decidido 4&3: 15 jugados ≥ 10, no es la razón', () => {
    expect(cuentaParaIndice({ ...sinDif, formato_juego: 'match_play', metadata: { estimados: noJugados(3) } }).razon).toBe(SIN_RECHAZO)
  })
})

describe('cuentaParaIndice — mismas reglas que diferencialDeTarjeta (WHS 9 o 18, mitad de la cancha)', () => {
  const golpes = (n: number) => Array.from({ length: n }, () => 5)
  it('tarjeta de 12 hoyos', () => {
    expect(cuentaParaIndice({ ...sinDif, holes_played: 12, scores: golpes(12) }))
      .toEqual({ cuenta: false, razon: 'Tarjeta de 10 a 17 hoyos: el índice pide 9 o 18' })
  })
  it('nueve hoyos sueltos (1..5 y 14..17)', () => {
    const scores: (number | null)[] = Array.from({ length: 18 }, (_, i) => (i < 5 || (i >= 13 && i < 17) ? 5 : null))
    expect(cuentaParaIndice({ ...sinDif, holes_played: 9, scores }))
      .toEqual({ cuenta: false, razon: 'Los 9 hoyos no son una vuelta de la cancha' })
  })
  it('front 9 y back 9 (metadata.hoyos 10..18) no se rechazan', () => {
    expect(cuentaParaIndice({ ...sinDif, holes_played: 9, scores: golpes(9) }).razon).toBe(SIN_RECHAZO)
    expect(cuentaParaIndice({ ...sinDif, holes_played: 9, scores: golpes(9), metadata: { hoyos: [10, 11, 12, 13, 14, 15, 16, 17, 18] } }).razon).toBe(SIN_RECHAZO)
  })
})
