/**
 * GET /api/en-vivo — puntos Stableford del feed público de rondas en vivo.
 *
 * Hallazgo 16 de la prueba de fuego Los Leones (04-oct-2026): en neto la ruta
 * repartía golpes con el ÍNDICE redondeado del jugador (`ronda_libre_jugadores.handicap`)
 * y no con su course handicap. En una vuelta de 9 hoyos eso es el DOBLE de golpes
 * (WHS: el course handicap de 9 sale del índice/2): un índice 18 a par en los 9 se
 * veía con 36 puntos en vez de 28. Ahora puntúa con la MISMA fuente que el scorer
 * (`cargarHoyosDelScorer` + `courseHandicapsDeRonda`) y el mismo motor que la
 * vista en vivo (`buildLeaderboard`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const PAR_9 = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, 4])) as Record<number, number>
const PAR_EN_LOS_9 = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), 4]))

const ronda = {
  id: 'r1', codigo: 'QA', course_name: 'Club QA', course_id: 'c1', tees: 'azul', holes: 9,
  fecha: '2026-10-08', estado: 'en_curso', hoyo_inicio: 1, formato_juego: 'stableford', modo_juego: 'neto',
  recorridos: null,
  ronda_libre_jugadores: [
    // Índice 18 guardado en la tarjeta; su course handicap de 9 hoyos es 10.
    { id: 'j1', nombre: 'Ana', user_id: null, scores: PAR_EN_LOS_9, handicap: 18, tees: 'azul' },
  ],
}

/** Cadena PostgREST mínima: cualquier método encadena y el await resuelve. */
function query(data: unknown[]) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit', 'ilike']) q[m] = () => q
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res)
  return q
}

vi.mock('@/utils/supabase/server', () => ({
  // `course_holes` vacío: si la ruta usara su propio catálogo, caería a par 4 / SI = nº de hoyo.
  createClient: async () => ({ from: (t: string) => query(t === 'rondas_libres' ? [ronda] : []) }),
}))
const cargarHoyosDelScorer = vi.fn(async () => ({
  parMap: PAR_9,
  holeDataMap: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, { numero: i + 1, par: 4, stroke_index: i + 1, yardaje: null }])),
  finalParTotal: 36,
}))
vi.mock('@/lib/data/ronda-libre-scorer', () => ({ cargarHoyosDelScorer: (...a: unknown[]) => cargarHoyosDelScorer(...(a as [])) }))
const courseHandicapsDeRonda = vi.fn(async () => ({ courseHcpMap: { j1: 10 }, indexByJugador: { j1: 18 }, sinIndice: new Set(), courseDataByTee: {} }))
vi.mock('@/lib/data/ronda-libre', () => ({ courseHandicapsDeRonda: (...a: unknown[]) => courseHandicapsDeRonda(...(a as [])) }))

import { GET } from '@/app/api/en-vivo/route'

async function puntosDeAna(): Promise<number> {
  const res = await GET(new Request('http://localhost/api/en-vivo'))
  const json = await res.json()
  return json.rondas[0].jugadores[0].stablefordPts
}

beforeEach(() => {
  vi.clearAllMocks()
  ronda.modo_juego = 'neto'
})

describe('GET /api/en-vivo — Stableford', () => {
  it('neto en 9 hoyos: reparte el course handicap (10), no el índice (18) → 18 + 10 = 28', async () => {
    expect(await puntosDeAna()).toBe(28)
    // El course handicap se resuelve con el par de la ronda que usa el scorer.
    expect(courseHandicapsDeRonda).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'r1' }), 36)
  })

  it('gross: par en los 9 = 18 pts, sin golpes', async () => {
    ronda.modo_juego = 'gross'
    expect(await puntosDeAna()).toBe(18)
  })

  it('stroke play no consulta handicaps ni hoyos extra', async () => {
    ronda.formato_juego = 'stroke_play'
    try {
      expect(await puntosDeAna()).toBe(0)
      expect(cargarHoyosDelScorer).not.toHaveBeenCalled()
      expect(courseHandicapsDeRonda).not.toHaveBeenCalled()
    } finally {
      ronda.formato_juego = 'stableford'
    }
  })
})
