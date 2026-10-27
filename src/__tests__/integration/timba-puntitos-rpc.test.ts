/**
 * Timba libre (PR B) contra la base real: RPC `marcar_puntito_ronda_libre`, tablas privadas y permisos.
 * Contrato docs/specs/formato-personalizado.md — cláusulas 3 (orden de llegada), 4 (secuencia por dispositivo)
 * y 5 (greenie uno por hoyo, decidido en la escritura).
 *
 * Skipea si faltan las credenciales o si la migración 20261027120000 todavía no está aplicada (la RPC no
 * existe: PGRST202). Así el CI del PR no falla antes del merge y el canario lo cubre desde que se aplica.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { armarReglasGuardadas, crearConfigDePlantilla } from '@/golf/formats/personalizado'
import { createRondaFixture, cleanupRondaFixture, getTestUserId, type RondaFixture } from '../../../e2e/helpers/ronda-fixture'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const e2eEmail = process.env.E2E_TEST_USER_EMAIL
const sinEnv = !url || !serviceKey || !anonKey || !e2eEmail

const opcionesSinSesion = { auth: { autoRefreshToken: false, persistSession: false } }

async function rpcExiste(): Promise<boolean> {
  if (sinEnv) return false
  const sonda = createClient(url!, serviceKey!, opcionesSinSesion)
  const { error } = await sonda.rpc('marcar_puntito_ronda_libre', {
    p_codigo: '__sondeo__', p_jugador_id: '00000000-0000-4000-8000-000000000000', p_hoyo: 1,
    p_puntito_id: 'greenie', p_marcar: true, p_seq: null, p_dispositivo: null,
  })
  return error?.code !== 'PGRST202'
}
const migrada = await rpcExiste()

describe.skipIf(!migrada)('Timba libre — RPC de puntos especiales y tablas privadas', () => {
  let admin: SupabaseClient
  let anon: SupabaseClient
  let rondaP: Promise<RondaFixture> | undefined
  let codigo: string
  let rondaId: string
  let ids: string[] = []
  let parTres = 0

  const marcar = (jugador: string, marcar = true, extra: Record<string, unknown> = {}) =>
    admin.rpc('marcar_puntito_ronda_libre', {
      p_codigo: codigo, p_jugador_id: jugador, p_hoyo: parTres, p_puntito_id: 'greenie', p_marcar: marcar,
      p_seq: null, p_dispositivo: null, ...extra,
    })
  const greeniesDelHoyo = async () => {
    const { data, error } = await admin.from('ronda_libre_puntitos')
      .select('jugador_id').eq('ronda_id', rondaId).eq('hoyo', parTres).eq('puntito_id', 'greenie')
    expect(error).toBeNull()
    return (data ?? []).map(r => r.jugador_id)
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, opcionesSinSesion)
    anon = createClient(url!, anonKey!, opcionesSinSesion)
    rondaP = createRondaFixture({ creadorUserId: await getTestUserId(), creadorName: 'Timba PR B' })
    const ronda = await rondaP
    codigo = ronda.codigo
    rondaId = ronda.id

    const { data: creador } = await admin.from('ronda_libre_jugadores').select('id').eq('ronda_id', rondaId).single()
    const { data: rivales, error: errRivales } = await admin.from('ronda_libre_jugadores')
      .insert(['Pedro', 'Diego', 'Tomás'].map(nombre => ({ ronda_id: rondaId, nombre, user_id: null, scores: {} })))
      .select('id')
    if (errRivales || !rivales) throw new Error(`no se crearon los rivales: ${errRivales?.message}`)
    ids = [creador!.id, ...rivales.map(r => r.id)]

    const { data: hoyos } = await admin.from('course_holes').select('numero, par').eq('course_id', ronda.course_id).order('numero')
    parTres = (hoyos ?? []).find(h => h.par === 3)?.numero ?? 0
    if (!parTres) throw new Error('la cancha del fixture no tiene par 3')

    const config = {
      ...crearConfigDePlantilla('dos_cero_dos'),
      puntitos: [{ id: 'greenie', tipo: 'greenie', valor: 1, destino: 'individual', activo: true }],
    }
    const { error } = await admin.from('rondas_libres')
      .update({ formato_juego: 'personalizado', reglas_juego: armarReglasGuardadas(config as never, ids) })
      .eq('id', rondaId)
    if (error) throw new Error(`no se pasó la ronda a Timba: ${error.message}`)
  }, 60_000)

  afterAll(async () => {
    const ronda = await rondaP?.catch(() => null)
    if (ronda) await cleanupRondaFixture(ronda.id)
  }, 60_000)

  it('greenie Pedro → Juan → Pedro: queda solo Pedro (cláusula 5)', async () => {
    const [juan, pedro] = ids
    for (const j of [pedro, juan, pedro]) expect((await marcar(j)).error).toBeNull()
    expect(await greeniesDelHoyo()).toEqual([pedro])
  })

  it('greenie Pedro → Juan → quitar Juan: no queda nadie', async () => {
    const [juan, pedro] = ids
    await marcar(pedro)
    await marcar(juan)
    expect((await marcar(juan, false)).error).toBeNull()
    expect(await greeniesDelHoyo()).toEqual([])
  })

  it('una marca vieja del mismo dispositivo que llega tarde no pisa a la nueva (cláusula 4)', async () => {
    const [juan, pedro] = ids
    const dispositivo = crypto.randomUUID()
    const nueva = await marcar(juan, true, { p_seq: 20, p_dispositivo: dispositivo })
    expect(nueva.data).toMatchObject({ aplicada: true })
    const vieja = await marcar(pedro, true, { p_seq: 10, p_dispositivo: dispositivo })
    expect(vieja.error).toBeNull()
    expect(vieja.data).toMatchObject({ aplicada: false })
    expect(await greeniesDelHoyo()).toEqual([juan])
  })

  it('un punto que no está en las reglas de la ronda se rechaza', async () => {
    const { error } = await admin.rpc('marcar_puntito_ronda_libre', {
      p_codigo: codigo, p_jugador_id: ids[0], p_hoyo: 1, p_puntito_id: 'birdie', p_marcar: true, p_seq: null, p_dispositivo: null,
    })
    expect(error?.code).toBe('22023')
  })

  it('retiro: se guarda y se deshace', async () => {
    const tomas = ids[3]
    expect((await admin.rpc('marcar_retiro_ronda_libre', { p_codigo: codigo, p_jugador_id: tomas, p_desde_hoyo: 10, p_seq: null, p_dispositivo: null })).error).toBeNull()
    const { data } = await admin.from('ronda_libre_retiros').select('desde_hoyo').eq('jugador_id', tomas).single()
    expect(data?.desde_hoyo).toBe(10)
    expect((await admin.rpc('marcar_retiro_ronda_libre', { p_codigo: codigo, p_jugador_id: tomas, p_desde_hoyo: null, p_seq: null, p_dispositivo: null })).error).toBeNull()
    const { data: despues } = await admin.from('ronda_libre_retiros').select('jugador_id').eq('jugador_id', tomas)
    expect(despues).toEqual([])
  })

  it('anon no ejecuta las RPC ni lee las tablas privadas', async () => {
    const rpc = await anon.rpc('marcar_puntito_ronda_libre', {
      p_codigo: codigo, p_jugador_id: ids[0], p_hoyo: parTres, p_puntito_id: 'greenie', p_marcar: true, p_seq: null, p_dispositivo: null,
    })
    expect(rpc.error).not.toBeNull()
    for (const t of ['ronda_libre_puntitos', 'ronda_libre_retiros', 'ronda_libre_juego_orden']) {
      const { data, error } = await anon.from(t).select('*').limit(1)
      expect(error, t).not.toBeNull()
      expect(data, t).toBeNull()
    }
  })
})
