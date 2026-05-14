import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFinalizeRonda } from '@/app/ronda-libre/[codigo]/score/hooks/useFinalizeRonda'

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
  updatePlayerNotification: vi.fn(),
  getNotifPrefs: vi.fn(async () => ({ partidas_terminadas: false })),
  sendPushViaServer: vi.fn(),
}))
vi.mock('@/lib/indice-golfers', () => ({
  calcularDiferencial: vi.fn(() => 10),
  calcularNivel: vi.fn(() => ({ nivel: 'Intermedio' })),
}))
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

describe('useFinalizeRonda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('estados iniciales correctos', () => {
    const { result } = renderHook(() => useFinalizeRonda(baseOpts()))
    expect(result.current.roundDone).toBe(false)
    expect(result.current.confirmFinalize).toBe(false)
    expect(result.current.confirmDiscard).toBe(false)
    expect(result.current.discarding).toBe(false)
    expect(result.current.finalScore).toEqual({ gross: 0, totalPar: 0 })
  })

  it('discardRound primer tap setea confirmDiscard, no descarta', async () => {
    const { result } = renderHook(() => useFinalizeRonda(baseOpts()))
    await act(async () => { await result.current.discardRound() })
    expect(result.current.confirmDiscard).toBe(true)
    expect(result.current.discarding).toBe(false)
  })

  it('finalizeRound primer tap setea confirmFinalize, no finaliza', async () => {
    const { result } = renderHook(() => useFinalizeRonda(baseOpts()))
    await act(async () => { await result.current.finalizeRound() })
    expect(result.current.confirmFinalize).toBe(true)
    expect(result.current.roundDone).toBe(false)
  })

  it('finalizeRound segundo tap (confirmFinalize=true) si ejecuta', async () => {
    const { result } = renderHook(() => useFinalizeRonda(baseOpts()))
    // Primer tap
    await act(async () => { await result.current.finalizeRound() })
    expect(result.current.confirmFinalize).toBe(true)
    // Segundo tap
    await act(async () => { await result.current.finalizeRound() })
    expect(result.current.roundDone).toBe(true)
    expect(result.current.finalScore.gross).toBeGreaterThan(0)
  })

  it('roundDone=true cuando no hay hoyos jugados (early-exit del finalize)', async () => {
    const opts = { ...baseOpts(), scores: { p1: {} as Record<number, number> } }
    const { result } = renderHook(() => useFinalizeRonda(opts))
    // Primer tap
    await act(async () => { await result.current.finalizeRound() })
    // Segundo tap — deberia entrar al path "Sin hoyos jugados" y setRoundDone(true)
    await act(async () => { await result.current.finalizeRound() })
    expect(result.current.roundDone).toBe(true)
  })
})
