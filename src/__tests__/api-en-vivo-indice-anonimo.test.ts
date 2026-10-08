/**
 * GET /api/en-vivo con un visor ANÓNIMO — 2ª revisión Fable del #509 (P0).
 *
 * `/api/torneos/[slug]/start` inserta la tarjeta individual con `user_id` y SIN
 * `handicap`: el índice sólo vive en `profiles.indice`. La única policy SELECT de
 * `profiles` es `TO authenticated`, así que con el cliente del request un anónimo
 * (el caso normal del feed y el que cachea el CDN) recibe 0 filas sin error →
 * índice 0 → el Stableford NETO se publicaba como gross.
 *
 * Cadena REAL: `cargarHoyosDelScorer`, `courseHandicapsDeRonda` y `buildLeaderboard`
 * sin mockear. Sólo son falsos los dos clientes de Supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const golpesEnLos9 = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), 4]))
let ronda = {
  id: 'r1', codigo: 'QA', course_name: 'Club QA', course_id: null as string | null, tees: 'azul', holes: 9,
  fecha: '2026-10-08', estado: 'en_curso', hoyo_inicio: 1, formato_juego: 'stableford', modo_juego: 'neto',
  recorridos: null,
  ronda_libre_jugadores: [{ id: 'j1', nombre: 'Ana', user_id: 'u1', scores: golpesEnLos9, handicap: null as number | null, tees: 'azul' }],
}
const rondaBase = structuredClone(ronda)
let rondasDelFeed: unknown[] | null = null

/** Cadena PostgREST mínima que registra qué se pidió. */
function query(data: unknown[], log?: unknown[][], error: { message: string } | null = null) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit', 'ilike']) {
    q[m] = (...args: unknown[]) => { log?.push([m, ...args]); return q }
  }
  q.then = (res: (v: unknown) => unknown) => Promise.resolve(error ? { data: null, error } : { data, error: null }).then(res)
  return q
}

const lecturasRequest: string[] = []
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => {
      lecturasRequest.push(t)
      // Anónimo: RLS de profiles devuelve 0 filas SIN error.
      return query(t === 'rondas_libres' ? (rondasDelFeed ?? [ronda]) : [])
    },
  }),
}))
let adminFalla = false
const llamadasAdmin: unknown[][] = []
const tablasAdmin: string[] = []
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      tablasAdmin.push(t)
      return query(t === 'profiles' ? [{ id: 'u1', indice: 18 }] : [], llamadasAdmin, adminFalla ? { message: 'timeout' } : null)
    },
  }),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { GET } from '@/app/api/en-vivo/route'

async function feed() {
  const res = await GET(new Request('http://localhost/api/en-vivo'))
  const texto = await res.text()
  return { texto, json: JSON.parse(texto) }
}

beforeEach(() => {
  ronda = structuredClone(rondaBase)
  lecturasRequest.length = 0
  llamadasAdmin.length = 0
  tablasAdmin.length = 0
  adminFalla = false
  rondasDelFeed = null
})

describe('GET /api/en-vivo — visor anónimo, índice sólo en el perfil', () => {
  it('Stableford neto 9h: el índice 18 del perfil da CH 9 → 18 + 9 = 27 pts (no 18 como gross)', async () => {
    const { json } = await feed()
    expect(json.rondas[0].jugadores[0].stablefordPts).toBe(27)
  })

  it('el índice se lee UNA vez, con el cliente de servicio, acotado a id e índice de esos usuarios', async () => {
    await feed()
    expect(tablasAdmin).toEqual(['profiles'])
    expect(llamadasAdmin).toContainEqual(['select', 'id, indice'])
    expect(llamadasAdmin).toContainEqual(['in', 'id', ['u1']])
    // Resuelto antes: la ronda ya no consulta profiles con el cliente del request.
    expect(lecturasRequest).not.toContain('profiles')
  })

  it('la respuesta pública no expone el índice ni el user_id', async () => {
    const { texto, json } = await feed()
    expect(texto).not.toContain('u1')
    expect(Object.keys(json.rondas[0].jugadores[0]).sort()).toEqual(
      ['holesCompleted', 'id', 'nombre', 'stablefordPts', 'totalGross', 'totalHoles', 'vsPar'],
    )
  })

  it('la tarjeta manda sobre el perfil: handicap 10 en la tarjeta → CH 5 → 23 pts, sin leer perfiles', async () => {
    ronda.ronda_libre_jugadores[0].handicap = 10
    const { json } = await feed()
    expect(json.rondas[0].jugadores[0].stablefordPts).toBe(23)
    expect(tablasAdmin).toEqual([])
  })

  it('si la lectura de índices falla, cae sólo la ronda neta (nunca se publica como gross); el feed sigue', async () => {
    adminFalla = true
    const gross = { ...structuredClone(rondaBase), id: 'r2', codigo: 'GROSS', modo_juego: 'gross' }
    const neto = ronda
    rondasDelFeed = [neto, gross]
    const res = await GET(new Request('http://localhost/api/en-vivo'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.rondas.map((r: { codigo: string }) => r.codigo)).toEqual(['GROSS'])
  })

  it('Stableford gross: no reparte golpes y no lee índices', async () => {
    ronda.modo_juego = 'gross'
    const { json } = await feed()
    expect(json.rondas[0].jugadores[0].stablefordPts).toBe(18)
    expect(tablasAdmin).toEqual([])
  })
})
