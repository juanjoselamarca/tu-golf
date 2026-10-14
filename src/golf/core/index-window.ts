/**
 * Which rounds the Golfers+ index averages: the 20 most recent with diferencial, slope and
 * course rating, not excluded from the handicap. The formula (`whs-index.ts`) receives their differentials.
 *
 * Twin of the `calcular_indice_golfers` RPC SELECT: `canary-whs-index-sql.test.ts`
 * requires the migration to filter and limit the same way.
 */

export const INDEX_WINDOW_SIZE = 20

export interface IndexWindowRound {
  played_at: string
  diferencial: number | null
  slope_rating: number | null
  course_rating: number | null
  excluded_from_handicap: boolean | null
}

/** The rounds that count for the index, from the most recent to the oldest. */
export function indexWindow<T extends IndexWindowRound>(rounds: ReadonlyArray<T>): T[] {
  return rounds
    .filter(r => r.diferencial != null && r.slope_rating != null && r.course_rating != null && !r.excluded_from_handicap)
    .sort((a, b) => b.played_at.localeCompare(a.played_at))
    .slice(0, INDEX_WINDOW_SIZE)
}

/** Differentials of `indexWindow`, ready for `computeGolfersIndex`. */
export function indexWindowDifferentials(rounds: ReadonlyArray<IndexWindowRound>): number[] {
  return indexWindow(rounds).map(r => Number(r.diferencial))
}
