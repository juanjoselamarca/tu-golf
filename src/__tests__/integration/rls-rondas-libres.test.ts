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
 *  4. Caminos legítimos que antes dependían del hueco: miembro no-creador
 *     anota la tarjeta de otro, marcador designado (admin_user_id), anónimo
 *     cierra una ronda COMPLETA (9 hoyos desde el 10), no-creador no descarta.
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
const e2ePassword = process.env.E2E_TEST_USER_PASSWORD

const skipIfNoEnv = !url || !serviceKey || !anonKey || !e2eEmail || !e2ePassword

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
  let testUserId: string
  // Ronda ajena: la creó otro usuario; el usuario de test es solo jugador.
  let ajenaId: string | null = null
  let ajenaCodigo: string
  let ajenaJugadorCreador: string
  let ajenaJugadorTest: string
  let logueado: SupabaseClient

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    anon = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    const userId = await getTestUserId()
    testUserId = userId
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

    const { data: otro } = await admin.from('profiles').select('id').neq('id', userId).limit(1).single()
    ajenaCodigo = 'ZR' + Math.random().toString(36).slice(2, 8).toUpperCase()
    const { data: ajena, error: ajenaErr } = await admin
      .from('rondas_libres')
      .insert({
        codigo: ajenaCodigo, creador_id: otro!.id, course_name: 'RLS P0 ajena', holes: 9,
        hoyo_inicio: 10, fecha: new Date().toISOString().slice(0, 10), estado: 'en_curso',
      })
      .select('id')
      .single()
    if (ajenaErr) throw ajenaErr
    ajenaId = ajena!.id
    const { data: jugs, error: jugsErr } = await admin
      .from('ronda_libre_jugadores')
      .insert([
        { ronda_id: ajenaId, nombre: 'Creador ajeno', user_id: otro!.id, scores: {} },
        { ronda_id: ajenaId, nombre: 'Usuario test', user_id: userId, scores: {} },
      ])
      .select('id, user_id')
    if (jugsErr) throw jugsErr
    ajenaJugadorCreador = jugs!.find(j => j.user_id === otro!.id)!.id
    ajenaJugadorTest = jugs!.find(j => j.user_id === userId)!.id

    logueado = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error: loginErr } = await logueado.auth.signInWithPassword({ email: e2eEmail!, password: e2ePassword! })
    if (loginErr) throw loginErr
  })

  afterAll(async () => {
    if (rondaId) await cleanupRondaFixture(rondaId)
    if (ajenaId) await cleanupRondaFixture(ajenaId)
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
    // EXECUTE revocado a anon: falla antes de entrar a la función.
    const desc = await anon.rpc('descartar_ronda_libre', { p_codigo: codigo })
    expect(desc.error).not.toBeNull()
    const { data: sigue } = await admin.from('rondas_libres').select('id').eq('id', rondaId)
    expect(sigue).toHaveLength(1)
  })

  it('miembro no-creador anota la tarjeta de otro jugador (marcador del grupo)', async () => {
    const r = await logueado.rpc('upsert_ronda_libre_scores', {
      p_jugador_id: ajenaJugadorCreador, p_codigo: ajenaCodigo, p_delta: { '10': 4 },
    })
    expect(r.error).toBeNull()
    expect((r.data as Record<string, number>)['10']).toBe(4)
  })

  it('miembro no-creador no puede cerrar la ronda por UPDATE directo ni descartarla', async () => {
    const upd = await logueado.from('rondas_libres').update({ estado: 'finalizada' }).eq('id', ajenaId!).select('id')
    expect(upd.data ?? []).toHaveLength(0)
    const desc = await logueado.rpc('descartar_ronda_libre', { p_codigo: ajenaCodigo })
    expect(desc.error?.code).toBe('P0003')
    const { data: sigue } = await admin.from('rondas_libres').select('estado').eq('id', ajenaId!).single()
    expect(sigue!.estado).toBe('en_curso')
  })

  it('marcador designado (admin_user_id) anota aunque no sea creador ni jugador', async () => {
    await admin.from('ronda_libre_jugadores').update({ user_id: null, is_guest: false }).eq('id', ajenaJugadorTest)
    await admin.from('rondas_libres').update({ admin_user_id: testUserId }).eq('id', ajenaId!)
    try {
      const r = await logueado.rpc('upsert_ronda_libre_scores', {
        p_jugador_id: ajenaJugadorCreador, p_codigo: ajenaCodigo, p_delta: { '11': 5 },
      })
      expect(r.error).toBeNull()
    } finally {
      await admin.from('rondas_libres').update({ admin_user_id: null }).eq('id', ajenaId!)
    }
  })

  it('anónimo cierra una ronda COMPLETA de 9 hoyos desde el 10 (claves 10..18)', async () => {
    const back9 = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(10 + i), 4]))
    await admin.from('ronda_libre_jugadores').update({ scores: back9 }).eq('ronda_id', ajenaId!)
    const fin = await anon.rpc('finalizar_ronda_libre', { p_codigo: ajenaCodigo })
    expect(fin.error).toBeNull()
    expect(fin.data).toBe(true)
    const otra = await anon.rpc('finalizar_ronda_libre', { p_codigo: ajenaCodigo })
    expect(otra.data).toBe(false)
  })
})
