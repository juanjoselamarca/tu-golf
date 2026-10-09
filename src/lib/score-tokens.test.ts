import { describe, it, expect } from 'vitest'
import { scoreFgVar, scoreCellStyle, scoreChipStyle } from './score-tokens'

describe('score-tokens — colores de resultado theme-aware', () => {
  it('scoreFgVar mapea el diferencial vs par a la variable del resultado', () => {
    expect(scoreFgVar(-3)).toBe('var(--score-eagle-fg)')
    expect(scoreFgVar(-2)).toBe('var(--score-eagle-fg)')
    expect(scoreFgVar(-1)).toBe('var(--score-birdie-fg)')
    expect(scoreFgVar(0)).toBe('var(--text-3)')
    expect(scoreFgVar(1)).toBe('var(--score-bogey-fg)')
    expect(scoreFgVar(2)).toBe('var(--score-double-fg)')
    expect(scoreFgVar(7)).toBe('var(--score-double-fg)')
  })

  it('scoreCellStyle usa golpes − par, no el score absoluto', () => {
    expect(scoreCellStyle(3, 5).color).toBe('var(--score-eagle-fg)')
    expect(scoreCellStyle(3, 4).color).toBe('var(--score-birdie-fg)')
    expect(scoreCellStyle(3, 3).color).toBe('var(--text)')
    expect(scoreCellStyle(5, 4).color).toBe('var(--score-bogey-fg)')
    expect(scoreCellStyle(6, 4).color).toBe('var(--score-double-fg)')
  })

  it('hoyo sin score → celda vacía; par por defecto 4', () => {
    expect(scoreCellStyle(null)).toEqual({ background: 'var(--score-empty-bg)', color: 'var(--score-empty-fg)' })
    expect(scoreCellStyle(3).color).toBe('var(--score-birdie-fg)')
  })

  it('solo devuelve variables CSS (nada hardcodeado que ignore el tema)', () => {
    for (const d of [-2, -1, 1, 2]) expect(scoreFgVar(d)).toMatch(/^var\(--/)
    for (const s of [2, 3, 5, 6, null]) expect(String(scoreCellStyle(s, 4).color)).toMatch(/^var\(--/)
  })

  it('scoreChipStyle: par neutro con borde; el resto con el color del resultado como borde', () => {
    expect(scoreChipStyle(4, 4)).toEqual({ background: 'var(--surface-soft)', color: 'var(--text-2)', border: '1px solid var(--border)' })
    expect(scoreChipStyle(3, 4)).toEqual({ background: 'var(--score-birdie-bg)', color: 'var(--score-birdie-fg)', border: '1px solid currentColor' })
    expect(scoreChipStyle(7, 4).color).toBe('var(--score-double-fg)')
  })
})
