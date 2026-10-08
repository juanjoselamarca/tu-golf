/**
 * GWI de TORNEO en Stableford GROSS — gemelo del bug de la ronda libre (hotfix #504).
 *
 * `gwiDeTorneo` le pasaba el course handicap del gate al marcador del GWI aunque el
 * torneo fuera gross: el panel "probabilidad de ganar" rankeaba con puntos NETOS
 * mientras la tabla (por puntos gross) mostraba otro orden. Este test llama a la RUTA
 * real y mira qué handicap le entrega al motor del GWI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase } from './gwi-server/fake-supabase'

let cliente: ReturnType<typeof fakeSupabase>
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn(async () => cliente) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

const llamadas: Array<{ courseHcp: number; totalStableford: number }> = []
vi.mock('@/golf/stats/gwi', async (orig) => {
  const real = await orig<typeof import('@/golf/stats/gwi')>()
  return {
    ...real,
    marcadorEnCursoGWI: (input: Parameters<typeof real.marcadorEnCursoGWI>[0]) => {
      const out = real.marcadorEnCursoGWI(input)
      llamadas.push({ courseHcp: input.courseHcp, totalStableford: out.totalStableford })
      return out
    },
  }
})

import { GET } from '@/app/api/gwi/torneo/[slug]/route'

// Cancha sin catálogo → hoyos neutros par 4. Gate `raw` (hcp_calc_mode null):
// el course handicap es `handicap_at_registration` = 21.
const torneo = {
  id: 't1', name: 'Copa Stableford', hole_count: 18, total_rounds: 1, date_start: null, course_id: null, tees: null,
  hcp_calc_mode: null, modo_juego: 'gross', formato_juego: 'stableford', format: 'stableford',
  organizer_id: 'u-org', courses: null,
}
const parEnLos18 = Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, gross_score: 4 }))
const TABLAS = {
  tournaments: torneo,
  players: [{
    id: 'p1', user_id: null, handicap_at_registration: 21, tee_id: null, genero: null,
    profiles: { name: 'Ana', indice: 18 }, categories: null,
    rounds: [{ id: 'r1', status: 'in_progress', round_number: 1, total_gross: 0, hole_scores: parEnLos18 }],
  }],
}

const pedir = () => GET(new Request('http://localhost/api/gwi/torneo/copa'), { params: Promise.resolve({ slug: 'copa' }) })

beforeEach(() => { llamadas.length = 0 })

describe('GET /api/gwi/torneo — Stableford', () => {
  it('gross: el motor del GWI recibe handicap 0 y cuenta 36 pts con par en los 18', async () => {
    cliente = fakeSupabase(TABLAS, null)
    expect((await pedir()).status).toBe(200)
    expect(llamadas).toEqual([{ courseHcp: 0, totalStableford: 36 }])
  })

  it('neto: el motor sigue recibiendo el course handicap (36 + 21 = 57)', async () => {
    torneo.modo_juego = 'neto'
    try {
      cliente = fakeSupabase(TABLAS, null)
      await pedir()
      expect(llamadas).toEqual([{ courseHcp: 21, totalStableford: 57 }])
    } finally {
      torneo.modo_juego = 'gross'
    }
  })
})
