import { describe, it, expect, vi, beforeEach } from 'vitest'
import { armarReglasGuardadas, crearConfigDePlantilla } from '@/golf/formats/personalizado'

// GET /api/ronda-libre/[codigo]/juego: ruta + cargador reales (`cargarJuegoDeLaRonda`), base simulada.

const JUAN = '00000000-0000-4000-8000-00000000000a'
const PEDRO = '00000000-0000-4000-8000-00000000000b'
const DIEGO = '00000000-0000-4000-8000-00000000000c'
const TOMAS = '00000000-0000-4000-8000-00000000000d'
const IDS = [JUAN, PEDRO, DIEGO, TOMAS]

let conSesion = true
let formato = 'personalizado'
let reglasJuego: unknown = armarReglasGuardadas({ ...crearConfigDePlantilla('dos_cero_dos'), modo: 'neto' }, IDS)
const leerIndices = vi.fn()

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: conSesion ? { claims: { sub: JUAN } } : null }) },
  }),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/data/indices-de-perfil', () => ({ indicesDePerfil: (...a: unknown[]) => leerIndices(...a) }))

// La ronda en vivo con los course handicaps que calcula el servidor con el lector real de índices.
const cargarRondaLibreEnVivo = vi.fn()
vi.mock('@/lib/data/ronda-libre', () => ({ cargarRondaLibreEnVivo: (...a: unknown[]) => cargarRondaLibreEnVivo(...a) }))

function tabla(nombre: string) {
  const datos: Record<string, unknown> = {
    rondas_libres: { reglas_juego: reglasJuego },
    ronda_libre_puntitos: [],
    ronda_libre_retiros: [],
  }
  const resultado = () => ({ data: datos[nombre], error: null })
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) b[m] = vi.fn(() => b)
  b.single = vi.fn(async () => resultado())
  b.then = (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(resultado()).then(res, rej)
  return b
}
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({ from: tabla }) }))

import { GET } from './route'

const PAR = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, 4]))
const SI = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, i + 1]))
const llamar = (codigo = 'ABC123') =>
  GET(new Request(`http://test/api/ronda-libre/${codigo}/juego`), { params: Promise.resolve({ codigo }) })

beforeEach(() => {
  conSesion = true
  formato = 'personalizado'
  reglasJuego = armarReglasGuardadas({ ...crearConfigDePlantilla('dos_cero_dos'), modo: 'neto' }, IDS)
  cargarRondaLibreEnVivo.mockReset()
  cargarRondaLibreEnVivo.mockImplementation(async () => ({
    status: 'ok',
    ronda: {
      id: 'ronda-1', holes: 18, hoyo_inicio: 1, estado: 'en_curso', formato_juego: formato,
      ronda_libre_jugadores: [TOMAS, JUAN, DIEGO, PEDRO].map(id => ({ id, scores: { 1: 4 } })),
    },
    courseHcpMap: { [JUAN]: 10, [PEDRO]: 14, [DIEGO]: 6, [TOMAS]: 18 },
    sinIndice: [],
    parMap: PAR,
    siMap: SI,
  }))
})

describe('GET /api/ronda-libre/[codigo]/juego', () => {
  it('sin sesión es 401 y no lee la ronda', async () => {
    conSesion = false
    const res = await llamar()
    expect(res.status).toBe(401)
    expect(cargarRondaLibreEnVivo).not.toHaveBeenCalled()
  })

  it('el neto se calcula con el lector real de índices, no con el mapa vacío de la respuesta pública', async () => {
    await llamar()
    expect(cargarRondaLibreEnVivo).toHaveBeenCalledWith(expect.anything(), 'ABC123', expect.any(Function))
  })

  it('decisión 27-oct: la respuesta trae puntos y golpes recibidos por hoyo, nunca índice ni hándicap de nadie', async () => {
    const res = await llamar()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toMatch(/no-store/)
    const cuerpo = await res.json()
    expect(Object.keys(cuerpo).sort()).toEqual(['config', 'estado', 'golpesRecibidos', 'jugadorIds', 'resultado'])
    expect(JSON.stringify(cuerpo)).not.toMatch(/courseHandicap|courseHcp|handicapIndex|"indice"|sinIndice/i)
    expect(cuerpo.jugadorIds).toEqual(IDS)
    expect(Object.values(cuerpo.golpesRecibidos[TOMAS] as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(12) // la diferencia con el más bajo (18 − 6), no su CH
  })

  it('una ronda que no es Timba es 404', async () => {
    formato = 'stroke_play'
    expect((await llamar()).status).toBe(404)
  })

  it('reglas_juego inválido no calcula: estado sin_juego con el motivo', async () => {
    reglasJuego = null
    const cuerpo = await (await llamar()).json()
    expect(cuerpo).toEqual({ estado: 'sin_juego', motivo: 'reglas_invalidas' })
  })

  it('un código con caracteres raros es 404 sin tocar la base', async () => {
    expect((await llamar('a b')).status).toBe(404)
    expect(cargarRondaLibreEnVivo).not.toHaveBeenCalled()
  })
})
