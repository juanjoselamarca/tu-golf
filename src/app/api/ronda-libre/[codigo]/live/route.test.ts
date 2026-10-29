import { describe, it, expect, vi, beforeEach } from 'vitest'

// GET /live (pública, cacheada) en una Timba libre: no viaja el índice ni el hándicap de nadie, ni en gross
// (decisión de Juanjo, 27-oct-2026). En una ronda gross de otro formato, el índice de tarjeta sí viaja.

let formato = 'personalizado'

vi.mock('@/utils/supabase/anon', () => ({ createAnonClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/data/ronda-libre', () => ({
  cargarRondaLibreEnVivo: async () => ({
    status: 'ok',
    ronda: {
      formato_juego: formato,
      modo_juego: 'gross',
      ronda_libre_jugadores: [
        { id: 'j-juan', user_id: null, handicap: 12, scores: { 1: 4 } },
        { id: 'j-pedro', user_id: null, handicap: 18, scores: { 1: 5 } },
      ],
    },
    parMap: { 1: 4 },
    siMap: { 1: 1 },
    courseHcpMap: { 'j-juan': 13, 'j-pedro': 20 },
    courseHcpCompletoMap: { 'j-juan': 13, 'j-pedro': 20 },
    displayHcpMap: { 'j-juan': 13, 'j-pedro': 20 },
    sinIndice: [],
    equipos: [],
  }),
}))

import { GET } from './route'

const llamar = () => GET(new Request('http://test/api/ronda-libre/ABC123/live'), { params: Promise.resolve({ codigo: 'ABC123' }) })
type Jugador = { handicap: unknown; scores: unknown }

beforeEach(() => { formato = 'personalizado' })

describe('GET /api/ronda-libre/[codigo]/live — Timba libre', () => {
  it('personalizado gross: sin índice de tarjeta ni course handicap de nadie; los golpes sí viajan', async () => {
    const cuerpo = await (await llamar()).json()
    expect(cuerpo.ronda.ronda_libre_jugadores.map((j: Jugador) => j.handicap)).toEqual([null, null])
    expect(cuerpo.courseHcpMap).toEqual({})
    expect(cuerpo.courseHcpCompletoMap).toEqual({})
    expect(cuerpo.displayHcpMap).toEqual({})
    expect(cuerpo.ronda.ronda_libre_jugadores.map((j: Jugador) => j.scores)).toEqual([{ 1: 4 }, { 1: 5 }])
  })

  it('stroke play gross: el índice de tarjeta de los invitados sigue viajando (sin cambios)', async () => {
    formato = 'stroke_play'
    const cuerpo = await (await llamar()).json()
    expect(cuerpo.ronda.ronda_libre_jugadores.map((j: Jugador) => j.handicap)).toEqual([12, 18])
    expect(cuerpo.courseHcpMap).toEqual({ 'j-juan': 13, 'j-pedro': 20 })
  })
})
