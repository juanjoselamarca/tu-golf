/**
 * GET /api/ronda-libre/[codigo]/live — reemplazo de Supabase Realtime para los
 * espectadores (incidente Los Leones 04-oct-2026). Contrato:
 * - cacheable en el CDN (misma respuesta para todos: cliente anónimo, sin cookies);
 * - sólo las claves que la vista ya mostraba; el índice crudo del perfil no viaja;
 * - errores de la base NUNCA al CDN.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Tablas = Record<string, { data: unknown; error?: unknown }>
let tablasAnon: Tablas = {}
let tablasAdmin: Tablas = {}
const consultasAnon: string[] = []
const consultasAdmin: string[] = []

function fake(tablas: () => Tablas, consultas: string[]) {
  const builder = (res: { data: unknown; error: unknown }): unknown => {
    const b: unknown = new Proxy({}, {
      get(_t, k) {
        if (k === 'then') return (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, ko)
        if (k === 'single' || k === 'maybeSingle') return async () => res
        return () => b
      },
    })
    return b
  }
  return {
    from(tabla: string) {
      consultas.push(tabla)
      const t = tablas()[tabla]
      return builder({ data: t?.data ?? null, error: t?.error ?? null })
    },
  }
}

const createAnonClient = vi.fn(() => fake(() => tablasAnon, consultasAnon))
const createAdminClient = vi.fn(() => fake(() => tablasAdmin, consultasAdmin))
vi.mock('@/utils/supabase/anon', () => ({ createAnonClient: () => createAnonClient() }))
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => createAdminClient() }))
vi.mock('@/utils/supabase/server', () => ({ createClient: () => { throw new Error('la ruta pública no puede leer la sesión') } }))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))
let publicarIndice = false
vi.mock('@/lib/api-en-vivo', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api-en-vivo')>()
  return { ...real, get PUBLICAR_INDICE_DE_PERFIL_EN_VIVO() { return publicarIndice } }
})
vi.mock('@/golf/core/course-handicap', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/golf/core/course-handicap')>()
  return { ...real, resolverCourseData: vi.fn(async () => null) }
})

import { GET } from '@/app/api/ronda-libre/[codigo]/live/route'

const INDICE_PRIVADO = 23.7
const RONDA = {
  id: 'r1', codigo: 'ABC123', course_name: 'Los Leones', course_id: null, tees: 'azul', holes: 18, hoyo_inicio: 1,
  fecha: '2026-10-08', estado: 'en_curso', modo_juego: 'neto', formato_juego: 'stroke_play', admin_mode: false,
  admin_user_id: null, creador_id: 'u1', recorridos: null,
  ronda_libre_jugadores: [
    { id: 'j1', nombre: 'Ana', user_id: 'u1', scores: { 1: 4 }, handicap: null, tees: null },
    { id: 'j2', nombre: 'Bea', user_id: null, scores: { 1: 5 }, handicap: 12, tees: null },
  ],
}

const pedir = (codigo = 'ABC123', query = '') =>
  GET(new Request(`http://localhost/api/ronda-libre/${codigo}/live${query}`), { params: Promise.resolve({ codigo }) })

beforeEach(() => {
  vi.clearAllMocks()
  publicarIndice = false
  consultasAnon.length = 0
  consultasAdmin.length = 0
  tablasAnon = { rondas_libres: { data: RONDA } }
  tablasAdmin = { profiles: { data: [{ id: 'u1', indice: INDICE_PRIVADO }] } }
})

describe('GET /api/ronda-libre/[codigo]/live', () => {
  it('200 cacheable en el CDN, con sólo las claves de la vista en vivo', async () => {
    const res = await pedir()
    expect(res.status).toBe(200)
    // Cache en el CDN; el navegador NO aplica stale-while-revalidate (si no, cada poll muestra la respuesta anterior).
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBe('max-age=10, stale-while-revalidate=30')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate')
    const texto = await res.text()
    const json = JSON.parse(texto)
    expect(Object.keys(json).sort()).toEqual(
      ['courseHcpMap', 'displayHcpMap', 'equipos', 'parMap', 'ronda', 'siMap', 'sinIndice'],
    )
    expect(json.ronda.codigo).toBe('ABC123')
  })

  it('privacidad (camino conservador): NO lee perfiles; el jugador con cuenta sin índice en la tarjeta sale sinIndice, como lo ve hoy un anónimo', async () => {
    const res = await pedir()
    const texto = await res.text()
    const json = JSON.parse(texto)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(consultasAnon).not.toContain('profiles')
    expect(json.sinIndice).toEqual(['j1'])
    expect(json.courseHcpMap.j1).toBe(0)
    expect(json.courseHcpMap.j2).toBe(12) // índice de la tarjeta: público
    expect(texto).not.toContain(String(INDICE_PRIVADO))
  })

  it('con el flag activado: service role SÓLO para profiles y sale el derivado, nunca el índice crudo', async () => {
    publicarIndice = true
    const res = await pedir()
    const texto = await res.text()
    const json = JSON.parse(texto)
    expect(consultasAdmin).toEqual(['profiles'])
    expect(consultasAnon).not.toContain('profiles')
    expect(json.courseHcpMap.j1).toBe(24)
    expect(json.sinIndice).toEqual([])
    expect(texto).not.toContain(String(INDICE_PRIVADO))
  })

  it('un query string (?x=random saltaría el CDN) → 400 sin consultar la base', async () => {
    const res = await pedir('ABC123', '?x=123')
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(createAnonClient).not.toHaveBeenCalled()
  })

  it('sin jugadores que necesiten índice, ni se crea el cliente service role', async () => {
    tablasAnon = { rondas_libres: { data: { ...RONDA, ronda_libre_jugadores: [RONDA.ronda_libre_jugadores[1]] } } }
    const res = await pedir()
    expect(res.status).toBe(200)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('código inexistente → 404 (cache corto, sin stale)', async () => {
    tablasAnon = { rondas_libres: { data: null, error: { code: 'PGRST116' } } }
    const res = await pedir('NOPE99')
    expect(res.status).toBe(404)
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBe('max-age=10')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate')
  })

  it('código con forma inválida → 404 sin consultar la base', async () => {
    const res = await pedir('a b;drop')
    expect(res.status).toBe(404)
    expect(createAnonClient).not.toHaveBeenCalled()
  })

  it('base caída (statement timeout) → 503 y NUNCA al CDN', async () => {
    tablasAnon = { rondas_libres: { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } }
    const res = await pedir()
    expect(res.status).toBe(503)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBeNull()
  })
})
