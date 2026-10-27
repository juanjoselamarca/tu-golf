/**
 * Capa de datos de ronda libre — cada escritura avisa a los seguidores, y el
 * aviso lleva el jugadorId: un INVITADO sin cuenta que termina la ronda tiene
 * que poder mandar el "Resultado final" (review C-1: antes finalizarRondaLibre
 * no pasaba el jugadorId → 401 en el servidor → el resultado nunca salía).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-vapid-key')
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))

import { saveRondaLibreScores, saveRondaEquiposScores, finalizarRondaLibre, nuevaSecuencia, type RondaLibreWriteClient } from './ronda-libre-scores'

const fetchMock = vi.fn(async () => ({ ok: true }))
const rpc = vi.fn(async () => ({ error: null }))
// Sin `from`: si el código volviera a escribir la tabla directo, el test revienta.
const supabase = { rpc } as unknown as RondaLibreWriteClient

const bodies = () => fetchMock.mock.calls.map(c => JSON.parse((c as unknown as [string, { body: string }])[1].body))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  sessionStorage.clear()
  fetchMock.mockClear(); rpc.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('finalizarRondaLibre — invitado sin cuenta termina la ronda', () => {
  it('cierra por el RPC (nunca UPDATE directo) y el "Resultado final" sale con SU jugadorId', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null } as never)
    const r = await finalizarRondaLibre(supabase, 'FIN1', { jugadorId: 'j-guest' })
    await vi.advanceTimersByTimeAsync(0)
    expect(rpc).toHaveBeenCalledWith('finalizar_ronda_libre', { p_codigo: 'FIN1' })
    expect(r).toEqual({ finalizada: true, error: null })
    expect(bodies()).toEqual([{ codigo: 'FIN1', jugadorId: 'j-guest' }])
  })

  it('si otro dispositivo ya la cerró (false), no duplica el push (review M-b)', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null } as never)
    const r = await finalizarRondaLibre(supabase, 'FIN3', { jugadorId: 'j-guest' })
    await vi.advanceTimersByTimeAsync(0)
    expect(r.finalizada).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('error de transporte (no sabemos si cerró) → empuja igual; el servidor dedupea', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: 'Failed to fetch' } } as never)
    const r = await finalizarRondaLibre(supabase, 'FIN4', { jugadorId: 'j-guest' })
    await vi.advanceTimersByTimeAsync(0)
    expect(r.error).not.toBeNull()
    expect(bodies()).toEqual([{ codigo: 'FIN4', jugadorId: 'j-guest' }])
  })

  it('con error del RPC (p. ej. sin permiso) no avisa', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0003', message: 'RONDA_FORBIDDEN' } } as never)
    const r = await finalizarRondaLibre(supabase, 'FIN2', { jugadorId: 'j-guest' })
    await vi.advanceTimersByTimeAsync(0)
    expect(r.error).not.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('guardados', () => {
  it('individual: RPC con claves string + aviso con jugadorId', async () => {
    await saveRondaLibreScores(supabase, { codigo: 'S1', jugadorId: 'j-1', delta: { 3: 4 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(rpc).toHaveBeenCalledWith('upsert_ronda_libre_scores', {
      p_jugador_id: 'j-1', p_codigo: 'S1', p_delta: { '3': 4 }, p_seq: expect.any(Number), p_dispositivo: expect.any(String),
    })
    expect(bodies()).toEqual([{ codigo: 'S1', jugadorId: 'j-1' }])
  })

  it('equipos (scramble/foursome): RPC de equipos + aviso con el jugador del equipo', async () => {
    await saveRondaEquiposScores(supabase, { codigo: 'S2', equipoId: 'e-1', delta: { '5': 4 }, jugadorId: 'j-9' })
    await vi.advanceTimersByTimeAsync(0)
    expect(rpc).toHaveBeenCalledWith('upsert_ronda_equipos_scores', {
      p_equipo_id: 'e-1', p_codigo: 'S2', p_delta: { '5': 4 }, p_seq: expect.any(Number), p_dispositivo: expect.any(String),
    })
    expect(bodies()).toEqual([{ codigo: 'S2', jugadorId: 'j-9' }])
  })

  it('error de la RPC (P0002 ronda finalizada) se devuelve tal cual y no avisa', async () => {
    rpc.mockResolvedValueOnce({ error: { code: 'P0002', message: 'finalizada' } } as never)
    const r = await saveRondaLibreScores(supabase, { codigo: 'S3', jugadorId: 'j-1', delta: { 1: 4 } })
    expect(r.error?.code).toBe('P0002')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('orden de los guardados (un guardado viejo que llega tarde no pisa uno nuevo)', () => {
  const args = () => rpc.mock.calls.map(c => (c as unknown as [string, { p_seq: number; p_dispositivo: string }])[1])

  it('cada guardado, individual o de equipo, va con el mismo dispositivo y una secuencia mayor', async () => {
    await saveRondaLibreScores(supabase, { codigo: 'O1', jugadorId: 'j-1', delta: { 1: 4 } })
    await saveRondaEquiposScores(supabase, { codigo: 'O1', equipoId: 'e-1', delta: { 1: 4 } })
    await saveRondaLibreScores(supabase, { codigo: 'O1', jugadorId: 'j-1', delta: { 1: 5 } })
    const [a, b, c] = args()
    expect(a.p_dispositivo).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect([b.p_dispositivo, c.p_dispositivo]).toEqual([a.p_dispositivo, a.p_dispositivo])
    expect(b.p_seq).toBeGreaterThan(a.p_seq)
    expect(c.p_seq).toBeGreaterThan(b.p_seq)
  })

  it('un reintento manda la secuencia que recibe, no una nueva', async () => {
    const seq = nuevaSecuencia()
    await saveRondaLibreScores(supabase, { codigo: 'O2', jugadorId: 'j-1', delta: { 1: 4 }, seq })
    await saveRondaLibreScores(supabase, { codigo: 'O2', jugadorId: 'j-1', delta: { 1: 4 }, seq })
    expect(args().map(a => a.p_seq)).toEqual([seq, seq])
  })

  it('sin crypto.randomUUID (http en la red local) el módulo carga y guarda sin dispositivo', async () => {
    vi.stubGlobal('crypto', {})
    vi.resetModules()
    const mod = await import('./ronda-libre-scores')
    const { error } = await mod.saveRondaLibreScores(supabase, { codigo: 'O3', jugadorId: 'j-1', delta: { 1: 4 } })
    expect(error).toBeNull()
    expect(args()[0].p_dispositivo).toBeNull()
  })
})

describe('guardado con plazo (caída 04-oct: respuestas de 20-80 s)', () => {
  it('si la RPC se cuelga, devuelve error SIN_RESPUESTA a los 12 s en vez de colgar el scorer', async () => {
    vi.useFakeTimers()
    const colgado = { rpc: () => new Promise(() => {}) }
    const p = saveRondaLibreScores(colgado as never, { codigo: 'ABC', jugadorId: 'j1', delta: { 1: 4 } })
    await vi.advanceTimersByTimeAsync(12_001)
    const { error } = await p
    expect(error?.code).toBe('SIN_RESPUESTA')
    vi.useRealTimers()
  })
  it('si la red revienta (fetch lanza), devuelve error SIN_RESPUESTA, no excepción', async () => {
    const roto = { rpc: () => Promise.reject(new TypeError('Failed to fetch')) }
    const { error } = await saveRondaLibreScores(roto as never, { codigo: 'ABC', jugadorId: 'j1', delta: { 1: 4 } })
    expect(error?.code).toBe('SIN_RESPUESTA')
  })
})
