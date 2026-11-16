import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStatsDerived } from './useStatsDerived'
import { normalizarRondas, type RawStatsRound } from '@/golf/stats/rondas-normalizadas'

let seq = 0
function raw(over: Partial<RawStatsRound>): RawStatsRound {
  seq++
  return {
    id: `r${seq}`, course_name: 'Los Leones', course_id: null,
    played_at: `2026-01-${String(seq).padStart(2, '0')}`,
    scores: Array(18).fill(5), total_gross: 90, holes_played: 18, import_source: null,
    formato_juego: 'stroke_play',
    ...over,
  }
}
const pares18 = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i + 1), 4]))
const derivar = (rs: RawStatsRound[], range: '5' | '10' | '20' | 'all' = 'all') =>
  renderHook(() => useStatsDerived(normalizarRondas(rs, [], []), range)).result.current

describe('useStatsDerived', () => {
  it('sin rondas: hasRounds false, todo vacío', () => {
    const d = derivar([])
    expect(d.hasRounds).toBe(false)
    expect(d.cifras).toBeNull()
    expect(d.serie).toEqual([])
    expect(d.trendData).toBeNull()
    expect(d.topRounds).toEqual([])
  })

  it('el rango toma las N MÁS RECIENTES aunque lleguen desordenadas', () => {
    const rs = [80, 85, 90, 95, 100, 105].map((g, i) => raw({ total_gross: g, played_at: `2026-02-0${i + 1}` }))
    const d = derivar([rs[2], rs[5], rs[0], rs[4], rs[1], rs[3]], '5')
    expect(d.rondas).toHaveLength(5)
    expect(d.rondas[0].played_at).toBe('2026-02-06')
    expect(d.rondas.map(r => r.total_gross)).not.toContain(80)
  })

  it('cifras de 18h: un scramble de 62 no es la mejor ronda ni baja el promedio', () => {
    const d = derivar([
      raw({ total_gross: 80 }),
      raw({ total_gross: 90 }),
      raw({ total_gross: 62, formato_juego: 'scramble' }),
    ])
    expect(d.cifras?.bucket).toBe(18)
    expect(d.cifras?.mejorRonda?.score).toBe(80)
    expect(d.cifras?.promedioVsPar).toBe(13) // (8 + 18) / 2
    expect(d.cifras?.rondasEnPromedio).toBe(2)
    expect(d.fueraDePromedios).toBe(1)
  })

  it('una sola regla de bucket: 2 de 18 y 7 de 9 → cifras, gráfico, top y tendencia hablan de 9 hoyos', () => {
    const rs = [
      raw({ total_gross: 80 }), raw({ total_gross: 82 }),
      ...Array.from({ length: 7 }, () => raw({ scores: Array(9).fill(5), total_gross: 45, holes_played: 9 })),
    ]
    const d = derivar(rs)
    expect(d.cifras?.bucket).toBe(9)
    expect(d.cifras?.rondasEnPromedio).toBe(7)
    expect(d.serie).toHaveLength(7)
    expect(d.serie.every(p => p.vsPar === 9)).toBe(true)
    expect(d.topRounds.every(r => r.bucket === 9)).toBe(true)
    expect(d.trendData?.bucketHoles).toBe(9)
  })

  it('el rango se aplica DESPUÉS del bucket: "Últimas 5" son las últimas 5 que cuentan', () => {
    // seq creciente → las de 18 y el scramble son las MÁS recientes.
    const d = derivar([
      ...Array.from({ length: 7 }, () => raw({ scores: Array(9).fill(5), total_gross: 45, holes_played: 9 })),
      raw({ total_gross: 80 }), raw({ total_gross: 82 }),
      raw({ total_gross: 62, formato_juego: 'scramble' }),
    ], '5')
    expect(d.cifras?.bucket).toBe(9)
    expect(d.cifras?.rondasEnPromedio).toBe(5)
    expect(d.serie).toHaveLength(5)
    expect(d.delOtroBucket).toEqual({ bucket: 18, n: 2 })
    expect(d.nineHoleData).toBeNull()
  })

  it('usuario solo-9h: las cifras caen al bucket 9 (rotulado), nunca vacías', () => {
    const d = derivar([
      raw({ scores: Array(9).fill(5), total_gross: 45, holes_played: 9 }),
      raw({ scores: Array(9).fill(4), total_gross: 40, holes_played: 9 }),
    ])
    expect(d.cifras?.bucket).toBe(9)
    expect(d.cifras?.mejorRonda?.score).toBe(40)
    expect(d.cifras?.promedioVsPar).toBe(6.5)
    expect(d.topRounds.map(r => r.total_gross)).toEqual([40, 45])
  })

  it('sin par real no hay conteo hoyo a hoyo (nada de par 4 inventado); con par real, el albatros es eagle', () => {
    expect(derivar([raw({ scores: [2, ...Array(17).fill(4)], total_gross: 70 })]).scoringTotal).toBe(0)
    const d = derivar([raw({ scores: [1, 3, ...Array(16).fill(4)], total_gross: 68, par_per_hole: pares18 })])
    expect(d.scoringCounts).toEqual({ eagles: 1, birdies: 1, pars: 16, bogeys: 0, doubles: 0 })
  })

  it('Top 5 y Front/Back: solo rondas que cuentan del bucket de las cifras', () => {
    const d = derivar([
      raw({ total_gross: 85 }), raw({ total_gross: 88 }), raw({ total_gross: 90 }),
      raw({ total_gross: 70, formato_juego: 'match_play' }),
      raw({ scores: Array(9).fill(3), total_gross: 27, holes_played: 9 }),
    ])
    expect(d.topRounds.map(r => r.total_gross)).toEqual([85, 88, 90])
    expect(d.nineHoleData?.count).toBe(3)
  })

  it('la tendencia se calcula sobre TODAS las rondas aunque el rango filtre', () => {
    const d = derivar(Array.from({ length: 10 }, () => raw({ total_gross: 90 })), '5')
    expect(d.rondas).toHaveLength(5)
    expect(d.trendData).not.toBeNull()
    expect(d.trendData?.stable).toBe(true)
  })
})
