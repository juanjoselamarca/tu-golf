/**
 * Golfers+ index under WHS Rule 5.2: the average of the best differentials among the last
 * 20 rounds plus the Table 5.2a adjustment, rounded to one decimal. No × 0.96 from the
 * pre-2020 USGA formula.
 *
 * Twin of the `calcular_indice_golfers` RPC, which is the one that stores the index:
 * `canary-whs-index-sql.test.ts` requires the migration to use this same table.
 */

/** Table 5.2a: with N differentials, how many of the best are averaged and which adjustment is added. */
export const WHS_TABLE_5_2 = [
  { from: 3, to: 3, best: 1, adjustment: -2 },
  { from: 4, to: 4, best: 1, adjustment: -1 },
  { from: 5, to: 5, best: 1, adjustment: 0 },
  { from: 6, to: 6, best: 2, adjustment: -1 },
  { from: 7, to: 8, best: 2, adjustment: 0 },
  { from: 9, to: 11, best: 3, adjustment: 0 },
  { from: 12, to: 14, best: 4, adjustment: 0 },
  { from: 15, to: 16, best: 5, adjustment: 0 },
  { from: 17, to: 18, best: 6, adjustment: 0 },
  { from: 19, to: 19, best: 7, adjustment: 0 },
  { from: 20, to: 20, best: 8, adjustment: 0 },
] as const

/** Table row for `count` differentials; null below 3 (no index). */
export function whsTableRow(count: number): (typeof WHS_TABLE_5_2)[number] | null {
  const n = Math.min(count, 20)
  return WHS_TABLE_5_2.find(row => n >= row.from && n <= row.to) ?? null
}

/** Index from the differentials of the last 20 valid rounds; null below 3. */
export function computeGolfersIndex(differentials: readonly number[]): number | null {
  const row = whsTableRow(differentials.length)
  if (!row) return null
  // In integer hundredths (the column is numeric(5,2)): rounds like Postgres ROUND
  // (half away from zero), without toFixed's floating-point error.
  const hundredths = differentials.map(d => Math.round(d * 100)).sort((a, b) => a - b).slice(0, row.best)
  const total = hundredths.reduce((a, b) => a + b, 0) + row.adjustment * 100 * row.best
  const divisor = 10 * row.best
  const tenths = Math.sign(total) * Math.floor((2 * Math.abs(total) + divisor) / (2 * divisor))
  return tenths === 0 ? 0 : tenths / 10
}
