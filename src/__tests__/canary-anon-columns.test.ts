/**
 * Canary: on each table of ANON_COLUMNS, anon can SELECT exactly those columns and nothing else.
 *
 * Read from supabase/schema.sql, the schema the migrations leave (the esquema workflow keeps it in sync).
 * Fails if a migration gives anon table-level SELECT on one of these tables again, grants it a column the
 * public views do not read, or takes away one they do (the view breaks). The fix goes in ANON_COLUMNS and in
 * the migration's GRANT SELECT (col) ... TO anon together.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { ANON_COLUMNS } from './helpers/migration-sql'

// Windows checkouts (core.autocrlf) bring CRLF; normalized so the line anchors match as in CI.
const schema = readFileSync(path.resolve(process.cwd(), 'supabase', 'schema.sql'), 'utf8').replace(/\r\n/g, '\n')

const anonPrivileges = (table: string) =>
  [...schema.matchAll(new RegExp(String.raw`^grant (.+) on table public\."${table}" to anon;$`, 'gm'))].map(([, privileges]) => privileges)

describe('anon SELECT on the public-view tables (supabase/schema.sql)', () => {
  it.each(Object.entries(ANON_COLUMNS))('%s: only the columns of ANON_COLUMNS', (table, columns) => {
    const privileges = anonPrivileges(table)
    expect(privileges.filter(p => !p.includes('(') && /\bSELECT\b/.test(p))).toEqual([])
    const granted = privileges.flatMap(p => [.../^SELECT \((.*)\)$/.exec(p)?.[1].matchAll(/"(\w+)"/g) ?? []].map(([, column]) => column))
    expect(granted.sort()).toEqual([...columns].sort())
  })
})
