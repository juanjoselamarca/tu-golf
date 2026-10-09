import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchJsonConPlazo, JsonInvalidoError } from './fetch-json-con-plazo'
import { TiempoAgotadoError } from './con-timeout'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('fetchJsonConPlazo', () => {
  it('respeta el plazo que recibe (no uno fijo) y aborta la conexión al vencer', async () => {
    vi.useFakeTimers()
    let señal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_u: unknown, init?: RequestInit) => { señal = init?.signal ?? undefined; return new Promise<Response>(() => {}) }))
    const p = fetchJsonConPlazo('/x', {}, 3_000)
    const resultado = p.then(() => 'ok', (e) => e)
    await vi.advanceTimersByTimeAsync(2_999)
    expect(señal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await resultado).toBeInstanceOf(TiempoAgotadoError)
    expect(señal?.aborted).toBe(true)
  })

  it('respuesta no ok: no lee el cuerpo y lo cancela (libera la conexión)', async () => {
    const cancel = vi.fn(async () => {})
    const text = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, body: { cancel }, text }) as unknown as Response))
    const { res, json } = await fetchJsonConPlazo('/x', {}, 1_000)
    expect(res.status).toBe(503)
    expect(json).toBeUndefined()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(text).not.toHaveBeenCalled()
  })

  it('2xx con cuerpo que no es JSON → JsonInvalidoError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })))
    await expect(fetchJsonConPlazo('/x', {}, 1_000)).rejects.toBeInstanceOf(JsonInvalidoError)
  })
})
