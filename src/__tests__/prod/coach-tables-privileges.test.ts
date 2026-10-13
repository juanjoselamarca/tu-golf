/**
 * Prod canary: the coach tables and search_chunks_hybrid are not readable without the service role.
 *
 * Pins the state left by 20261012000000_coach_tables_private_read.sql (applied on 2026-10-12, PR #538):
 *  - anon reads no row of knowledge_chunks, knowledge_sources, llm_models or pattern_definitions;
 *  - a non-admin session reads only pattern_definitions, all of it (coach focus catalog);
 *  - only service_role executes search_chunks_hybrid, in every overload.
 * And the other side: service_role still reads the 4 tables and runs the RPC (coach retrieval).
 *
 * Read only (signs in the E2E user). Skipped without credentials.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { EMBED_DIM } from '@/golf/coach/v3/retrieval/embed-query'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.E2E_TEST_USER_EMAIL
const password = process.env.E2E_TEST_USER_PASSWORD

const missingCredentials = !url || !anonKey || !serviceKey || !email || !password

const PRIVATE_TABLES = ['knowledge_chunks', 'knowledge_sources', 'llm_models']
const SESSION_TABLE = 'pattern_definitions'
const TABLES = [...PRIVATE_TABLES, SESSION_TABLE]
const OPTIONS = { auth: { autoRefreshToken: false, persistSession: false } }

/** Rows the client can see; a revoked table grant (42501) also means none. */
async function visibleRows(client: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await client.from(table).select('*', { count: 'exact' }).range(0, 0)
  if (error?.code === '42501') return 0
  if (error) throw error
  return count ?? 0
}

describe.skipIf(missingCredentials)('coach tables: service role only (pattern_definitions also for sessions)', () => {
  let anon: SupabaseClient
  let session: SupabaseClient
  let service: SupabaseClient
  const serviceRows: Record<string, number> = {}

  beforeAll(async () => {
    anon = createClient(url!, anonKey!, OPTIONS)
    service = createClient(url!, serviceKey!, OPTIONS)
    session = createClient(url!, anonKey!, OPTIONS)
    const { error } = await session.auth.signInWithPassword({ email: email!, password: password! })
    if (error) throw error
    for (const table of TABLES) serviceRows[table] = await visibleRows(service, table)
  }, 60_000)

  it.each(TABLES)('service role reads %s (an empty table would prove nothing)', table => {
    expect(serviceRows[table]).toBeGreaterThan(0)
  })

  it.each(TABLES)('anon reads no row of %s', async table => {
    expect(await visibleRows(anon, table)).toBe(0)
  })

  it.each(PRIVATE_TABLES)('a session reads no row of %s', async table => {
    expect(await visibleRows(session, table)).toBe(0)
  })

  it(`a session reads all of ${SESSION_TABLE}`, async () => {
    expect(await visibleRows(session, SESSION_TABLE)).toBe(serviceRows[SESSION_TABLE])
  })

  it('only service_role executes search_chunks_hybrid, in every overload', async () => {
    const { data, error } = await service.rpc('exec_sql', {
      query: `select p.oid::regprocedure::text as signature,
                     has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
                     has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
                     has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
              from pg_proc p
              where p.pronamespace = 'public'::regnamespace and p.proname = 'search_chunks_hybrid'`,
    })
    if (error) throw error
    if (!Array.isArray(data)) throw new Error(`exec_sql: ${JSON.stringify(data)}`)
    expect(data.length).toBeGreaterThan(0)
    for (const row of data) {
      expect(row).toEqual({ signature: row.signature, anon: false, authenticated: false, service_role: true })
    }
  })

  it('service role runs search_chunks_hybrid (coach retrieval)', async () => {
    const { data, error } = await service.rpc('search_chunks_hybrid', {
      query_embedding: Array(EMBED_DIM).fill(0),
      query_text: 'out of bounds',
      alpha: 0,
      top_k: 1,
      jurisdictions: null,
      block_filter: null,
    })
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })
})
