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
const eqEstado = vi.fn(async () => ({ error: null }))
const eqCodigo = vi.fn(() => Object.assign(Promise.resolve({ error: null }), { eq: eqEstado }))
const supabase = {
  rpc,
  from: () => ({ update: () => ({ eq: eqCodigo }) }),
} as unknown as RondaLibreWriteClient

const bodies = () => fetchMock.mock.calls.map(c => JSON.parse((c as unknown as [string, { body: string }])[1].body))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  sessionStorage.clear()
  fetchMock.mockClear(); rpc.mockClear(); eqEstado.mockClear(); eqCodigo.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('finalizarRondaLibre — invitado sin cuenta termina la ronda', () => {
  it('el "Resultado final" sale con SU jugadorId (y update condicional si aún en curso)', async () => {
    await finalizarRondaLibre(supabase, 'FIN1', { soloSiEnCurso: true, jugadorId: 'j-guest' })
    await vi.advanceTimersByTimeAsync(0)
    expect(eqEstado).toHaveBeenCalledWith('estado', 'en_curso')
    expect(bodies()).toEqual([{ codigo: 'FIN1', jugadorId: 'j-guest' }])
  })

  it('con error en el update no avisa', async () => {
    eqEstado.mockResolvedValueOnce({ error: { message: 'boom' } } as never)
    const r = await finalizarRondaLibre(supabase, 'FIN2', { soloSiEnCurso: true, jugadorId: 'j-guest' })
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
