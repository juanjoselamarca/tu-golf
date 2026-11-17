import { describe, it, expect } from 'vitest'
import { calcularTendencia } from './tendencia'
import { getTaigerLine } from './taiger-line'
import type { HistoricalRound } from './types'

const AHORA = new Date('2026-11-16T12:00:00').getTime()
const r = (id: string, diasAtras: number, diferencial: number | null): HistoricalRound => ({
  id,
  total_gross: 85,
  course_name: 'A',
  played_at: new Date(AHORA - diasAtras * 86400000).toISOString().slice(0, 10),
  diferencial,
  holes_played: 18,
  slope_rating: 130,
  course_rating: 72,
})

describe('calcularTendencia', () => {
  it('compara los últimos 30 días contra los 30 anteriores: diferenciales más bajos = mejora', () => {
    const t = calcularTendencia([r('1', 2, 10), r('2', 10, 11), r('3', 20, 12), r('4', 35, 14), r('5', 40, 15), r('6', 50, 13)], AHORA)
    expect(t).toEqual({ direccion: 'up', delta: 3, dias: 30 })
  })

  it('diferenciales más altos = empeora', () => {
    const t = calcularTendencia([r('1', 2, 16), r('2', 10, 16), r('3', 20, 16), r('4', 35, 14), r('5', 40, 14), r('6', 50, 14)], AHORA)
    expect(t?.direccion).toBe('down')
    expect(t?.delta).toBe(2)
  })

  it('diferencia menor a 1 golpe: flat', () => {
    const t = calcularTendencia([r('1', 2, 12.9), r('2', 10, 12), r('3', 20, 12), r('4', 35, 12), r('5', 40, 12), r('6', 50, 12)], AHORA)
    expect(t?.direccion).toBe('flat')
  })

  it('menos de 3 rondas con diferencial en alguna ventana: sin tendencia', () => {
    expect(calcularTendencia([r('1', 2, 10), r('2', 10, 11), r('3', 20, 12), r('4', 35, 14), r('5', 40, 15)], AHORA)).toBeNull()
    expect(calcularTendencia([r('1', 2, 10), r('2', 10, null), r('3', 20, 12), r('4', 35, 14), r('5', 40, 15), r('6', 50, 13)], AHORA)).toBeNull()
  })

  it('rondas de hace más de 60 días no cuentan', () => {
    expect(calcularTendencia([r('1', 2, 10), r('2', 10, 11), r('3', 20, 12), r('4', 70, 14), r('5', 80, 15), r('6', 90, 13)], AHORA)).toBeNull()
  })

  it('la ronda de hoy cuenta aunque el servidor (UTC) todavía no llegue al mediodía', () => {
    const madrugada = new Date('2026-11-16T00:30:00Z').getTime()
    const hoy = { ...r('hoy', 0, 8), played_at: '2026-11-16' }
    const t = calcularTendencia([hoy, r('2', 10, 11), r('3', 20, 12), r('4', 35, 14), r('5', 40, 15), r('6', 50, 13)], madrugada)
    expect(t).toEqual({ direccion: 'up', delta: (14 + 15 + 13) / 3 - (8 + 11 + 12) / 3, dias: 30 })
  })

  it('de punta a punta: diferenciales que bajan → tAIger+ dice "bajó"; que suben → "subió"', () => {
    const linea = (t: ReturnType<typeof calcularTendencia>) =>
      getTaigerLine({ tendencia: t, golpesHastaSiguienteNivel: null, nombreSiguienteNivel: null, taigerSessionCount: 0, totalRounds: 20 }).texto
    expect(linea(calcularTendencia([r('1', 2, 10), r('2', 10, 11), r('3', 20, 12), r('4', 35, 14), r('5', 40, 15), r('6', 50, 13)], AHORA)))
      .toBe('Tu diferencial promedio bajó 3.0 frente a los 30 días anteriores.')
    expect(linea(calcularTendencia([r('1', 2, 16), r('2', 10, 16), r('3', 20, 16), r('4', 35, 14), r('5', 40, 14), r('6', 50, 14)], AHORA)))
      .toBe('Tu diferencial promedio subió 2.0 frente a los 30 días anteriores.')
  })

  it('usa solo las rondas que cuentan para el índice (isIndexEligible)', () => {
    const base = [r('1', 2, 10), r('2', 10, 11), r('3', 20, 12), r('4', 35, 14), r('5', 40, 15), r('6', 50, 13)]
    // No cuentan: excluida a mano, score imposible (gross < 3 por hoyo), sin slope/rating.
    const fuera = [
      { ...r('x1', 5, 40), excluded_from_handicap: true },
      { ...r('x2', 6, 40), total_gross: 40 },
      { ...r('x3', 7, 40), slope_rating: null },
    ]
    expect(calcularTendencia([...base, ...fuera], AHORA)).toEqual(calcularTendencia(base, AHORA))
    // Control positivo: una ronda válida (match play, best ball o stableford: el formato no
    // filtra) con diferencial 40 sí mueve el promedio reciente.
    expect(calcularTendencia([...base, r('ok', 5, 40)], AHORA)?.direccion).toBe('down')
  })

  it('no depende de ningún índice: un índice oficial viejo no inventa tendencia', () => {
    // Juego estable: mismo diferencial en ambas ventanas → flat, aunque el índice cargado diga otra cosa.
    const t = calcularTendencia([r('1', 2, 12), r('2', 10, 12), r('3', 20, 12), r('4', 35, 12), r('5', 40, 12), r('6', 50, 12)], AHORA)
    expect(t?.direccion).toBe('flat')
    expect(calcularTendencia.length).toBeLessThanOrEqual(2)
  })
})
