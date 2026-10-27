/**
 * Canario de `validate_score_delta` (migración 20261027210000): la única validación de los golpes de ronda libre
 * (`ronda_libre_jugadores.scores` / `ronda_equipos.scores` son jsonb sin CHECK), y la corren los RPC que anon puede
 * ejecutar para las tarjetas sin cuenta.
 *
 * Mide el estado DESPUÉS de aplicar: corre en migraciones-prod justo tras el `db push` y cada noche. La función es
 * IMMUTABLE y sólo valida, así que se llama con un SELECT dentro de exec_sql (transacción de solo lectura): no
 * escribe nada en prod. exec_sql re-lanza la excepción de la función (P0004) como error del RPC.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

describe.skipIf(!url || !serviceKey)('validate_score_delta en prod', () => {
  let service: SupabaseClient

  /** `null` si el delta pasa; el mensaje de Postgres si lo rechaza. */
  async function rechazo(delta: string): Promise<string | null> {
    const literal = delta.replace(/'/g, "''")
    const { data, error } = await service.rpc('exec_sql', {
      query: `select public.validate_score_delta('${literal}'::jsonb) is null as ok`,
    })
    if (error) return error.message
    if (Array.isArray(data)) return null
    return (data as { error: string }).error
  }

  beforeAll(() => {
    service = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  })

  it('acepta lo que mandan los scorers: claves String(n), golpes enteros y el CONCEDE (-1)', async () => {
    expect(await rechazo('{"1":4,"9":5,"18":3,"27":6}')).toBeNull()
    expect(await rechazo('{"5":-1,"6":20}')).toBeNull()
    expect(await rechazo('{}')).toBeNull()
  })

  // Pasaban `k::int` como hoyo 1 pero quedaban guardadas como claves distintas de "1": quien lee con Number(k)
  // podía tomar el golpe basura en vez del real.
  it.each(['01', ' 1', '1 ', '+1', '0', '28', 'x'])('rechaza la clave de hoyo %j', async (clave) => {
    expect(await rechazo(JSON.stringify({ [clave]: 4 }))).toMatch(/INVALID_DELTA/)
  })

  // 4.5 pasaba el chequeo de rango como 5 y se guardaba 4.5; 1e10 reventaba el ::int con un error genérico.
  it.each(['4.5', '1e10', '0', '-2', '21'])('rechaza el golpe %s', async (golpes) => {
    expect(await rechazo(`{"1":${golpes}}`)).toMatch(/INVALID_DELTA/)
  })

  it('rechaza valores que no son números', async () => {
    expect(await rechazo('{"1":"4"}')).toMatch(/INVALID_DELTA/)
    expect(await rechazo('{"1":null}')).toMatch(/INVALID_DELTA/)
    expect(await rechazo('[4]')).toMatch(/INVALID_DELTA/)
  })
})
