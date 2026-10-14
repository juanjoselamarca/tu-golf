import { describe, it, expect } from 'vitest'
import { computeGolfersIndex, whsTableRow, WHS_TABLE_5_2 } from './whs-index'

const from5 = (n: number) => Array.from({ length: n }, (_, i) => 5 + i)

describe('WHS_TABLE_5_2', () => {
  it('covers 3 to 20 differentials with no gaps or overlaps', () => {
    for (let n = 3; n <= 20; n++) {
      expect(WHS_TABLE_5_2.filter(row => n >= row.from && n <= row.to)).toHaveLength(1)
    }
    expect(whsTableRow(2)).toBeNull()
    expect(whsTableRow(25)).toEqual(whsTableRow(20))
  })
})

describe('computeGolfersIndex (WHS 5.2)', () => {
  it('no index with fewer than 3 differentials', () => {
    expect(computeGolfersIndex([])).toBeNull()
    expect(computeGolfersIndex([5, 6])).toBeNull()
  })

  it('applies the -2.0, -1.0 and -1.0 adjustment with 3, 4 and 6', () => {
    expect(computeGolfersIndex([10, 12, 15])).toBe(8)
    expect(computeGolfersIndex([10, 12, 15, 11])).toBe(9)
    expect(computeGolfersIndex([10, 12, 15, 11, 13])).toBe(10)
    expect(computeGolfersIndex([8, 9, 10, 11, 12, 14])).toBe(7.5)
  })

  it('averages the best ones according to the count, without the 0.96 factor', () => {
    expect(computeGolfersIndex([10, 12, 8, 15, 11, 9, 14])).toBe(8.5)
    expect(computeGolfersIndex(from5(17))).toBe(7.5)
    expect(computeGolfersIndex(from5(18))).toBe(7.5)
    expect(computeGolfersIndex(from5(19))).toBe(8)
    expect(computeGolfersIndex(from5(20))).toBe(8.5)
  })

  it('rounds half away from zero, like Postgres ROUND', () => {
    // (9.1 + 9.2) / 2 in floating point is 9.149999…; Postgres gives 9.2.
    expect(computeGolfersIndex([9.1, 9.2, 30, 30, 30, 30, 30])).toBe(9.2)
    expect(computeGolfersIndex([-9.1, -9.2, 30, 30, 30, 30, 30])).toBe(-9.2)
    expect(computeGolfersIndex([31.32, 18.76, 20.2, 22.18, 16.37])).toBe(16.4)
  })

  it('never returns -0', () => {
    expect(Object.is(computeGolfersIndex([-0.04, 1, 2, 3, 4]), 0)).toBe(true)
  })
})
