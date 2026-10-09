/**
 * GET /api/gwi/ronda-libre/[codigo] responde también a anónimos. Decisión de producto
 * (08-oct-2026): sin sesión, el handicap de un jugador con cuenta (índice del perfil,
 * no de la tarjeta) no viaja — `breakdown.handicapInfo` en null. Los invitados (índice
 * en la tarjeta) se muestran; con sesión, todo. Llama a la RUTA real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HOYOS_LEONES, TARJETAS_LEONES } from '@/golf/core/__fixtures__/los-leones'

const ronda = {
  id: 'r1', course_name: 'Club QA', course_id: 'c1', tees: 'azul', holes: 18, hoyo_inicio: 1,
  modo_juego: 'gross', formato_juego: 'stroke_play', creador_id: 'u-otro', admin_user_id: null, recorridos: null,
  ronda_libre_jugadores: [
    // Ana: cuenta, SIN handicap en la tarjeta → su índice (18) sale del perfil.
    { id: 'A', nombre: 'Ana', user_id: 'u-ana', scores: TARJETAS_LEONES.A, handicap: null, tees: 'azul' },
    // Beto: invitado con índice 7 tipeado en la tarjeta.
    { id: 'B', nombre: 'Beto', user_id: null, scores: TARJETAS_LEONES.B, handicap: 7, tees: 'azul' },
  ],
}

let visor: { id: string } | null = null
function query(data: unknown) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'not', 'order', 'limit', 'gte']) q[m] = () => q
  q.single = async () => ({ data, error: null })
  q.maybeSingle = async () => ({ data, error: null })
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: Array.isArray(data) ? data : [], error: null }).then(res)
  return q
}
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => query(t === 'rondas_libres' ? ronda : []),
    auth: { getUser: async () => ({ data: { user: visor }, error: null }) },
  }),
}))
vi.mock('@/lib/data/course-holes', () => ({ fetchHoyosDeLaRonda: async () => HOYOS_LEONES }))
vi.mock('@/lib/data/ronda-libre', () => ({
  courseHandicapsDeRonda: async () => ({ courseHcpMap: { A: 21, B: 8 }, indexByJugador: { A: 18, B: 7 } }),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { GET } from '@/app/api/gwi/ronda-libre/[codigo]/route'

async function pedir() {
  const res = await GET(new Request('http://x/api/gwi/ronda-libre/QA'), { params: Promise.resolve({ codigo: 'QA' }) })
  const texto = await res.text()
  return { texto, json: JSON.parse(texto) as { results: Array<{ id: string; volatilidad: string | null; narrativa: string; breakdown: { handicapInfo: { handicap: number } | null } }> } }
}
const fila = (j: Awaited<ReturnType<typeof pedir>>['json'], id: string) => j.results.find((r) => r.id === id)!

beforeEach(() => { visor = null; ronda.modo_juego = 'gross' })

describe('GET /api/gwi/ronda-libre — handicap según el visor', () => {
  it('sin sesión: el handicap de Ana (cuenta) no viaja; el de Beto (invitado) sí', async () => {
    const { json, texto } = await pedir()
    expect(fila(json, 'A').breakdown.handicapInfo).toBeNull()
    expect(fila(json, 'A').volatilidad).toBeNull()
    expect(fila(json, 'B').breakdown.handicapInfo?.handicap).toBe(7)
    expect(fila(json, 'B').volatilidad).toBe('media')
    expect(texto).not.toMatch(/"handicap":18/)
  })

  it('ronda NETO sin sesión (regla canónica `vistaPublica.soloBruto`): GWI vacío — ni neto ni HCP de nadie, invitados incluidos', async () => {
    ronda.modo_juego = 'neto'
    const { json, texto } = await pedir()
    expect(json.results).toEqual([])
    expect(texto).not.toMatch(/"handicap":\s*\d/)
  })

  it('ronda NETO con sesión: GWI completo, en neto', async () => {
    ronda.modo_juego = 'neto'
    visor = { id: 'u-otro' }
    const { json } = await pedir()
    expect(json.results).toHaveLength(2)
    expect(fila(json, 'B').breakdown.handicapInfo?.handicap).toBe(7)
  })

  it('con sesión: viaja el de los dos', async () => {
    visor = { id: 'u-otro' }
    const { json } = await pedir()
    expect(fila(json, 'A').breakdown.handicapInfo?.handicap).toBe(18)
    expect(fila(json, 'A').volatilidad).toBe('alta')
    expect(fila(json, 'B').breakdown.handicapInfo?.handicap).toBe(7)
  })
})
