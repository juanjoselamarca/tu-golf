import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadTorneoEnVivo } from './en-vivo-api'

const DATA = { tournament: { id: 't1' }, players: [], teams: [], categories: [], groups: [] }
const mockFetch = (impl: () => Promise<Response>) => { const f = vi.fn(impl); vi.stubGlobal('fetch', f); return f }
afterEach(() => { vi.unstubAllGlobals() })

describe('loadTorneoEnVivo (navegador → /api/torneo/[slug]/live)', () => {
  it('pide la ruta cacheable SIN cookies y devuelve la edad del CDN', async () => {
    const f = mockFetch(async () => new Response(JSON.stringify(DATA), { status: 200, headers: { age: '4' } }))
    const r = await loadTorneoEnVivo('copa-leones')
    expect(f).toHaveBeenCalledWith('/api/torneo/copa-leones/live', { credentials: 'omit' })
    expect(r).toEqual({ status: 'ok', data: DATA, edadSegundos: 4 })
  })
  it('404 → not_found · 503/red → transient · forma rara → error', async () => {
    mockFetch(async () => new Response('{}', { status: 404 }))
    expect((await loadTorneoEnVivo('x')).status).toBe('not_found')
    mockFetch(async () => new Response('{}', { status: 503 }))
    expect((await loadTorneoEnVivo('x')).status).toBe('transient')
    mockFetch(async () => { throw new TypeError('Failed to fetch') })
    expect((await loadTorneoEnVivo('x')).status).toBe('transient')
    mockFetch(async () => new Response(JSON.stringify({ players: [] }), { status: 200 }))
    expect((await loadTorneoEnVivo('x')).status).toBe('error')
  })
})
