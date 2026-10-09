/**
 * GET /api/en-vivo — el feed público de rondas en vivo.
 *
 * Decisión de producto (Juanjo, 08-oct-2026), "solo bruto": el feed es público y el
 * CDN lo cachea igual para todos, así que NUNCA lleva nada neto. En Stableford neto
 * no viajan puntos (con ellos y el bruto se deduce el handicap): la ronda se
 * publica con golpes brutos. Stableford GROSS sí publica puntos (no dependen del
 * handicap). Reemplaza el cálculo neto con course handicap de las vueltas
 * anteriores del #509 (hallazgo 16): en este feed ya no hay neto que calcular.
 *
 * Además (revisión Fable #509): un solo par por ronda (score vs par y puntos de la
 * misma fuente que el scorer), lecturas de hoyos memoizadas por cancha dentro del
 * request, y una ronda que falla sale del feed sin tumbarlo.
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
  fecha: string; created_at: string; estado: string; hoyo_inicio: number; formato_juego: string; modo_juego: string
  recorridos: string[] | null
  ronda_libre_jugadores: Array<{ id: string; nombre: string; user_id: string | null; scores: Record<string, number>; handicap: number | null; tees: string }>
}
function ronda(over: Partial<Ronda> = {}): Ronda {
  return {
    id: 'r1', codigo: 'QA1', course_name: 'Club QA', course_id: 'c1', tees: 'azul', holes: 9,
    fecha: '2026-10-08', created_at: '2026-10-08T22:40:00+00:00', estado: 'en_curso', hoyo_inicio: 1, formato_juego: 'stableford', modo_juego: 'gross',
    recorridos: null,
    // Un jugador con cuenta SIN handicap en la tarjeta (como las inserta `start`) y un
    // invitado con índice 18. Par en los 9 los dos.
    ronda_libre_jugadores: [
      { id: 'j1', nombre: 'Ana', user_id: 'u1', scores: golpesEnLos9(4), handicap: null, tees: 'azul' },
      { id: 'j2', nombre: 'Beto', user_id: null, scores: golpesEnLos9(4), handicap: 18, tees: 'azul' },
    ],
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
const tablasAdmin: string[] = []
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({ from: (t: string) => { tablasAdmin.push(t); return query([]) } }),
}))
const cargarHoyosDelScorer = vi.fn(async (_s: unknown, _r: { course_id: string | null }) => hoyos9(4))
vi.mock('@/lib/data/ronda-libre-scorer', () => ({
  cargarHoyosDelScorer: (s: unknown, r: { course_id: string | null }) => cargarHoyosDelScorer(s, r),
}))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { GET } from '@/app/api/en-vivo/route'

async function feed() {
  const res = await GET(new Request('http://localhost/api/en-vivo'))
  const texto = await res.text()
  return { status: res.status, texto, json: JSON.parse(texto) }
}

beforeEach(() => {
  vi.clearAllMocks()
  tablasConsultadas.length = 0
  tablasAdmin.length = 0
  rondas = [ronda()]
})

const CLAVES_JUGADOR = ['holesCompleted', 'id', 'nombre', 'stablefordPts', 'totalGross', 'totalHoles', 'vsPar']

describe('GET /api/en-vivo — solo bruto', () => {
  it('Stableford NETO: sin puntos (null), muestra_puntos=false y score vs par BRUTO', async () => {
    rondas = [ronda({ modo_juego: 'neto' })]
    const { json, texto } = await feed()
    const r = json.rondas[0]
    expect(r.muestra_puntos).toBe(false)
    for (const j of r.jugadores) {
      expect(Object.keys(j).sort()).toEqual(CLAVES_JUGADOR)
      expect(j.stablefordPts).toBeNull()
      expect(j.vsPar).toBe(0)
      expect(j.totalGross).toBe(36)
    }
    // Nada de lo que delata el handicap: ni puntos netos, ni user_id, ni índice.
    expect(texto).not.toMatch(/"stablefordPts":\d|u1|"handicap/)
  })

  it('Stableford NETO: no lee perfiles ni handicaps (no hay neto que calcular)', async () => {
    rondas = [ronda({ modo_juego: 'neto' })]
    await feed()
    expect(tablasConsultadas).not.toContain('profiles')
    expect(tablasAdmin).toEqual([])
  })

  it('Stableford GROSS: publica puntos contra el par (par en los 9 = 18), sin golpes', async () => {
    const { json } = await feed()
    expect(json.rondas[0].muestra_puntos).toBe(true)
    expect(json.rondas[0].jugadores.map((j: { stablefordPts: number }) => j.stablefordPts)).toEqual([18, 18])
  })

  it('stroke play (gross o neto): sin puntos, score vs par bruto', async () => {
    rondas = [ronda({ formato_juego: 'stroke_play', modo_juego: 'neto' })]
    const { json } = await feed()
    expect(json.rondas[0].muestra_puntos).toBe(false)
    expect(json.rondas[0].jugadores[0].stablefordPts).toBeNull()
    expect(json.rondas[0].jugadores[0].vsPar).toBe(0)
  })
})

describe('GET /api/en-vivo — un solo par por ronda', () => {
  it('score vs par y puntos salen de los hoyos del scorer (club 27h: el padre no tiene filas propias)', async () => {
    // Recorrido de par 5 en todos los hoyos; el jugador hace 5 en cada uno.
    // Con el catálogo propio de la ruta (0 filas en el padre → par 4) saldría "+9".
    cargarHoyosDelScorer.mockResolvedValueOnce(hoyos9(5))
    rondas = [ronda({ recorridos: ['norte'], ronda_libre_jugadores: [
      { id: 'j1', nombre: 'Ana', user_id: null, scores: golpesEnLos9(5), handicap: 18, tees: 'azul' },
    ] })]
    const { json } = await feed()
    const ana = json.rondas[0].jugadores[0]
    expect(ana.vsPar).toBe(0)
    expect(ana.stablefordPts).toBe(18)
    expect(tablasConsultadas).not.toContain('course_holes')
  })
})

describe('GET /api/en-vivo — memo por request y aislamiento', () => {
  it('dos rondas en la misma cancha leen los hoyos UNA vez', async () => {
    rondas = [ronda({ id: 'r1', codigo: 'QA1' }), ronda({ id: 'r2', codigo: 'QA2' })]
    await feed()
    expect(cargarHoyosDelScorer).toHaveBeenCalledTimes(1)
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
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'api.en-vivo.ronda' }))
    cargarHoyosDelScorer.mockImplementation(async () => hoyos9(4))
  })
})

describe('GET /api/en-vivo — hora de inicio', () => {
  it('"inicio" es created_at, no `fecha` (un DATE = medianoche UTC → "Hace 12h" falso)', async () => {
    const { json } = await feed()
    expect(json.rondas[0].inicio).toBe('2026-10-08T22:40:00+00:00')
    expect(json.rondas[0].fecha).toBe('2026-10-08')
  })
})
