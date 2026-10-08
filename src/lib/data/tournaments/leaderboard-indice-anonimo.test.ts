// @vitest-environment node
/**
 * Board público /torneo/[slug] de torneos con grupos en ronda libre, visor ANÓNIMO.
 *
 * `/api/torneos/[slug]/start` inserta la tarjeta individual con `user_id` y SIN
 * `handicap`: el índice sólo vive en `profiles.indice`. La policy SELECT de
 * `profiles` es `TO authenticated`: con el cliente del request un anónimo recibía
 * 0 filas → índice 0 → el Stableford/stroke play NETO del board publicado como
 * gross (3ª revisión Fable del #509). Ahora el índice lo lee el servidor con
 * `indicesDePerfil` (cliente de servicio), inyectado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Cliente de servicio: el único que ve el índice.
const tablasAdmin: string[] = []
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      tablasAdmin.push(t)
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.in = async () => ({ data: t === 'profiles' ? [{ id: 'u1', indice: 18 }] : [], error: null })
      return q
    },
  }),
}))

import { fetchRondaLibreJugadoresConCourseHcp } from './leaderboard'
import { indicesDePerfil } from '@/lib/data/indices-de-perfil'
import { buildLeaderboardFromRondaLibre } from '@/golf/leaderboard/build-from-ronda-libre'

const parEnLos18 = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i + 1), 4]))
let tarjetas: Array<Record<string, unknown>> = []
const tablasAnon: string[] = []

/** Cliente ANÓNIMO del request: profiles devuelve 0 filas SIN error (RLS). */
const anon = {
  from: (t: string) => {
    tablasAnon.push(t)
    const data = t === 'ronda_libre_jugadores' ? tarjetas
      : t === 'rondas_libres' ? [{ id: 'r1', course_id: null, holes: 18, recorridos: null, tees: 'azul' }]
      : []
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) q[m] = () => q
    q.in = async () => ({ data, error: null })
    return q
  },
} as unknown as Parameters<typeof fetchRondaLibreJugadoresConCourseHcp>[0]

beforeEach(() => {
  tablasAdmin.length = 0
  tablasAnon.length = 0
  tarjetas = [{ id: 'j1', nombre: 'Ana', user_id: 'u1', scores: parEnLos18, handicap: null, tees: 'azul', ronda_id: 'r1' }]
})

describe('fetchRondaLibreJugadoresConCourseHcp — visor anónimo', () => {
  it('el índice del perfil (18) llega aunque el cliente del request no vea profiles', async () => {
    const [ana] = await fetchRondaLibreJugadoresConCourseHcp(anon, ['r1'], 72, indicesDePerfil)
    expect(ana.handicap_index).toBe(18)
    // Sin cancha vinculada: course handicap = round(índice).
    expect(ana.handicap).toBe(18)
    expect(tablasAnon).not.toContain('profiles')
    expect(tablasAdmin).toEqual(['profiles'])
  })

  it('el board Stableford NETO puntúa con esos 18 golpes: par en los 18 = 54, no 36', async () => {
    const jugadores = await fetchRondaLibreJugadoresConCourseHcp(anon, ['r1'], 72, indicesDePerfil)
    const courseHoles = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
    const { players } = buildLeaderboardFromRondaLibre(jugadores, {
      parTotal: 72, totalHoyos: 18, modoJuego: 'neto', formatoJuego: 'stableford', courseHoles,
    })
    expect(players[0].stablefordTotal).toBe(54)
  })

  it('la tarjeta manda: con handicap en la tarjeta no se lee el perfil', async () => {
    tarjetas[0].handicap = 10
    const [ana] = await fetchRondaLibreJugadoresConCourseHcp(anon, ['r1'], 72, indicesDePerfil)
    expect(ana.handicap_index).toBe(10)
    expect(tablasAdmin).toEqual([])
  })
})
