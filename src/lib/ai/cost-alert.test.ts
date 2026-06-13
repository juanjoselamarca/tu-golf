import { describe, it, expect } from 'vitest'
import { evaluateDailyCostAlert, DEFAULT_DAILY_COST_THRESHOLD_USD } from './usage-stats'

describe('evaluateDailyCostAlert', () => {
  it('sin alerta cuando el costo del día está bajo el umbral', () => {
    expect(evaluateDailyCostAlert(2, 5)).toEqual([])
  })

  it('sin alerta cuando es exactamente el umbral (estricto >)', () => {
    expect(evaluateDailyCostAlert(5, 5)).toEqual([])
  })

  it('warning cuando supera el umbral', () => {
    const alerts = evaluateDailyCostAlert(6, 5)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].level).toBe('warning')
    expect(alerts[0].code).toBe('ai_daily_cost_high')
    expect(alerts[0].message).toContain('6')
  })

  it('critical cuando triplica el umbral (gasto descontrolado)', () => {
    const alerts = evaluateDailyCostAlert(16, 5)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].level).toBe('critical')
  })

  it('usa el umbral por defecto cuando no se pasa', () => {
    expect(evaluateDailyCostAlert(DEFAULT_DAILY_COST_THRESHOLD_USD - 0.01)).toEqual([])
    expect(evaluateDailyCostAlert(DEFAULT_DAILY_COST_THRESHOLD_USD + 1000)[0].level).toBe('critical')
  })
})
