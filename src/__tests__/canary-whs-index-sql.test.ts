/**
 * Canary: the `calcular_indice_golfers` RPC (the one that stores the index) picks its rounds like
 * `indexWindow` and uses the same WHS 5.2a table as `computeGolfersIndex` (the one that shows it
 * and the one the cap backfill uses).
 *
 * Reads the function's definition in the latest migration that defines it: compares its WHERE, ORDER BY and LIMIT with `indexWindow`
 * and evaluates its `v_best` and `v_adjustment` CASE for 3 to 20 differentials. Fails if anything
 * differs or if the 0.96 factor returns.
 */
import { describe, it, expect } from 'vitest'
import { functionDefinition, migrationFiles, readMigration, stripSqlComments } from './helpers/migration-sql'
import { whsTableRow } from '@/golf/core/whs-index'
import { INDEX_WINDOW_SIZE } from '@/golf/core/index-window'

const definitionIn = (file: string) => functionDefinition(stripSqlComments(readMigration(file)), 'calcular_indice_golfers')
const latest = migrationFiles().sort().filter(definitionIn).at(-1)!
const sql = definitionIn(latest)!

function evalCase(variable: string, n: number): number {
  const block = sql.match(new RegExp(String.raw`${variable}\s*:=\s*case([\s\S]*?)\bend\s*;`, 'i'))
  if (!block) throw new Error(`${latest}: cannot find "${variable} := CASE"`)
  for (const [, op, limit, value] of block[1].matchAll(/when\s+v_count\s*(<=|=)\s*(\d+)\s+then\s+(-?[\d.]+)/gi)) {
    if (op === '<=' ? n <= Number(limit) : n === Number(limit)) return Number(value)
  }
  const fallback = block[1].match(/else\s+(-?[\d.]+)/i)
  if (!fallback) throw new Error(`${latest}: "${variable}" has no ELSE`)
  return Number(fallback[1])
}

describe(`calcular_indice_golfers (${latest})`, () => {
  it('picks rounds like indexWindow: same conditions, most recent first with the same tie-break, up to 20', () => {
    const select = sql.match(
      /from\s+historical_rounds\s+where([\s\S]*?)order\s+by\s+played_at\s+desc\s*,\s*created_at\s+desc\s+nulls\s+last\s*,\s*id\s+desc\s+limit\s+(\d+)/i,
    )
    if (!select) throw new Error(`${latest}: cannot find the rounds SELECT`)
    const conditions = select[1].split(/\band\b/i).map(c => c.replace(/\s+/g, ' ').trim().toLowerCase()).sort()
    expect(conditions).toEqual([
      // `isImpossibleScore` negated: without gross or holes the score is not judged.
      '(total_gross is null or holes_played is null or total_gross >= 3 * holes_played)',
      'course_rating is not null',
      'diferencial is not null',
      'excluded_from_handicap = false',
      'slope_rating is not null',
      'user_id = p_user_id',
    ])
    expect(Number(select[2])).toBe(INDEX_WINDOW_SIZE)
  })

  it.each(Array.from({ length: 18 }, (_, i) => i + 3))('with %i differentials it uses the WHS_TABLE_5_2 row', n => {
    const row = whsTableRow(n)!
    expect(evalCase('v_best', n)).toBe(row.best)
    expect(evalCase('v_adjustment', n)).toBe(row.adjustment)
  })

  it('without the 0.96 factor and with a single rounding', () => {
    expect(sql).not.toMatch(/0\.96/)
    expect(sql).not.toMatch(/v_average\s+(?:decimal|numeric)\s*\(/i)
    expect(sql).toMatch(/v_index\s*:=\s*round\(\s*v_average\s*\+\s*v_adjustment\s*,\s*1\s*\)/i)
  })
})
