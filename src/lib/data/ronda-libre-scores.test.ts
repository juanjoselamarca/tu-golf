/**
 * Capa de datos de ronda libre — cada escritura avisa a los seguidores, y el
 * aviso lleva el jugadorId: un INVITADO sin cuenta que termina la ronda tiene
 * que poder mandar el "Resultado final" (review C-1: antes finalizarRondaLibre
 * no pasaba el jugadorId → 401 en el servidor → el resultado nunca salía).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-vapid-key')
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))

import { saveRondaLibreScores, saveRondaEquiposScores, finalizarRondaLibre, type RondaLibreWriteClient } from './ronda-libre-scores'

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
    expect(rpc).toHaveBeenCalledWith('upsert_ronda_libre_scores', { p_jugador_id: 'j-1', p_codigo: 'S1', p_delta: { '3': 4 } })
    expect(bodies()).toEqual([{ codigo: 'S1', jugadorId: 'j-1' }])
  })

  it('equipos (scramble/foursome): RPC de equipos + aviso con el jugador del equipo', async () => {
    await saveRondaEquiposScores(supabase, { codigo: 'S2', equipoId: 'e-1', delta: { '5': 4 }, jugadorId: 'j-9' })
    await vi.advanceTimersByTimeAsync(0)
    expect(rpc).toHaveBeenCalledWith('upsert_ronda_equipos_scores', { p_equipo_id: 'e-1', p_codigo: 'S2', p_delta: { '5': 4 } })
    expect(bodies()).toEqual([{ codigo: 'S2', jugadorId: 'j-9' }])
  })

  it('error de la RPC (P0002 ronda finalizada) se devuelve tal cual y no avisa', async () => {
    rpc.mockResolvedValueOnce({ error: { code: 'P0002', message: 'finalizada' } } as never)
    const r = await saveRondaLibreScores(supabase, { codigo: 'S3', jugadorId: 'j-1', delta: { 1: 4 } })
    expect(r.error?.code).toBe('P0002')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
