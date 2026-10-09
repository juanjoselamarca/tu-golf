/**
 * Canario de privilegios de tabla para anon/authenticated — ítem 7, fase F1
 * (plan docs/superpowers/plans/2026-10-02-plan-9-fixes.md, migración 20261003).
 *
 * Fija el estado esperado DESPUÉS de aplicar la migración:
 *  - anon y authenticated NO tienen TRUNCATE / TRIGGER / REFERENCES / MAINTAIN en
 *    ninguna tabla de `public` (ni directo ni heredado de PUBLIC), y las tablas
 *    futuras que cree postgres tampoco nacen con ellos (default ACL);
 *  - nadie fuera de postgres/service_role ejecuta las funciones de trigger
 *    handle_new_user, update_updated_at, log_role_change.
 * Y el otro lado (que el REVOKE no se pase de largo):
 *  - los triggers que las usan siguen existiendo y habilitados;
 *  - service_role conserva EXECUTE; authenticated conserva SELECT en todas las
 *    tablas (F1 no toca lectura/escritura: eso es F2/F3).
 *
 * La migración se aplicó en prod el 03-oct (PR #498) y este canario llegó en un PR propio
 * DESPUÉS, ya verde: mide el estado final, así que dentro del PR de la migración solo
 * podía estar rojo, y la regla de BD prohíbe aplicar antes del merge. Patrón a repetir en
 * F2/F3: migración → merge → aplicar → PR del canario.
 *
 * Lee el catálogo con `exec_sql` (SECURITY DEFINER, EXECUTE sólo service_role)
 * en modo SELECT. No escribe nada. Se salta sin service-role key.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const sinCredenciales = !url || !serviceKey

const ROLES_CLIENTE = ['anon', 'authenticated'] as const
const PRIVILEGIOS_PROHIBIDOS = ['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN'] as const
/** Letras de aclitem para los mismos privilegios: D=TRUNCATE, t=TRIGGER, x=REFERENCES, m=MAINTAIN. */
const LETRAS_PROHIBIDAS = /[Dtxm]/
const FUNCIONES_TRIGGER = ['handle_new_user', 'update_updated_at', 'log_role_change'] as const

/** Piso de tablas en public: si la consulta devuelve menos, mide en vacío. Hoy: 68. */
const MIN_TABLAS = 60

describe.skipIf(sinCredenciales)('privilegios de tabla — anon/authenticated (ítem 7 F1)', () => {
  let admin: SupabaseClient

  async function sql<T>(query: string): Promise<T[]> {
    const { data, error } = await admin.rpc('exec_sql', { query })
    if (error) throw error
    if (data && !Array.isArray(data) && typeof data === 'object' && 'error' in data) {
      throw new Error(`exec_sql: ${(data as { error: string }).error}`)
    }
    return (data ?? []) as T[]
  }

  beforeAll(() => {
    admin = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  })

  it(`hay al menos ${MIN_TABLAS} tablas en public (guarda de cardinalidad)`, async () => {
    const [fila] = await sql<{ n: number }>(
      `select count(*)::int as n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname = 'public' and c.relkind in ('r','p')`,
    )
    expect(fila.n).toBeGreaterThanOrEqual(MIN_TABLAS)
  })

  it('anon y authenticated NO tienen TRUNCATE/TRIGGER/REFERENCES/MAINTAIN en ninguna tabla de public', async () => {
    const pares = ROLES_CLIENTE.flatMap(r => PRIVILEGIOS_PROHIBIDOS.map(p => `('${r}','${p}')`)).join(',')
    const violaciones = await sql<{ rol: string; privilegio: string; tabla: string }>(
      `select v.rol, v.privilegio, c.relname as tabla
       from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
       cross join (values ${pares}) as v(rol, privilegio)
       where ns.nspname = 'public' and c.relkind in ('r','p')
         and has_table_privilege(v.rol, c.oid, v.privilegio)
       order by 1, 2, 3`,
    )
    // Resumen por rol:privilegio → nº de tablas (+ 3 ejemplos), legible aunque falle en las 68.
    const resumen: Record<string, string> = {}
    for (const v of violaciones) {
      const k = `${v.rol}:${v.privilegio}`
      const previas = violaciones.filter(x => `${x.rol}:${x.privilegio}` === k)
      resumen[k] = `${previas.length} tablas (${previas.slice(0, 3).map(x => x.tabla).join(', ')}…)`
    }
    expect(resumen, `${violaciones.length} privilegios de más`).toEqual({})
  })

  it('las tablas FUTURAS de postgres en public no nacen con esos privilegios (default ACL)', async () => {
    const entradas = await sql<{ rol: string; privs: string }>(
      `select pg_get_userbyid(a.grantee) as rol, string_agg(a.privilege_type, ',' order by a.privilege_type) as privs
       from pg_default_acl d, aclexplode(d.defaclacl) a
       where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
         and d.defaclobjtype = 'r'
         and pg_get_userbyid(a.grantee) in ('anon','authenticated')
         and a.privilege_type in ('TRUNCATE','TRIGGER','REFERENCES','MAINTAIN')
       group by 1 order by 1`,
    )
    expect(entradas).toEqual([])
    // Doble chequeo por texto crudo del aclitem (por si aclexplode cambiara de nombres).
    const crudo = await sql<{ acl: string }>(
      `select d.defaclacl::text as acl from pg_default_acl d
       where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
         and d.defaclobjtype = 'r'`,
    )
    for (const { acl } of crudo) {
      for (const item of acl.replace(/[{}]/g, '').split(',')) {
        const [rol, resto] = item.split('=')
        if (rol === 'anon' || rol === 'authenticated') {
          expect(resto.split('/')[0], `default ACL ${item}`).not.toMatch(LETRAS_PROHIBIDAS)
        }
      }
    }
  })

  it('las 3 funciones de trigger existen y anon/authenticated/PUBLIC NO las ejecutan', async () => {
    const filas = await sql<{ fn: string; anon: boolean; authenticated: boolean; publico: boolean; service_role: boolean }>(
      `select p.proname as fn,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE') as publico,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
       from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public'
         and p.proname in (${FUNCIONES_TRIGGER.map(f => `'${f}'`).join(',')})
         and p.pronargs = 0
       order by 1`,
    )
    expect(filas.map(f => f.fn).sort()).toEqual([...FUNCIONES_TRIGGER].sort())
    for (const f of filas) {
      expect({ fn: f.fn, anon: f.anon, authenticated: f.authenticated, publico: f.publico })
        .toEqual({ fn: f.fn, anon: false, authenticated: false, publico: false })
      expect(f.service_role, `${f.fn}: service_role debe conservar EXECUTE`).toBe(true)
    }
  })

  it('los triggers que usan esas funciones siguen existiendo y habilitados', async () => {
    const triggers = await sql<{ fn: string; n: number; deshabilitados: number }>(
      `select p.proname as fn, count(*)::int as n,
              count(*) filter (where t.tgenabled = 'D')::int as deshabilitados
       from pg_trigger t join pg_proc p on p.oid = t.tgfoid
       where not t.tgisinternal
         and p.proname in (${FUNCIONES_TRIGGER.map(f => `'${f}'`).join(',')})
       group by 1 order by 1`,
    )
    expect(triggers.map(t => t.fn).sort()).toEqual([...FUNCIONES_TRIGGER].sort())
    for (const t of triggers) expect(t.deshabilitados, t.fn).toBe(0)
  })

  it('F1 no toca lectura: authenticated conserva SELECT en todas las tablas de public', async () => {
    const sinSelect = await sql<{ tabla: string }>(
      `select c.relname as tabla from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname = 'public' and c.relkind in ('r','p')
         and not has_table_privilege('authenticated', c.oid, 'SELECT')
       order by 1`,
    )
    expect(sinSelect.map(t => t.tabla)).toEqual([])
  })
})
