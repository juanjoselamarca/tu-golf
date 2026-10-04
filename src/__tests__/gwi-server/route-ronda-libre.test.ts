/**
 * GET /api/gwi/ronda-libre/[codigo] — el GWI se calcula en el servidor y la
 * respuesta NUNCA trae los inputs privados (historial, patrones) de nadie, ni
 * al participante ni al espectador. Cadena real: route → gwiDeRondaLibre →
 * courseHandicapsDeRonda → construirRespuestaGWI; sólo Supabase es falso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, HUELLAS_PRIVADAS, CLAVES_PRIVADAS } from './fake-supabase'

let cliente: ReturnType<typeof fakeSupabase>
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn(async () => cliente) }))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { GET } from '@/app/api/gwi/ronda-libre/[codigo]/route'

const CREADOR = 'u-creador'
const RIVAL = 'u-rival'
const scores = (n: number, golpes: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), golpes]))

const RONDA = {
  id: 'r1', course_name: 'Los Leones', course_id: null, tees: 'azul', holes: 18, hoyo_inicio: 1,
  modo_juego: 'gross', formato_juego: 'stroke_play', creador_id: CREADOR, admin_user_id: null, recorridos: null,
  ronda_libre_jugadores: [
    { id: 'j1', nombre: 'Ana', user_id: CREADOR, scores: scores(9, 4), handicap: 8, tees: null },
    { id: 'j2', nombre: 'Bea', user_id: RIVAL, scores: scores(9, 5), handicap: 14, tees: null },
  ],
}
const HISTORIAL = Array.from({ length: 25 }, () => ([
  { user_id: CREADOR, total_gross: HUELLAS_PRIVADAS.totalGross, course_name: 'Los Leones', holes_played: 18, scores: null },
  { user_id: RIVAL, total_gross: HUELLAS_PRIVADAS.totalGross, course_name: 'Los Leones', holes_played: 18, scores: null },
])).flat()
const PATRONES = [
  { user_id: RIVAL, pattern_type: 'back_nine_collapse', confidence: HUELLAS_PRIVADAS.confianzaPatron, metadata: { diff: 4 } },
  { user_id: RIVAL, pattern_type: 'post_bogey_spiral', confidence: HUELLAS_PRIVADAS.confianzaPatron, metadata: null },
]
const TABLAS = { rondas_libres: RONDA, historical_rounds: HISTORIAL, player_patterns: PATRONES }

const pedir = (codigo = 'ABC123') => GET(new Request(`http://localhost/api/gwi/ronda-libre/${codigo}`), { params: Promise.resolve({ codigo }) })

beforeEach(() => { vi.clearAllMocks() })

describe('GET /api/gwi/ronda-libre/[codigo] — contrato GWIResponse', () => {
  it('participante: resultados calculados, sin inputs privados en ningún campo', async () => {
    cliente = fakeSupabase(TABLAS, CREADOR)
    const res = await pedir()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const texto = await res.text()
    const json = JSON.parse(texto)

    expect(Object.keys(json).sort()).toEqual(['formatoJuego', 'jugadores', 'modoJuego', 'results', 'totalHoyos'])
    expect(json).toMatchObject({ totalHoyos: 18, modoJuego: 'gross', formatoJuego: 'stroke_play' })
    expect(json.jugadores).toEqual([
      { id: 'j1', nombre: 'Ana', hoyosCompletados: 9 },
      { id: 'j2', nombre: 'Bea', hoyosCompletados: 9 },
    ])
    expect(json.results).toHaveLength(2)
    const total = json.results.reduce((s: number, r: { winProbability: number }) => s + r.winProbability, 0)
    expect(total).toBe(100)
    // El participante SÍ obtiene un GWI que usó el historial (peso > 0)...
    expect(json.results[0].breakdown.historico.peso).toBeGreaterThan(0)
    // ...pero los valores y las claves privadas no viajan.
    expect(texto).not.toMatch(CLAVES_PRIVADAS)
    expect(texto).not.toContain(HUELLAS_PRIVADAS.historicalAvg)
    expect(texto).not.toContain(String(HUELLAS_PRIVADAS.totalGross))
    expect(texto).not.toContain(String(HUELLAS_PRIVADAS.confianzaPatron))
    // Historial acotado POR USUARIO (sin el tope silencioso de 1.000 filas de PostgREST).
    expect(cliente.consultas.filter(t => t === 'historical_rounds')).toHaveLength(2)
    const limites = cliente.llamadas.filter(l => l.tabla === 'historical_rounds' && l.metodo === 'limit')
    expect(limites.map(l => l.args[0])).toEqual([60, 60])
  })

  it('espectador: GWI "sin historia", ni siquiera se consulta el historial', async () => {
    cliente = fakeSupabase(TABLAS, null)
    const res = await pedir()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const texto = await res.text()
    const json = JSON.parse(texto)
    expect(json.results).toHaveLength(2)
    for (const r of json.results) {
      expect(r.breakdown.historico.peso).toBe(0)
      expect(r.breakdown.patrones.alerta).toBe(false)
    }
    expect(texto).not.toMatch(CLAVES_PRIVADAS)
    expect(cliente.consultas).not.toContain('historical_rounds')
    expect(cliente.consultas).not.toContain('player_patterns')
  })

  it('ronda inexistente → 404 privado', async () => {
    cliente = fakeSupabase({ ...TABLAS, rondas_libres: null }, CREADOR)
    const res = await pedir('NOEXISTE')
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('error inesperado → 500 y captureError (sin console)', async () => {
    cliente = { ...fakeSupabase(TABLAS, CREADOR), from: () => { throw new Error('caída') } } as never
    const res = await pedir()
    expect(res.status).toBe(500)
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'api.gwi.ronda-libre' }))
  })
})
