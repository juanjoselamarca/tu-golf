/**
 * Which rounds the Golfers+ index averages: the 20 most recent that are index eligible
 * (`isIndexEligible`). The formula (`whs-index.ts`) receives their differentials.
 *
 * Twin of the `calcular_indice_golfers` RPC SELECT: `canary-whs-index-sql.test.ts`
 * requires the migration to filter, order and limit the same way.
 */

export const INDEX_WINDOW_SIZE = 20

interface IndexRoundFields {
  diferencial?: number | null
  slope_rating?: number | null
  course_rating?: number | null
  excluded_from_handicap?: boolean | null
  total_gross?: number | null
  holes_played?: number | null
}

export interface IndexWindowRound extends Required<IndexRoundFields> {
  id: string
  played_at: string
  created_at: string | null
}

/**
 * Gross below 3 strokes per hole: it cannot come from a round played under the Rules of Golf, so it
 * is not an acceptable score (WHS 2.1). It is a data entry error.
 */
export function isImpossibleScore(r: Pick<IndexRoundFields, 'total_gross' | 'holes_played'>): boolean {
  return r.total_gross != null && r.holes_played != null && r.total_gross < 3 * r.holes_played
}

/** Round that counts for the index: with diferencial, slope and course rating, not excluded and with a possible score. */
export function isIndexEligible(r: IndexRoundFields): boolean {
  return r.diferencial != null && r.slope_rating != null && r.course_rating != null && !r.excluded_from_handicap && !isImpossibleScore(r)
}

const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0)

/**
 * Most recent first. Same day: the one saved last, then by id, so the cut at 20 is always the same.
 * Same order as the RPC: `played_at DESC, created_at DESC NULLS LAST, id DESC`.
 */
function byRecency(a: IndexWindowRound, b: IndexWindowRound): number {
  return desc(a.played_at, b.played_at) || desc(a.created_at ?? '', b.created_at ?? '') || desc(a.id, b.id)
}

/** The index eligible rounds, from the most recent to the oldest, up to 20. */
export function indexWindow<T extends IndexWindowRound>(rounds: ReadonlyArray<T>): T[] {
  return rounds
    .filter(r => isIndexEligible(r))
    .sort(byRecency)
    .slice(0, INDEX_WINDOW_SIZE)
}

/** Differentials of `indexWindow`, ready for `computeGolfersIndex`. */
export function indexWindowDifferentials(rounds: ReadonlyArray<IndexWindowRound>): number[] {
  return indexWindow(rounds).map(r => Number(r.diferencial))
}
