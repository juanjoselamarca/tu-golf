/**
 * Canary: SELECT for anon/authenticated is column-level on the tables that hide columns.
 *
 * Since 20261009000000_profiles_hide_private_columns.sql the session cannot read the private
 * columns of profiles (email, fecha_nacimiento), and since
 * 20261013000000_rls_match_pairings_telefono_invitado.sql those of ronda_libre_jugadores
 * (telefono_invitado). This setup broke once before: in September coach_access_enabled
 * was created without a grant, the app got 42501 and the fix (#357) reopened SELECT on
 * the whole table, email included.
 *
 * Fails if a migration adds a column to one of these tables without its GRANT SELECT (col)
 * TO authenticated in the same file (unless it is private), grants SELECT on a private
 * column, or grants table-level SELECT on the table to a client role again. Every migration
 * is scanned, the baseline included. Private columns are the ones the baseline does not
 * grant SELECT on to authenticated, plus the ones a migration declares private with
 * REVOKE SELECT (col) ON <table> FROM anon, authenticated (a new column nobody on the client
 * should read, e.g. ronda_libre_jugadores.perfil_sugerido_id). The REVOKE is a no-op in
 * Postgres; it is the explicit, reviewable statement that the missing GRANT is on purpose.
 */
import { describe, it, expect } from 'vitest'
import {
  BASELINE,
  CLIENT_ROLES,
  RONDA_LIBRE_JUGADORES_PRIVATE_COLUMNS,
  migrationFiles,
  readMigration,
  sqlAllInSchemaPublic,
  sqlIdentifier,
  sqlStatements,
  stripSqlComments,
} from './helpers/migration-sql'

const CLIENT_GRANTEE = new RegExp(String.raw`\b(?:${CLIENT_ROLES.join('|')})\b`, 'i')
const NOT_COLUMNS = ['constraint', 'primary', 'unique', 'check', 'foreign', 'exclude']

const columnList = (cols: string) => cols.split(',').map(c => c.trim().replace(/"/g, '').toLowerCase())

/**
 * Columns this migration declares private: REVOKE SELECT (cols) ON <table> FROM a list that names
 * both client roles that read through PostgREST (anon and authenticated). A REVOKE from any other
 * role (service_role, postgres) or from only one of them declares nothing.
 */
function declaredPrivate(sql: string, table: string): string[] {
  const revoke = new RegExp(String.raw`revoke\s+select\s*\(([^)]*)\)\s*on\s+(?:table\s+)?${sqlIdentifier(table)}\s+from\s+([^;]*)`, 'gi')
  return [...stripSqlComments(sql).matchAll(revoke)]
    .filter(([, , grantees]) => /\banon\b/i.test(grantees) && /\bauthenticated\b/i.test(grantees))
    .flatMap(([, columns]) => columnList(columns))
}

/**
 * Every GRANT that gives SELECT on `table` (or on ALL TABLES IN SCHEMA public), read from the privilege
 * list between GRANT and ON: `select` or `all [privileges]` without columns is table-level
 * (`columns: null`), with (cols) it is column-level. So `GRANT SELECT, UPDATE (x)`, `GRANT ALL (col)` and
 * `GRANT UPDATE (x), SELECT (col)` are all seen. Statements inside function and DO bodies count too.
 */
function selectGrants(clean: string, table: string): { columns: string[] | null; grantees: string }[] {
  const onTable = new RegExp(String.raw`^(?:table\s+)?${sqlIdentifier(table)}$`, 'i')
  const allTables = new RegExp(String.raw`^${sqlAllInSchemaPublic('tables')}$`, 'i')
  const grants: { columns: string[] | null; grantees: string }[] = []
  for (const stmt of sqlStatements(clean, { insideBodies: true })) {
    const g = /\bgrant\s+([\s\S]*?)\s+on\s+([\s\S]*?)\s+to\s+([\s\S]*)$/i.exec(stmt)
    if (!g) continue
    const [, privileges, objects, grantees] = g
    if (!objects.split(',').map(o => o.trim()).some(o => onTable.test(o) || allTables.test(o))) continue
    for (const [, privilege, columns] of privileges.matchAll(/(\w+)(?:\s+privileges)?\s*(?:\(([^)]*)\))?/gi)) {
      if (!['select', 'all'].includes(privilege.toLowerCase())) continue
      grants.push({ columns: columns === undefined ? null : columnList(columns), grantees })
    }
  }
  return grants
}

function violations(sql: string, table: string, basePrivateColumns: string[]): string[] {
  const privateColumns = [...basePrivateColumns, ...declaredPrivate(sql, table)]
  const target = sqlIdentifier(table)
  const clean = stripSqlComments(sql)
  const granted = new Set<string>()
  const errors: string[] = []
  for (const { columns, grantees } of selectGrants(clean, table)) {
    if (!CLIENT_GRANTEE.test(grantees)) continue
    if (columns === null) {
      errors.push(`table-level GRANT reopens SELECT on ${table}`)
      continue
    }
    for (const col of columns) {
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
  return errors
}

type Migration = { file: string; sql: string }
const realMigrations = (): Migration[] => migrationFiles().map(file => ({ file, sql: readMigration(file) }))

function privateColumnsOf(table: string): string[] {
  const sql = readMigration(BASELINE)
  const columns = sql.match(new RegExp(String.raw`create table public\."${table}" \(\n([\s\S]*?)\n\);`))?.[1] ?? ''
  const granted = sql.match(new RegExp(String.raw`grant select \(([^)]*)\) on table public\."${table}" to authenticated;`, 'i'))?.[1] ?? ''
  return [...columns.matchAll(/^\s+"(\w+)"/gm)].map(m => m[1]).filter(c => !granted.includes(`"${c}"`)).sort()
}

/**
 * The private columns of `table` across ALL migrations: the baseline's plus every one declared private
 * by any migration. Global on purpose, so a GRANT in a later file cannot reopen what an earlier one closed.
 */
function globalPrivateColumns(table: string, migrations: Migration[] = realMigrations()): string[] {
  const declared = migrations.flatMap(m => declaredPrivate(m.sql, table))
  return [...new Set([...privateColumnsOf(table), ...declared])].sort()
}

/** The canary itself: every migration checked against the global private columns. */
function scan(table: string, migrations: Migration[] = realMigrations()): string[] {
  const privateColumns = globalPrivateColumns(table, migrations)
  return migrations.flatMap(m => violations(m.sql, table, privateColumns).map(e => `${m.file}: ${e}`))
}

describe('canary: column-level SELECT on profiles', () => {
  const privateColumns = privateColumnsOf('profiles')
  const v = (sql: string) => violations(sql, 'profiles', privateColumns)

  it('reads the private columns from the baseline', () => {
    expect(privateColumns).toEqual(['email', 'fecha_nacimiento'])
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
    expect(v('GRANT SELECT, UPDATE ON TABLE public."profiles" TO service_role, postgres;')).toEqual([])
    expect(v('GRANT SELECT ON public.profiles, public.otra TO anon;')).toHaveLength(1)
    // The privilege list is parsed: SELECT/ALL without columns is table-level wherever it sits.
    expect(v('GRANT SELECT, UPDATE (name) ON public.profiles TO authenticated;')).toHaveLength(1)
    expect(v('GRANT UPDATE (name), SELECT ON public.profiles TO authenticated;')).toHaveLength(1)
    expect(v('GRANT ALL PRIVILEGES ON TABLE profiles TO anon;')).toHaveLength(1)
    expect(v('GRANT ALL (email) ON public.profiles TO authenticated;')).toHaveLength(1)
    expect(v('GRANT UPDATE (name), SELECT (email) ON public.profiles TO authenticated;')).toHaveLength(1)
    expect(v('ALTER TABLE profiles ADD COLUMN plan text;\nGRANT ALL (plan) ON public.profiles TO authenticated;')).toEqual([])
    expect(v('ALTER TABLE profiles ADD COLUMN plan text;\nGRANT UPDATE (name), SELECT (plan) ON profiles TO authenticated;')).toEqual([])
    expect(v('GRANT UPDATE (name), INSERT (name) ON public.profiles TO authenticated;')).toEqual([])
    expect(v('DO $$ BEGIN GRANT SELECT ON public.profiles TO anon; END $$;')).toHaveLength(1)
    expect(v('GRANT EXECUTE ON FUNCTION public.profiles_x() TO authenticated;')).toEqual([])
  })
})

describe('canary: column-level SELECT on ronda_libre_jugadores', () => {
  const privateColumns = privateColumnsOf('ronda_libre_jugadores')
  const v = (sql: string) => violations(sql, 'ronda_libre_jugadores', privateColumns)

  it('reads the private columns from the baseline', () => {
    expect(privateColumns).toEqual(['telefono_invitado'])
  })

  it('detects a column without GRANT, a private GRANT and a table-level GRANT (detector guard)', () => {
    expect(v('ALTER TABLE public.ronda_libre_jugadores ADD COLUMN posicion int;')).toHaveLength(1)
    expect(v('ALTER TABLE ronda_libre_jugadores ADD COLUMN posicion int;\nGRANT SELECT (posicion) ON public.ronda_libre_jugadores TO anon, authenticated;')).toEqual([])
    expect(v('GRANT SELECT (telefono_invitado) ON public.ronda_libre_jugadores TO authenticated;')).toHaveLength(1)
    expect(v('GRANT SELECT ON public.ronda_libre_jugadores TO anon;')).toHaveLength(1)
    expect(v('GRANT SELECT ON public.rondas_libres TO anon;')).toEqual([])
  })

  it('a new column declared private with REVOKE needs no GRANT, and cannot be reopened (detector guard)', () => {
    const add = 'ALTER TABLE public.ronda_libre_jugadores ADD COLUMN IF NOT EXISTS sugerido uuid NULL;'
    const revoke = (from: string, tabla = 'public.ronda_libre_jugadores') => `${add}\nREVOKE SELECT (sugerido) ON ${tabla} FROM ${from};`
    // Counts: both client roles, with or without PUBLIC.
    expect(v(revoke('PUBLIC, anon, authenticated'))).toEqual([])
    expect(v(revoke('anon, authenticated'))).toEqual([])
    // Does not count: one client role only, non-client roles, another table, a commented-out REVOKE.
    expect(v(revoke('anon'))).toHaveLength(1)
    expect(v(revoke('PUBLIC'))).toHaveLength(1)
    expect(v(revoke('service_role, postgres'))).toHaveLength(1)
    expect(v(revoke('anon, authenticated', 'public.rondas_libres'))).toHaveLength(1)
    expect(v(`${add}\n-- REVOKE SELECT (sugerido) ON public.ronda_libre_jugadores FROM anon, authenticated;`)).toHaveLength(1)
    // Declared private, the same file cannot open it either.
    expect(v(`${revoke('anon, authenticated')}\nGRANT SELECT (sugerido) ON public.ronda_libre_jugadores TO authenticated;`)).toHaveLength(1)
  })

  it('pins the exact private columns: baseline plus the ones migrations declare', () => {
    expect(globalPrivateColumns('profiles')).toEqual(['email', 'fecha_nacimiento'])
    expect(globalPrivateColumns('ronda_libre_jugadores')).toEqual([...RONDA_LIBRE_JUGADORES_PRIVATE_COLUMNS].sort())
  })

  it('the private set is global: a GRANT in a later file reopening a declared column is caught', () => {
    const later = (sql: string) => scan('ronda_libre_jugadores', [...realMigrations(), { file: '20991231000000_later.sql', sql }])
    expect(later('GRANT SELECT (perfil_sugerido_id) ON public.ronda_libre_jugadores TO authenticated;')).toEqual([
      '20991231000000_later.sql: GRANT SELECT (perfil_sugerido_id) reopens a private column',
    ])
    expect(later('GRANT ALL (perfil_sugerido_id) ON ronda_libre_jugadores TO anon;')).toHaveLength(1)
    expect(later('GRANT UPDATE (nombre) ON public.ronda_libre_jugadores TO authenticated;')).toEqual([])
  })
})

describe.each(['profiles', 'ronda_libre_jugadores'])('canary: no migration reopens %s', table => {
  it('every migration keeps SELECT column-level', () => {
    expect(scan(table)).toEqual([])
  })
})
