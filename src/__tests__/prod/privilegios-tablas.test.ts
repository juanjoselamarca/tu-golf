/**
 * Canario de privilegios de tabla para anon/authenticated — ítem 7, fase F1
 * (plan docs/superpowers/plans/2026-10-02-plan-9-fixes.md, migración 20261003).
 *
 * Fija el estado esperado DESPUÉS de aplicar la migración:
 *  - anon y authenticated NO tienen TRUNCATE / TRIGGER / REFERENCES / MAINTAIN en
 *    ninguna tabla de `public` (ni directo ni heredado de PUBLIC);
 *  - las tablas, secuencias y funciones que cree postgres en `public` nacen sin
 *    permisos para PUBLIC, anon ni authenticated (default ACL, 20261014030000);
 *  - nadie fuera de postgres/service_role ejecuta las funciones de trigger
 *    handle_new_user, update_updated_at, log_role_change.
 * Y el otro lado (que el REVOKE no se pase de largo):
 *  - los triggers que las usan siguen existiendo y habilitados;
 *  - service_role conserva EXECUTE; authenticated conserva SELECT en todas las
 *    tablas (F1 no toca lectura/escritura: eso es F2/F3). profiles has column-level
 *    SELECT since 20261009 (no email or fecha_nacimiento), hence
 *    has_any_column_privilege.
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
const FUNCIONES_TRIGGER = ['handle_new_user', 'update_updated_at', 'log_role_change'] as const
/**
 * Tablas que nacen privadas (sin ningún grant a los roles cliente): quedan fuera de
 * "authenticated conserva SELECT" y se exige lo contrario. rate_limit_hits: 20261019200000; ronda_libre_scores_orden: 20261020190000;
 * ronda_equipos_scores_orden: 20261020200000; ronda_libre_juego_orden, ronda_libre_puntitos y ronda_libre_retiros: 20261027180000.
 */
const TABLAS_PRIVADAS = [
  'rate_limit_hits', 'ronda_equipos_scores_orden', 'ronda_libre_juego_orden', 'ronda_libre_puntitos', 'ronda_libre_retiros',
  'ronda_libre_scores_orden',
] as const
const listaSql = (xs: readonly string[]) => xs.map(x => `'${x}'`).join(',')

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

  // Privado por defecto (20261014030000, hoy en la baseline). Sin la entrada global de funciones rige el
  // default de Postgres, que le da EXECUTE a PUBLIC en cada función nueva; sync-schema y la deriva no la leen.
  it('las tablas, secuencias y funciones FUTURAS de postgres en public no nacen con permisos para PUBLIC, anon ni authenticated (default ACL)', async () => {
    const [global] = await sql<{ n: number }>(
      `select count(*)::int as n from pg_default_acl
       where defaclrole = 'postgres'::regrole and defaclnamespace = 0 and defaclobjtype = 'f'`,
    )
    expect(global.n, 'entrada global de funciones de postgres').toBe(1)
    const abiertos = await sql<{ esquema: string; tipo: string; rol: string; privs: string }>(
      `select case when d.defaclnamespace = 0 then 'global' else d.defaclnamespace::regnamespace::text end as esquema,
              d.defaclobjtype as tipo,
              case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as rol,
              string_agg(a.privilege_type, ',' order by a.privilege_type) as privs
       from pg_default_acl d, aclexplode(d.defaclacl) a
       where d.defaclrole = 'postgres'::regrole
         and d.defaclnamespace in (0::oid, 'public'::regnamespace)
         and d.defaclobjtype in ('r', 'S', 'f')
         and (a.grantee = 0 or pg_get_userbyid(a.grantee) in (${listaSql(ROLES_CLIENTE)}))
       group by 1, 2, 3 order by 1, 2, 3`,
    )
    expect(abiertos).toEqual([])
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

  it('F1 no toca lectura: authenticated conserva SELECT en todas las tablas de public (salvo las privadas)', async () => {
    const sinSelect = await sql<{ tabla: string }>(
      `select c.relname as tabla from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname = 'public' and c.relkind in ('r','p')
         and c.relname not in (${listaSql(TABLAS_PRIVADAS)})
         and not has_any_column_privilege('authenticated', c.oid, 'SELECT')
       order by 1`,
    )
    expect(sinSelect.map(t => t.tabla)).toEqual([])
  })

  it('las tablas privadas existen y ningún rol cliente tiene privilegio alguno sobre ellas', async () => {
    const filas = await sql<{ tabla: string; rol: string; alguno: boolean }>(
      `select c.relname as tabla, r.rol,
              (has_any_column_privilege(r.rol, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
               or has_table_privilege(r.rol, c.oid, 'DELETE,TRUNCATE,TRIGGER')) as alguno
       from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
       cross join (values ${ROLES_CLIENTE.map(r => `('${r}')`).join(',')}) as r(rol)
       where ns.nspname = 'public' and c.relkind in ('r','p') and c.relname in (${listaSql(TABLAS_PRIVADAS)})
       order by 1, 2`,
    )
    // Cardinalidad: si la tabla no existiera, el test pasaría en vacío.
    expect(filas).toHaveLength(TABLAS_PRIVADAS.length * ROLES_CLIENTE.length)
    expect(filas.filter(f => f.alguno)).toEqual([])
  })
})
