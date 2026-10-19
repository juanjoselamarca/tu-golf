/**
 * Canary: every table, view or function a migration creates states who can use it.
 *
 * Since 20261014030000 (privado_por_defecto, now in the baseline), what postgres creates in public is
 * born without privileges for PUBLIC, anon and authenticated. A forgotten GRANT breaks the feature
 * with 42501; this canary catches it in CI instead of in prod.
 *
 * Fails if a migration after the baseline creates a table, view or function in public without,
 * after its last CREATE in the same file, a GRANT on it to a client role or a REVOKE from PUBLIC,
 * anon and authenticated (private). CREATE OR REPLACE counts too, so a DROP + CREATE cannot drop
 * the ACL unnoticed. A table with a serial column that grants INSERT to a client role also grants
 * USAGE, UPDATE or ALL on that column's sequence (<table>_<column>_seq) to the same role. Also fails
 * on a GRANT on ALL ... IN SCHEMA public or an ALTER DEFAULT PRIVILEGES that grants to a client
 * role. Not detected: names built with format() or a variable, procedures, ON ROUTINE, a serial
 * column added by ALTER TABLE, and an explicit CREATE SEQUENCE or DEFAULT nextval(). A sequence grant
 * must say ON SEQUENCE.
 */
import { describe, it, expect } from 'vitest'
import { BASELINE, CLIENT_ROLES, migrationFiles, readMigration, sqlIdentifier, stripSqlComments } from './helpers/migration-sql'

const CREATES =
  /create\s+(?:or\s+replace\s+)?(?:(?:unlogged|materialized|recursive)\s+)?(table|view|function)\s+(?:if\s+not\s+exists\s+)?(?:"?(\w+)"?\s*\.\s*)?"?(\w+)"?/gi
const SERIAL_COLUMNS = /[(,]\s*"?(\w+)"?\s+(?:small|big)?serial[248]?\b/gi
const ALL_IN_PUBLIC = String.raw`all\s+(?:tables|sequences|functions)\s+in\s+schema\s+"?public"?(?!\w)`
const REOPENS = [
  new RegExp(String.raw`grant\s[^;]*?\bon\s+${ALL_IN_PUBLIC}[^;]*?\bto\s+([^;]*)`, 'gi'),
  new RegExp(String.raw`alter\s+default\s+privileges\b[^;]*?\bgrant\b[^;]*?\bto\s+([^;]*)`, 'gi'),
]

const clientRoles = (list: string) =>
  list
    .split(',')
    .map(item => item.trim().match(/^"?(\w+)/)?.[1].toLowerCase() ?? '')
    .filter(role => CLIENT_ROLES.includes(role))

/** GRANT ... TO / REVOKE ... FROM statements on the object that start at or after `from`, with their client roles. */
function statements(sql: string, verb: 'grant' | 'revoke', kind: string, name: string, from: number) {
  const keyword = kind === 'function' ? 'function' : 'table'
  const target = String.raw`on\s+(?:(?:${keyword}\s+)?[^;]*?(?<![\w."])${sqlIdentifier(name)}${verb === 'revoke' ? `|${ALL_IN_PUBLIC}` : ''})`
  const statement = new RegExp(String.raw`${verb}\s+([^;]*?)\b${target}[^;]*?\b${verb === 'grant' ? 'to' : 'from'}\s+([^;]*)`, 'gi')
  return [...sql.matchAll(statement)].filter(m => m.index >= from).map(m => ({ privileges: m[1], roles: clientRoles(m[2]) }))
}

/** Client roles granted USAGE, UPDATE or ALL on the sequence at or after `from`. */
function sequenceGrantees(sql: string, sequence: string, from: number): Set<string> {
  const statement = new RegExp(
    String.raw`grant\s[^;]*?\b(?:usage|update|all)\b[^;]*?\bon\s+sequence\s[^;]*?(?<![\w."])${sqlIdentifier(sequence)}[^;]*?\bto\s+([^;]*)`,
    'gi',
  )
  return new Set([...sql.matchAll(statement)].filter(m => m.index >= from).flatMap(m => clientRoles(m[1])))
}

function violations(sql: string): string[] {
  const clean = stripSqlComments(sql)
  const errors = REOPENS.flatMap(re => [...clean.matchAll(re)].flatMap(m => clientRoles(m[1]))).map(
    role => `grants ${role} on future or all objects of public`,
  )
  const lastCreate = new Map<string, { kind: string; index: number }>()
  for (const m of clean.matchAll(CREATES)) {
    if (m[2] && m[2].toLowerCase() !== 'public') continue
    lastCreate.set(`${m[1].toLowerCase()} ${m[3].toLowerCase()}`, { kind: m[1].toLowerCase(), index: m.index })
  }
  for (const [object, { kind, index }] of lastCreate) {
    const name = object.split(' ')[1]
    const granted = statements(clean, 'grant', kind, name, index).filter(s => s.roles.length)
    if (granted.length) {
      const inserters = new Set(granted.filter(s => /\b(?:insert|all)\b/i.test(s.privileges)).flatMap(s => s.roles))
      const columns = kind === 'table' ? [...clean.slice(index).match(/^[^;]*/)![0].matchAll(SERIAL_COLUMNS)] : []
      for (const sequence of columns.map(m => `${name}_${m[1].toLowerCase()}_seq`)) {
        const users = sequenceGrantees(clean, sequence, index)
        const missing = [...inserters].filter(role => !users.has(role) && !users.has('public'))
        if (missing.length) errors.push(`grants INSERT on ${name} to ${missing.join(', ')} without GRANT USAGE on ${sequence}`)
      }
      continue
    }
    const revoked = new Set(statements(clean, 'revoke', kind, name, index).flatMap(s => s.roles))
    if (CLIENT_ROLES.every(role => revoked.has(role))) continue
    errors.push(`creates ${object} without GRANT to a client role or REVOKE from ${CLIENT_ROLES.join(', ')}`)
  }
  return errors
}

describe('canary: new objects in public state their privileges', () => {
  it('detects missing declarations and reopened defaults (detector guard)', () => {
    const table = 'CREATE TABLE IF NOT EXISTS public.puntajes (id uuid PRIMARY KEY, n int);'
    const fn = 'CREATE OR REPLACE FUNCTION public.calcular(x int) RETURNS int LANGUAGE sql AS $$ SELECT x $$;'
    expect(violations(table)).toEqual([
      'creates table puntajes without GRANT to a client role or REVOKE from public, anon, authenticated',
    ])
    expect(violations(`${table}\nGRANT SELECT ON public.puntajes TO authenticated;`)).toEqual([])
    expect(violations(`${table}\nGRANT SELECT (id, n) ON TABLE "public"."puntajes" TO anon, authenticated;`)).toEqual([])
    expect(violations(`${table}\nGRANT SELECT ON public.otra, public.puntajes TO authenticated;`)).toEqual([])
    expect(violations(`${table}\nREVOKE ALL ON public.puntajes FROM PUBLIC, anon, authenticated;`)).toEqual([])
    expect(violations(`${table}\nREVOKE ALL ON public.puntajes FROM anon, authenticated;`)).toHaveLength(1)
    expect(violations(`${table}\nGRANT SELECT ON public.puntajes_v2 TO authenticated;`)).toHaveLength(1)
    expect(violations(`${table}\nGRANT SELECT ON otro.puntajes TO authenticated;`)).toHaveLength(1)
    expect(violations(`${table}\nGRANT ALL ON public.puntajes TO service_role;`)).toHaveLength(1)
    expect(violations(`${table}\n-- GRANT SELECT ON public.puntajes TO authenticated;`)).toHaveLength(1)
    expect(violations(`GRANT SELECT ON public.puntajes TO authenticated;\nDROP TABLE public.puntajes;\n${table}`)).toHaveLength(1)
    expect(violations('CREATE TABLE auditoria.eventos (id int);')).toEqual([])
    const serial = 'CREATE TABLE public.notas (id bigserial PRIMARY KEY, texto text);'
    const usage = 'GRANT USAGE ON SEQUENCE public.notas_id_seq TO authenticated;'
    expect(violations(`${serial}\nGRANT SELECT, INSERT ON public.notas TO authenticated;`)).toEqual([
      'grants INSERT on notas to authenticated without GRANT USAGE on notas_id_seq',
    ])
    expect(violations(`${serial}\nGRANT ALL ON public.notas TO authenticated;`)).toHaveLength(1)
    expect(violations(`${serial}\nGRANT INSERT ON public.notas TO authenticated;\n${usage}`)).toEqual([])
    expect(violations(`${serial}\nGRANT INSERT ON public.notas TO authenticated;\nGRANT SELECT, UPDATE ON SEQUENCE notas_id_seq TO authenticated;`)).toEqual([])
    expect(violations(`${serial}\nGRANT INSERT ON public.notas TO anon, authenticated;\n${usage}`)).toEqual([
      'grants INSERT on notas to anon without GRANT USAGE on notas_id_seq',
    ])
    const otra = 'CREATE TABLE public.notas_extra (id serial, n int);\nGRANT INSERT ON public.notas_extra TO authenticated;'
    expect(violations(`${serial}\nGRANT INSERT ON public.notas TO authenticated;\n${usage}\n${otra}`)).toEqual([
      'grants INSERT on notas_extra to authenticated without GRANT USAGE on notas_extra_id_seq',
    ])
    expect(violations(`${serial}\nGRANT SELECT ON public.notas TO anon;`)).toEqual([])
    expect(violations(`${serial}\nREVOKE ALL ON public.notas FROM PUBLIC, anon, authenticated;`)).toEqual([])
    expect(violations('CREATE TEMP TABLE tmp_x (id int);')).toEqual([])
    expect(violations('CREATE MATERIALIZED VIEW public.resumen AS SELECT 1;')).toHaveLength(1)
    expect(violations('CREATE OR REPLACE VIEW resumen AS SELECT 1;\nGRANT SELECT ON resumen TO anon;')).toEqual([])

    expect(violations(fn)).toEqual([
      'creates function calcular without GRANT to a client role or REVOKE from public, anon, authenticated',
    ])
    expect(violations(`${fn}\nGRANT EXECUTE ON FUNCTION public.calcular(int) TO authenticated;`)).toEqual([])
    expect(violations(`${fn}\nREVOKE ALL ON FUNCTION calcular(int) FROM PUBLIC;\nREVOKE EXECUTE ON FUNCTION calcular FROM anon, authenticated;`)).toEqual([])
    expect(violations(`${fn}\nREVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;`)).toEqual([])
    expect(violations(`DO $$ BEGIN EXECUTE '${fn.replaceAll('$$', '$f$')}'; END $$;`)).toHaveLength(1)
    expect(violations('CREATE TRIGGER t AFTER INSERT ON public.puntajes FOR EACH ROW EXECUTE FUNCTION public.calcular();')).toEqual([])

    expect(violations('GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;')).toHaveLength(2)
    expect(violations('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;')).toHaveLength(1)
    expect(violations('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC;')).toHaveLength(1)
    expect(violations('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;')).toEqual([])
    expect(violations('GRANT SELECT ON ALL TABLES IN SCHEMA extensions TO anon;')).toEqual([])
  })

  it('every migration after the baseline declares the privileges of what it creates', () => {
    const errors = migrationFiles()
      .filter(f => f > BASELINE)
      .flatMap(f => violations(readMigration(f)).map(v => `${f}: ${v}`))
    expect(errors).toEqual([])
  })
})
