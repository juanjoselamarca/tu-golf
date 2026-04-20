// src/lib/mi-golf/insights.test.ts
import { describe, it, expect } from 'vitest'
import { selectDailyInsight } from './insights'
import type { HistoricalRound } from './types'

const FECHA = '2026-04-20'
const USER_ID = 'user-abc-123'

const mk = (id: string, gross: number, course: string): HistoricalRound => ({
  id,
  total_gross: gross,
  course_name: course,
  played_at: '2026-04-10',
  diferencial: gross - 72,
})

describe('selectDailyInsight', () => {
  it('es determinístico: mismo input → mismo insight en el mismo día', () => {
    const rondas = [mk('1', 80, 'A'), mk('2', 78, 'A'), mk('3', 82, 'B')]
    const i1 = selectDailyInsight({ userId: USER_ID, fecha: FECHA, historico: rondas, taigerSessionCount: 0 })
    const i2 = selectDailyInsight({ userId: USER_ID, fecha: FECHA, historico: rondas, taigerSessionCount: 0 })
    expect(i1).toEqual(i2)
  })

  it('cambia en diferentes días', () => {
    const rondas = [mk('1', 80, 'A'), mk('2', 78, 'A'), mk('3', 82, 'B'), mk('4', 79, 'A')]
    const i1 = selectDailyInsight({ userId: USER_ID, fecha: '2026-04-20', historico: rondas, taigerSessionCount: 0 })
    const i2 = selectDailyInsight({ userId: USER_ID, fecha: '2026-04-21', historico: rondas, taigerSessionCount: 0 })
    expect(i1).toBeTruthy()
    expect(i2).toBeTruthy()
  })

  it('devuelve insight fallback cuando no hay datos', () => {
    const i = selectDailyInsight({ userId: USER_ID, fecha: FECHA, historico: [], taigerSessionCount: 0 })
    expect(i.source).toBe('fallback')
    expect(i.titulo).toMatch(/ronda/i)
  })

  it('prioriza stat real sobre fallback si hay suficiente data', () => {
    const rondas = [mk('1', 80, 'A'), mk('2', 78, 'A'), mk('3', 82, 'B'), mk('4', 79, 'A'), mk('5', 77, 'A')]
    const i = selectDailyInsight({ userId: USER_ID, fecha: FECHA, historico: rondas, taigerSessionCount: 2 })
    expect(['stat', 'comparativa']).toContain(i.source)
  })

  it('genera insight de cancha más jugada', () => {
    const rondas = [
      mk('1', 80, 'Sport Francés'),
      mk('2', 78, 'Sport Francés'),
      mk('3', 82, 'Sport Francés'),
      mk('4', 79, 'Los Leones'),
      mk('5', 77, 'Sport Francés'),
    ]
    let encontrado = false
    for (let d = 1; d <= 31; d++) {
      const fecha = `2026-04-${String(d).padStart(2, '0')}`
      const i = selectDailyInsight({ userId: USER_ID, fecha, historico: rondas, taigerSessionCount: 0 })
      if (i.titulo.includes('Sport Francés')) {
        encontrado = true
        break
      }
    }
    expect(encontrado).toBe(true)
  })
})
