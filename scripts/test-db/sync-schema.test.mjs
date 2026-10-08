import { describe, it, expect } from 'vitest'
import { generarDDL, huella, diferencias, EXTENSIONES_EXCLUIDAS } from './sync-schema.mjs'

/** Catálogo mínimo con la forma que devuelven las LECTURAS de sync-schema.mjs. */
function catalogo(extra = {}) {
  return {
    extensiones: [{ extname: 'pg_trgm', nspname: 'public' }, { extname: 'pg_net', nspname: 'public' }, { extname: 'pgcrypto', nspname: 'extensions' }],
    tiposRaros: [],
    relacionesRaras: [],
    enums: [{ typname: 'tier', etiquetas: ['free', "o'pro"] }],
    secuencias: [
      { relname: 't_n_seq', tipo: 'bigint', seqstart: 1, seqincrement: 1, seqmin: 1, seqmax: '9223372036854775807', seqcache: 1, seqcycle: false, deptype: 'a', tabla_duena: 't', columna_duena: 'n' },
      { relname: 't_id_seq', tipo: 'bigint', seqstart: 1, seqincrement: 1, seqmin: 1, seqmax: '9223372036854775807', seqcache: 1, seqcycle: false, deptype: 'i', tabla_duena: 't', columna_duena: 'id' },
    ],
    tablas: [{ relname: 't', rls: true, force_rls: false, relpersistence: 'p', relreplident: 'd', reloptions: null }],
    columnas: [
      { relname: 't', attnum: 1, attname: 'id', tipo: 'bigint', attnotnull: true, attidentity: 'a', attgenerated: '', expr: null, colacion: null },
      { relname: 't', attnum: 3, attname: 'n', tipo: 'bigint', attnotnull: true, attidentity: '', attgenerated: '', expr: "nextval('public.t_n_seq'::regclass)", colacion: null },
      { relname: 't', attnum: 4, attname: 'g', tipo: 'text', attnotnull: false, attidentity: '', attgenerated: 's', expr: 'lower(x)', colacion: null },
    ],
    constraints: [{ relname: 't', conname: 't_pkey', contype: 'p', def: 'PRIMARY KEY (id)' }],
    indices: [],
    funciones: [{ firma: 'public.f()', prokind: 'f', def: 'CREATE OR REPLACE FUNCTION public.f() RETURNS int LANGUAGE sql AS $$ select 1 $$' }],
    triggers: [{ tabla: 'auth.users', tgname: 'on_auth_user_created', tgenabled: 'O', def: 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.f()' }],
    policies: [{ tablename: 't', policyname: 'lee', permissive: 'PERMISSIVE', roles: ['authenticated'], cmd: 'SELECT', qual: 'true', with_check: null }],
    aclTablas: [{ relname: 't', relkind: 'r', grantee: 'authenticated', privilege_type: 'SELECT', is_grantable: false }],
    aclColumnas: [{ relname: 't', attname: 'n', grantee: 'anon', privilege_type: 'UPDATE', is_grantable: false }],
    aclFunciones: [{ firma: 'public.f()', grantee: 'service_role', privilege_type: 'EXECUTE', is_grantable: false }],
    aclTipos: [],
    aclDefault: [{ defaclobjtype: 'r', grantee: 'anon', privilege_type: 'SELECT', is_grantable: false }],
    buckets: [],
    ...extra,
  }
}

describe('generarDDL', () => {
  const ddl = generarDDL(catalogo(), [{ extname: 'pgcrypto', nspname: 'extensions' }])

  it('no recrea pg_cron/pg_net y recrea las extensiones de public', () => {
    expect(EXTENSIONES_EXCLUIDAS).toEqual(expect.arrayContaining(['pg_cron', 'pg_net']))
    expect(ddl).not.toMatch(/pg_net/)
    expect(ddl).toMatch(/create extension if not exists "pg_trgm" with schema "public"/)
    expect(ddl).not.toMatch(/"pgcrypto"/) // ya está en el destino, en el mismo esquema
  })

  it('escapa literales de enums, respeta identity/generadas y no crea la secuencia de identity', () => {
    expect(ddl).toContain(`create type public."tier" as enum ('free', 'o''pro')`)
    expect(ddl).toContain('"id" bigint generated always as identity not null')
    expect(ddl).toContain('"g" text generated always as (lower(x)) stored')
    expect(ddl).toContain('create sequence public."t_n_seq"')
    expect(ddl).not.toContain('create sequence public."t_id_seq"')
    expect(ddl).toContain('alter sequence public."t_n_seq" owned by public."t"."n"')
  })

  it('recrea el trigger de auth.users limpio y replica privilegios de tabla, columna, función y default ACL', () => {
    expect(ddl).toContain('drop trigger if exists "on_auth_user_created" on auth.users;')
    expect(ddl).toContain('revoke all on table public."t" from public, anon, authenticated, service_role, postgres;')
    expect(ddl).toContain('grant SELECT on table public."t" to authenticated;')
    expect(ddl).toContain('grant UPDATE ("n") on table public."t" to anon;')
    expect(ddl).toContain('grant EXECUTE on function public.f() to service_role;')
    expect(ddl).toContain('alter default privileges for role postgres in schema public grant SELECT on tables to anon;')
    expect(ddl).toContain('create policy "lee" on public."t" as permissive for select to "authenticated" using (true);')
  })

  it('el vaciado va primero y el orden respeta dependencias (tablas → funciones → constraints → triggers → policies)', () => {
    const pos = s => ddl.indexOf(s)
    expect(ddl.startsWith('-- ===== 0. vaciar public')).toBe(true)
    expect(pos('create table')).toBeLessThan(pos('CREATE OR REPLACE FUNCTION'))
    expect(pos('CREATE OR REPLACE FUNCTION')).toBeLessThan(pos('add constraint'))
    expect(pos('add constraint')).toBeLessThan(pos('CREATE TRIGGER'))
    expect(pos('CREATE TRIGGER')).toBeLessThan(pos('create policy'))
  })

  it('aborta ante objetos que no sabe clonar (en vez de clonar a medias)', () => {
    expect(() => generarDDL(catalogo({ tiposRaros: [{ typname: 'dom', typtype: 'd' }] }), [])).toThrow(/tipos no soportados/)
    expect(() => generarDDL(catalogo({ relacionesRaras: [{ relname: 'v', relkind: 'v' }] }), [])).toThrow(/relaciones no soportadas/)
    expect(() => generarDDL(catalogo({ funciones: [{ firma: 'public.agg(int)', prokind: 'a', def: null }] }), [])).toThrow(/agregados/)
  })
})

describe('huella y diferencias', () => {
  it('compara la posición ORDINAL de las columnas (los huecos de columnas borradas en prod no son diferencia)', () => {
    const prod = catalogo()
    const pruebas = catalogo({ columnas: prod.columnas.map((c, i) => ({ ...c, attnum: i + 1 })) })
    expect(diferencias(huella(prod), huella(pruebas))).toEqual([])
  })

  it('detecta lo que falta, lo que sobra y lo que cambió', () => {
    const prod = catalogo()
    const pruebas = catalogo({
      policies: [],
      aclTablas: [...prod.aclTablas, { relname: 't', relkind: 'r', grantee: 'anon', privilege_type: 'TRUNCATE', is_grantable: false }],
      constraints: [{ ...prod.constraints[0], def: 'PRIMARY KEY (n)' }],
    })
    const d = diferencias(huella(prod), huella(pruebas))
    expect(d.some(x => x.startsWith('falta en pruebas: policy t.lee'))).toBe(true)
    expect(d.some(x => x.startsWith('sobra en pruebas: privilegio t anon TRUNCATE'))).toBe(true)
    expect(d.some(x => x.startsWith('distinto: constraint t.t_pkey'))).toBe(true)
  })

  it('ignora pg_net/pg_cron en la huella (no se clonan a propósito)', () => {
    expect([...huella(catalogo()).keys()].some(k => k.includes('pg_net'))).toBe(false)
  })
})
