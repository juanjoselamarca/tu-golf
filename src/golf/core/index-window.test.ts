import { describe, it, expect } from 'vitest'
import { indexWindow, indexWindowDifferentials, isIndexEligible, isImpossibleScore, INDEX_WINDOW_SIZE } from './index-window'

const r = (day: number, diferencial: number | null = day) => ({
  played_at: `2026-01-${String(day).padStart(2, '0')}`, diferencial, slope_rating: 128, course_rating: 71.3, excluded_from_handicap: false,
  total_gross: 90, holes_played: 18,
})

describe('indexWindow — same filter as calcular_indice_golfers', () => {
  it('takes the 20 most recent, newest first', () => {
    const w = indexWindowDifferentials(Array.from({ length: 25 }, (_, i) => r(i + 1)))
    expect(w).toHaveLength(INDEX_WINDOW_SIZE)
    expect(w[0]).toBe(25)
    expect(w.at(-1)).toBe(6)
  })

  it('excluded rounds and rounds without diferencial, slope or course rating do not count', () => {
    expect(indexWindow([
      r(1, null),
      { ...r(2), slope_rating: null },
      { ...r(3), course_rating: null },
      { ...r(4), excluded_from_handicap: true },
    ])).toEqual([])
  })

  it('a score under 3 strokes per hole does not count (not an acceptable score, WHS 2.1)', () => {
    expect(isIndexEligible({ ...r(1), total_gross: 53, holes_played: 18 })).toBe(false)
    expect(isIndexEligible({ ...r(1), total_gross: 26, holes_played: 9 })).toBe(false)
    expect(isIndexEligible({ ...r(1), total_gross: 54, holes_played: 18 })).toBe(true)
    expect(isIndexEligible({ ...r(1), total_gross: 27, holes_played: 9 })).toBe(true)
  })

  it('without gross or holes the score is not judged (same as the RPC with NULL)', () => {
    expect(isImpossibleScore({ total_gross: null, holes_played: 18 })).toBe(false)
    expect(isImpossibleScore({ total_gross: 40, holes_played: null })).toBe(false)
    expect(isIndexEligible({ ...r(1), total_gross: null, holes_played: null })).toBe(true)
  })

  it('rounds that do not count take no place in the window', () => {
    const w = indexWindowDifferentials([...Array.from({ length: 20 }, (_, i) => r(i + 1)), { ...r(28), excluded_from_handicap: true }])
    expect(w).toHaveLength(20)
    expect(w).not.toContain(28)
    expect(w).toContain(1)
  })

  it('returns the full rows and does not reorder the input', () => {
    const input = [{ ...r(1), id: 'a' }, { ...r(2), id: 'b' }]
    expect(indexWindow(input).map(row => row.id)).toEqual(['b', 'a'])
    expect(input.map(row => row.id)).toEqual(['a', 'b'])
  })

  it('converts a diferencial that arrives as text (DECIMAL) to a number', () => {
    expect(indexWindowDifferentials([{ ...r(1), diferencial: '12.30' as unknown as number }])).toEqual([12.3])
  })
})
