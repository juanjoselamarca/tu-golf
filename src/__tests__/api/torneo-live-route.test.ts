/**
 * GET /api/torneo/[slug]/live — leaderboard en vivo de un torneo, cacheable en el
 * CDN (reemplazo de Supabase Realtime + router.refresh, incidente Los Leones).
 * Cadena real: route → fetchTorneoEnVivoRow → armarTorneoEnVivo → motor + regla
 * canónica de #509 (`vistaPublica`, `boardPublicoRondaLibre`); sólo Supabase y la
 * lectura de índices (`indicesDePerfil`) son falsos. Contrato:
 * - misma respuesta para todos (cliente anónimo, sin cookies) y cache en el CDN;
 * - `profiles` jamás con el cliente anónimo; el índice sólo vía `indicesDePerfil`;
 * - camino de RONDA LIBRE, visor sin sesión: nada neto; torneo neto → sólo bruto;
 * - torneos LEGACY: completos para cualquiera (decisión 2 de #509);
 * - errores de la base NUNCA al CDN; query strings → 400 sin consultar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Res = { data: unknown; error: unknown }
const consultasAnon: string[] = []
let tablas: Record<string, unknown> = {}
let errorEn: string | null = null

function fake(datos: () => Record<string, unknown>) {
  return {
    from(tabla: string) {
      consultasAnon.push(tabla)
      const res = (): Res => (errorEn === tabla
        ? { data: null, error: { code: '57014', message: 'statement timeout' } }
        : { data: datos()[tabla] ?? null, error: null })
      const b: unknown = new Proxy({}, {
        get(_t, k) {
          if (k === 'then') return (ok: (r: Res) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, ko)
          if (k === 'single' || k === 'maybeSingle') return async () => {
            const r = res()
            return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data }
          }
          return () => b
        },
      })
      return b
    },
  }
}

const createAnonClient = vi.fn(() => fake(() => tablas))
vi.mock('@/utils/supabase/anon', () => ({ createAnonClient: () => createAnonClient() }))
const indicesDePerfil = vi.fn(async (ids: readonly string[]) => new Map(ids.filter((id) => id === 'u-ana').map((id) => [id, INDICE_DE_PERFIL] as [string, number])))
vi.mock('@/lib/data/indices-de-perfil', () => ({ indicesDePerfil: (ids: readonly string[]) => indicesDePerfil(ids) }))
vi.mock('@/utils/supabase/server', () => ({ createClient: () => { throw new Error('la ruta pública no puede leer la sesión') } }))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { GET } from '@/app/api/torneo/[slug]/live/route'

const INDICE_DE_PERFIL = 27.3
const hoyos = (golpes: number[]) => golpes.map((g, i) => ({ hole_number: i + 1, gross_score: g }))
const CATALOGO = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
const BASE = {
  id: 't1', slug: 'copa-qa', name: 'Copa QA', format: 'stroke_play', formato_juego: 'stroke_play', modo_juego: 'neto',
  hole_count: 9, total_rounds: 1, status: 'in_progress', date_start: '2026-10-08', date_end: '2026-10-08',
  course_id: 'cancha-1', tees: 'azul', hcp_calc_mode: null, courses: { nombre: 'QA', par_total: 36 },
  categories: [{ id: 'c1', name: 'General' }],
}
// ── Legacy: players + rounds + hole_scores (sin grupos de ronda libre) ──
const LEGACY = { ...BASE, tournament_groups: [{ id: 'g1', name: 'Grupo 1', ronda_libre_id: null, tournament_group_players: [{ player_id: 'p1' }] }] }
const PLAYERS = [{
  id: 'p1', handicap_at_registration: 12.4, player_name: 'Pablo', category_id: 'c1', tee_id: null, genero: null,
  profiles: null, categories: { name: 'General', default_tee_color: null, gender: null },
  rounds: [{ id: 'r1', status: 'in_progress', total_gross: null, total_net: null, total_points: null, round_number: 1, hole_scores: hoyos([4, 5, 3]) }],
}]
// ── Camino de ronda libre: grupos con ronda_libre_id ──
const RL = { ...BASE, tournament_groups: [{ id: 'g1', name: 'Grupo 1', ronda_libre_id: 'rl1', tournament_group_players: [] }] }
const JUGADORES = [
  { id: 'j-ana', nombre: 'Ana', user_id: 'u-ana', scores: { 1: 5, 2: 5, 3: 5 }, handicap: null, tees: 'azul', ronda_id: 'rl1' },
  { id: 'j-inv', nombre: 'Invitada', user_id: null, scores: { 1: 4, 2: 4, 3: 4 }, handicap: 14, tees: 'azul', ronda_id: 'rl1' },
]

const pedir = (slug = 'copa-qa', query = '') =>
  GET(new Request(`http://localhost/api/torneo/${slug}/live${query}`), { params: Promise.resolve({ slug }) })

beforeEach(() => {
  vi.clearAllMocks()
  consultasAnon.length = 0
  errorEn = null
  tablas = { tournaments: LEGACY, players: PLAYERS, course_holes: CATALOGO, course_tees: [], courses: null }
})

describe('GET /api/torneo/[slug]/live', () => {
  it('200 cacheable en el CDN (no en el navegador) con sólo las claves de la vista', async () => {
    const res = await pedir()
    expect(res.status).toBe(200)
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBe('max-age=10, stale-while-revalidate=30')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate')
    const json = await res.json()
    expect(Object.keys(json).sort()).toEqual(['categories', 'groups', 'players', 'teams', 'tournament'])
    expect(json.groups).toEqual([{ id: 'g1', name: 'Grupo 1' }])
    expect(json.players[0]).toMatchObject({ id: 'p1', gross_total: 12, thru: 3, group_id: 'g1', category_id: 'c1' })
  })

  it('torneo LEGACY neto: completo para cualquiera (decisión 2 de #509) — HCP de inscripción y neto', async () => {
    const json = await (await pedir()).json()
    expect(json.tournament).toMatchObject({ modo: 'neto', caminoRondaLibre: false, vista: { sinNeto: false, soloBruto: false } })
    expect(json.players[0].handicap_index).toBe(12.4)
    expect(json.players[0].net_total).toBeDefined()
    expect(consultasAnon).not.toContain('profiles')
  })

  it('camino de RONDA LIBRE, torneo NETO, sin sesión: sólo bruto — sin HCP, neto ni puntos (las claves ni existen)', async () => {
    tablas = { ...tablas, tournaments: { ...RL, format: 'stableford', formato_juego: 'stableford' }, ronda_libre_jugadores: JUGADORES, rondas_libres: [{ id: 'rl1', course_id: 'cancha-1', holes: 9, recorridos: null, tees: 'azul' }] }
    const res = await pedir()
    const texto = await res.text()
    const json = JSON.parse(texto)
    expect(json.tournament).toMatchObject({ modo: 'gross', format: 'stroke_play', modoReal: 'neto', caminoRondaLibre: true, vista: { soloBruto: true } })
    // Ranking BRUTO: la invitada (12 golpes) adelante de Ana (15), aunque en neto ganaría Ana.
    expect(json.players.map((p: { name: string }) => p.name)).toEqual(['Invitada', 'Ana'])
    for (const p of json.players) {
      expect(p.handicap_index).toBeUndefined()
      expect(p.net_total).toBeUndefined()
      expect(p.points_total).toBeUndefined()
      expect(Object.keys(p)).not.toContain('handicap_index')
    }
    expect(json.players[0].group_id).toBe('g1')
    expect(texto).not.toContain(String(INDICE_DE_PERFIL))
    // El índice del perfil se leyó por la canónica (entra al cálculo), nunca con el anónimo.
    expect(consultasAnon).not.toContain('profiles')
    expect(indicesDePerfil).toHaveBeenCalledWith(['u-ana'])
  })

  it('camino de RONDA LIBRE, torneo GROSS, sin sesión: nada neto; el HCP del jugador con cuenta no viaja, el de la invitada sí', async () => {
    tablas = { ...tablas, tournaments: { ...RL, modo_juego: 'gross' }, ronda_libre_jugadores: JUGADORES, rondas_libres: [{ id: 'rl1', course_id: 'cancha-1', holes: 9, recorridos: null, tees: 'azul' }] }
    const json = await (await pedir()).json()
    expect(json.tournament.vista).toMatchObject({ sinNeto: true, soloBruto: false })
    const porNombre = Object.fromEntries(json.players.map((p: { name: string }) => [p.name, p]))
    expect(porNombre.Ana.handicap_index).toBeUndefined()
    expect(porNombre.Invitada.handicap_index).toBeDefined()
    for (const p of json.players) expect(p.net_total).toBeUndefined()
  })

  it('scramble NETO (ronda libre), sin sesión: equipos en BRUTO, sin handicap; el índice de perfil sólo por la canónica', async () => {
    tablas = {
      ...tablas,
      tournaments: { ...RL, format: 'scramble', formato_juego: 'scramble' },
      ronda_libre_jugadores: JUGADORES,
      rondas_libres: [{ id: 'rl1', course_id: 'cancha-1', holes: 9, recorridos: null, tees: 'azul' }],
      tournament_groups: [{ id: 'g1', name: 'Grupo 1', ronda_libre_id: 'rl1' }],
      ronda_equipos: [{ id: 'e1', nombre: 'Los Leones', handicap_equipo: null, scores: { 1: 4, 2: 3 }, ronda_id: 'rl1', ronda_equipo_jugadores: [{ jugador_id: 'j-ana', orden: 0 }, { jugador_id: 'j-inv', orden: 1 }] }],
    }
    const res = await pedir()
    const texto = await res.text()
    const json = JSON.parse(texto)
    expect(json.teams).toHaveLength(1)
    expect(json.teams[0]).toMatchObject({ id: 'e1', name: 'Los Leones', thru: 2, team_total: 7 }) // 4 + 3 brutos
    expect(json.teams[0].players.map((p: { name: string }) => p.name)).toEqual(['Ana', 'Invitada'])
    expect(texto).not.toMatch(/handicap_index|handicap_equipo|teamHandicap/)
    expect(consultasAnon).not.toContain('profiles')
  })

  it('torneo inexistente o no público → 404 cache corto', async () => {
    tablas = { ...tablas, tournaments: null }
    const res = await pedir('no-existe')
    expect(res.status).toBe(404)
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBe('max-age=10')
  })

  it('slug con forma inválida o query string → sin consultar la base', async () => {
    expect((await pedir('Copa QA;drop')).status).toBe(404)
    const r = await pedir('copa-qa', '?x=1')
    expect(r.status).toBe(400)
    expect(r.headers.get('Cache-Control')).toBe('private, no-store')
    expect(createAnonClient).not.toHaveBeenCalled()
  })

  it('base caída (statement timeout) → 503 y NUNCA al CDN', async () => {
    errorEn = 'tournaments'
    const res = await pedir()
    expect(res.status).toBe(503)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBeNull()
  })
})
