import { describe, it, expect } from 'vitest'
import {
  calcularMentalIndex,
  strokesEvitables,
  clasificarHoyo,
  calcularCostoPsicologico,
  type MentalIndexInput,
  type RoundForCostoPsicologico,
} from './mental-index'

describe('calcularMentalIndex', () => {
  it('returns high score for clean profile', () => {
    const input: MentalIndexInput = {
      activePatterns: [],
      activePlan: { id: 'plan_1' },
      outcomes: [
        { target_reached: true, compliance: 'full' },
        { target_reached: true, compliance: 'full' },
        { target_reached: true, compliance: 'full' },
        { target_reached: true, compliance: 'full' },
      ],
      cpi: {
        score: 92,
        trend: 0.5,
        status: 'established',
        breakdown: { diferencial_avg: 5, consistencia: 25, tendencia: 18, volumen_factor: 1 },
        rondas_usadas: 15,
      },
      totalRounds: 15,
      previousScore: 95,
    }
    const r = calcularMentalIndex(input)
    expect(r.score).toBeGreaterThanOrEqual(95)
    expect(r.score).toBeLessThanOrEqual(100)
    expect(r.band).toBe('high')
    expect(r.status).toBe('established')
    expect(r.delta).toBe(r.score - 95)
  })

  it('penalizes post_bogey_spiral confidence 0.9 by at least 22 points', () => {
    const input: MentalIndexInput = {
      activePatterns: [{ pattern_type: 'post_bogey_spiral', confidence: 0.9 }],
      activePlan: null,
      outcomes: [],
      cpi: null,
      totalRounds: 5,
      previousScore: null,
    }
    const r = calcularMentalIndex(input)
    // base 100 - 25*0.9 = 77.5 → 78 redondeado
    expect(r.score).toBeLessThanOrEqual(100 - 22)
    expect(r.band).toBe('high')  // 78 sigue en high
    expect(r.breakdown.patternPenalty).toBeCloseTo(22.5, 1)
  })

  it('skips adherence bonus when no active plan', () => {
    const input: MentalIndexInput = {
      activePatterns: [],
      activePlan: null,
      outcomes: [],
      cpi: null,
      totalRounds: 5,
      previousScore: null,
    }
    const r = calcularMentalIndex(input)
    expect(r.score).toBe(100)
    expect(r.breakdown.adherenceBonus).toBe(0)
    expect(r.breakdown.consistencyBonus).toBe(0)
  })

  it('reports insufficient_data status when < 3 rounds', () => {
    const input: MentalIndexInput = {
      activePatterns: [],
      activePlan: null,
      outcomes: [],
      cpi: null,
      totalRounds: 2,
      previousScore: null,
    }
    const r = calcularMentalIndex(input)
    expect(r.status).toBe('insufficient_data')
  })
})

describe('strokesEvitables', () => {
  it('counts only bogey-followed-by-bogey, contained = bogey simple', () => {
    const round = {
      id: 'r1',
      scores: [5, 6, 4, 4, 5, 4, 3, 4, 5, 6, 5, 3, 4, 7, 7, 3, 4, 5],
      hole_pars: [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5],
    }
    const r = strokesEvitables([round])
    expect(r.total).toBe(3)
    expect(r.instances[0].round_id).toBe('r1')
    expect(r.instances[0].holes).toEqual(['H1→H2', 'H14→H15'])
    expect(r.instances[0].strokes_saved).toBe(3)
  })

  it('skips null scores', () => {
    const round = {
      id: 'r1',
      scores: [5, null, 3, 6, 8, null, 3, 4, 5],
      hole_pars: [4, 4, 3, 4, 5, 4, 3, 4, 5],
    }
    const r = strokesEvitables([round])
    expect(r.total).toBe(2)
    expect(r.instances[0].strokes_saved).toBe(2)
  })

  it('skips rounds without hole_pars (no asume par 72 standard)', () => {
    const round = {
      id: 'legacy-no-pars',
      scores: [5, 6, 4, 4, 5, 4, 3, 4, 5, 6, 5, 3, 4, 7, 7, 3, 4, 5],
      hole_pars: null,
    }
    const r = strokesEvitables([round])
    expect(r.total).toBe(0)
    expect(r.instances).toHaveLength(0)
  })

  it('skips rounds with hole_pars length mismatch', () => {
    const round = {
      id: 'malformed',
      scores: [5, 6, 4, 4, 5, 4, 3, 4, 5, 6, 5, 3, 4, 7, 7, 3, 4, 5],
      hole_pars: [4, 4, 3, 4, 5, 4, 3, 4, 5], // 9 pars para 18 scores
    }
    const r = strokesEvitables([round])
    expect(r.total).toBe(0)
    expect(r.instances).toHaveLength(0)
  })

  it('strokes_saved per ronda agrega correctamente con múltiples rondas', () => {
    const r1 = { id: 'r1', scores: [5, 6, 4], hole_pars: [4, 4, 3] } // 1 evitable
    const r2 = { id: 'r2', scores: [4, 5, 7], hole_pars: [4, 4, 3] } // 3 evitable: 5>=5 (post-bogey) + 7>=4 (next bogey), evitable=7-4-1=2... wait scores
    const result = strokesEvitables([r1, r2])
    expect(result.total).toBe(result.instances.reduce((a, i) => a + i.strokes_saved, 0))
  })
})

describe('clasificarHoyo', () => {
  it('returns null for null score', () => {
    const round = { id: 'r1', scores: [null, 4, 3], hole_pars: [4, 4, 3] }
    expect(clasificarHoyo(round, 0)).toBeNull()
  })

  it('returns tilt for double bogey or worse', () => {
    const round = { id: 'r1', scores: [6, 5], hole_pars: [4, 4] }
    expect(clasificarHoyo(round, 0)).toBe('tilt')
  })

  it('returns tilt for bogey after bogey', () => {
    const round = { id: 'r1', scores: [5, 5], hole_pars: [4, 4] }
    expect(clasificarHoyo(round, 1)).toBe('tilt')
  })

  it('returns tense for isolated bogey', () => {
    const round = { id: 'r1', scores: [4, 5, 4], hole_pars: [4, 4, 3] }
    expect(clasificarHoyo(round, 1)).toBe('tense')
  })

  it('returns calm for par or better', () => {
    const round = { id: 'r1', scores: [4, 3, 4], hole_pars: [4, 4, 3] }
    expect(clasificarHoyo(round, 0)).toBe('calm')
    expect(clasificarHoyo(round, 1)).toBe('calm')  // birdie en par 4
  })

  it('classifies Los Leones 03-may correctly (3+ tilts expected)', () => {
    // Datos reales screenshot del usuario: 03/05 Los Leones 100 (+28).
    // Espirales conocidas: H1→H2, H11→H12, H14→H15.
    const round = {
      id: 'los-leones-2026-05-03',
      // par:   4  4  3  4  5  4  3  4  5  4  4  3  4  5  4  3  4  5
      scores: [5, 7, 3, 4, 5, 6, 3, 4, 5, 4, 5, 7, 4, 5, 7, 3, 4, 9],
      hole_pars: [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5],
    }
    const states = round.scores.map((_, i) => clasificarHoyo(round, i))
    const tiltCount = states.filter(s => s === 'tilt').length
    expect(tiltCount).toBeGreaterThanOrEqual(3)
  })
})

describe('calcularCostoPsicologico', () => {
  // Helper: ronda sintética con par 4 en todos los hoyos, scores configurables
  const mkRound = (id: string, total: number, scores: number[]): RoundForCostoPsicologico => ({
    id,
    total_gross: total,
    scores,
    hole_pars: scores.map(() => 4),
  })

  it('invariante: evitables === windowSize × (promedioReal − promedioContenido)', () => {
    // Universo consistente: 5 rondas, cada una con 1 espiral de +2 (evitable=1)
    // Total evitables = 5, promedioReal = 83, promedioContenido = 83 − 5/5 = 82.
    const rounds = [
      mkRound('r1', 83, [4, 5, 6, 4, 4]),
      mkRound('r2', 83, [4, 5, 6, 4, 4]),
      mkRound('r3', 83, [4, 5, 6, 4, 4]),
      mkRound('r4', 83, [4, 5, 6, 4, 4]),
      mkRound('r5', 83, [4, 5, 6, 4, 4]),
    ]
    const r = calcularCostoPsicologico(rounds)
    expect(r.windowSize).toBe(5)
    expect(r.evitables).toBe(5)
    expect(r.promedioReal).toBe(83)
    expect(r.promedioContenido).toBe(82)
    // Invariante matemática crítica — el número grande de la card NUNCA
    // puede divergir del delta de promedios mostrado debajo:
    expect(r.evitables).toBeCloseTo(r.windowSize * (r.promedioReal - r.promedioContenido), 6)
  })

  it('reproduce bug del usuario: 36 strokes con denominador inflado (regression test)', () => {
    // Antes del fix: evitables se calculaba sobre slice(0,8) mientras que
    // promedios sobre slice(0,5). Con 8 espirales (1 stroke evitable c/u) en
    // 8 rondas y promedio real 83, el viejo flujo mostraba:
    //   evitables = 8 (de 8 rondas) pero promedioContenido se calculaba con
    //   strokes_saved solo de las primeras 5 rondas → mismatch.
    // Tras el fix: TODO debe estar sobre el mismo universo (5 rondas por defecto).
    const rounds = Array.from({ length: 8 }, (_, i) =>
      mkRound(`r${i + 1}`, 83, [4, 5, 6, 4, 4]) // 1 evitable c/u
    )
    const r = calcularCostoPsicologico(rounds, 5)
    expect(r.windowSize).toBe(5)
    expect(r.evitables).toBe(5) // solo las 5 últimas rondas, NO 8
    // Invariante se mantiene:
    expect(r.evitables).toBeCloseTo(r.windowSize * (r.promedioReal - r.promedioContenido), 6)
  })

  it('reporta la última ronda con sus holes y strokes_saved', () => {
    const rounds = [
      mkRound('last', 88, [4, 5, 6, 4, 4]), // 1 evitable en H2→H3
      mkRound('prev1', 83, [4, 4, 4, 4, 4]),
      mkRound('prev2', 83, [4, 4, 4, 4, 4]),
    ]
    const r = calcularCostoPsicologico(rounds)
    expect(r.lastRound).not.toBeNull()
    expect(r.lastRound?.id).toBe('last')
    expect(r.lastRound?.strokes_saved).toBe(1)
    expect(r.lastRound?.holes).toEqual(['H2→H3'])
    expect(r.lastRound?.ghostScore).toBe(87) // 88 − 1
  })

  it('windowSize se ajusta cuando hay menos rondas que el cap', () => {
    const rounds = [mkRound('r1', 83, [4, 5, 6, 4, 4]), mkRound('r2', 80, [4, 4, 4, 4, 4])]
    const r = calcularCostoPsicologico(rounds, 5)
    expect(r.windowSize).toBe(2) // no infla a 5 con rondas inexistentes
    expect(r.evitables).toBe(1)
    expect(r.promedioReal).toBe((83 + 80) / 2)
  })

  it('devuelve null en lastRound cuando última ronda no tuvo espirales', () => {
    const rounds = [
      mkRound('clean', 72, [4, 4, 4, 4, 4]), // sin espirales
      mkRound('prev', 83, [4, 5, 6, 4, 4]),  // 1 evitable
    ]
    const r = calcularCostoPsicologico(rounds)
    expect(r.lastRound).toBeNull() // no mostrar "Tu yo contenido" si última fue limpia
    expect(r.evitables).toBe(1) // pero seguimos contando la histórica
  })

  it('maneja rondas vacías sin crashear', () => {
    const r = calcularCostoPsicologico([])
    expect(r.evitables).toBe(0)
    expect(r.promedioReal).toBe(0)
    expect(r.promedioContenido).toBe(0)
    expect(r.windowSize).toBe(0)
    expect(r.lastRound).toBeNull()
  })

  it('skip rondas sin hole_pars (mantiene invariante)', () => {
    const rounds: RoundForCostoPsicologico[] = [
      { id: 'no-pars', total_gross: 88, scores: [4, 5, 6, 4, 4], hole_pars: null },
      mkRound('good', 80, [4, 4, 4, 4, 4]),
    ]
    const r = calcularCostoPsicologico(rounds)
    // Rondas sin pars no aportan strokes_saved pero SÍ aportan al total_gross
    // (no se puede inferir su componente "contenido" sin pars, así que su
    // strokes_saved = 0 — consistente con strokesEvitables que las skipea).
    expect(r.evitables).toBe(0)
    expect(r.evitables).toBeCloseTo(r.windowSize * (r.promedioReal - r.promedioContenido), 6)
  })
})
