import { describe, it, expect } from 'vitest'
import { estimateCostUsd } from './costs'

describe('estimateCostUsd — cache-aware', () => {
  it('cobra input no-cacheado + output a las tarifas del modelo', () => {
    // sonnet-4-6: in $3 / out $15 por 1M
    const cost = estimateCostUsd('claude-sonnet-4-6', { tokensIn: 1_000_000, tokensOut: 1_000_000 })
    expect(cost).toBeCloseTo(3 + 15, 6)
  })

  it('cache WRITE cuesta 1.25× el input', () => {
    // 1M tokens escritos a caché → 3 * 1.25 = 3.75
    const cost = estimateCostUsd('claude-sonnet-4-6', { tokensIn: 0, tokensOut: 0, cacheWrite: 1_000_000 })
    expect(cost).toBeCloseTo(3.75, 6)
  })

  it('cache READ cuesta 0.1× el input', () => {
    // 1M tokens leídos de caché → 3 * 0.1 = 0.30
    const cost = estimateCostUsd('claude-sonnet-4-6', { tokensIn: 0, tokensOut: 0, cacheRead: 1_000_000 })
    expect(cost).toBeCloseTo(0.3, 6)
  })

  it('combina las cuatro componentes correctamente', () => {
    // un turno realista del coach: poco input nuevo, mucho cache_read, algo de output
    const cost = estimateCostUsd('claude-sonnet-4-6', {
      tokensIn: 200,
      tokensOut: 500,
      cacheRead: 5000,
      cacheWrite: 0,
    })
    const expected = (200 * 3 + 500 * 15 + 5000 * 0.3 + 0 * 3.75) / 1_000_000
    expect(cost).toBeCloseTo(expected, 10)
  })

  it('cacheRead/cacheWrite default a 0 cuando no se pasan', () => {
    const cost = estimateCostUsd('claude-sonnet-4-6', { tokensIn: 1000, tokensOut: 1000 })
    expect(cost).toBeCloseTo((1000 * 3 + 1000 * 15) / 1_000_000, 10)
  })

  it('modelo desconocido → 0', () => {
    expect(estimateCostUsd('modelo-fantasma', { tokensIn: 1000, tokensOut: 1000, cacheRead: 1000, cacheWrite: 1000 })).toBe(0)
  })

  it('overload legacy (firma posicional tokensIn, tokensOut) sigue funcionando para los call-sites del gateway', () => {
    const cost = estimateCostUsd('claude-sonnet-4-6', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(3 + 15, 6)
  })

  it('gemini-2.5-flash cobra a su tarifa (sin caché)', () => {
    const cost = estimateCostUsd('gemini-2.5-flash', { tokensIn: 1_000_000, tokensOut: 1_000_000 })
    expect(cost).toBeCloseTo(0.1 + 0.4, 6)
  })
})
