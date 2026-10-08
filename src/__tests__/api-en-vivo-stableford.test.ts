/**
 * GET /api/en-vivo — el feed público de rondas en vivo.
 *
 * Hallazgo 16 de la prueba de fuego Los Leones (04-oct-2026): en neto la ruta
 * repartía golpes con el ÍNDICE redondeado del jugador (`ronda_libre_jugadores.handicap`)
 * y no con su course handicap. En una vuelta de 9 hoyos eso es el DOBLE de golpes
 * (WHS: el course handicap de 9 sale del índice/2): un índice 18 a par en los 9 se
 * veía con 36 puntos en vez de 28. Ahora puntúa con la MISMA fuente que el scorer
 * (`cargarHoyosDelScorer` + `courseHandicapsDeRonda`) y el mismo motor que la
 * vista en vivo (`buildLeaderboard`).
 *
 * Revisión Fable (#509): un solo par por ronda (score vs par y puntos de la misma
 * fuente), lecturas memoizadas por cancha dentro del request, y una ronda que
 * falla sale del feed sin tumbarlo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoyos9 = (par: number) => ({
  parMap: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, par])) as Record<number, number>,
  holeDataMap: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, { numero: i + 1, par, stroke_index: i + 1, yardaje: null }])),
  finalParTotal: 9 * par,
})
const golpesEnLos9 = (g: number) => Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), g]))

type Ronda = {
  id: string; codigo: string; course_name: string; course_id: string | null; tees: string; holes: number
  fecha: string; estado: string; hoyo_inicio: number; formato_juego: string; modo_juego: string
  recorridos: string[] | null
  ronda_libre_jugadores: Array<{ id: string; nombre: string; user_id: null; scores: Record<string, number>; handicap: number; tees: string }>
}
function ronda(over: Partial<Ronda> = {}): Ronda {
  return {
    id: 'r1', codigo: 'QA1', course_name: 'Club QA', course_id: 'c1', tees: 'azul', holes: 9,
    fecha: '2026-10-08', estado: 'en_curso', hoyo_inicio: 1, formato_juego: 'stableford', modo_juego: 'neto',
    recorridos: null,
    // Índice 18 guardado en la tarjeta; su course handicap de 9 hoyos es 10. Par (4) en los 9.
    ronda_libre_jugadores: [{ id: 'j1', nombre: 'Ana', user_id: null, scores: golpesEnLos9(4), handicap: 18, tees: 'azul' }],
    ...over,
  }
}

let rondas: Ronda[] = []
const tablasConsultadas: string[] = []

/** Cadena PostgREST mínima: cualquier método encadena y el await resuelve. */
function query(data: unknown[]) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit', 'ilike']) q[m] = () => q
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res)
  return q
}

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => {
      tablasConsultadas.push(t)
      return query(t === 'rondas_libres' ? rondas : [])
    },
  }),
}))
const cargarHoyosDelScorer = vi.fn(async (_s: unknown, _r: { course_id: string | null }) => hoyos9(4))
vi.mock('@/lib/data/ronda-libre-scorer', () => ({
  cargarHoyosDelScorer: (s: unknown, r: { course_id: string | null }) => cargarHoyosDelScorer(s, r),
}))
const courseHandicapsDeRonda = vi.fn(async (..._a: unknown[]) => ({ courseHcpMap: { j1: 10 }, indexByJugador: { j1: 18 }, sinIndice: new Set(), courseDataByTee: {} }))
vi.mock('@/lib/data/ronda-libre', () => ({ courseHandicapsDeRonda: (...a: unknown[]) => courseHandicapsDeRonda(...a) }))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { GET } from '@/app/api/en-vivo/route'

async function feed() {
  const res = await GET(new Request('http://localhost/api/en-vivo'))
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  tablasConsultadas.length = 0
  rondas = [ronda()]
})

describe('GET /api/en-vivo — Stableford', () => {
  it('neto en 9 hoyos: reparte el course handicap (10), no el índice (18) → 18 + 10 = 28', async () => {
    const { json } = await feed()
    expect(json.rondas[0].jugadores[0].stablefordPts).toBe(28)
    // El course handicap se resuelve con el par de la ronda que usa el scorer.
    expect(courseHandicapsDeRonda).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'r1' }), 36, expect.any(Map))
  })

  it('gross: par en los 9 = 18 pts, sin golpes ni consulta de handicaps', async () => {
    rondas = [ronda({ modo_juego: 'gross' })]
    const { json } = await feed()
    expect(json.rondas[0].jugadores[0].stablefordPts).toBe(18)
    expect(courseHandicapsDeRonda).not.toHaveBeenCalled()
  })

  it('stroke play no consulta handicaps y no inventa puntos', async () => {
    rondas = [ronda({ formato_juego: 'stroke_play' })]
    const { json } = await feed()
    expect(json.rondas[0].jugadores[0].stablefordPts).toBe(0)
    expect(courseHandicapsDeRonda).not.toHaveBeenCalled()
  })
})

describe('GET /api/en-vivo — un solo par por ronda', () => {
  it('score vs par y puntos salen de los hoyos del scorer (club 27h: el padre no tiene filas propias)', async () => {
    // Recorrido de par 5 en todos los hoyos; el jugador hace 5 en cada uno.
    // Con el catálogo propio de la ruta (0 filas en el padre → par 4) saldría "+9".
    cargarHoyosDelScorer.mockResolvedValueOnce(hoyos9(5))
    rondas = [ronda({ modo_juego: 'gross', recorridos: ['norte'], ronda_libre_jugadores: [
      { id: 'j1', nombre: 'Ana', user_id: null, scores: golpesEnLos9(5), handicap: 18, tees: 'azul' },
    ] })]
    const { json } = await feed()
    const ana = json.rondas[0].jugadores[0]
    expect(ana.vsPar).toBe(0)
    expect(ana.stablefordPts).toBe(18)
    // Ya no hay un segundo catálogo de hoyos en la ruta.
    expect(tablasConsultadas).not.toContain('course_holes')
  })
})

describe('GET /api/en-vivo — memo por request y aislamiento', () => {
  it('dos rondas en la misma cancha leen los hoyos UNA vez y comparten el memo de ratings', async () => {
    rondas = [ronda({ id: 'r1', codigo: 'QA1' }), ronda({ id: 'r2', codigo: 'QA2' })]
    await feed()
    expect(cargarHoyosDelScorer).toHaveBeenCalledTimes(1)
    expect(courseHandicapsDeRonda).toHaveBeenCalledTimes(2)
    const [a, b] = courseHandicapsDeRonda.mock.calls
    expect(a[3]).toBeInstanceOf(Map)
    expect(a[3]).toBe(b[3])
  })

  it('canchas distintas no comparten hoyos', async () => {
    rondas = [ronda({ id: 'r1', course_id: 'c1' }), ronda({ id: 'r2', course_id: 'c2' })]
    await feed()
    expect(cargarHoyosDelScorer).toHaveBeenCalledTimes(2)
  })

  it('misma cancha a 9 y a 18 hoyos no comparten hoyos', async () => {
    rondas = [ronda({ id: 'r1', holes: 9 }), ronda({ id: 'r2', holes: 18 })]
    await feed()
    expect(cargarHoyosDelScorer).toHaveBeenCalledTimes(2)
  })

  it('misma cancha con recorridos distintos (27h) no comparte hoyos', async () => {
    rondas = [ronda({ id: 'r1', recorridos: ['norte'] }), ronda({ id: 'r2', recorridos: ['sur'] })]
    await feed()
    expect(cargarHoyosDelScorer).toHaveBeenCalledTimes(2)
  })

  it('una ronda que falla sale del feed; el resto se publica (200, no 500)', async () => {
    cargarHoyosDelScorer.mockImplementation(async (_s, r) => {
      if (r.course_id === 'c-rota') throw new Error('timeout')
      return hoyos9(4)
    })
    rondas = [ronda({ id: 'r1', codigo: 'BIEN' }), ronda({ id: 'r2', codigo: 'ROTA', course_id: 'c-rota' })]
    const { status, json } = await feed()
    expect(status).toBe(200)
    expect(json.rondas.map((r: { codigo: string }) => r.codigo)).toEqual(['BIEN'])
    expect(json.total).toBe(1)
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'api.en-vivo.ronda' }))
    cargarHoyosDelScorer.mockImplementation(async () => hoyos9(4))
  })
})
