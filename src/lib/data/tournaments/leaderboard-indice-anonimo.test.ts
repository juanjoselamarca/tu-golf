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
import { boardPublicoRondaLibre, gwiDelBoardPublico, vistaPublica } from './vista-publica'
import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'

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

describe('board público — qué VIAJA según el visor (decisiones de producto 08-oct)', () => {
  const courseHoles = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
  // Ana (cuenta, índice 18 del perfil): par en los 18 → 72 bruto, 54 neto/pts netos.
  // Beto (invitado, 12 en la tarjeta): un bogey en cada hoyo → 90 bruto.
  const beto = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i + 1), 5]))

  /** Lo mismo que llama /torneo/[slug]/page.tsx (camino ronda libre): fetch real + `boardPublicoRondaLibre`. */
  async function board(
    visorConSesion: boolean, modoJuego: ModoJuego, formatoJuego: FormatoJuego,
    golpes: { ana?: Record<string, number>; beto?: Record<string, number> } = {},
  ) {
    tarjetas = [
      { id: 'j1', nombre: 'Ana (cuenta)', user_id: 'u1', scores: golpes.ana ?? parEnLos18, handicap: null, tees: 'azul', ronda_id: 'r1' },
      { id: 'j2', nombre: 'Beto (invitado)', user_id: null, scores: golpes.beto ?? beto, handicap: 12, tees: 'azul', ronda_id: 'r1' },
    ]
    const vista = vistaPublica({ visorConSesion, caminoRondaLibre: true, modoJuego, formatoJuego })
    const jugadores = await fetchRondaLibreJugadoresConCourseHcp(anon, ['r1'], 72, indicesDePerfil)
    const out = boardPublicoRondaLibre(jugadores, { parTotal: 72, totalHoyos: 18, modoJuego, formatoJuego, courseHoles }, vista)
    return { vista, ...out }
  }
  const de = <T extends { id?: string }>(ps: T[], id: string) => ps.find((p) => p.id === id)!

  it('Stableford NETO sin sesión: sólo bruto — ni neto, ni puntos, ni handicap de nadie, en ningún campo', async () => {
    const { vista, players, playersByNeto, gwiInputs } = await board(false, 'neto', 'stableford')
    expect(vista.soloBruto).toBe(true)
    expect(playersByNeto).toEqual([])
    expect(gwiInputs).toEqual([])
    for (const p of players) {
      expect(p.hcp).toBeNull()
      expect(p.hcpDisplay).toBeNull()
      expect(p).not.toHaveProperty('netTotal')
      expect(p).not.toHaveProperty('stablefordTotal')
    }
    // Ni el 54 (neto/puntos de Ana) ni el 18/12 (handicaps) viajan en la fila.
    const texto = JSON.stringify(players)
    expect(texto).not.toMatch(/:54|"hcp":(18|12)/)
    // El orden y el score son los BRUTOS: Ana (72, a par) primero, Beto (+18) después.
    expect(players.map((p) => p.id)).toEqual(['j1', 'j2'])
    expect(de(players, 'j1').total).toBe(0)
    expect(de(players, 'j2').total).toBe(18)
  })

  it('Stroke play NETO sin sesión: el orden es el BRUTO aunque el neto lo invierta', async () => {
    // Ana 88 bruto (+16), neto 88−18 = 70 (−2). Beto 84 bruto (+12), neto 84−12 = 72 (a par).
    // Neto: Ana 1°. Bruto: Beto 1°. Sin sesión tiene que verse el bruto.
    const ana = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i + 1), i < 2 ? 4 : 5]))
    const beto84 = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i + 1), i < 6 ? 4 : 5]))
    const anon = await board(false, 'neto', 'stroke_play', { ana, beto: beto84 })
    expect(anon.players.map((p) => p.id)).toEqual(['j2', 'j1'])
    expect(anon.players.map((p) => p.total)).toEqual([12, 16])
    expect(anon.players.every((p) => p.hcp === null && !('netTotal' in p))).toBe(true)
    // Control: con sesión el ranking primario de un torneo neto es el neto (Ana 1°).
    const conSesion = await board(true, 'neto', 'stroke_play', { ana, beto: beto84 })
    expect(conSesion.players.map((p) => p.id)).toEqual(['j1', 'j2'])
  })

  it('con sesión: todo — neto, puntos netos y handicap real', async () => {
    const { vista, players, playersByNeto } = await board(true, 'neto', 'stableford')
    expect(vista.sinNeto).toBe(false)
    const ana = de(players, 'j1')
    expect(ana.hcp).toBe(18)
    expect(ana.stablefordTotal).toBe(54)
    expect(ana.netTotal).toBe(54)
    expect(playersByNeto.length).toBe(2)
  })

  it('torneo GROSS sin sesión: sin neto; handicap oculto sólo al jugador con cuenta; puntos gross visibles', async () => {
    const { vista, players } = await board(false, 'gross', 'stableford')
    expect(vista.soloBruto).toBe(false)
    expect(de(players, 'j1').hcp).toBeNull()
    expect(de(players, 'j2').hcp).toBe(12)
    expect(de(players, 'j1').stablefordTotal).toBe(36)
    expect(players.every((p) => !('netTotal' in p))).toBe(true)
  })
})

describe('GWI del board público — el handicap del jugador con cuenta no viaja sin sesión', () => {
  const courseHoles = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
  // A mitad de ronda (9 hoyos) para que el GWI tenga algo que calcular.
  const nueve = (g: number) => Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), g]))

  /** Mismas dos funciones que llama /torneo/[slug]/page.tsx. */
  async function gwi(visorConSesion: boolean) {
    tarjetas = [
      { id: 'j1', nombre: 'Ana (cuenta)', user_id: 'u1', scores: nueve(4), handicap: null, tees: 'azul', ronda_id: 'r1' },
      { id: 'j2', nombre: 'Beto (invitado)', user_id: null, scores: nueve(5), handicap: 7, tees: 'azul', ronda_id: 'r1' },
    ]
    const vista = vistaPublica({ visorConSesion, caminoRondaLibre: true, modoJuego: 'gross', formatoJuego: 'stroke_play' })
    const jugadores = await fetchRondaLibreJugadoresConCourseHcp(anon, ['r1'], 72, indicesDePerfil)
    const board = boardPublicoRondaLibre(jugadores, { parTotal: 72, totalHoyos: 18, modoJuego: 'gross', formatoJuego: 'stroke_play', courseHoles }, vista)
    return gwiDelBoardPublico(board, { totalHoyos: 18, modoJuego: vista.modo, formatoJuego: vista.formato })
  }
  const fila = (g: Awaited<ReturnType<typeof gwi>>, id: string) => g.results.find((r) => r.id === id)!

  it('torneo GROSS sin sesión: el handicap de Ana (18) no está en la respuesta publicada; el del invitado sí', async () => {
    const g = await gwi(false)
    expect(fila(g, 'j1').breakdown.handicapInfo).toBeNull()
    expect(fila(g, 'j2').breakdown.handicapInfo?.handicap).toBe(7)
    expect(JSON.stringify(g)).not.toMatch(/"handicap":18/)
  })

  it('con sesión: el handicap de Ana viaja', async () => {
    const g = await gwi(true)
    expect(fila(g, 'j1').breakdown.handicapInfo?.handicap).toBe(18)
    expect(JSON.stringify(g)).toMatch(/"handicap":18/)
  })
})
