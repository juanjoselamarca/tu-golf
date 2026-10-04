/**
 * GET /api/gwi/torneo/[slug] — mismo contrato que la ronda libre: GWI calculado
 * en el servidor, sin inputs privados para nadie. Sólo Supabase es falso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, HUELLAS_PRIVADAS, CLAVES_PRIVADAS } from './fake-supabase'

let cliente: ReturnType<typeof fakeSupabase>
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn(async () => cliente) }))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { GET } from '@/app/api/gwi/torneo/[slug]/route'

const ORGANIZADOR = 'u-org'
const JUG_A = 'u-a'
const JUG_B = 'u-b'
const hoyos = (n: number, golpes: number) => Array.from({ length: n }, (_, i) => ({ hole_number: i + 1, gross_score: golpes }))

const TORNEO = {
  id: 't1', name: 'Copa', hole_count: 18, total_rounds: 1, date_start: null, course_id: null, tees: null,
  hcp_calc_mode: null, modo_juego: 'gross', formato_juego: 'stroke_play', format: null,
  organizer_id: ORGANIZADOR, courses: null,
}
const jugador = (id: string, userId: string, nombre: string, golpes: number, hcp: number) => ({
  id, user_id: userId, handicap_at_registration: hcp, tee_id: null, genero: null,
  profiles: { name: nombre, indice: hcp }, categories: null,
  rounds: [{ id: `r-${id}`, status: 'in_progress', round_number: 1, total_gross: 0, hole_scores: hoyos(9, golpes) }],
})
const TABLAS = {
  tournaments: TORNEO,
  players: [jugador('p1', JUG_A, 'Ana', 4, 8), jugador('p2', JUG_B, 'Bea', 5, 14)],
  historical_rounds: Array.from({ length: 25 }, () => [JUG_A, JUG_B].map(user_id => ({
    user_id, total_gross: HUELLAS_PRIVADAS.totalGross, course_name: null, holes_played: 18, scores: null,
  }))).flat(),
  player_patterns: [{ user_id: JUG_B, pattern_type: 'back_nine_collapse', confidence: HUELLAS_PRIVADAS.confianzaPatron, metadata: { diff: 4 } }],
}

const pedir = (slug = 'copa') => GET(new Request(`http://localhost/api/gwi/torneo/${slug}`), { params: Promise.resolve({ slug }) })

beforeEach(() => { vi.clearAllMocks() })

describe('GET /api/gwi/torneo/[slug] — contrato GWIResponse', () => {
  it('participante: resultados calculados, sin inputs privados en ningún campo', async () => {
    cliente = fakeSupabase(TABLAS, JUG_A)
    const res = await pedir()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const texto = await res.text()
    const json = JSON.parse(texto)
    expect(Object.keys(json).sort()).toEqual(['formatoJuego', 'jugadores', 'modoJuego', 'results', 'totalHoyos'])
    expect(json.jugadores).toEqual([
      { id: 'p1', nombre: 'Ana', hoyosCompletados: 9 },
      { id: 'p2', nombre: 'Bea', hoyosCompletados: 9 },
    ])
    expect(json.results).toHaveLength(2)
    expect(json.results[0].breakdown.historico.peso).toBeGreaterThan(0)
    expect(texto).not.toMatch(CLAVES_PRIVADAS)
    expect(texto).not.toContain(HUELLAS_PRIVADAS.historicalAvg)
    expect(texto).not.toContain(String(HUELLAS_PRIVADAS.totalGross))
    expect(texto).not.toContain(String(HUELLAS_PRIVADAS.confianzaPatron))
  })

  it('espectador: sin historia y sin consultar el historial', async () => {
    cliente = fakeSupabase(TABLAS, null)
    const res = await pedir()
    const texto = await res.text()
    expect(res.status).toBe(200)
    expect(texto).not.toMatch(CLAVES_PRIVADAS)
    for (const r of JSON.parse(texto).results) expect(r.breakdown.historico.peso).toBe(0)
    expect(cliente.consultas).not.toContain('historical_rounds')
    expect(cliente.consultas).not.toContain('player_patterns')
  })

  it('torneo sin jugadores → respuesta vacía con el mismo contrato', async () => {
    cliente = fakeSupabase({ ...TABLAS, players: [] }, JUG_A)
    const json = await (await pedir()).json()
    expect(json).toEqual({ results: [], jugadores: [], totalHoyos: 18, modoJuego: 'gross', formatoJuego: 'stroke_play' })
  })

  it('torneo inexistente → 404 privado', async () => {
    cliente = fakeSupabase({ ...TABLAS, tournaments: null }, JUG_A)
    const res = await pedir('nada')
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('error inesperado → 500 y captureError', async () => {
    cliente = { ...fakeSupabase(TABLAS, JUG_A), from: () => { throw new Error('caída') } } as never
    const res = await pedir()
    expect(res.status).toBe(500)
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'api.gwi.torneo' }))
  })
})
