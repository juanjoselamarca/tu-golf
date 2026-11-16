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
    expect(d.cifras?.peorRonda?.score).toBe(90)
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
