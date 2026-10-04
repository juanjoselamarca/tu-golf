import { describe, it, expect } from 'vitest'
import { historialGWI, patronesGWI, type RondaHistoricaGWI } from './gwi-historial'

const r18 = (total_gross: number, course_name = 'A'): RondaHistoricaGWI => ({ total_gross, course_name, holes_played: 18 })
const r9 = (total_gross: number): RondaHistoricaGWI => ({ total_gross, course_name: 'A', holes_played: 9 })
const opts = { totalHoyos: 18, parTotal: 72, ventana: { revisadas: 60, usadas: 30 } }

describe('historialGWI', () => {
  it('promedia vs par sólo las rondas del mismo tipo (9 vs 18)', () => {
    const h = historialGWI([r18(80), r9(40), r18(84)], opts)
    expect(h).toEqual({ historicalAvg: 10, historicalRoundsCount: 2, courseAvg: null, courseRoundsCount: 0 })
  })

  it('9 hoyos: usa las de 9; holes_played NULL se infiere de scores', () => {
    const h = historialGWI([r18(80), { total_gross: 42, holes_played: null, scores: Array(9).fill(4) }], { ...opts, totalHoyos: 9, parTotal: 36 })
    expect(h).toMatchObject({ historicalAvg: 6, historicalRoundsCount: 1 })
  })

  it('respeta la ventana: mira `revisadas` y usa `usadas`', () => {
    const rondas = [r9(40), r9(40), r18(90), r18(80), r18(70)]
    expect(historialGWI(rondas, { ...opts, ventana: { revisadas: 3, usadas: 30 } }).historicalRoundsCount).toBe(1)
    expect(historialGWI(rondas, { ...opts, ventana: { revisadas: 60, usadas: 2 } })).toMatchObject({ historicalRoundsCount: 2, historicalAvg: 13 })
  })

  it('promedio por cancha sólo si se pide', () => {
    const rondas = [r18(80, 'A'), r18(90, 'B')]
    expect(historialGWI(rondas, opts)).toMatchObject({ courseAvg: null, courseRoundsCount: 0 })
    expect(historialGWI(rondas, { ...opts, cancha: { nombre: 'B' } })).toMatchObject({ courseAvg: 18, courseRoundsCount: 1 })
  })

  it('sin rondas del tipo → sin historial', () => {
    expect(historialGWI([r9(40)], opts)).toEqual({ historicalAvg: null, historicalRoundsCount: 0, courseAvg: null, courseRoundsCount: 0 })
  })
})

describe('patronesGWI', () => {
  const pats = [
    { pattern_type: 'back_nine_collapse', confidence: 0.7, metadata: { diff: 5 } },
    { pattern_type: 'post_bogey_spiral', confidence: 0.4, metadata: null },
    { pattern_type: 'otro', confidence: 1, metadata: null },
  ]
  it('mapea los dos tipos que usa el GWI', () => {
    expect(patronesGWI(pats)).toEqual({ back9Collapse: { confidence: 0.7, avgDiff: 5 }, postBogeySpiral: { confidence: 0.4 } })
  })
  it('filtra por tipos incluidos; avgDiff por defecto 3', () => {
    expect(patronesGWI([{ ...pats[0], metadata: null }, pats[1]], ['back_nine_collapse'])).toEqual({ back9Collapse: { confidence: 0.7, avgDiff: 3 } })
  })
  it('sin patrones → null', () => {
    expect(patronesGWI([])).toBeNull()
  })
})
