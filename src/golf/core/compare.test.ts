import { describe, it, expect } from 'vitest'
import { worstRoundByVsPar, bestRoundByVsPar } from './compare'

describe('worstRoundByVsPar', () => {
  it('devuelve la ronda con mayor vsPar', () => {
    const rounds = [
      { total_gross: 80, par_total: 72 }, // +8
      { total_gross: 95, par_total: 72 }, // +23 ← peor
      { total_gross: 74, par_total: 72 }, // +2
    ]
    expect(worstRoundByVsPar(rounds)?.total_gross).toBe(95)
  })

  it('en empate gana la primera en orden original (paridad con sort estable)', () => {
    const a = { total_gross: 90, par_total: 72, id: 'a' }
    const b = { total_gross: 90, par_total: 72, id: 'b' }
    expect(worstRoundByVsPar([a, b])?.id).toBe('a')
  })

  it('lista vacía → null', () => {
    expect(worstRoundByVsPar([])).toBeNull()
  })

  it('es espejo de bestRoundByVsPar', () => {
    const rounds = [
      { total_gross: 80, par_total: 72 },
      { total_gross: 95, par_total: 72 },
      { total_gross: 74, par_total: 72 },
    ]
    expect(bestRoundByVsPar(rounds)?.total_gross).toBe(74)
    expect(worstRoundByVsPar(rounds)?.total_gross).toBe(95)
  })
})
