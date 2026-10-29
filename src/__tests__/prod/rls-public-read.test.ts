/**
 * Prod canary: RLS in public and the policies that let anon read without a filter.
 *
 * Pins the state classified on 2026-10-13:
 *  - every table in public has RLS, and only the tables in RLS_WITHOUT_POLICY have it without a policy (service role only);
 *  - a permissive policy that reaches anon (role anon or public) with USING (true) or WITH CHECK (true)
 *    exists only for SELECT, on the course catalog and on the tables that /torneo/[slug] and
 *    /api/ronda-libre/[codigo]/live read without a session;
 *  - the private columns of ronda_libre_jugadores (RONDA_LIBRE_JUGADORES_PRIVATE_COLUMNS: telefono_invitado
 *    since 20261013000000, PR #542; perfil_sugerido_id since 20261026120000) are readable only by
 *    service_role. A private column that does not exist yet in prod is not required, so this passes
 *    before and after its migration is applied; telefono_invitado must exist.
 * And on each of those tables anon reads exactly the columns of ANON_COLUMNS
 * (20261027120000_anon_columnas_vistas_publicas): one fewer breaks the public views, one more is readable
 * without a session. authenticated keeps every other column of ronda_libre_jugadores.
 *
 * Read only. Skipped without the service role key.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSql } from '../helpers/prod-sql'
import { ANON_COLUMNS, RONDA_LIBRE_JUGADORES_PRIVATE_COLUMNS } from '../helpers/migration-sql'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const CATALOG_TABLES = [
  'categories', 'cerebro_weights', 'course_holes', 'course_tees', 'courses', 'flights', 'golf_rules',
  'external_priors_amateur_benchmarks', 'external_priors_course_norms', 'external_priors_handicap_dist',
]
const PUBLIC_VIEW_TABLES = Object.keys(ANON_COLUMNS)
// rate_limit_hits: privada (20261019200000), solo la toca la RPC SECURITY DEFINER rate_limit_hit.
// ronda_libre_scores_orden y ronda_equipos_scores_orden: privadas (20261020190000 y 20261020200000), solo las tocan
// las RPC upsert_ronda_libre_scores y upsert_ronda_equipos_scores.
// ronda_libre_juego_orden, ronda_libre_puntitos y ronda_libre_retiros: privadas (20261027180000, Timba libre), solo
// las tocan las RPC marcar_puntito_ronda_libre y marcar_retiro_ronda_libre; la lectura va por la API con service role.
const RLS_WITHOUT_POLICY = [
  'inbox_reports', 'rate_limit_hits', 'ronda_equipos_scores_orden', 'ronda_libre_juego_orden', 'ronda_libre_puntitos',
  'ronda_libre_retiros', 'ronda_libre_scores_orden',
]

type Policy = { table: string; policy: string; cmd: string }
type ColumnPrivilege = { column: string; readable: boolean }

const columnPrivileges = (service: SupabaseClient, role: string, table: string) =>
  execSql<ColumnPrivilege>(
    service,
    `select column_name as column,
            has_column_privilege('${role}', 'public.${table}', column_name, 'SELECT') as readable
     from information_schema.columns
     where table_schema = 'public' and table_name = '${table}'`,
  )

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

  it.each(Object.entries(ANON_COLUMNS))('anon reads exactly the public-view columns of %s', async (table, columns) => {
    const readable = (await columnPrivileges(service, 'anon', table)).filter(c => c.readable).map(c => c.column)
    expect(readable.sort()).toEqual([...columns].sort())
  })

  it.each(['authenticated', 'service_role'])(
    `%s: ronda_libre_jugadores private columns only for service_role, every other column readable`,
    async role => {
      const columns = await columnPrivileges(service, role, 'ronda_libre_jugadores')
      expect(columns.map(c => c.column)).toContain('telefono_invitado')
      const expected = (column: string) => role === 'service_role' || !RONDA_LIBRE_JUGADORES_PRIVATE_COLUMNS.includes(column)
      expect(columns.filter(c => c.readable !== expected(c.column))).toEqual([])
    },
  )
})
