/**
 * Canary: anon has table-level privileges only on ANON_TABLE_PRIVILEGES, and column-level only SELECT on
 * ANON_COLUMN_SELECT_TABLES (20261029120000_anon_sin_permisos_de_tabla).
 *
 * Read from supabase/schema.sql, the schema the migrations leave (the esquema workflow keeps it in sync).
 * Fails if a migration gives anon a privilege on another table, or another privilege on one of these. A table
 * a page without a session starts reading goes in ANON_TABLE_PRIVILEGES and in the migration's GRANT together.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { ANON_COLUMN_SELECT_TABLES, ANON_TABLE_PRIVILEGES } from './helpers/migration-sql'

// Windows checkouts (core.autocrlf) bring CRLF; normalized so the line anchors match as in CI.
const schema = readFileSync(path.resolve(process.cwd(), 'supabase', 'schema.sql'), 'utf8').replace(/\r\n/g, '\n')

const anonGrants = [...schema.matchAll(/^grant (.+) on table public\."(\w+)" to anon;$/gm)].flatMap(([, privileges, table]) =>
  privileges.includes('(')
    ? [`${table}:${privileges.split(' ')[0]} (columns)`]
    : privileges.split(', ').map(privilege => `${table}:${privilege}`),
)

describe('anon privileges in public (supabase/schema.sql)', () => {
  it('only ANON_TABLE_PRIVILEGES and the column SELECT of ANON_COLUMN_SELECT_TABLES', () => {
    const expected = [
      ...ANON_COLUMN_SELECT_TABLES.map(table => `${table}:SELECT (columns)`),
      ...Object.entries(ANON_TABLE_PRIVILEGES).flatMap(([table, privileges]) => privileges.map(p => `${table}:${p}`)),
    ]
    expect(anonGrants.sort()).toEqual(expected.sort())
  })
})
