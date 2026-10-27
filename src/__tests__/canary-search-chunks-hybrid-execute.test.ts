/**
 * Canary: only service_role executes search_chunks_hybrid.
 *
 * Since 20261012000000 (coach_tables_private_read, now in the baseline), PUBLIC, anon and authenticated have no
 * EXECUTE on it. CREATE OR REPLACE with the same signature keeps that ACL, but a DROP +
 * CREATE or a new signature creates a new function, and Supabase's default privileges
 * grant EXECUTE to anon and authenticated again.
 *
 * Fails if a migration defines the function without revoking EXECUTE from PUBLIC, anon
 * and authenticated after its last definition in the same file, or grants it to any of
 * them (directly or through ALL FUNCTIONS IN SCHEMA public). The baseline is scanned too.
 * Statements inside EXECUTE '...' are read too. Not
 * detected (none used in this repo): the function inside a list of several objects,
 * ON ROUTINE / ALL ROUTINES, TO GROUP, a role passed through format() or a variable, and
 * ALL FUNCTIONS IN SCHEMA with public after another schema.
 */
import { describe, it, expect } from 'vitest'
import {
  BASELINE,
  CLIENT_ROLES,
  migrationFiles,
  readMigration,
  sqlAllInSchemaPublic,
  sqlIdentifier,
  stripSqlComments,
} from './helpers/migration-sql'

const FN = sqlIdentifier('search_chunks_hybrid')
const TARGET = String.raw`on\s+(?:function\s+${FN}|${sqlAllInSchemaPublic('functions')})`
const DEFINES = new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+${FN}\s*\(`, 'gi')

/** Client roles in GRANT ... TO / REVOKE ... FROM statements on the function that start at or after `from`. */
function grantees(sql: string, verb: 'grant' | 'revoke', from = 0): Set<string> {
  const to = verb === 'grant' ? 'to' : 'from'
  const statement = new RegExp(String.raw`${verb}\s+(?:all|execute)\b[^;]*?\b${TARGET}[^;]*?\b${to}\s+([^;]*)`, 'gi')
  const roles = new Set<string>()
  for (const match of sql.matchAll(statement)) {
    if (match.index < from) continue
    for (const item of match[1].split(',')) {
      const role = item.trim().match(/^"?(\w+)/)?.[1].toLowerCase()
      if (role && CLIENT_ROLES.includes(role)) roles.add(role)
    }
  }
  return roles
}

function violations(sql: string): string[] {
  const clean = stripSqlComments(sql)
  const errors = [...grantees(clean, 'grant')].map(role => `GRANT EXECUTE on search_chunks_hybrid to ${role}`)
  const lastDefinition = [...clean.matchAll(DEFINES)].at(-1)
  if (lastDefinition) {
    const revoked = grantees(clean, 'revoke', lastDefinition.index)
    const missing = CLIENT_ROLES.filter(role => !revoked.has(role))
    if (missing.length) errors.push(`defines search_chunks_hybrid without REVOKE EXECUTE from ${missing.join(', ')}`)
  }
  return errors
}

describe('canary: search_chunks_hybrid is service_role only', () => {
  it('the baseline revokes EXECUTE from every client role', () => {
    expect([...grantees(stripSqlComments(readMigration(BASELINE)), 'revoke')].sort()).toEqual([...CLIENT_ROLES].sort())
  })

  it('detects a definition without a later REVOKE and a GRANT (detector guard)', () => {
    const create = 'CREATE OR REPLACE FUNCTION public.search_chunks_hybrid(q text) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;'
    const revoke = 'REVOKE EXECUTE ON FUNCTION public.search_chunks_hybrid FROM PUBLIC, anon, authenticated;'
    expect(violations(create)).toHaveLength(1)
    expect(violations(`DROP FUNCTION search_chunks_hybrid;\nCREATE FUNCTION search_chunks_hybrid(q text) RETURNS int AS $$ SELECT 1 $$;`)).toHaveLength(1)
    expect(violations(`${create}\n${revoke}`)).toEqual([])
    expect(violations(`${revoke}\nDROP FUNCTION search_chunks_hybrid;\n${create}`)).toHaveLength(1)
    expect(violations(`${create}\nREVOKE ALL ON FUNCTION search_chunks_hybrid(text) FROM PUBLIC;\nREVOKE EXECUTE ON FUNCTION search_chunks_hybrid(text) FROM anon, authenticated;`)).toEqual([])
    expect(violations(`${create}\nREVOKE EXECUTE ON FUNCTION "public"."search_chunks_hybrid" FROM "anon", authenticated, PUBLIC CASCADE;`)).toEqual([])
    expect(violations(`${create}\nREVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;`)).toEqual([])
    expect(violations(`${create}\nREVOKE EXECUTE ON FUNCTION search_chunks_hybrid FROM anon, authenticated;`)).toEqual([
      'defines search_chunks_hybrid without REVOKE EXECUTE from public',
    ])
    expect(violations(`${create}\n-- ${revoke}`)).toHaveLength(1)
    expect(violations('CREATE FUNCTION "public"."search_chunks_hybrid"(q text) RETURNS int AS $$ SELECT 1 $$;')).toHaveLength(1)
    expect(violations('GRANT EXECUTE ON FUNCTION public.search_chunks_hybrid TO authenticated;')).toHaveLength(1)
    expect(violations("DO $$ BEGIN EXECUTE 'GRANT EXECUTE ON FUNCTION public.search_chunks_hybrid TO authenticated'; END $$;")).toHaveLength(1)
    expect(violations(`${create}\nDO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.search_chunks_hybrid FROM public, anon, authenticated'; END $$;`)).toEqual([])
    expect(violations('GRANT ALL ON FUNCTION search_chunks_hybrid(vector, text) TO anon WITH GRANT OPTION;')).toHaveLength(1)
    expect(violations('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;')).toHaveLength(2)
    expect(violations('GRANT EXECUTE ON FUNCTION search_chunks_hybrid(vector, text) TO service_role;')).toEqual([])
    expect(violations('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon;')).toEqual([])
    expect(violations('CREATE OR REPLACE FUNCTION search_chunks_hybrid_v2(q text) RETURNS int AS $$ SELECT 1 $$;')).toEqual([])
  })

  it('no migration reopens search_chunks_hybrid', () => {
    const errors = migrationFiles().flatMap(f => violations(readMigration(f)).map(v => `${f}: ${v}`))
    expect(errors).toEqual([])
  })
})
