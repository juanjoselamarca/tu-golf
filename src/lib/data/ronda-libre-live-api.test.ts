import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadRondaLibre } from './ronda-libre-live-api'

const PAYLOAD = {
  ronda: { id: 'r1', ronda_libre_jugadores: [] },
  parMap: {}, siMap: {}, courseHcpMap: {}, displayHcpMap: {}, sinIndice: [], equipos: [],
}

function mockFetch(impl: () => Promise<Response>) {
  const f = vi.fn(impl)
  vi.stubGlobal('fetch', f)
  return f
}

afterEach(() => { vi.unstubAllGlobals() })

describe('loadRondaLibre (navegador → /api/ronda-libre/[codigo]/live)', () => {
  it('pide la ruta cacheable SIN cookies (el CDN puede colapsar a todos los espectadores)', async () => {
    const f = mockFetch(async () => new Response(JSON.stringify(PAYLOAD), { status: 200 }))
    const r = await loadRondaLibre('ABC 1')
    expect(f).toHaveBeenCalledWith('/api/ronda-libre/ABC%201/live', { credentials: 'omit' })
    expect(r).toEqual({ status: 'ok', ...PAYLOAD, edadSegundos: 0 })
  })

  it('edadSegundos = header Age del CDN (antigüedad real, sin depender del reloj del teléfono)', async () => {
    mockFetch(async () => new Response(JSON.stringify(PAYLOAD), { status: 200, headers: { age: '7' } }))
    const r = await loadRondaLibre('X')
    expect(r.status === 'ok' && r.edadSegundos).toBe(7)
  })

  it('404 → not_found', async () => {
    mockFetch(async () => new Response('{}', { status: 404 }))
    expect((await loadRondaLibre('X')).status).toBe('not_found')
  })

  it('503 o red caída → transient (la UI conserva lo que ya mostraba)', async () => {
    mockFetch(async () => new Response('{}', { status: 503 }))
    expect((await loadRondaLibre('X')).status).toBe('transient')
    mockFetch(async () => { throw new TypeError('Failed to fetch') })
    expect((await loadRondaLibre('X')).status).toBe('transient')
  })

  it('respuesta con forma inesperada → error', async () => {
    mockFetch(async () => new Response(JSON.stringify({ ronda: null }), { status: 200 }))
    expect((await loadRondaLibre('X')).status).toBe('error')
  })
})

describe('aplicarHcpConSesion', () => {
  it('lo de la ruta privada manda para los ids que resolvió; el resto queda público', async () => {
    const { aplicarHcpConSesion } = await import('./ronda-libre-live-api')
    const publico = { courseHcpMap: { a: 0, b: 12 }, displayHcpMap: { a: 0, b: 12 }, sinIndice: ['a', 'c'] }
    expect(aplicarHcpConSesion(publico, null)).toBe(publico)
    const r = aplicarHcpConSesion(publico, { courseHcpMap: { a: 10 }, displayHcpMap: { a: 10 }, sinIndice: [] })
    expect(r).toEqual({ courseHcpMap: { a: 10, b: 12 }, displayHcpMap: { a: 10, b: 12 }, sinIndice: ['c'] })
  })
})
