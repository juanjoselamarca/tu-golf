import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chainable builder that resolves when awaited (then/catch)
const makeChainable = (resolved: unknown = { error: null }): unknown => {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(resolved)
      if (prop === 'catch') return () => makeChainable(resolved)
      return () => makeChainable(resolved)
    },
  }
  return new Proxy({}, handler)
}

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      update: () => makeChainable({ error: null }),
      insert: () => makeChainable({ data: { id: 'h1' }, error: null }),
      delete: () => makeChainable({ error: null }),
      select: () => makeChainable({ data: null, count: 0, error: null }),
    }),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    rpc: () => Promise.resolve({}),
  }),
}))
vi.mock('@/lib/ronda/score-storage', () => ({ clearScores: vi.fn(), saveScores: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/push-notifications', () => ({
  getNotifPrefs: vi.fn(() => ({ partidas_terminadas: false })),
}))
vi.mock('@/lib/round-notifications', () => ({
  triggerRoundUpdatePush: vi.fn(),
}))
vi.mock('@/lib/indice-golfers', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/indice-golfers')>()
  return {
    ...real,
    calcularDiferencial: vi.fn(() => 10),
    calcularNivel: vi.fn(() => ({ nivel: 'Intermedio' })),
  }
})
vi.mock('@/hooks/useToast', () => ({ addToast: vi.fn() }))
vi.mock('@/lib/ronda/helpers', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ronda/helpers')>()
  return {
    ...real,
    haptic: vi.fn(),
  }
})

const baseOpts = () => ({
  ronda: {
    id: 'r1', codigo: 'ABC123', course_name: 'Los Leones', course_id: 'c1',
    holes: 9, estado: 'en_curso', tees: 'azul', fecha: '2026-05-14',
    formato_juego: 'stroke_play' as const, modo_juego: 'gross' as const,
    hoyo_inicio: 1, admin_mode: false, recorridos: null,
    ronda_libre_jugadores: [{ id: 'p1', nombre: 'Juanjo', user_id: 'u1', scores: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 }, handicap: 11.1, tees: 'azul' }],
  } as never,
  activeJugadorId: 'p1',
  scores: { p1: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 } },
  parMap: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 },
  holeDataMap: {},
  codigo: 'ABC123',
  saveScores: vi.fn(async () => {}),
  setScores: vi.fn(),
  setSaveStatus: vi.fn(),
  setHasUnsaved: vi.fn(),
  setHistoricalRoundId: vi.fn(),
})

// Cerebro v2 wiring — interceptamos fetch para verificar que el coach recibe la senal de aprendizaje.
const mockFetch = vi.fn(() => Promise.resolve({ ok: true } as Response))
globalThis.fetch = mockFetch as unknown as typeof fetch

const guardarTarjetaEnHistorial = vi.fn()
const fetchRondaParaCierre = vi.fn()
const finalizarRondaLibre = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/data/ronda-libre-finalizar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/ronda-libre-finalizar')>()),
  guardarTarjetaEnHistorial: (...a: unknown[]) => guardarTarjetaEnHistorial(...a),
  fetchRondaParaCierre: (...a: unknown[]) => fetchRondaParaCierre(...a),
  fetchEstadoRondaLibre: async () => 'en_curso',
}))
vi.mock('@/lib/data/ronda-libre-scores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/ronda-libre-scores')>()),
  finalizarRondaLibre: (...a: unknown[]) => finalizarRondaLibre(...(a as [])),
}))

import { useFinalizeRonda } from '@/app/ronda-libre/[codigo]/score/hooks/useFinalizeRonda'
import { addToast } from '@/hooks/useToast'

async function finalizar(opts = baseOpts()) {
  const { result } = renderHook(() => useFinalizeRonda(opts))
  await act(async () => { await result.current.finalizeRound() })
  await act(async () => { await result.current.finalizeRound() })
  return result
}

describe('useFinalizeRonda — fallas al guardar y al cerrar (review Opus, 01-oct-2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchRondaParaCierre.mockResolvedValue({ estado: 'en_curso', jugadores: [{ id: 'p1', scores: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 } }] })
  })

  it('si el historial no se guarda: NO dice "Ronda guardada", NO cierra la ronda y deja reintentar', async () => {
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'error', error: { code: '42501' }, tarjeta: {} })
    const result = await finalizar()
    const titulos = vi.mocked(addToast).mock.calls.map(c => (c[0] as { title: string }).title)
    expect(titulos).toContain('No pudimos guardar la ronda en tu historial')
    expect(titulos).not.toContain('Ronda guardada')
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
    expect(result.current.roundDone).toBe(false)
  })

  it('si la lectura para cerrar falla (null): NO cierra la ronda para todos', async () => {
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'insertada', id: 'h1', tarjeta: {} })
    fetchRondaParaCierre.mockResolvedValue(null)
    await finalizar()
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
  })

  it('con todas las tarjetas completas sí cierra', async () => {
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'insertada', id: 'h1', tarjeta: {} })
    await finalizar()
    expect(finalizarRondaLibre).toHaveBeenCalledTimes(1)
  })
})
