/**
 * Audit 2026-05-17 P0 #1 regression — el RPC `upsert_ronda_libre_scores`
 * tiene que hacer MERGE server-side, no replace. Tests directos contra
 * Supabase prod usando admin client + fixture real de ronda libre.
 *
 * Skipea automáticamente si no hay service-role key (CI sin secrets).
 *
 * Uso:
 *   npx vitest run src/__tests__/integration/score-upsert-merge.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CONCEDE } from '@/golf/formats/match-play'
import { createRondaFixture, cleanupRondaFixture, getTestUserId, type RondaFixture } from '../../../e2e/helpers/ronda-fixture'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const e2eEmail = process.env.E2E_TEST_USER_EMAIL

const skipIfNoEnv = !url || !serviceKey || !e2eEmail

describe.skipIf(skipIfNoEnv)('RPC upsert_ronda_libre_scores — merge semantics (audit P0 #1)', () => {
  let admin: SupabaseClient
  let userId: string
  let rondaId: string
  let codigo: string
  let jugadorId: string
  let rondaP: Promise<RondaFixture> | undefined

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    userId = await getTestUserId()

    rondaP = createRondaFixture({ creadorUserId: userId, creadorName: 'P0#1 regression' })
    const ronda = await rondaP
    rondaId = ronda.id
    codigo = ronda.codigo

    const { data: jug } = await admin
      .from('ronda_libre_jugadores')
      .select('id')
      .eq('ronda_id', rondaId)
      .single()
    jugadorId = jug!.id

    // Seed: scores iniciales {1: 4, 2: 3} via UPDATE directo (estado de "ya scoreó dos hoyos").
    await admin
      .from('ronda_libre_jugadores')
      .update({ scores: { '1': 4, '2': 3 } })
      .eq('id', jugadorId)
  }, 60_000)

  afterAll(async () => {
    // La limpieza espera a la creación pendiente: si beforeAll se pasó de su
    // timeout, el fixture igual termina de crearse en segundo plano y sin esto
    // quedaba vivo en prod (y en el feed /en-vivo). Ver sweep-e2e-leftovers.ts.
    const ronda = await rondaP?.catch(() => null)
    if (ronda) await cleanupRondaFixture(ronda.id)
  }, 60_000)

  it('agrega un hoyo nuevo sin perder los anteriores', async () => {
    const { data, error } = await admin.rpc('upsert_ronda_libre_scores', {
      p_jugador_id: jugadorId,
      p_codigo: codigo,
      p_delta: { '3': 5 },
    })
    expect(error).toBeNull()
    expect(data).toEqual({ '1': 4, '2': 3, '3': 5 })
  })

  it('sobreescribe un hoyo existente (corrección de score) y conserva los demás', async () => {
    const { data, error } = await admin.rpc('upsert_ronda_libre_scores', {
      p_jugador_id: jugadorId,
      p_codigo: codigo,
      p_delta: { '2': 9 },
    })
    expect(error).toBeNull()
    expect(data).toEqual({ '1': 4, '2': 9, '3': 5 })
  })

  it('STALE STATE PROTECTION: delta parcial no pisa hoyos existentes', async () => {
    // Repro del bug original: el cliente manda solo {1: 4} (estado React stale
    // que perdió h2 y h3 por re-mount/cierre app). El UPDATE viejo BORRABA
    // h2 y h3. El RPC nuevo los preserva via `||`.
    const { data, error } = await admin.rpc('upsert_ronda_libre_scores', {
      p_jugador_id: jugadorId,
      p_codigo: codigo,
      p_delta: { '1': 4 },
    })
    expect(error).toBeNull()
    expect(data).toEqual({ '1': 4, '2': 9, '3': 5 })
  })

  it('mantiene el merge cuando se envía el objeto completo (backwards-compat)', async () => {
    const { data, error } = await admin.rpc('upsert_ronda_libre_scores', {
      p_jugador_id: jugadorId,
      p_codigo: codigo,
      p_delta: { '1': 4, '2': 9, '3': 5, '4': 6 },
    })
    expect(error).toBeNull()
    expect(data).toEqual({ '1': 4, '2': 9, '3': 5, '4': 6 })
  })

  it('rechaza con RONDA_NOT_FOUND (P0001) si el jugador no existe', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const { error } = await admin.rpc('upsert_ronda_libre_scores', {
      p_jugador_id: fakeId,
      p_codigo: codigo,
      p_delta: { '1': 4 },
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('P0001')
  })

  it('rechaza con RONDA_FINALIZED (P0002) si la ronda está cerrada', async () => {
    // Marca la ronda como finalizada y verifica el throw.
    await admin.from('rondas_libres').update({ estado: 'finalizada' }).eq('id', rondaId)
    try {
      const { error } = await admin.rpc('upsert_ronda_libre_scores', {
        p_jugador_id: jugadorId,
        p_codigo: codigo,
        p_delta: { '5': 7 },
      })
      expect(error).not.toBeNull()
      expect(error!.code).toBe('P0002')

      // Verifica además que los scores NO se modificaron (atomicidad).
      const { data: row } = await admin
        .from('ronda_libre_jugadores')
        .select('scores')
        .eq('id', jugadorId)
        .single()
      expect(row?.scores).toEqual({ '1': 4, '2': 9, '3': 5, '4': 6 })
    } finally {
      // Restablecer estado para no contaminar otros tests
      await admin.from('rondas_libres').update({ estado: 'en_curso' }).eq('id', rondaId)
    }
  })
})

describe.skipIf(skipIfNoEnv)('RPC upsert_ronda_equipos_scores — merge semantics (audit P0 #1 fase 2)', () => {
  let admin: SupabaseClient
  let userId: string
  let rondaId: string
  let codigo: string
  let equipoId: string
  let rondaP: Promise<RondaFixture> | undefined

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    userId = await getTestUserId()

    rondaP = createRondaFixture({ creadorUserId: userId, creadorName: 'P0#1 fase 2 equipos' })
    const ronda = await rondaP
    rondaId = ronda.id
    codigo = ronda.codigo

    // Crear un equipo de test con scores iniciales {1:4, 2:3}.
    const { data: equipo, error: eqErr } = await admin
      .from('ronda_equipos')
      .insert({
        ronda_id: rondaId,
        nombre: 'Equipo Test E2E',
        scores: { '1': 4, '2': 3 },
      })
      .select('id')
      .single()
    if (eqErr || !equipo) throw new Error(`crear equipo falló: ${eqErr?.message ?? 'unknown'}`)
    equipoId = equipo.id
  }, 60_000)

  afterAll(async () => {
    // ronda_equipos tiene ON DELETE CASCADE desde rondas_libres, así que
    // cleanupRondaFixture limpia también el equipo.
    // La limpieza espera a la creación pendiente: si beforeAll se pasó de su
    // timeout, el fixture igual termina de crearse en segundo plano y sin esto
    // quedaba vivo en prod (y en el feed /en-vivo). Ver sweep-e2e-leftovers.ts.
    const ronda = await rondaP?.catch(() => null)
    if (ronda) await cleanupRondaFixture(ronda.id)
  }, 60_000)

  it('agrega un hoyo nuevo al equipo sin perder los anteriores', async () => {
    const { data, error } = await admin.rpc('upsert_ronda_equipos_scores', {
      p_equipo_id: equipoId,
      p_codigo: codigo,
      p_delta: { '3': 5 },
    })
    expect(error).toBeNull()
    expect(data).toEqual({ '1': 4, '2': 3, '3': 5 })
  })

  it('STALE STATE PROTECTION en equipos: delta parcial no pisa hoyos previos', async () => {
    const { data, error } = await admin.rpc('upsert_ronda_equipos_scores', {
      p_equipo_id: equipoId,
      p_codigo: codigo,
      p_delta: { '3': 5 }, // solo h3 — h1 y h2 deben quedar intactos
    })
    expect(error).toBeNull()
    expect(data).toEqual({ '1': 4, '2': 3, '3': 5 })
  })

  it('rechaza con RONDA_NOT_FOUND (P0001) si el equipo no existe', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const { error } = await admin.rpc('upsert_ronda_equipos_scores', {
      p_equipo_id: fakeId,
      p_codigo: codigo,
      p_delta: { '1': 4 },
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('P0001')
  })

  it.each([0, 21])('el RPC de equipos también valida rango: rechaza %i con P0004', async (score) => {
    const { error } = await admin.rpc('upsert_ronda_equipos_scores', {
      p_equipo_id: equipoId,
      p_codigo: codigo,
      p_delta: { '4': score },
    })
    expect(error?.code).toBe('P0004')
  })

  it('rechaza con RONDA_FINALIZED (P0002) si la ronda está cerrada', async () => {
    await admin.from('rondas_libres').update({ estado: 'finalizada' }).eq('id', rondaId)
    try {
      const { error } = await admin.rpc('upsert_ronda_equipos_scores', {
        p_equipo_id: equipoId,
        p_codigo: codigo,
        p_delta: { '5': 7 },
      })
      expect(error).not.toBeNull()
      expect(error!.code).toBe('P0002')
    } finally {
      await admin.from('rondas_libres').update({ estado: 'en_curso' }).eq('id', rondaId)
    }
  })
})

// Hotfix P0 01-oct-2026: validate_score_delta rechazaba el CONCEDE (-1) del match
// play y, como el delta va en lote, fallaba el guardado de TODA la tarjeta.
describe.skipIf(skipIfNoEnv)('RPC upsert_ronda_libre_scores — validación de rango', () => {
  let admin: SupabaseClient
  let codigo: string
  let jugadorId: string
  let rondaP: Promise<RondaFixture> | undefined

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    const userId = await getTestUserId()
    rondaP = createRondaFixture({ creadorUserId: userId, creadorName: 'validador rango' })
    const ronda = await rondaP
    codigo = ronda.codigo
    const { data: jug } = await admin.from('ronda_libre_jugadores').select('id').eq('ronda_id', ronda.id).single()
    jugadorId = jug!.id
  }, 60_000)

  afterAll(async () => {
    const ronda = await rondaP?.catch(() => null)
    if (ronda) await cleanupRondaFixture(ronda.id)
  }, 60_000)

  it('acepta el hoyo concedido (-1, CONCEDE) junto a scores normales', async () => {
    const { data, error } = await admin.rpc('upsert_ronda_libre_scores', {
      p_jugador_id: jugadorId, p_codigo: codigo, p_delta: { '1': 4, '2': CONCEDE, '3': 20 },
    })
    expect(error).toBeNull()
    expect(data).toEqual({ '1': 4, '2': CONCEDE, '3': 20 })
  })

  it.each([0, -2, 21])('rechaza el score %i con INVALID_DELTA (P0004)', async (score) => {
    const { error } = await admin.rpc('upsert_ronda_libre_scores', {
      p_jugador_id: jugadorId, p_codigo: codigo, p_delta: { '4': score },
    })
    expect(error?.code).toBe('P0004')
  })
})
