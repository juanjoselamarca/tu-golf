import { describe, it, expect } from 'vitest'
import {
  HCP_PCT_OPCIONES,
  HCP_PCT_DEFAULT,
  esHcpPctValido,
  hcpPctEfectivo,
  handicapDeJuego,
  etiquetaHcpPct,
  hcpPctDelTorneo,
} from './playing-handicap'

describe('handicapDeJuego — WHS Regla 6.2a', () => {
  it('18 al 85 % = 15 (15,3 redondea abajo)', () => {
    expect(handicapDeJuego(18, 85)).toBe(15)
  })
  it('17,5 al 90 % = 16 (15,75 redondea arriba)', () => {
    expect(handicapDeJuego(17.5, 90)).toBe(16)
  })
  it('.5 exacto redondea hacia arriba: 10 al 85 % = 8,5 → 9', () => {
    expect(handicapDeJuego(10, 85)).toBe(9)
  })
  it('ejemplo oficial 6.2a/1: CH sin redondear 9,5132 y 11,3938 al 85 % → 8 y 10', () => {
    // CR 71, slope 125, par 71: HI 8,6 → 9,5132…; HI 10,3 → 11,3938…
    expect(handicapDeJuego(8.6 * (125 / 113) + (71 - 71), 85)).toBe(8)
    expect(handicapDeJuego(10.3 * (125 / 113) + (71 - 71), 85)).toBe(10)
  })
  it('plus (negativo): -2 al 75 % = -1,5 → -1 (.5 hacia arriba)', () => {
    expect(handicapDeJuego(-2, 75)).toBe(-1)
  })
  it('plus (negativo): -4 al 85 % = -3,4 → -3', () => {
    expect(handicapDeJuego(-4, 85)).toBe(-3)
  })
  it('0 queda en 0', () => {
    expect(handicapDeJuego(0, 85)).toBe(0)
  })
  it('al 100 % es el course handicap redondeado (Nota de 6.2a)', () => {
    expect(handicapDeJuego(18, 100)).toBe(18)
    expect(handicapDeJuego(17.5, 100)).toBe(18)
    expect(handicapDeJuego(9.5132, 100)).toBe(10)
  })
})

describe('opciones y validación', () => {
  it('opciones 100 → 75 de a 5, default 100', () => {
    expect([...HCP_PCT_OPCIONES]).toEqual([100, 95, 90, 85, 80, 75])
    expect(HCP_PCT_DEFAULT).toBe(100)
  })
  it('esHcpPctValido acepta solo las opciones', () => {
    for (const p of HCP_PCT_OPCIONES) expect(esHcpPctValido(p)).toBe(true)
    expect(esHcpPctValido(70)).toBe(false)
    expect(esHcpPctValido(87)).toBe(false)
    expect(esHcpPctValido('85')).toBe(false)
    expect(esHcpPctValido(null)).toBe(false)
    expect(esHcpPctValido(undefined)).toBe(false)
  })
})

describe('hcpPctEfectivo — fuente única de "¿aplica el %?"', () => {
  it('individual neto aplica el % elegido', () => {
    expect(hcpPctEfectivo({ formato: 'stroke_play', modo: 'neto', hcpPct: 85 })).toBe(85)
    expect(hcpPctEfectivo({ formato: 'stableford', modo: 'neto', hcpPct: 90 })).toBe(90)
    expect(hcpPctEfectivo({ formato: 'match_play', modo: 'neto', hcpPct: 75 })).toBe(75)
  })
  it('acepta la fila del torneo (formato_juego canónica gana a format legacy)', () => {
    expect(hcpPctEfectivo({ formato: { formato_juego: 'stroke_play', format: 'scramble' }, modo: 'neto', hcpPct: 85 })).toBe(85)
    expect(hcpPctEfectivo({ formato: { formato_juego: 'scramble', format: 'stroke_play' }, modo: 'neto', hcpPct: 85 })).toBe(100)
  })
  it('formatos de equipo → 100 (ya tienen team_config.handicap_pct: no se aplica dos veces)', () => {
    expect(hcpPctEfectivo({ formato: 'scramble', modo: 'neto', hcpPct: 85 })).toBe(100)
    expect(hcpPctEfectivo({ formato: 'best_ball', modo: 'neto', hcpPct: 85 })).toBe(100)
    expect(hcpPctEfectivo({ formato: 'foursome', modo: 'neto', hcpPct: 85 })).toBe(100)
  })
  it('gross → 100 (no reparte golpes; el tab Neto usa el handicap completo)', () => {
    expect(hcpPctEfectivo({ formato: 'stroke_play', modo: 'gross', hcpPct: 85 })).toBe(100)
    expect(hcpPctEfectivo({ formato: 'stroke_play', modo: null, hcpPct: 85 })).toBe(100)
  })
  it('valor ausente o fuera de las opciones → 100 (torneos existentes no cambian)', () => {
    expect(hcpPctEfectivo({ formato: 'stroke_play', modo: 'neto', hcpPct: null })).toBe(100)
    expect(hcpPctEfectivo({ formato: 'stroke_play', modo: 'neto', hcpPct: undefined })).toBe(100)
    expect(hcpPctEfectivo({ formato: 'stroke_play', modo: 'neto', hcpPct: 60 })).toBe(100)
  })
})

describe('hcpPctDelTorneo — lectura de la fila de tournaments', () => {
  it('stroke play neto al 85 % → 85', () => {
    expect(hcpPctDelTorneo({ hcp_pct: 85, modo_juego: 'neto', formato_juego: 'stroke_play', format: 'stroke_play' })).toBe(85)
  })
  it('fila sin la columna → 100', () => {
    expect(hcpPctDelTorneo({ modo_juego: 'neto', formato_juego: 'stroke_play' })).toBe(100)
  })
  it('scramble al 85 % → 100; gross al 85 % → 100', () => {
    expect(hcpPctDelTorneo({ hcp_pct: 85, modo_juego: 'neto', formato_juego: 'scramble' })).toBe(100)
    expect(hcpPctDelTorneo({ hcp_pct: 85, modo_juego: 'gross', formato_juego: 'stroke_play' })).toBe(100)
  })
})

describe('etiquetaHcpPct', () => {
  it('null al 100 %', () => {
    expect(etiquetaHcpPct(100)).toBeNull()
    expect(etiquetaHcpPct(null)).toBeNull()
  })
  it('texto con el porcentaje', () => {
    expect(etiquetaHcpPct(85)).toBe('Handicap al 85 %')
  })
})
