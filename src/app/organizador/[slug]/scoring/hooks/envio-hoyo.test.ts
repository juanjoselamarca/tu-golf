import { afterEach, describe, expect, it, vi } from 'vitest'
import { enviarHoyo } from './envio-hoyo'
import type { Sobre } from './estado-hoyos'

const SOBRE: Sobre = { roundId: 'r1', hole: 3, par: 4, gross: 5, stats: { putts: null }, rev: 1, seq: 7 }

function responder(status: number, cuerpo: unknown = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(cuerpo), { status })))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('enviarHoyo', () => {
  it('manda el sobre con su seq, el marcador de null y sin neto ni puntos', async () => {
    responder(200, { success: true, totalGross: 40, totalNet: 36, totalPoints: 20 })
    const r = await enviarHoyo('t1', SOBRE)
    expect(r).toEqual({ lectura: 'ok', totales: { totalGross: 40, totalNet: 36, totalPoints: 20 } })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({ seq: 7, stats_null_borra: true, round_id: 'r1', hole_number: 3, gross_score: 5, putts: null })
    expect(body).not.toHaveProperty('net_score')
    expect(body).not.toHaveProperty('points')
  })

  it('descartado, 5xx y 429 son sin respuesta; 400/404 y 403/409 son rechazos', async () => {
    responder(200, { success: true, descartado: true })
    expect((await enviarHoyo('t1', SOBRE)).lectura).toBe('sin_respuesta')
    for (const s of [500, 502, 503, 429]) {
      responder(s)
      expect((await enviarHoyo('t1', SOBRE)).lectura).toBe('sin_respuesta')
    }
    responder(400, { error: 'x' })
    expect((await enviarHoyo('t1', SOBRE)).lectura).toEqual({ rechazo: 'datos' })
    responder(409, { code: 'round_closed' })
    expect((await enviarHoyo('t1', SOBRE)).lectura).toEqual({ rechazo: 'closed' })
    responder(403, {})
    expect((await enviarHoyo('t1', SOBRE)).lectura).toEqual({ rechazo: 'sin_permiso' })
  })

  it('un 2xx sin success: true (cuerpo vacío, HTML de un proxy, JSON ajeno) es sin respuesta, nunca ok', async () => {
    responder(200, {})
    expect((await enviarHoyo('t1', SOBRE)).lectura).toBe('sin_respuesta')
    responder(200, { success: false, totalGross: 40 })
    expect((await enviarHoyo('t1', SOBRE)).lectura).toBe('sin_respuesta')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>portal</html>', { status: 200 })))
    expect((await enviarHoyo('t1', SOBRE)).lectura).toBe('sin_respuesta')
  })

  it('corta a los 15 s sin AbortSignal.timeout (iOS 15) y lo lee como sin respuesta', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('AbortSignal', Object.assign(function () {}, { timeout: undefined }))
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      signal = init.signal as AbortSignal
      signal.addEventListener('abort', () => rej(new Error('abort')))
    })))
    const p = enviarHoyo('t1', SOBRE)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(signal?.aborted).toBe(true)
    expect((await p).lectura).toBe('sin_respuesta')
  })
})
