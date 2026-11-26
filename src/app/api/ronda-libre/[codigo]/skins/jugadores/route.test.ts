import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clienteFalso, ok, type ClienteFalso } from '@/__tests__/helpers/postgrest-falso'
import { CONFIG_SKINS_POR_DEFECTO } from '@/golf/formats/skins'
import { MENSAJE_HANDICAP_UN_DECIMAL } from '@/golf/handicap-index-range'
import { skinsParaCrearRonda } from '@/lib/data/skins-ronda-nueva'
import { MENSAJE_SKINS_YA_EMPEZO } from '@/lib/data/skins-editar'

// PUT /api/ronda-libre/[codigo]/skins/jugadores: ruta + lib reales (validador, contexto y congelado de crear), base
// simulada (sesión con clienteFalso, la función SQL con un rpc falso).

const CREADOR = '11111111-1111-4111-8111-111111111111'
const OTRO = '99999999-9999-4999-8999-999999999999'
const IDS = ['a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002']
const HOYOS = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: ((i * 7) % 18) + 1 }))
const cancha = () => ({
  course_holes: [ok(HOYOS)],
  courses: [ok({ slope_rating: 130, course_rating: 72, par_total: 72 })],
  course_tees: [ok({ rating: 72, slope: 130, front_course_rating: null, front_slope_rating: null })],
})

let userId: string | null = CREADOR
let sesion: ClienteFalso
let reglas: Record<string, unknown>
let creadorDeLaRonda = CREADOR
const rpc = vi.fn()
const captureError = vi.fn()

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => Object.assign(sesion, { auth: { getClaims: async () => ({ data: userId ? { claims: { sub: userId } } : null }) } }),
}))
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))
vi.mock('@/lib/data/perfiles-existentes', () => ({ perfilesQueExisten: async (ids: readonly string[]) => new Set(ids) }))

import { PUT } from './route'

function armarSesion() {
  sesion = clienteFalso({
    ...cancha(),
    rondas_libres: [ok({
      id: 'R1', creador_id: creadorDeLaRonda, formato_juego: 'skins', estado: 'en_curso', course_id: 'c1', course_name: 'Los Leones',
      holes: 18, hoyo_inicio: 1, recorridos: null, tees: 'blanco', modo_juego: 'neto', admin_mode: true, reglas_juego: reglas,
    })],
    ronda_libre_jugadores: [ok([{ id: IDS[0], user_id: CREADOR }, { id: IDS[1], user_id: null }])],
  })
}

const pedir = (jugadores: unknown[], codigo = 'ABC123') =>
  PUT(new Request(`http://x/api/ronda-libre/${codigo}/skins/jugadores`, { method: 'PUT', body: JSON.stringify({ jugadores }) }), {
    params: Promise.resolve({ codigo }),
  })

const jugadores = (beto: Record<string, unknown> = {}) => [
  { id: IDS[0], nombre: 'Ana', user_id: CREADOR, handicap: 10.2, tees: null },
  { id: IDS[1], nombre: 'Beto', user_id: null, handicap: 24, tees: null, ...beto },
]

beforeEach(async () => {
  userId = CREADOR
  creadorDeLaRonda = CREADOR
  rpc.mockReset().mockResolvedValue({ error: null })
  captureError.mockReset()
  let n = 0
  const r = await skinsParaCrearRonda(clienteFalso(cancha()), {
    reglasJuego: { ...CONFIG_SKINS_POR_DEFECTO, modo: 'neto' }, modoDeLaRonda: 'neto', courseId: 'c1', holes: 18, hoyoInicio: 1,
    recorridos: null, tees: 'blanco', adminMode: true, nuevoId: () => IDS[n++],
    jugadores: [{ nombre: 'Ana', indice: 10.2 }, { nombre: 'Beto', indice: 24 }],
  })
  if (!r.ok) throw new Error(r.error)
  reglas = r.reglas as unknown as Record<string, unknown>
  armarSesion()
})

describe('PUT /api/ronda-libre/[codigo]/skins/jugadores', () => {
  it('sin sesión: 401', async () => {
    userId = null
    expect((await pedir(jugadores())).status).toBe(401)
  })

  it('no es el creador: 403 y no graba', async () => {
    userId = OTRO
    const res = await pedir(jugadores())
    expect(res.status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('índice con dos decimales: 400 con el mensaje del campo', async () => {
    const res = await pedir(jugadores({ handicap: 12.35 }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(`Índice de Beto: ${MENSAJE_HANDICAP_UN_DECIMAL}`)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('ya empezó (la función responde P0003): 409 con el mensaje', async () => {
    rpc.mockResolvedValue({ error: { code: 'P0003', message: 'SKINS_CONGELADO' } })
    const res = await pedir(jugadores({ handicap: 18 }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(MENSAJE_SKINS_YA_EMPEZO)
  })

  it('falla el servidor: 503 y se reporta', async () => {
    rpc.mockRejectedValue(new Error('sin service key'))
    const res = await pedir(jugadores())
    expect(res.status).toBe(503)
    expect(captureError).toHaveBeenCalled()
  })

  it('ok: llama a la función con las filas y lo congelado nuevo; la config no viaja', async () => {
    const res = await pedir([...jugadores({ handicap: 18 }), { nombre: 'Coni', user_id: CREADOR, handicap: 3, tees: 'azul', config: { pozoPorJugador: 1 } }])
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(rpc).toHaveBeenCalledTimes(1)
    const [nombre, args] = rpc.mock.calls[0] as [string, { p_ronda_id: string; p_jugadores: Record<string, unknown>[]; p_congelado: Record<string, unknown> }]
    expect(nombre).toBe('editar_jugadores_skins')
    // La config no viaja: la función deja la guardada (una versión nueva que la reparsee distinto no choca).
    expect(Object.keys(args).sort()).toEqual(['p_congelado', 'p_jugadores', 'p_ronda_id'])
    expect(args.p_ronda_id).toBe('R1')
    const ids = args.p_jugadores.map(f => f.id as string)
    expect(ids.slice(0, 2)).toEqual(IDS)
    expect(ids).toHaveLength(3)
    // Un jugador nuevo nunca entra con cuenta, aunque el cliente la mande (#581).
    expect(args.p_jugadores[2].user_id).toBeNull()
    const golpes = (args.p_congelado as { golpes: Record<string, number> }).golpes
    expect(Object.keys(golpes)).toEqual(ids)
    expect(golpes[IDS[1]]).not.toBe((reglas.congelado as { golpes: Record<string, number> }).golpes[IDS[1]])
  })

  it('un Skins que no es de este código o ya cerró: 404', async () => {
    sesion = clienteFalso({ rondas_libres: [ok(null)] })
    expect((await pedir(jugadores())).status).toBe(404)
  })
})
