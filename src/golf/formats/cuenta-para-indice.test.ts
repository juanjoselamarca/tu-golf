import { describe, it, expect } from 'vitest'
import { cuentaParaIndice, isSharedBallFormat, KNOWN_FORMAT_KEYS } from './index'

// Lo que se MUESTRA ("cuenta para tu índice") debe ser lo que hace el cálculo real:
// `diferencialDeTarjeta` sólo anula la bola compartida, y `calcular_indice_golfers`
// promedia toda fila con diferencial no excluida. WHS 2024 Regla 2.1a: match play y
// four-ball (best ball) son formatos aceptables; scramble y foursome no.
const valida = { slope_rating: 128, course_rating: 71.3, holes_played: 18 }

describe('cuentaParaIndice', () => {
  it('match play y best ball cuentan (antes decía "no cuenta" pero el índice sí los usaba)', () => {
    expect(cuentaParaIndice({ ...valida, formato_juego: 'match_play' }).cuenta).toBe(true)
    expect(cuentaParaIndice({ ...valida, formato_juego: 'best_ball' }).cuenta).toBe(true)
  })

  it('bola compartida no cuenta, con el nombre del formato en la razón', () => {
    const r = cuentaParaIndice({ ...valida, formato_juego: 'scramble' })
    expect(r.cuenta).toBe(false)
    expect(r.razon).toMatch(/no cuenta para índice/)
  })

  it('el predicado de formato es exactamente el de bola compartida (una fuente)', () => {
    for (const fmt of KNOWN_FORMAT_KEYS) {
      expect(cuentaParaIndice({ ...valida, formato_juego: fmt }).cuenta).toBe(!isSharedBallFormat(fmt))
    }
  })

  it('el resto de las reglas sigue igual', () => {
    expect(cuentaParaIndice({ ...valida, excluded_from_handicap: true }).razon).toBe('Excluida manualmente')
    expect(cuentaParaIndice({ ...valida, slope_rating: null }).cuenta).toBe(false)
    expect(cuentaParaIndice({ ...valida, holes_played: 8 }).razon).toBe('Menos de 9 hoyos')
  })
})

describe('cuentaParaIndice — hoyos estimados por no jugarse', () => {
  const noJugados = (n: number) => Array.from({ length: n }, () => ({ motivo: 'no_jugado' }))
  it('match de 9 decidido 5&4: no cuenta (sólo 5 jugados)', () => {
    const r = cuentaParaIndice({ ...valida, formato_juego: 'match_play', holes_played: 9, metadata: { estimados: noJugados(4) } })
    expect(r).toEqual({ cuenta: false, razon: 'Menos de 9 hoyos jugados' })
  })
  it('match de 18 decidido 4&3: cuenta (15 jugados ≥ 10)', () => {
    expect(cuentaParaIndice({ ...valida, formato_juego: 'match_play', metadata: { estimados: noJugados(3) } }).cuenta).toBe(true)
  })
  it('tarjeta de 18 con hoyos en blanco (sin estimar): no cuenta, y lo dice', () => {
    expect(cuentaParaIndice({ ...valida, holes_played: 17 })).toEqual({ cuenta: false, razon: 'Tarjeta incompleta' })
  })
})
