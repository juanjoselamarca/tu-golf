import { describe, it, expect } from 'vitest'
import { normalizarRondas, type RawStatsRound, type RondaNormalizada } from '@/golf/stats/rondas-normalizadas'
import {
  calcularCostoPsicologico,
  calcularMentalIndex,
  espiralesDeRonda,
  estadosDeRonda,
  etiquetaEspiral,
  fraseMentalIndex,
  recuperacionDeRonda,
  resumenMentalDelCoach,
  TITULO_BANDA_MENTAL,
  ventanaMental,
  type Espiral,
} from './mental-index'
import { buscarVoseo } from '../../../scripts/lib/voseo.mjs'

let seq = 0

/**
 * Ronda cruda como la guarda la BD (par_per_hole JSONB {"1":4,...}) normalizada por
 * el camino real. `sobrePar` por hoyo; par 4 en todos salvo que se pasen `pares`.
 */
function ronda(
  sobrePar: (number | null)[],
  opts: { pares?: (number | null)[]; dias?: number; formato?: string; estimadosHoyo?: number[] } = {},
): RondaNormalizada {
  const pares = opts.pares ?? sobrePar.map(() => 4)
  const scores = sobrePar.map((s, i) => (s == null ? null : (pares[i] ?? 4) + s))
  const parPerHole: Record<string, number> = {}
  pares.forEach((p, i) => { if (p != null) parPerHole[String(i + 1)] = p })
  const raw: RawStatsRound = {
    id: `r${++seq}`,
    course_name: 'Club de prueba',
    course_id: null,
    played_at: new Date(Date.UTC(2026, 10, 30) - (opts.dias ?? seq) * 86_400_000).toISOString().slice(0, 10),
    scores,
    total_gross: null,
    holes_played: sobrePar.length,
    import_source: null,
    par_per_hole: parPerHole,
    metadata: opts.estimadosHoyo ? { estimados: opts.estimadosHoyo.map(hoyo => ({ hoyo })) } : null,
    formato_juego: opts.formato ?? null,
  }
  const [r] = normalizarRondas([raw], [], [])
  return r
}

const repetir = <T,>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i))

const A = [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0]
const B = [1, 0, 1, 0, 1, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0]
const C = [1, 1, 0, 1, 0, 2, 2, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0]
const D9 = [1, 1, 0, 0, 1, 0, 0, 1, 2]

const sumaHoyosMenosUno = (es: Espiral[]) => es.reduce((a, e) => a + e.hoyos - 1, 0)

describe('casos del plan (números exactos)', () => {
  it('A tilt: 1 ronda de 86 → 12 en tilt, 2 espirales, 2 de 14, MI 14 low, 0 evitables', () => {
    const r = ronda(A)
    expect(r.total_gross).toBe(86)
    expect(estadosDeRonda(r).filter(s => s === 'tilt')).toHaveLength(12)
    expect(espiralesDeRonda(r).map(etiquetaEspiral)).toEqual(['H1–H7', 'H9–H15'])
    const { indice, costo } = resumenMentalDelCoach([r])
    expect(indice).toMatchObject({ oportunidades: 14, cortes: 2, score: 14, band: 'low', status: 'provisional', windowSize: 1, bucket: 18 })
    expect(costo.evitables).toBe(0)
    expect(costo.lastRound).toBeNull()
  })

  it('B limpio: 5×18h → 25 de 25, MI 100 high, 0 espirales', () => {
    const rondas = repetir(5, () => ronda(B))
    const { indice, costo, curva } = resumenMentalDelCoach(rondas)
    expect(indice).toMatchObject({ oportunidades: 25, cortes: 25, score: 100, band: 'high', status: 'established', windowSize: 5 })
    expect(curva?.espirales).toEqual([])
    expect(costo.evitables).toBe(0)
  })

  it('C borde: 5×18h de 84 → 30 de 50, MI 60 high, 3 espirales por ronda, 5 evitables, 84.0 → 83.0', () => {
    const rondas = repetir(5, () => ronda(C))
    expect(rondas[0].total_gross).toBe(84)
    expect(espiralesDeRonda(rondas[0]).map(etiquetaEspiral)).toEqual(['H1–H2', 'H6–H7', 'H12–H14'])
    const { indice, costo } = resumenMentalDelCoach(rondas)
    expect(indice).toMatchObject({ oportunidades: 50, cortes: 30, score: 60, band: 'high' })
    expect(costo.evitables).toBe(5)
    expect(costo.promedioReal.toFixed(1)).toBe('84.0')
    expect(costo.promedioContenido.toFixed(1)).toBe('83.0')
    // La última ronda: solo la espiral que costó golpes (H6–H7, el +2 del H7).
    expect(costo.lastRound).toMatchObject({ realScore: 84, ghostScore: 83, strokes_saved: 1 })
    expect(costo.lastRound?.espirales.map(etiquetaEspiral)).toEqual(['H6–H7'])
  })

  it('D 9h: 4×9h de 42 + una de 18 de 90 → bucket 9, ventana 4, 8 de 16, MI 50 mid, 4 evitables, 42.0 → 41.0', () => {
    const r18 = ronda([...C.slice(0, 17), 6], { dias: 1 }) // 18h, la más reciente
    expect(r18.total_gross).toBe(90)
    const rondas = [r18, ...repetir(4, i => ronda(D9, { dias: 2 + i }))]
    expect(rondas[1].total_gross).toBe(42)
    const { ventana, indice, costo } = resumenMentalDelCoach(rondas)
    expect(ventana.bucket).toBe(9)
    expect(ventana.rondas.map(r => r.id)).not.toContain(r18.id)
    expect(indice).toMatchObject({ oportunidades: 16, cortes: 8, score: 50, band: 'mid', windowSize: 4, bucket: 9, status: 'provisional' })
    expect(costo.evitables).toBe(4)
    expect(costo.bucket).toBe(9)
    expect(costo.promedioReal.toFixed(1)).toBe('42.0')
    expect(costo.promedioContenido.toFixed(1)).toBe('41.0')
  })

  it("D' pocos: una sola 9h → 4 oportunidades → insufficient_data, score null", () => {
    const { indice } = resumenMentalDelCoach([ronda(D9)])
    expect(indice).toMatchObject({ oportunidades: 4, status: 'insufficient_data', score: null, band: null })
  })
})

describe('identidades', () => {
  it('oportunidades − cortes = Σ(hoyos − 1) de las espirales, en cada caso', () => {
    for (const s of [A, B, C, D9, [2, 2, 2, 2, 2, 2, 2, 2, 2], [0, 1, null, 1, 1, 0, 3, 3, 1]]) {
      const r = ronda(s)
      const { oportunidades, cortes } = recuperacionDeRonda(r)
      expect(oportunidades - cortes).toBe(sumaHoyosMenosUno(espiralesDeRonda(r)))
    }
  })

  it('invariante del costo: evitables === windowSize × (promedioReal − promedioContenido)', () => {
    const v = ventanaMental([ronda(C), ronda(A), ronda([2, 3, 0, 1, 2, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 2, 2]), ronda(B)])
    const c = calcularCostoPsicologico(v)
    expect(c.evitables).toBeCloseTo(c.windowSize * (c.promedioReal - c.promedioContenido), 10)
    expect(c.evitables).toBe(1 + 0 + (2 + 1 + 0 + 1) + 0) // C 1 · A 0 · H2 +3, H5 +2, H18 +2 · B 0
  })

  it('el chip de espirales y los hoyos en tilt salen de la misma definición', () => {
    const r = ronda(C)
    const tilt = estadosDeRonda(r).filter(s => s === 'tilt').length
    expect(tilt).toBe(sumaHoyosMenosUno(espiralesDeRonda(r)))
  })
})

describe('bordes', () => {
  it('un hoyo sin score corta la espiral y no es oportunidad', () => {
    const r = ronda([1, null, 1, 1, 0, 0, 0, 0, 0])
    expect(espiralesDeRonda(r).map(etiquetaEspiral)).toEqual(['H3–H4'])
    expect(recuperacionDeRonda(r)).toEqual({ oportunidades: 2, cortes: 1 })
    expect(estadosDeRonda(r)[1]).toBeNull()
  })

  it('un hoyo estimado (concedido) no cuenta: corta la racha', () => {
    const r = ronda([1, 1, 1, 0, 0, 0, 0, 0, 0], { estimadosHoyo: [3] })
    expect(espiralesDeRonda(r).map(etiquetaEspiral)).toEqual(['H1–H2'])
    expect(recuperacionDeRonda(r)).toEqual({ oportunidades: 1, cortes: 0 })
    expect(estadosDeRonda(r)[2]).toBeNull()
  })

  it('doble bogey aislado es tense, no tilt (espiral = dos hoyos seguidos)', () => {
    expect(estadosDeRonda(ronda([0, 2, 0, 0, 0, 0, 0, 0, 0]))[1]).toBe('tense')
  })

  it('rondas sin par real, de bola compartida o parciales no entran a la ventana', () => {
    const sinPar = ronda(B, { pares: B.map((_, i) => (i === 5 ? null : 4)) })
    const scramble = ronda(B, { formato: 'scramble' })
    const parcial = ronda(B.slice(0, 12))
    const v = ventanaMental([sinPar, scramble, parcial])
    expect(v).toEqual({ bucket: null, rondas: [] })
    expect(calcularMentalIndex(v)).toMatchObject({ status: 'insufficient_data', score: null, windowSize: 0 })
  })

  it('la ventana toma las 5 más recientes del bucket', () => {
    const rondas = repetir(7, i => ronda(B, { dias: i + 1 }))
    expect(ventanaMental(rondas).rondas.map(r => r.id)).toEqual(rondas.slice(0, 5).map(r => r.id))
  })

  it('regresión Los Leones 03-may: 2 espirales H1–H2 y H11–H12, 5 golpes evitables', () => {
    const pares = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]
    const scores = [5, 7, 3, 4, 5, 6, 3, 4, 5, 4, 5, 7, 4, 5, 7, 3, 4, 9]
    const r = ronda(scores.map((s, i) => s - pares[i]), { pares })
    const es = espiralesDeRonda(r)
    expect(es.map(etiquetaEspiral)).toEqual(['H1–H2', 'H11–H12'])
    expect(es.map(e => e.golpesEvitables)).toEqual([2, 3])
    expect(r.vsPar).toBe(90 - 72)
  })
})

describe('copy (descriptivo, con datos, sin voseo)', () => {
  it('frase con cortes, oportunidades y ventana con su bucket', () => {
    const { indice } = resumenMentalDelCoach(repetir(5, () => ronda(C)))
    expect(fraseMentalIndex(indice)).toBe('Cortaste 30 de tus 50 bogeys en el hoyo siguiente · últimas 5 rondas de 18 hoyos')
  })

  it('una sola ronda en singular; 9 hoyos rotulado', () => {
    const { indice } = resumenMentalDelCoach([ronda(A)])
    expect(fraseMentalIndex(indice)).toBe('Cortaste 2 de tus 14 bogeys en el hoyo siguiente · última ronda de 18 hoyos')
    const nueve = resumenMentalDelCoach(repetir(4, () => ronda(D9))).indice
    expect(fraseMentalIndex(nueve)).toContain('últimas 4 rondas de 9 hoyos')
  })

  it('mid no exagera: "Cerca de la mitad" (50–59 % de cortes)', () => {
    expect(TITULO_BANDA_MENTAL.mid).toBe('Cerca de la mitad de tus bogeys traen otro detrás')
  })

  // Vuelta 1: la home pinta esta frase cuando no hay número; tiene que decir qué falta.
  describe('sin datos suficientes', () => {
    it('rondas sin par hoyo a hoyo → pide tarjetas hoyo a hoyo con par', () => {
      const { indice } = resumenMentalDelCoach([ronda(B, { pares: B.map(() => null) })])
      expect(indice.status).toBe('insufficient_data')
      expect(indice.windowSize).toBe(0)
      expect(fraseMentalIndex(indice)).toBe('Necesitamos tarjetas hoyo a hoyo con par para medir tu recuperación')
    })

    it('pocos bogeys → cuántos hay y cuántos hacen falta, con la ventana concordada', () => {
      const una = resumenMentalDelCoach([ronda(B)]).indice
      expect(una.status).toBe('insufficient_data')
      expect(una.oportunidades).toBe(5)
      expect(fraseMentalIndex(una)).toBe(
        'Necesitamos al menos 10 bogeys con un hoyo jugado después para medir tu recuperación: tu última ronda de 18 hoyos suma 5 bogeys',
      )
    })

    it('un bogey en el último hoyo no se cuenta (no tiene hoyo siguiente) y el copy lo nombra así', () => {
      const conUltimo = [...B.slice(0, 17), 1] // 6 bogeys en la tarjeta, el último en el 18
      const i = resumenMentalDelCoach([ronda(conUltimo)]).indice
      expect(i.oportunidades).toBe(5)
      expect(fraseMentalIndex(i)).toMatch(/bogeys con un hoyo jugado después.*suma 5 bogeys/)
    })

    it('el copy de datos insuficientes no usa voseo', () => {
      const frases = [
        fraseMentalIndex(resumenMentalDelCoach([ronda(B, { pares: B.map(() => null) })]).indice),
        fraseMentalIndex(resumenMentalDelCoach([ronda(B)]).indice),
      ]
      for (const t of frases) expect(buscarVoseo(t)).toEqual([])
    })
  })

  it('los títulos de banda no juzgan ni usan voseo', () => {
    const frases = [...Object.values(TITULO_BANDA_MENTAL), fraseMentalIndex(resumenMentalDelCoach([ronda(A)]).indice)]
    for (const t of frases) {
      expect(buscarVoseo(t)).toEqual([])
      expect(t).not.toMatch(/reset|necesita/i) // el viejo "Tu cabeza necesita reset" juzgaba
    }
  })
})
