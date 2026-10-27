import { describe, it, expect, vi, afterEach } from 'vitest'
import { fedegolfFetch, FedegolfError, esFedegolfError } from './http'

describe('fedegolfFetch', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('devuelve la respuesta tal cual cuando fetch resuelve (cualquier status < 500)', async () => {
    const res = { status: 302 } as Response
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res))
    await expect(fedegolfFetch('https://www.fedegolf.cl/')).resolves.toBe(res)
  })

  it('pasa un AbortSignal con timeout y conserva el resto del init', async () => {
    const f = vi.fn().mockResolvedValue({ status: 200 } as Response)
    vi.stubGlobal('fetch', f)
    await fedegolfFetch('https://www.fedegolf.cl/', { method: 'POST' })
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(f.mock.calls[0][1].method).toBe('POST')
  })

  it('error de red → FedegolfError no_disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const err = await fedegolfFetch('https://www.fedegolf.cl/').catch((e) => e)
    expect(err).toBeInstanceOf(FedegolfError)
    expect(err.kind).toBe('no_disponible')
  })

  it('timeout → FedegolfError no_disponible', async () => {
    const abort = Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))
    const err = await fedegolfFetch('https://www.fedegolf.cl/').catch((e) => e)
    expect(esFedegolfError(err, 'no_disponible')).toBe(true)
  })

  it('status 5xx → FedegolfError no_disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 503 } as Response))
    const err = await fedegolfFetch('https://www.fedegolf.cl/').catch((e) => e)
    expect(esFedegolfError(err, 'no_disponible')).toBe(true)
  })

  it('esFedegolfError sin kind acepta cualquier FedegolfError y rechaza Error genérico', () => {
    expect(esFedegolfError(new FedegolfError('credenciales', 'x'))).toBe(true)
    expect(esFedegolfError(new FedegolfError('credenciales', 'x'), 'no_disponible')).toBe(false)
    expect(esFedegolfError(new Error('x'))).toBe(false)
  })
})
