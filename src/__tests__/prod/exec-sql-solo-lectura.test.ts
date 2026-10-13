/**
 * Canario de `exec_sql` en solo lectura (migración 20261013220000). Si alguien la redefine sin la transacción
 * read-only, la service key vuelve a escribir y a cambiar el schema de prod sin pasar por una migración revisada.
 *
 * Mide el estado DESPUÉS de aplicar: corre en migraciones-prod justo tras el `db push` y cada noche. Las consultas
 * no escriben aunque la función volviera a la versión vieja: el DELETE es `where false`.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSql } from '../helpers/prod-sql'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

describe.skipIf(!url || !serviceKey)('exec_sql en solo lectura', () => {
  let service: SupabaseClient

  async function rpc(query: string): Promise<unknown> {
    const { data, error } = await service.rpc('exec_sql', { query })
    if (error) throw error
    return data
  }

  beforeAll(() => {
    service = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  })

  it('la consulta corre dentro de una transacción read-only', async () => {
    expect(await execSql(service, "select current_setting('transaction_read_only') ro")).toEqual([{ ro: 'on' }])
  })

  it('la consulta no puede volver la transacción a read-write', async () => {
    expect(await rpc("select set_config('transaction_read_only', 'off', true)")).toEqual({
      error: 'cannot set transaction read-write mode inside a read-only transaction',
    })
  })

  it('anon/authenticated/PUBLIC no la ejecutan y service_role sí', async () => {
    expect(await execSql(service,
      `select has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE') as publico,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
       from pg_proc p where p.oid = 'public.exec_sql(text)'::regprocedure`,
    )).toEqual([{ anon: false, authenticated: false, publico: false, service_role: true }])
  })

  it('una escritura colada tras un ; la rechaza Postgres', async () => {
    expect(await rpc('select 1 uno) exec_sql_fila; delete from public.profiles where false; select (1')).toEqual({
      error: 'cannot execute DELETE in a read-only transaction',
    })
  })
})
