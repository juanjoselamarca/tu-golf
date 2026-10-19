/**
 * Canary: SELECT for anon/authenticated is column-level on the tables that hide columns.
 *
 * Since 20261009000000_profiles_hide_private_columns.sql the session cannot read the private
 * columns of profiles (email, fecha_nacimiento), and since
 * 20261013000000_rls_match_pairings_telefono_invitado.sql those of ronda_libre_jugadores
 * (telefono_invitado), and since 20261016030000_players_hide_pending_user_id.sql that of
 * players (pending_user_id, the tournament guest's credential). This setup broke once before: in September coach_access_enabled
 * was created without a grant, the app got 42501 and the fix (#357) reopened SELECT on
 * the whole table, email included.
 *
 * Fails if a migration adds a column to one of these tables without its GRANT SELECT (col)
 * TO authenticated in the same file (unless it is private), grants SELECT on a private
 * column, or grants table-level SELECT on the table again. Every migration is scanned
 * (the numeric series sorts before the base one) except the legacy ones that already
 * broke the rule. Private columns are read from each base migration.
 */
import { describe, it, expect } from 'vitest'
import {
  CLIENT_ROLES,
  migrationFiles,
  readMigration,
  sqlAllInSchemaPublic,
  sqlIdentifier,
  stripSqlComments,
} from './helpers/migration-sql'

const CLIENT_GRANTEE = new RegExp(String.raw`\b(?:${CLIENT_ROLES.join('|')})\b`, 'i')
const NOT_COLUMNS = ['constraint', 'primary', 'unique', 'check', 'foreign', 'exclude']
const PROFILES_LEGACY = [
  '20260319234332_import_and_cpi.sql',
  '20260330205538_indice_dual_y_niveles.sql',
  '20260325000000_add_metadata_columns.sql',
  '20260527000000_cerebro_v3_observability.sql',
  '20260602000000_cerebro_v3_ola2_conocer.sql',
  '20260608000000_profiles_default_tee_color.sql',
  '20260609000000_profiles_genero.sql',
  '20260906000000_coach_access_enabled.sql',
  '20260910000000_grant_select_profiles.sql',
  '20260914000000_billing_subscription_columns.sql',
]
const TABLES = [
  { table: 'profiles', base: '20261009000000_profiles_hide_private_columns.sql', legacy: PROFILES_LEGACY },
  {
    table: 'ronda_libre_jugadores',
    base: '20261013000000_rls_match_pairings_telefono_invitado.sql',
    legacy: ['20260331170618_handicap_ronda_libre_jugadores.sql', '20260415131628_tee_por_jugador.sql'],
  },
  {
    table: 'players',
    base: '20261016030000_players_hide_pending_user_id.sql',
    legacy: [
      '20260415131628_tee_por_jugador.sql',
      '20260415154209_wd_dq_players.sql',
      '20260423051015_players_pending_user_id.sql',
      '20260527000001_players_tee_id.sql',
      '20260925000001_players_genero_tournament_rounds_ajustes.sql',
    ],
  },
]

function violations(sql: string, table: string, privateColumns: string[]): string[] {
  const target = sqlIdentifier(table)
  const columnGrant = new RegExp(String.raw`grant\s+select\s*\(([^)]*)\)\s*on\s+(?:table\s+)?${target}\s+to\s+([^;]*)`, 'gi')
  const clean = stripSqlComments(sql)
  const granted = new Set<string>()
  const errors: string[] = []
  for (const [, columns, grantees] of clean.matchAll(columnGrant)) {
    if (!CLIENT_GRANTEE.test(grantees)) continue
    for (const col of columns.split(',').map(c => c.trim().replace(/"/g, '').toLowerCase())) {
      if (privateColumns.includes(col)) errors.push(`GRANT SELECT (${col}) reopens a private column`)
      else if (/\bauthenticated\b/i.test(grantees)) granted.add(col)
    }
  }

  for (const alter of clean.matchAll(new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${target}\s([^;]*)`, 'gi')))
    for (const add of alter[1].matchAll(/\badd\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi)) {
      const col = add[1].toLowerCase()
      if (NOT_COLUMNS.includes(col) || privateColumns.includes(col) || granted.has(col)) continue
      errors.push(`column ${col} without GRANT SELECT (${col}) ON public.${table}`)
    }

  const tableGrant = new RegExp(
    String.raw`grant\s+[\w\s,]*?\b(?:select|all)\b[\w\s,]*?\bon\s+(?:(?:table\s+)?${target}|${sqlAllInSchemaPublic('tables')})`,
    'i',
  )
  if (tableGrant.test(clean)) errors.push(`table-level GRANT reopens SELECT on ${table}`)
  return errors
}

const privateColumnsOf = (base: string) =>
  (readMigration(base).match(/private_columns\s+text\[\]\s*:=\s*ARRAY\[([^\]]+)\]/i)?.[1] ?? '')
    .split(',')
    .map(c => c.trim().replace(/'/g, ''))
    .filter(Boolean)

describe('canary: column-level SELECT on profiles', () => {
  const privateColumns = privateColumnsOf('20261009000000_profiles_hide_private_columns.sql')
  const v = (sql: string) => violations(sql, 'profiles', privateColumns)

  it('reads the private columns from the base migration', () => {
    expect(privateColumns).toContain('email')
  })

  it('detects a column without GRANT and a table-level GRANT (detector guard)', () => {
    expect(v('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan text;')).toHaveLength(1)
    expect(v('ALTER TABLE profiles ADD COLUMN plan text, ADD COLUMN tier text;')).toHaveLength(2)
    expect(v('ALTER TABLE profiles ADD COLUMN plan text;\nGRANT SELECT (plan) ON public.profiles TO anon, authenticated;')).toEqual([])
    expect(v('ALTER TABLE profiles ADD COLUMN email_2 text; -- GRANT SELECT (email_2) ON profiles')).toHaveLength(1)
    expect(v('ALTER TABLE profiles ADD CONSTRAINT x CHECK (true);')).toEqual([])
    expect(v('ALTER TABLE profiles_x ADD COLUMN plan text;')).toEqual([])
    expect(v('GRANT SELECT ON public.profiles TO anon, authenticated;')).toHaveLength(1)
    expect(v('GRANT SELECT, UPDATE ON TABLE profiles TO authenticated;')).toHaveLength(1)
    expect(v('GRANT SELECT ON "public"."profiles" TO anon;')).toHaveLength(1)
    expect(v('GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;')).toHaveLength(1)
    expect(v('GRANT SELECT ON ALL TABLES IN SCHEMA "public" TO anon;')).toHaveLength(1)
    expect(v('GRANT SELECT ON ALL TABLES IN SCHEMA public_v2 TO anon;')).toEqual([])
    expect(v('GRANT UPDATE (name) ON public.profiles TO authenticated;')).toEqual([])
    expect(v('GRANT SELECT (email) ON public.profiles TO authenticated;')).toHaveLength(1)
    expect(v('GRANT SELECT (id, fecha_nacimiento) ON profiles TO anon;')).toHaveLength(1)
    expect(v('ALTER TABLE profiles ADD COLUMN plan text;\nGRANT SELECT (plan) ON profiles TO service_role;')).toHaveLength(1)
  })
})

describe('canary: column-level SELECT on ronda_libre_jugadores', () => {
  const privateColumns = privateColumnsOf('20261013000000_rls_match_pairings_telefono_invitado.sql')
  const v = (sql: string) => violations(sql, 'ronda_libre_jugadores', privateColumns)

  it('reads the private columns from the base migration', () => {
    expect(privateColumns).toEqual(['telefono_invitado'])
  })

  it('detects a column without GRANT, a private GRANT and a table-level GRANT (detector guard)', () => {
    expect(v('ALTER TABLE public.ronda_libre_jugadores ADD COLUMN posicion int;')).toHaveLength(1)
    expect(v('ALTER TABLE ronda_libre_jugadores ADD COLUMN posicion int;\nGRANT SELECT (posicion) ON public.ronda_libre_jugadores TO anon, authenticated;')).toEqual([])
    expect(v('GRANT SELECT (telefono_invitado) ON public.ronda_libre_jugadores TO authenticated;')).toHaveLength(1)
    expect(v('GRANT SELECT ON public.ronda_libre_jugadores TO anon;')).toHaveLength(1)
    expect(v('GRANT SELECT ON public.rondas_libres TO anon;')).toEqual([])
  })
})

describe.each(TABLES)('canary: no migration reopens $table', ({ table, base, legacy }) => {
  it('every migration keeps SELECT column-level', () => {
    const privateColumns = privateColumnsOf(base)
    const errors = migrationFiles(legacy).flatMap(f =>
      violations(readMigration(f), table, privateColumns).map(e => `${f}: ${e}`),
    )
    expect(errors).toEqual([])
  })
})
