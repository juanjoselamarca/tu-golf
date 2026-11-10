import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFinalizeRonda } from '@/app/ronda-libre/[codigo]/score/hooks/useFinalizeRonda'
import { finalizarRondaLibre, ERRCODE_SIN_RESPUESTA } from '@/lib/data/ronda-libre-scores'
import { fetchRondaParaCierre } from '@/lib/data/ronda-libre-finalizar'
import { addToast } from '@/hooks/useToast'
import { AVISO_FINALIZAR_SIN_SERVIDOR } from '@/components/ronda/finalizar-copy'
import { clearScoresDeRonda } from '@/lib/ronda/score-storage'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn((..._a: unknown[]) => Promise.resolve({})) }))

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
    rpc: (...a: unknown[]) => rpcMock(...a),
  }),
}))
vi.mock('@/lib/ronda/score-storage', () => ({ clearScores: vi.fn(), clearScoresDeRonda: vi.fn(), saveScores: vi.fn() }))
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
// La lectura de tarjetas frescas (estado + golpes de todos) responde: sin ella el
// finalizador aborta ("Sin conexión") antes de tocar nada.
vi.mock('@/lib/data/ronda-libre-finalizar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/ronda-libre-finalizar')>()),
  fetchRondaParaCierre: vi.fn(async () => ({ estado: 'en_curso', jugadores: [{ id: 'p1', scores: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 } }] })),
}))
vi.mock('@/lib/data/ronda-libre-scores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/ronda-libre-scores')>()),
  finalizarRondaLibre: vi.fn(async () => ({ finalizada: true, error: null })),
}))
vi.mock('@/lib/ronda/helpers', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ronda/helpers')>()
  return {
    ...real,
    haptic: vi.fn(),
  }
})

const baseOpts = () => ({
  playerHcp: {} as Record<string, number>,
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
  authUserId: 'u1' as string | null,
  guardarAhora: vi.fn(async () => 'guardado' as const),
  marcarFinalizando: vi.fn(),
  setScores: vi.fn(),
  setSaveStatus: vi.fn(),
  setHasUnsaved: vi.fn(),
  setHistoricalRoundId: vi.fn(),
})

// Cerebro v2 wiring — interceptamos fetch para verificar que el coach recibe la senal de aprendizaje.
const mockFetch = vi.fn(() => Promise.resolve({ ok: true } as Response))
globalThis.fetch = mockFetch as unknown as typeof fetch

describe('useFinalizeRonda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockClear()
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

  it('discardRound: un doble toque no borra la ronda; pasado el plazo, confirmar sí', async () => {
    const onDiscardSuccess = vi.fn()
    const ahora = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    try {
      const { result } = renderHook(() => useFinalizeRonda({ ...baseOpts(), onDiscardSuccess }))
      await act(async () => { await result.current.discardRound() })
      ahora.mockReturnValue(1_000_100)
      await act(async () => { await result.current.discardRound() })
      expect(result.current.discarding).toBe(false)
      expect(onDiscardSuccess).not.toHaveBeenCalled()
      ahora.mockReturnValue(1_000_500)
      await act(async () => { await result.current.discardRound() })
      expect(onDiscardSuccess).toHaveBeenCalledTimes(1)
    } finally {
      ahora.mockRestore()
    }
  })

  // #511 — match play NETO sin sesión con un jugador cuyo índice está en su perfil:
  // el match saldría como gross (y se rellenarían con par hoyos no jugados).
  it('match play neto sin índice legible (netoNoDisponible): no finaliza ni guarda, avisa iniciar sesión', async () => {
    const { addToast } = await import('@/hooks/useToast')
    const opts = baseOpts()
    const ronda = { ...(opts.ronda as object), formato_juego: 'match_play', modo_juego: 'neto' } as never
    const { result } = renderHook(() => useFinalizeRonda({ ...opts, ronda, netoNoDisponible: true }))
    await act(async () => { await result.current.finalizeRound() })
    await act(async () => { await result.current.finalizeRound() })
    expect(result.current.confirmFinalize).toBe(false)
    expect(opts.guardarAhora).not.toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Inicia sesión para finalizar' }))
  })

  it('stroke play con netoNoDisponible: finalizar sigue disponible (el cierre no depende del handicap)', async () => {
    const opts = baseOpts()
    const { result } = renderHook(() => useFinalizeRonda({ ...opts, netoNoDisponible: true }))
    await act(async () => { await result.current.finalizeRound() })
    expect(result.current.confirmFinalize).toBe(true)
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

  const finalizarConDosToques = async (result: { current: { finalizeRound: () => Promise<void> } }) => {
    await act(async () => { await result.current.finalizeRound() })
    await act(async () => { await result.current.finalizeRound() })
  }
  const avisoSinServidor = expect.objectContaining({ title: AVISO_FINALIZAR_SIN_SERVIDOR.title, type: 'error' })

  // postgrest-js no lanza sin red: devuelve `code: ''`. Un 5xx trae su propio código.
  it.each([ERRCODE_SIN_RESPUESTA, '', '503'])('el cierre sin respuesta firme (code "%s") avisa, no da la ronda por terminada y deja reintentar', async (code) => {
    vi.mocked(finalizarRondaLibre).mockResolvedValueOnce({ finalizada: false, error: { code } as never })
    const { result } = renderHook(() => useFinalizeRonda(baseOpts()))
    await finalizarConDosToques(result)
    expect(result.current.roundDone).toBe(false)
    expect(result.current.finalizando).toBe(false)
    expect(addToast).toHaveBeenCalledWith(avisoSinServidor)
    // Reintento con señal: ahora sí termina.
    await finalizarConDosToques(result)
    expect(result.current.roundDone).toBe(true)
  })

  it('el servidor rechaza con respuesta firme (ya cerrada): la ronda queda terminada', async () => {
    vi.mocked(finalizarRondaLibre).mockResolvedValueOnce({ finalizada: false, error: { code: 'P0002' } as never })
    const { result } = renderHook(() => useFinalizeRonda(baseOpts()))
    await finalizarConDosToques(result)
    expect(result.current.roundDone).toBe(true)
  })

  it('si no se pudo leer la ronda antes de cerrarla avisa y no la da por terminada', async () => {
    const abierta = { estado: 'en_curso', jugadores: [{ id: 'p1', scores: { 1: 4 } }] }
    vi.mocked(fetchRondaParaCierre)
      .mockResolvedValueOnce(abierta as never) // la lectura del inicio
      .mockResolvedValueOnce(null as never)    // la de justo antes de cerrar
    const { result } = renderHook(() => useFinalizeRonda(baseOpts()))
    await finalizarConDosToques(result)
    expect(result.current.roundDone).toBe(false)
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith(avisoSinServidor)
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

  // Cerebro v2 — canario crítico
  it('canario Cerebro v2: dispara POST /api/coach/plan-outcome con historical_round_id', async () => {
    const { result } = renderHook(() => useFinalizeRonda(baseOpts()))
    await act(async () => { await result.current.finalizeRound() }) // primer tap
    await act(async () => { await result.current.finalizeRound() }) // segundo tap (ejecuta)

    const calls = mockFetch.mock.calls as unknown as Array<[string, RequestInit | undefined]>
    const planOutcomeCalls = calls.filter(
      (call) => typeof call[0] === 'string' && call[0] === '/api/coach/plan-outcome',
    )
    expect(planOutcomeCalls.length).toBeGreaterThanOrEqual(1)

    const init = planOutcomeCalls[0]?.[1]
    expect(init?.method).toBe('POST')
    const body = JSON.parse(init?.body as string) as { historical_round_id: string }
    expect(body.historical_round_id).toBe('h1') // mock insert devuelve { id: 'h1' }
  })
})

// PR #759: la ronda ya no existe (la borró quien la creó, o un descarte anterior cuya respuesta se perdió).
describe('useFinalizeRonda — ronda que ya no existe', () => {
  const respaldo = () => localStorage.setItem('golfers_score_ABC123_p1', JSON.stringify({
    scores: { 1: 4 }, timestamp: Date.now(), sincronizado: false, codigoRonda: 'ABC123', jugadorId: 'p1',
  }))
  const descartarConDosToques = async (result: { current: { discardRound: () => Promise<void> } }) => {
    const ahora = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    try {
      await act(async () => { await result.current.discardRound() })
      ahora.mockReturnValue(1_002_000)
      await act(async () => { await result.current.discardRound() })
    } finally { ahora.mockRestore() }
  }
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

  it('descartar recibe P0001 (el servidor ya la borró): sigue como descartada y limpia las copias locales', async () => {
    respaldo()
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'RONDA_NOT_FOUND', details: '' } })
    const onDiscardSuccess = vi.fn()
    const { result } = renderHook(() => useFinalizeRonda({ ...baseOpts(), onDiscardSuccess }))
    await descartarConDosToques(result)
    expect(onDiscardSuccess).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('golfers_score_ABC123_p1')).toBeNull()
    expect(clearScoresDeRonda).toHaveBeenCalledWith('ABC123')
    expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
  })

  it('inverso: descartar sin red NO limpia ni sale (la ronda puede seguir viva)', async () => {
    respaldo()
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: '', message: 'Failed to fetch', details: '' } })
    const onDiscardSuccess = vi.fn()
    const { result } = renderHook(() => useFinalizeRonda({ ...baseOpts(), onDiscardSuccess }))
    await descartarConDosToques(result)
    expect(onDiscardSuccess).not.toHaveBeenCalled()
    expect(localStorage.getItem('golfers_score_ABC123_p1')).not.toBeNull()
    expect(clearScoresDeRonda).not.toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
  })

  it('Finalizar: el guardado responde no_existe → avisa, limpia y sale sin cerrar nada', async () => {
    respaldo()
    const onDiscardSuccess = vi.fn()
    const opts = { ...baseOpts(), onDiscardSuccess, guardarAhora: vi.fn(async () => 'no_existe' as const) }
    const { result } = renderHook(() => useFinalizeRonda(opts))
    await act(async () => { await result.current.finalizeRound() })
    await act(async () => { await result.current.finalizeRound() })
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Esta ronda ya no existe', message: 'Quien la creó la descartó.' }))
    expect(onDiscardSuccess).toHaveBeenCalledTimes(1)
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
    expect(result.current.roundDone).toBe(false)
    expect(localStorage.getItem('golfers_score_ABC123_p1')).toBeNull()
  })
})
