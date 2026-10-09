/**
 * GET /api/torneo/[slug]/live — leaderboard en vivo de un torneo, cacheable en el
 * CDN (reemplazo de Supabase Realtime + router.refresh, incidente Los Leones).
 * Cadena real: route → fetchTorneoEnVivoRow → armarTorneoEnVivo → motor; sólo
 * Supabase es falso. Contrato:
 * - misma respuesta para todos (cliente anónimo, sin cookies) y cache en el CDN;
 * - `profiles` jamás con el cliente anónimo; el service role SÓLO lee profiles;
 * - en la respuesta, ni course handicap ni índice del perfil (sólo derivados);
 * - errores de la base NUNCA al CDN; query strings → 400 sin consultar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Res = { data: unknown; error: unknown }
const consultasAnon: string[] = []
const consultasAdmin: Array<{ tabla: string; select?: string }> = []
let tablas: Record<string, unknown> = {}
let errorEn: string | null = null

function fake(consultas: (t: string) => { push: (sel?: string) => void }, datos: () => Record<string, unknown>) {
  return {
    from(tabla: string) {
      const reg = consultas(tabla)
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
          return (...args: unknown[]) => { if (k === 'select') reg.push(String(args[0])); return b }
        },
      })
      reg.push()
      return b
    },
  }
}

const createAnonClient = vi.fn(() => fake((t) => ({ push: (sel?: string) => { if (sel === undefined) consultasAnon.push(t) } }), () => tablas))
const createAdminClient = vi.fn(() => fake((t) => ({ push: (sel?: string) => { if (sel === undefined) consultasAdmin.push({ tabla: t }); else consultasAdmin[consultasAdmin.length - 1].select = sel } }), () => ({ profiles: PERFILES })))
vi.mock('@/utils/supabase/anon', () => ({ createAnonClient: () => createAnonClient() }))
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => createAdminClient() }))
vi.mock('@/utils/supabase/server', () => ({ createClient: () => { throw new Error('la ruta pública no puede leer la sesión') } }))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { GET } from '@/app/api/torneo/[slug]/live/route'

const INDICE_DE_PERFIL = 27.3
const PERFILES = [{ id: 'u-ana', indice: INDICE_DE_PERFIL }]
const hoyos = (golpes: number[]) => golpes.map((g, i) => ({ hole_number: i + 1, gross_score: g }))
const TORNEO = {
  id: 't1', slug: 'copa-qa', name: 'Copa QA', format: 'stroke_play', formato_juego: 'stroke_play', modo_juego: 'neto',
  hole_count: 9, total_rounds: 1, status: 'in_progress', date_start: '2026-10-08', date_end: '2026-10-08',
  course_id: null, tees: 'azul', hcp_calc_mode: null, courses: null,
  categories: [{ id: 'c1', name: 'General' }], tournament_groups: [{ id: 'g1', name: 'Grupo 1' }],
}
const PLAYERS = [
  {
    id: 'p1', handicap_at_registration: 12.4, player_name: null, category_id: 'c1', tee_id: null, genero: null,
    // anon: el embed de profiles llega null (RLS authenticated)
    profiles: null, categories: { name: 'General', default_tee_color: null, gender: null },
    rounds: [{ id: 'r1', status: 'in_progress', total_gross: null, total_net: null, total_points: null, round_number: 1, hole_scores: hoyos([4, 5, 3]) }],
  },
]

const pedir = (slug = 'copa-qa', query = '') =>
  GET(new Request(`http://localhost/api/torneo/${slug}/live${query}`), { params: Promise.resolve({ slug }) })

beforeEach(() => {
  vi.clearAllMocks()
  consultasAnon.length = 0
  consultasAdmin.length = 0
  errorEn = null
  tablas = { tournaments: TORNEO, players: PLAYERS, tournament_group_players: [{ group_id: 'g1', player_id: 'p1' }], course_holes: [], course_tees: [] }
})

describe('GET /api/torneo/[slug]/live', () => {
  it('200 cacheable en el CDN (no en el navegador) con sólo las claves de la vista', async () => {
    const res = await pedir()
    expect(res.status).toBe(200)
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBe('max-age=10, stale-while-revalidate=30')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate')
    const json = await res.json()
    expect(Object.keys(json).sort()).toEqual(['categories', 'groups', 'players', 'teams', 'tournament'])
    expect(json.tournament).toMatchObject({ slug: 'copa-qa', status: 'in_progress', modo: 'gross', soloGross: true, modoReal: 'neto' })
    expect(json.players).toHaveLength(1)
    expect(json.players[0]).toMatchObject({ id: 'p1', gross_total: 12, thru: 3, group_id: 'g1', category_id: 'c1' })
  })

  it('torneo NETO (decisión de Juanjo): la respuesta pública lleva SÓLO gross — ni HCP, ni neto, ni puntos', async () => {
    tablas = { ...tablas, tournaments: { ...TORNEO, format: 'stableford', formato_juego: 'stableford' } }
    const res = await pedir()
    const texto = await res.text()
    const json = JSON.parse(texto)
    expect(json.tournament).toMatchObject({ modo: 'gross', format: 'stroke_play', soloGross: true, modoReal: 'neto' })
    const p = json.players[0]
    // Sin centinelas: las claves ni existen.
    expect(p.handicap_index).toBeUndefined()
    expect(p.net_total).toBeUndefined()
    expect(p.points_total).toBeUndefined()
    expect(Object.keys(p)).not.toContain('handicap_index')
    expect(p.gross_total).toBe(12)
    expect(texto).not.toContain('12.4') // índice de inscripción
    expect(texto).not.toMatch(/net_total|points_total/)
  })

  it('torneo GROSS: columna HCP = índice de INSCRIPCIÓN (público); profiles nunca con el anónimo; sin course handicap', async () => {
    tablas = { ...tablas, tournaments: { ...TORNEO, modo_juego: 'gross' } }
    const res = await pedir()
    const texto = await res.text()
    expect(consultasAnon).not.toContain('profiles')
    expect(texto).not.toContain(String(INDICE_DE_PERFIL))
    const json = JSON.parse(texto)
    expect(json.players[0].handicap_index).toBe(12.4)
    expect(texto).not.toMatch(/course_?hcp|courseHcp|course_handicap/i)
  })

  it('stroke play: ni siquiera se crea el cliente service role', async () => {
    await pedir()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('scramble neto (público): ni se leen perfiles; sale el total GROSS del equipo', async () => {
    const HOYOS = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
    tablas = {
      ...tablas,
      tournaments: { ...TORNEO, format: 'scramble', formato_juego: 'scramble', course_id: 'cancha-1' },
      course_holes: HOYOS,
      tournament_groups: [{ id: 'g1', name: 'Grupo 1', ronda_libre_id: 'rl1' }],
      ronda_equipos: [{ id: 'e1', nombre: 'Los Leones', handicap_equipo: null, scores: { 1: 4, 2: 3 }, ronda_id: 'rl1', ronda_equipo_jugadores: [{ jugador_id: 'j1', orden: 0 }, { jugador_id: 'j2', orden: 1 }] }],
      ronda_libre_jugadores: [
        { id: 'j1', user_id: 'u-ana', handicap: null, nombre: 'Ana' },
        { id: 'j2', user_id: null, handicap: 18, nombre: 'Bea' },
      ],
    }
    const res = await pedir()
    expect(res.status).toBe(200)
    const texto = await res.text()
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(consultasAnon).not.toContain('profiles')
    const json = JSON.parse(texto)
    expect(json.teams).toHaveLength(1)
    expect(json.teams[0]).toMatchObject({ id: 'e1', name: 'Los Leones', thru: 2 })
    expect(json.teams[0].players.map((p: { name: string }) => p.name)).toEqual(['Ana', 'Bea'])
    expect(texto).not.toContain(String(INDICE_DE_PERFIL))
    expect(texto).not.toMatch(/handicap_equipo|teamHandicap|courseHcp/)
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
