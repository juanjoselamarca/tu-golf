/**
 * GET /api/torneo/[slug]/neto — el neto de un torneo SÓLO para un visor con sesión
 * (decisión de Juanjo, 08-oct-2026). Privada (no-store, nunca al CDN); el armado se
 * comparte en el servidor (unstable_cache) para no volver lineal la carga.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let claims: { sub: string } | null = null
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getClaims: async () => ({ data: claims ? { claims } : null, error: null }) } })),
}))
const armar = vi.fn()
vi.mock('@/lib/data/tournaments/en-vivo-servidor', () => ({
  SLUG_TORNEO_VALIDO: /^[a-z0-9][a-z0-9-]{0,119}$/,
  armarTorneoEnVivoParaRuta: (...a: unknown[]) => armar(...a),
}))
const cacheLlamadas: Array<{ claves: string[]; opciones: unknown; resultado?: Promise<unknown> }> = []
vi.mock('next/cache', () => ({
  // Registra lo que devolvió la fn cacheada: unstable_cache guarda resoluciones, NO rechazos.
  unstable_cache: (fn: () => Promise<unknown>, claves: string[], opciones: unknown) => () => {
    const resultado = fn()
    cacheLlamadas.push({ claves, opciones, resultado })
    return resultado
  },
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { GET } from '@/app/api/torneo/[slug]/neto/route'

const NETO = { tournament: { id: 't1', modo: 'neto' }, players: [{ id: 'p1', net_total: 70, handicap_index: 12.4 }], teams: [], categories: [], groups: [] }
const pedir = (slug = 'copa-qa') => GET(new Request(`http://localhost/api/torneo/${slug}/neto`), { params: Promise.resolve({ slug }) })

beforeEach(() => {
  vi.clearAllMocks()
  cacheLlamadas.length = 0
  claims = null
  armar.mockResolvedValue(NETO)
})

describe('GET /api/torneo/[slug]/neto', () => {
  it('sin sesión → 401 sin armar nada', async () => {
    const res = await pedir()
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(armar).not.toHaveBeenCalled()
  })

  it('con sesión → el board completo (con neto), privado y no-store, armado compartido 10 s por torneo', async () => {
    claims = { sub: 'u-visor' }
    const res = await pedir()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBeNull()
    expect(await res.json()).toEqual(NETO)
    expect(res.headers.get('x-armado-hace')).toBe('0') // edad real del armado compartido
    expect(armar).toHaveBeenCalledWith('copa-qa', { visorConSesion: true })
    expect(cacheLlamadas[0]).toMatchObject({ claves: ['torneo-en-vivo-neto', 'copa-qa'], opciones: { revalidate: 10, tags: ['torneo-en-vivo:copa-qa'] } })
  })

  it('armado DEGRADADO (equiposNoDisponibles): la fn cacheada RECHAZA (no se guarda) y la ruta responde 200 privado con x-armado-hace 0', async () => {
    claims = { sub: 'u-visor' }
    const DEGRADADO = { ...NETO, teams: [], equiposNoDisponibles: true }
    armar.mockResolvedValueOnce(DEGRADADO)
    const res = await pedir()
    await expect(cacheLlamadas[0].resultado).rejects.toThrow(/degradado/i)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('x-armado-hace')).toBe('0')
    expect(await res.json()).toMatchObject({ equiposNoDisponibles: true, teams: [] })
  })

  it('torneo inexistente → 404; base caída → 503 no-store', async () => {
    claims = { sub: 'u-visor' }
    armar.mockResolvedValueOnce(null)
    expect((await pedir()).status).toBe(404)
    armar.mockRejectedValueOnce(new Error('statement timeout'))
    const r = await pedir()
    expect(r.status).toBe(503)
    expect(r.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
