/**
 * Canary: SELECT on `profiles` for anon/authenticated is column-level.
 *
 * Since 20261009_profiles_hide_private_columns.sql the session cannot read the private
 * columns (email, fecha_nacimiento). This setup broke once before: in September
 * coach_access_enabled was created without a grant, the app got 42501 and the fix
 * (#357) reopened SELECT on the whole table, email included.
 *
 * Fails if a migration adds a column to profiles without its GRANT SELECT (col) TO
 * authenticated in the same file (unless it is private), grants SELECT on a private
 * column, or grants table-level SELECT on profiles again. Every migration is scanned
 * (the numeric series sorts before the base one) except the legacy ones that already
 * broke the rule. Private columns are read from the base migration.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const DIR = path.resolve(process.cwd(), 'supabase', 'migrations')
const BASE = '20261009_profiles_hide_private_columns.sql'
const PROFILES = String.raw`(?:public\.)?"?profiles"?(?!\w)`
const NOT_COLUMNS = ['constraint', 'primary', 'unique', 'check', 'foreign', 'exclude']
const COLUMN_GRANT = new RegExp(String.raw`grant\s+select\s*\(([^)]*)\)\s*on\s+(?:table\s+)?${PROFILES}\s+to\s+([^;]*)`, 'gi')
const LEGACY = [
  '004_import_and_cpi.sql',
  '010_indice_dual_y_niveles.sql',
  '20260325_add_metadata_columns.sql',
  '20260527_cerebro_v3_observability.sql',
  '20260602_cerebro_v3_ola2_conocer.sql',
  '20260608_profiles_default_tee_color.sql',
  '20260609_profiles_genero.sql',
  '20260906_coach_access_enabled.sql',
  '20260910_grant_select_profiles.sql',
  '20260914_billing_subscription_columns.sql',
]

function violations(sql: string, privateColumns: string[]): string[] {
  const clean = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const granted = new Set<string>()
  const errors: string[] = []
  for (const [, columns, grantees] of clean.matchAll(COLUMN_GRANT)) {
    if (!/\b(anon|authenticated|public)\b/i.test(grantees)) continue
    for (const col of columns.split(',').map(c => c.trim().replace(/"/g, '').toLowerCase())) {
      if (privateColumns.includes(col)) errors.push(`GRANT SELECT (${col}) reopens a private column`)
      else if (/\bauthenticated\b/i.test(grantees)) granted.add(col)
    }
  }

  for (const alter of clean.matchAll(new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${PROFILES}\s([^;]*)`, 'gi')))
    for (const add of alter[1].matchAll(/\badd\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi)) {
      const col = add[1].toLowerCase()
      if (NOT_COLUMNS.includes(col) || privateColumns.includes(col) || granted.has(col)) continue
      errors.push(`column ${col} without GRANT SELECT (${col}) ON public.profiles`)
    }

  const tableGrant = new RegExp(
    String.raw`grant\s+[\w\s,]*?\b(?:select|all)\b[\w\s,]*?\bon\s+(?:(?:table\s+)?${PROFILES}|all\s+tables\s+in\s+schema\s+public\b)`,
    'i',
  )
  if (tableGrant.test(clean)) errors.push('table-level GRANT reopens SELECT on profiles')
  return errors
}

const privateColumns = (readFileSync(path.join(DIR, BASE), 'utf8').match(/private_columns\s+text\[\]\s*:=\s*ARRAY\[([^\]]+)\]/i)?.[1] ?? '')
  .split(',')
  .map(c => c.trim().replace(/'/g, ''))
  .filter(Boolean)

describe('canary: column-level SELECT on profiles', () => {
  it('reads the private columns from the base migration', () => {
    expect(privateColumns).toContain('email')
  })

  it('detects a column without GRANT and a table-level GRANT (detector guard)', () => {
    expect(violations('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan text;', privateColumns)).toHaveLength(1)
    expect(violations('ALTER TABLE profiles ADD COLUMN plan text, ADD COLUMN tier text;', privateColumns)).toHaveLength(2)
    expect(violations('ALTER TABLE profiles ADD COLUMN plan text;\nGRANT SELECT (plan) ON public.profiles TO anon, authenticated;', privateColumns)).toEqual([])
    expect(violations('ALTER TABLE profiles ADD COLUMN email_2 text; -- GRANT SELECT (email_2) ON profiles', privateColumns)).toHaveLength(1)
    expect(violations('ALTER TABLE profiles ADD CONSTRAINT x CHECK (true);', privateColumns)).toEqual([])
    expect(violations('ALTER TABLE profiles_x ADD COLUMN plan text;', privateColumns)).toEqual([])
    expect(violations('GRANT SELECT ON public.profiles TO anon, authenticated;', privateColumns)).toHaveLength(1)
    expect(violations('GRANT SELECT, UPDATE ON TABLE profiles TO authenticated;', privateColumns)).toHaveLength(1)
    expect(violations('GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;', privateColumns)).toHaveLength(1)
    expect(violations('GRANT UPDATE (name) ON public.profiles TO authenticated;', privateColumns)).toEqual([])
    expect(violations('GRANT SELECT (email) ON public.profiles TO authenticated;', privateColumns)).toHaveLength(1)
    expect(violations('GRANT SELECT (id, fecha_nacimiento) ON profiles TO anon;', privateColumns)).toHaveLength(1)
    expect(violations('ALTER TABLE profiles ADD COLUMN plan text;\nGRANT SELECT (plan) ON profiles TO service_role;', privateColumns)).toHaveLength(1)
  })

  it('no migration reopens profiles', () => {
    const current = readdirSync(DIR).filter(f => f.endsWith('.sql') && !LEGACY.includes(f))
    const errors = current.flatMap(f =>
      violations(readFileSync(path.join(DIR, f), 'utf8'), privateColumns).map(v => `${f}: ${v}`),
    )
    expect(errors).toEqual([])
  })
})
