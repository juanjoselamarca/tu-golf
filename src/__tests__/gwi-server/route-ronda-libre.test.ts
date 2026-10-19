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
// Lector de servicio de `profiles.indice` (server-only): el test decide qué ve.
const indicesDePerfil = vi.fn(async (_ids: readonly string[]) => new Map<string, number>())
vi.mock('@/lib/data/indices-de-perfil', () => ({ indicesDePerfil: (ids: readonly string[]) => indicesDePerfil(ids) }))

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
    // El participante SÍ obtiene un GWI que usó el historial...
    expect(json.results[0].breakdown.historico).toEqual({ usado: true })
    // ...pero los valores y las claves privadas no viajan.
    expect(texto).not.toMatch(CLAVES_PRIVADAS)
    expect(texto).not.toContain(HUELLAS_PRIVADAS.historicalAvg)
    expect(texto).not.toContain(String(HUELLAS_PRIVADAS.totalGross))
    expect(texto).not.toContain(String(HUELLAS_PRIVADAS.confianzaPatron))
    // Ronda libre: UNA query batch al historial (no una por jugador), con límite explícito.
    expect(cliente.consultas.filter(t => t === 'historical_rounds')).toHaveLength(1)
    const limites = cliente.llamadas.filter(l => l.tabla === 'historical_rounds' && l.metodo === 'limit')
    expect(limites.map(l => l.args[0])).toEqual([1000])
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
      expect(r.breakdown.historico).toEqual({ usado: false })
      expect(r.breakdown.patrones.alerta).toBe(false)
    }
    expect(texto).not.toMatch(CLAVES_PRIVADAS)
    expect(cliente.consultas).not.toContain('historical_rounds')
    expect(cliente.consultas).not.toContain('player_patterns')
  })

  it('máscara por visor: la fila del rival sale sin patrón, tendencia ni píldoras; la propia completa', async () => {
    // Bea (RIVAL) tiene patrones fuertes; Ana (CREADOR) mira.
    cliente = fakeSupabase(TABLAS, CREADOR)
    const { results } = await (await pedir()).json()
    const ana = results.find((r: { id: string }) => r.id === 'j1')
    const bea = results.find((r: { id: string }) => r.id === 'j2')
    expect(ana.breakdown.historico).toEqual({ usado: true })
    expect(['up', 'down', 'stable']).toContain(ana.tendencia)
    expect(ana.breakdown.cancha).toEqual({ usado: true })
    expect(bea.breakdown).toMatchObject({ historico: { usado: false }, cancha: { usado: false }, patrones: { alerta: false } })
    expect(bea.tendencia).toBeNull()
    expect(bea.narrativa).not.toMatch(/Patrón/)
  })

  it('máscara por visor: el dueño del patrón SÍ ve su alerta (la máscara discrimina por fila)', async () => {
    cliente = fakeSupabase(TABLAS, RIVAL)
    const { results } = await (await pedir()).json()
    const bea = results.find((r: { id: string }) => r.id === 'j2')
    const ana = results.find((r: { id: string }) => r.id === 'j1')
    expect(bea.breakdown).toMatchObject({ historico: { usado: true }, patrones: { alerta: true } })
    expect(['up', 'down', 'stable']).toContain(bea.tendencia)
    expect(ana.breakdown).toMatchObject({ historico: { usado: false }, cancha: { usado: false }, patrones: { alerta: false } })
    expect(ana.tendencia).toBeNull()
  })

  it('máscara por visor: la probabilidad de ganar es la misma para ambos participantes', async () => {
    cliente = fakeSupabase(TABLAS, CREADOR)
    const vistaAna = (await (await pedir()).json()).results
    cliente = fakeSupabase(TABLAS, RIVAL)
    const vistaBea = (await (await pedir()).json()).results
    expect(vistaAna.map((r: { winProbability: number }) => r.winProbability))
      .toEqual(vistaBea.map((r: { winProbability: number }) => r.winProbability))
  })

  it('espectador anónimo: todas las filas enmascaradas', async () => {
    cliente = fakeSupabase(TABLAS, null)
    const { results } = await (await pedir()).json()
    for (const r of results) {
      expect(r.tendencia).toBeNull()
      expect(r.narrativa).not.toMatch(/Patrón/)
      expect(r.breakdown).toMatchObject({ historico: { usado: false }, cancha: { usado: false }, patrones: { alerta: false } })
    }
  })

  // #511 — `profiles` es `TO authenticated`: con el cliente del request un anónimo
  // leía 0 filas SIN error y el GWI modelaba al jugador con índice 0 (en gross, su
  // varianza sale del índice). El índice va por el lector de servicio, para todos.
  it('índice de perfil (jugador con cuenta sin handicap en la tarjeta): lector de servicio, el anónimo ve el mismo GWI que un visor con sesión', async () => {
    const SIN_HCP = {
      ...RONDA,
      ronda_libre_jugadores: [RONDA.ronda_libre_jugadores[0], { ...RONDA.ronda_libre_jugadores[1], handicap: null }],
    }
    indicesDePerfil.mockImplementation(async (ids) => new Map(ids.includes(RIVAL) ? [[RIVAL, 30]] : []))
    cliente = fakeSupabase({ ...TABLAS, rondas_libres: SIN_HCP }, null)
    const anonimo = await (await pedir()).json()
    expect(cliente.consultas).not.toContain('profiles')
    expect(indicesDePerfil).toHaveBeenCalledWith([RIVAL])

    cliente = fakeSupabase({ ...TABLAS, rondas_libres: SIN_HCP }, 'u-otro-con-sesion')
    const conSesion = await (await pedir()).json()
    const probs = (j: { results: Array<{ winProbability: number }> }) => j.results.map(r => r.winProbability)
    expect(probs(anonimo)).toEqual(probs(conSesion))

    // Discrimina: si el índice no llegara (anónimo leyendo 0 filas), Bea se modelaría con 0.
    indicesDePerfil.mockImplementation(async () => new Map())
    cliente = fakeSupabase({ ...TABLAS, rondas_libres: SIN_HCP }, null)
    const conIndiceCero = await (await pedir()).json()
    expect(probs(conIndiceCero)).not.toEqual(probs(anonimo))
  })

  it('falla del lector de índices → 500 (nunca un GWI con índice 0)', async () => {
    indicesDePerfil.mockRejectedValueOnce(new Error('No se pudieron leer los índices de perfil: timeout'))
    cliente = fakeSupabase({
      ...TABLAS,
      rondas_libres: { ...RONDA, ronda_libre_jugadores: [{ ...RONDA.ronda_libre_jugadores[0], handicap: null }, RONDA.ronda_libre_jugadores[1]] },
    }, null)
    const res = await pedir()
    expect(res.status).toBe(500)
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
