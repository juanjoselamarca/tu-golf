/**
 * Prod canary: RLS in public and the policies that let anon read without a filter.
 *
 * Pins the state classified on 2026-10-13:
 *  - every table in public has RLS, and only inbox_reports has it without a policy (service role only);
 *  - a permissive policy that reaches anon (role anon or public) with USING (true) or WITH CHECK (true)
 *    exists only for SELECT, on the course catalog and on the tables that /torneo/[slug] and
 *    /api/ronda-libre/[codigo]/live read without a session;
 *  - ronda_libre_jugadores.telefono_invitado is readable only by service_role
 *    (20261013_rls_match_pairings_telefono_invitado.sql, applied on 2026-10-13, PR #542).
 * And the other side: anon keeps reading those tables and every other column of
 * ronda_libre_jugadores, or the public views break.
 *
 * Read only. Skipped without the service role key.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSql } from '../helpers/prod-sql'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const CATALOG_TABLES = [
  'categories', 'cerebro_weights', 'course_holes', 'course_tees', 'courses', 'flights', 'golf_rules',
  'external_priors_amateur_benchmarks', 'external_priors_course_norms', 'external_priors_handicap_dist',
]
const PUBLIC_VIEW_TABLES = [
  'hole_scores', 'players', 'rounds', 'tournament_groups', 'tournament_group_players',
  'rondas_libres', 'ronda_libre_jugadores', 'ronda_equipos', 'ronda_equipo_jugadores',
]
const RLS_WITHOUT_POLICY = ['inbox_reports']
const PRIVATE_COLUMN = 'telefono_invitado'

type Policy = { table: string; policy: string; cmd: string }

describe.skipIf(!url || !serviceKey)('RLS in public and unfiltered anon reads', () => {
  let service: SupabaseClient
  let unfiltered: Policy[]

  beforeAll(async () => {
    service = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    unfiltered = await execSql<Policy>(
      service,
      `select tablename as table, policyname as policy, cmd from pg_policies
       where schemaname = 'public' and permissive = 'PERMISSIVE'
         and roles && array['anon', 'public']::name[]
         and (qual = 'true' or with_check = 'true')
       order by 1, 2`,
    )
  })

  it('every table in public has RLS', async () => {
    const tables = await execSql<{ table: string }>(
      service,
      `select relname as table from pg_class
       where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') and not relrowsecurity`,
    )
    expect(tables).toEqual([])
  })

  it(`only ${RLS_WITHOUT_POLICY.join(', ')} has RLS without a policy`, async () => {
    const tables = await execSql<{ table: string }>(
      service,
      `select c.relname as table from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relrowsecurity
         and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
       order by 1`,
    )
    expect(tables.map(t => t.table)).toEqual(RLS_WITHOUT_POLICY)
  })

  it('anon reaches an unfiltered policy only for SELECT on the catalog and the public views', () => {
    const allowed = new Set([...CATALOG_TABLES, ...PUBLIC_VIEW_TABLES])
    expect(unfiltered.filter(p => p.cmd !== 'SELECT' || !allowed.has(p.table))).toEqual([])
  })

  it.each(PUBLIC_VIEW_TABLES)('anon still reads %s (public views)', async table => {
    expect(unfiltered.some(p => p.table === table && p.cmd === 'SELECT')).toBe(true)
    const [row] = await execSql<{ readable: boolean }>(
      service,
      `select has_any_column_privilege('anon', 'public.${table}', 'SELECT') as readable`,
    )
    expect(row.readable).toBe(true)
  })

  it.each(['anon', 'authenticated', 'service_role'])(
    `%s: ronda_libre_jugadores.${PRIVATE_COLUMN} only for service_role, every other column readable`,
    async role => {
      const columns = await execSql<{ column: string; readable: boolean }>(
        service,
        `select column_name as column,
                has_column_privilege('${role}', 'public.ronda_libre_jugadores', column_name, 'SELECT') as readable
         from information_schema.columns
         where table_schema = 'public' and table_name = 'ronda_libre_jugadores'`,
      )
      expect(columns.map(c => c.column)).toContain(PRIVATE_COLUMN)
      const expected = (column: string) => role === 'service_role' || column !== PRIVATE_COLUMN
      expect(columns.filter(c => c.readable !== expected(c.column))).toEqual([])
    },
  )
})
