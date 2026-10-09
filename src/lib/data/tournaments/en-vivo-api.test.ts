import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadTorneoEnVivo } from './en-vivo-api'

const DATA = { tournament: { id: 't1' }, players: [], teams: [], categories: [], groups: [] }
const mockFetch = (impl: () => Promise<Response>) => { const f = vi.fn(impl); vi.stubGlobal('fetch', f); return f }
afterEach(() => { vi.unstubAllGlobals() })

describe('loadTorneoEnVivo (navegador → /api/torneo/[slug]/live)', () => {
  it('pide la ruta cacheable SIN cookies y devuelve la edad del CDN', async () => {
    const f = mockFetch(async () => new Response(JSON.stringify(DATA), { status: 200, headers: { age: '4' } }))
    const r = await loadTorneoEnVivo('copa-leones')
    expect(f).toHaveBeenCalledWith('/api/torneo/copa-leones/live', expect.objectContaining({ credentials: 'omit', signal: expect.any(AbortSignal) }))
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

describe('loadTorneoNeto (visor con sesión → /api/torneo/[slug]/neto)', () => {
  it('va CON cookies a la ruta privada; 401 → sin-sesion', async () => {
    const { loadTorneoNeto } = await import('./en-vivo-api')
    const f = mockFetch(async () => new Response(JSON.stringify(DATA), { status: 200 }))
    expect((await loadTorneoNeto('copa')).status).toBe('ok')
    expect(f).toHaveBeenCalledWith('/api/torneo/copa/neto', expect.objectContaining({ credentials: 'same-origin' }))
    mockFetch(async () => new Response('{}', { status: 401 }))
    expect((await loadTorneoNeto('copa')).status).toBe('sin-sesion')
    mockFetch(async () => new Response(JSON.stringify(DATA), { status: 200, headers: { 'x-armado-hace': '6' } }))
    const r = await loadTorneoNeto('copa')
    expect(r.status === 'ok' && r.edadSegundos).toBe(6)
  })
})

describe('cuerpo colgado (4G degradado)', () => {
  it('headers al tiro y el cuerpo nunca termina: a los 8 s → transient y la conexión abortada', async () => {
    vi.useFakeTimers()
    let señal: AbortSignal | undefined
    const nunca = () => new Promise<never>(() => {})
    mockFetch(((_u: unknown, init?: RequestInit) => {
      señal = init?.signal ?? undefined
      return Promise.resolve({ ok: true, status: 200, headers: new Headers(), text: nunca, json: nunca } as unknown as Response)
    }) as never)
    const p = loadTorneoEnVivo('copa')
    await vi.advanceTimersByTimeAsync(8_000)
    expect(await p).toEqual({ status: 'transient' })
    expect(señal?.aborted).toBe(true)
    vi.useRealTimers()
  })
})
