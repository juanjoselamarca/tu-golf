import { describe, it, expect } from 'vitest'
import {
  calcularGWI,
  construirRespuestaGWI,
  hayGWIParaMostrar,
  hoyosJugadosGWI,
  publicarResultadoGWI,
  type JugadorGWIInput,
} from './gwi'

const jugador = (id: string, currentScore: number, extra: Partial<JugadorGWIInput> = {}): JugadorGWIInput => ({
  id, nombre: id, handicapIndex: 12, currentScore, hoyosCompletados: 12,
  modoJuego: 'gross', formatoJuego: 'stroke_play',
  historicalAvg: 8.4, historicalRoundsCount: 20, courseAvg: -3.7, courseRoundsCount: 5,
  patterns: { back9Collapse: { confidence: 0.8, avgDiff: 3 }, postBogeySpiral: { confidence: 0.6 } },
  ...extra,
})
const meta = { totalHoyos: 18, modoJuego: 'gross' as const, formatoJuego: 'stroke_play' as const }

describe('construirRespuestaGWI — lo que sale del servidor', () => {
  const inputs = [jugador('a', 1), jugador('b', 4), jugador('c', 6, { historicalAvg: 2.2, historicalRoundsCount: 7 })]

  it('no lleva ninguna clave ni valor de los inputs privados', () => {
    const texto = JSON.stringify(construirRespuestaGWI(inputs, meta))
    expect(texto).not.toMatch(/historicalAvg|historicalRoundsCount|courseAvg|courseRoundsCount|patterns|back9Collapse|postBogeySpiral|"valor"|"confianza"|"peso"|currentScore|Históricamente/)
    expect(texto).not.toMatch(/8\.4|2\.2|-3\.7/)
  })

  it('lo que la UI pinta es idéntico a calcularGWI (misma UI que antes)', () => {
    const crudos = calcularGWI(inputs, 18)
    const { results } = construirRespuestaGWI(inputs, meta)
    expect(results).toHaveLength(crudos.length)
    results.forEach((r, i) => {
      const c = crudos[i]
      expect(r).toMatchObject({
        id: c.id, nombre: c.nombre, winProbability: c.winProbability,
        tendencia: c.tendencia, volatilidad: c.volatilidad, narrativa: c.narrativa,
      })
      // Las píldoras se muestran en los mismos casos que antes (sin porcentaje).
      expect(r.breakdown.historico.usado).toBe(c.breakdown.historico.peso > 0)
      expect(r.breakdown.cancha.usado).toBe(c.breakdown.cancha.peso > 0 && c.breakdown.cancha.confianza > 0)
      expect(r.breakdown.patrones.alerta).toBe(c.breakdown.patrones.valor > 1)
      expect(r.breakdown.handicapInfo).toEqual(c.breakdown.handicapInfo)
    })
  })

  it('jugadores públicos: id, nombre y hoyos — nada más', () => {
    const { jugadores } = construirRespuestaGWI(inputs, meta)
    expect(jugadores).toEqual([
      { id: 'a', nombre: 'a', hoyosCompletados: 12 },
      { id: 'b', nombre: 'b', hoyosCompletados: 12 },
      { id: 'c', nombre: 'c', hoyosCompletados: 12 },
    ])
  })

  it('sin jugadores → respuesta vacía', () => {
    expect(construirRespuestaGWI([], meta)).toEqual({ results: [], jugadores: [], ...meta })
  })
})

describe('publicarResultadoGWI — umbrales de la UI', () => {
  const base = calcularGWI([jugador('a', 0), jugador('b', 0)], 18)[0]
  it('alerta de patrón sólo con valor > 1 (igual que el panel antes)', () => {
    const con = (valor: number) => publicarResultadoGWI({ ...base, breakdown: { ...base.breakdown, patrones: { peso: 10, valor } } })
    expect(con(1).breakdown.patrones.alerta).toBe(false)
    expect(con(1.01).breakdown.patrones.alerta).toBe(true)
  })
  it('el breakdown no lleva NINGÚN número derivado de historial, cancha o patrones', () => {
    const r = publicarResultadoGWI({
      ...base,
      breakdown: { ...base.breakdown, historico: { peso: 17, valor: 8.4, confianza: 0.85 }, cancha: { peso: 5, valor: -2, confianza: 0.4 } },
    })
    expect(r.breakdown.historico).toEqual({ usado: true })
    expect(r.breakdown.cancha).toEqual({ usado: true })
    expect(Object.keys(r.breakdown).sort()).toEqual(['cancha', 'handicapInfo', 'historico', 'patrones'])
    // Los únicos números del breakdown son los del hándicap (público).
    const { handicapInfo, ...resto } = r.breakdown
    expect(JSON.stringify(resto)).not.toMatch(/\d/)
    expect(Object.keys(handicapInfo).sort()).toEqual(['handicap', 'label', 'sigma'])
  })
})

describe('hayGWIParaMostrar / hoyosJugadosGWI', () => {
  const j = (hoyosCompletados: number) => ({ hoyosCompletados })
  it('2+ jugadores y alguno con 3+ hoyos', () => {
    expect(hayGWIParaMostrar([j(3), j(0)])).toBe(true)
    expect(hayGWIParaMostrar([j(2), j(2)])).toBe(false)
    expect(hayGWIParaMostrar([j(9)])).toBe(false)
    expect(hayGWIParaMostrar([])).toBe(false)
  })
  it('hoyos jugados = el máximo; 0 sin jugadores', () => {
    expect(hoyosJugadosGWI([j(4), j(7), j(5)])).toBe(7)
    expect(hoyosJugadosGWI([])).toBe(0)
  })
})
