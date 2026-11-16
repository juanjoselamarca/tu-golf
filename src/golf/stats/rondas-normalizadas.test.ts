import { describe, it, expect } from 'vitest'
import {
  agregarRondas,
  normalizarRondas,
  serieScoreVsPar,
  bucketPrincipal,
  type RawStatsRound,
} from './rondas-normalizadas'

function raw(over: Partial<RawStatsRound>): RawStatsRound {
  return {
    id: 'r', course_name: 'Cancha X', course_id: null, played_at: '2026-06-01',
    scores: Array(18).fill(5), total_gross: 90, holes_played: 18, import_source: null,
    formato_juego: 'stroke_play',
    ...over,
  }
}

const una = (r: RawStatsRound) => normalizarRondas([r], [], [])[0]

describe('normalizarRondas', () => {
  it('ronda de 27 hoyos (más de 18 marcados) cae al bucket 18', () => {
    const r = una(raw({ scores: Array(27).fill(5), total_gross: 135, holes_played: 27 }))
    expect(r.bucket).toBe(18)
    expect(r.fueraDePromedios).toBeNull()
  })

  it('9 hoyos: vsPar18 es el doble del vsPar (9h +5 → +10)', () => {
    const r = una(raw({ scores: Array(9).fill(4).map((s, i) => (i < 5 ? 5 : s)), total_gross: 41, holes_played: 9 }))
    expect(r.bucket).toBe(9)
    expect(r.vsPar).toBe(5)
    expect(r.vsPar18).toBe(10)
  })

  it('score imposible (menos de 3 golpes por hoyo): fuera de números y del conteo hoyo a hoyo', () => {
    const r = una(raw({ scores: Array(18).fill(2), total_gross: 36, par_per_hole: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i + 1), 4])) }))
    expect(r.fueraDePromedios).toBe('score_imposible')
    expect(r.cuentaHoyoAHoyo).toBe(false)
    expect(agregarRondas([r]).totalEagles).toBe(0)
  })

  it('parcial guardada "de 18" con 9 hoyos buenos no es imposible (se mide contra los hoyos marcados)', () => {
    const r = una(raw({ scores: [...Array(10).fill(3), ...Array(8).fill(null)], total_gross: null, holes_played: 18 }))
    expect(r.fueraDePromedios).toBe('parcial')
    expect(r.cuentaHoyoAHoyo).toBe(true)
  })

  it('bola compartida manda sobre los demás motivos', () => {
    const r = una(raw({ formato_juego: 'scramble', scores: Array(12).fill(4), total_gross: 48 }))
    expect(r.fueraDePromedios).toBe('bola_compartida')
    expect(r.cuentaHoyoAHoyo).toBe(false)
  })

  it('match play: fuera de promedios, pero sus hoyos jugados sí cuentan', () => {
    const r = una(raw({ formato_juego: 'match_play' }))
    expect(r.fueraDePromedios).toBe('match_play')
    expect(r.cuentaHoyoAHoyo).toBe(true)
  })

  it('sin hoyos ni total, la ronda se omite', () => {
    expect(normalizarRondas([raw({ scores: [null, null], total_gross: null as unknown as number }), raw({ scores: null, total_gross: null as unknown as number })], [], [])).toEqual([])
  })

  it('solo total (carga manual / FedeGolf): entra a promedios con par estándar, nunca hoyo a hoyo', () => {
    const [r] = normalizarRondas([raw({ scores: null, total_gross: 85, holes_played: 18, import_source: 'manual' })], [], [])
    expect(r.bucket).toBe(18)
    expect(r.vsPar).toBe(13)
    expect(r.fueraDePromedios).toBeNull()
    expect(r.cuentaHoyoAHoyo).toBe(false)
    const ag = agregarRondas([r])
    expect(ag.avgOverPar18).toBe(13)
    expect(ag.bestRound18?.score).toBe(85)
    expect(ag.totalBirdies).toBe(0)
  })

  it('solo total con holes_played raro queda parcial; scramble solo total queda fuera', () => {
    expect(una(raw({ scores: null, total_gross: 60, holes_played: 12 })).fueraDePromedios).toBe('parcial')
    expect(una(raw({ scores: [], total_gross: 62, formato_juego: 'scramble' })).fueraDePromedios).toBe('bola_compartida')
  })
})

describe('serieScoreVsPar', () => {
  const rondas = () => normalizarRondas([
    raw({ id: 'nueva', played_at: '2026-06-10', total_gross: 80 }),
    raw({ id: 'scramble', played_at: '2026-06-05', formato_juego: 'scramble', total_gross: 62 }),
    raw({ id: 'nueve', played_at: '2026-06-01', scores: Array(9).fill(4).map((s, i) => (i < 5 ? 5 : s)), total_gross: 41, holes_played: 9 }),
    raw({ id: 'parcial', played_at: '2026-05-01', scores: Array(12).fill(5), total_gross: 60 }),
  ], [], [])

  it('solo el bucket pedido, en su propia escala; rondas fuera de números sin punto', () => {
    expect(serieScoreVsPar(rondas(), 18)).toEqual([{ id: 'nueva', played_at: '2026-06-10', vsPar: 8 }])
    expect(serieScoreVsPar(rondas(), 9)).toEqual([{ id: 'nueve', played_at: '2026-06-01', vsPar: 5 }])
  })
})

describe('bucketPrincipal', () => {
  const r18 = (id: string) => raw({ id })
  const r9 = (id: string) => raw({ id, scores: Array(9).fill(5), total_gross: 45, holes_played: 9 })

  it('gana el bucket con más rondas que cuentan; empate → 18', () => {
    expect(bucketPrincipal(normalizarRondas([r18('a'), r18('b'), r9('c'), r9('d'), r9('e')], [], []))).toBe(9)
    expect(bucketPrincipal(normalizarRondas([r18('a'), r9('b')], [], []))).toBe(18)
  })

  it('las rondas fuera de números no votan; sin rondas que cuenten → null', () => {
    const scramble = (id: string) => raw({ id, formato_juego: 'scramble' })
    expect(bucketPrincipal(normalizarRondas([scramble('a'), scramble('b'), r9('c')], [], []))).toBe(9)
    expect(bucketPrincipal(normalizarRondas([scramble('a')], [], []))).toBeNull()
  })
})

describe('par estándar', () => {
  it('una ronda de 27 hoyos sin par real no inventa par 72 (queda sin vsPar)', () => {
    const [r] = normalizarRondas([raw({ scores: Array(27).fill(5), total_gross: 135, holes_played: 27 })], [], [])
    expect(r.bucket).toBe(18)
    expect(r.vsPar).toBeNull()
  })
})
