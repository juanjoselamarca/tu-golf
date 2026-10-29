import { describe, it, expect, vi, beforeEach } from 'vitest'

// GET /hcp en una Timba libre (decisión de Juanjo, 27-oct-2026): ni con sesión se ve el índice ni el hándicap
// de juego de OTRO jugador. En los demás formatos, todo igual.

const VISOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let formato = 'personalizado'

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: VISOR } } }) } }),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/data/indices-de-perfil-lectura', () => ({ leerIndicesDelCliente: () => async () => new Map() }))
vi.mock('@/lib/data/ronda-libre', () => ({
  cargarRondaLibreEnVivo: async () => ({
    status: 'ok',
    ronda: {
      formato_juego: formato,
      ronda_libre_jugadores: [
        { id: 'j-yo', user_id: VISOR, handicap: 12 },
        { id: 'j-pedro', user_id: null, handicap: 18 },
        { id: 'j-diego', user_id: null, handicap: null },
      ],
    },
    courseHcpMap: { 'j-yo': 13, 'j-pedro': 20, 'j-diego': 0 },
    courseHcpCompletoMap: { 'j-yo': 13, 'j-pedro': 20 },
    displayHcpMap: { 'j-yo': 13, 'j-pedro': 20 },
    sinIndice: ['j-diego'],
    equipos: [],
  }),
}))

import { GET } from './route'

const llamar = () => GET(new Request('http://test/api/ronda-libre/ABC123/hcp'), { params: Promise.resolve({ codigo: 'ABC123' }) })

beforeEach(() => { formato = 'personalizado' })

describe('GET /api/ronda-libre/[codigo]/hcp — Timba libre', () => {
  it('personalizado: solo las entradas del propio visor, nunca las de los rivales', async () => {
    const cuerpo = await (await llamar()).json()
    expect(cuerpo.courseHcpMap).toEqual({ 'j-yo': 13 })
    expect(cuerpo.courseHcpCompletoMap).toEqual({ 'j-yo': 13 })
    expect(cuerpo.displayHcpMap).toEqual({ 'j-yo': 13 })
    expect(cuerpo.handicapPorJugador).toEqual({ 'j-yo': 12 })
    expect(cuerpo.sinIndice).toEqual([])
    expect(JSON.stringify(cuerpo)).not.toMatch(/j-pedro|j-diego/)
  })

  it('otro formato: sin cambios (todos los jugadores)', async () => {
    formato = 'stroke_play'
    const cuerpo = await (await llamar()).json()
    expect(cuerpo.courseHcpMap).toEqual({ 'j-yo': 13, 'j-pedro': 20, 'j-diego': 0 })
    expect(cuerpo.handicapPorJugador).toEqual({ 'j-yo': 12, 'j-pedro': 18, 'j-diego': null })
    expect(cuerpo.sinIndice).toEqual(['j-diego'])
  })
})
