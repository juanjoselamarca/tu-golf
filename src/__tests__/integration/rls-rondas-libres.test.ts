/**
 * P0 29-sep-2026 — las guardas "demo read-only" eran PERMISSIVE y dejaban a
 * cualquiera con la anon key modificar/borrar rondas, tarjetas y torneos
 * ajenos. Migración 20260929b. Este test corre contra Supabase real:
 *
 *  1. Auditoría de policies: ninguna policy PERMISSIVE de UPDATE/DELETE/ALL
 *     en `public` puede otorgar escritura sin mirar la identidad
 *     (auth.uid/auth.role/is_admin…). Es el portero para que el patrón no
 *     vuelva en otra tabla.
 *  2. Anónimo no escribe directo una ronda real (0 filas).
 *  3. Anónimo no anota una tarjeta con cuenta (P0003) y sí la de invitado.
 *
 * Skipea si no hay service-role key (CI sin secrets).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createRondaFixture, cleanupRondaFixture, getTestUserId } from '../../../e2e/helpers/ronda-fixture'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const e2eEmail = process.env.E2E_TEST_USER_EMAIL

const skipIfNoEnv = !url || !serviceKey || !anonKey || !e2eEmail

/** Una condición "mira la identidad" si referencia alguna de estas. */
const IDENTIDAD = /auth\.(uid|role|jwt)\(\)|is_admin|service_role/i

interface PolicyRow {
  tablename: string
  policyname: string
  permissive: string
  roles: string[]
  cmd: string
  qual: string | null
  with_check: string | null
}

describe.skipIf(skipIfNoEnv)('RLS ronda libre — sin escritura anónima (P0 29-sep)', () => {
  let admin: SupabaseClient
  let anon: SupabaseClient
  let rondaId: string
  let codigo: string
  let jugadorConCuenta: string
  let jugadorInvitado: string

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    anon = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    const userId = await getTestUserId()
    const ronda = await createRondaFixture({ creadorUserId: userId, creadorName: 'RLS P0 regression' })
    rondaId = ronda.id
    codigo = ronda.codigo

    const { data: jug } = await admin.from('ronda_libre_jugadores').select('id').eq('ronda_id', rondaId).limit(1).single()
    jugadorConCuenta = jug!.id
    const { data: inv, error } = await admin
      .from('ronda_libre_jugadores')
      .insert({ ronda_id: rondaId, nombre: 'Invitado RLS', is_guest: true, user_id: null, scores: {} })
      .select('id')
      .single()
    if (error) throw error
    jugadorInvitado = inv!.id
  })

  afterAll(async () => {
    if (rondaId) await cleanupRondaFixture(rondaId)
  })

  it('ninguna policy PERMISSIVE de escritura otorga acceso sin mirar la identidad', async () => {
    const { data, error } = await admin.rpc('rls_write_policies_audit')
    expect(error).toBeNull()
    const rows = (data ?? []) as PolicyRow[]
    // Cardinalidad: si la auditoría vuelve vacía, el test no prueba nada.
    expect(rows.length).toBeGreaterThan(20)

    const abiertas = rows
      .filter((r) => r.permissive === 'PERMISSIVE' && ['UPDATE', 'DELETE', 'ALL'].includes(r.cmd))
      .filter((r) => !(r.roles.length === 1 && r.roles[0] === 'service_role'))
      .filter((r) => !IDENTIDAD.test(`${r.qual ?? ''} ${r.with_check ?? ''}`))
      .map((r) => `${r.tablename}.${r.policyname} (${r.cmd})`)
    expect(abiertas).toEqual([])

    // Las guardas de demo siguen existiendo, ahora RESTRICTIVE.
    const guardas = rows.filter((r) => /_demo_readonly_(update|delete)$/.test(r.policyname))
    expect(guardas).toHaveLength(6)
    expect(guardas.every((r) => r.permissive === 'RESTRICTIVE')).toBe(true)
  })

  it('anónimo no puede cerrar ni borrar una ronda real (0 filas)', async () => {
    const upd = await anon.from('rondas_libres').update({ estado: 'finalizada' }).eq('id', rondaId).select('id')
    expect(upd.data ?? []).toHaveLength(0)
    const del = await anon.from('ronda_libre_jugadores').delete().eq('ronda_id', rondaId).select('id')
    expect(del.data ?? []).toHaveLength(0)

    const { data: sigue } = await admin.from('rondas_libres').select('estado').eq('id', rondaId).single()
    expect(sigue!.estado).toBe('en_curso')
  })

  it('anónimo no anota la tarjeta de un jugador con cuenta, pero sí la del invitado', async () => {
    const ajena = await anon.rpc('upsert_ronda_libre_scores', {
      p_jugador_id: jugadorConCuenta, p_codigo: codigo, p_delta: { '1': 9 },
    })
    expect(ajena.error?.code).toBe('P0003')

    const invitado = await anon.rpc('upsert_ronda_libre_scores', {
      p_jugador_id: jugadorInvitado, p_codigo: codigo, p_delta: { '1': 5 },
    })
    expect(invitado.error).toBeNull()
    expect((invitado.data as Record<string, number>)['1']).toBe(5)
  })

  it('anónimo no cierra una ronda incompleta ni descarta', async () => {
    const fin = await anon.rpc('finalizar_ronda_libre', { p_codigo: codigo })
    expect(fin.error?.code).toBe('P0003')
    const desc = await anon.rpc('descartar_ronda_libre', { p_codigo: codigo })
    expect(desc.error).not.toBeNull()
  })
})
