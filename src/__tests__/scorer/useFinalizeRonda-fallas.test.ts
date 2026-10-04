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
// Lo que devuelve el guardado real: la tarjeta canónica (el modal final la usa).
const TARJETA = { scores: [4, 4, 4, 4, 4, 4, 4, 4, 4], parPerHole: null, totalGross: 36, holesPlayed: 9, hoyos: [1, 2, 3, 4, 5, 6, 7, 8, 9] }
const fetchRondaParaCierre = vi.fn()
const finalizarRondaLibre = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/data/ronda-libre-finalizar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/ronda-libre-finalizar')>()),
  guardarTarjetaEnHistorial: (...a: unknown[]) => guardarTarjetaEnHistorial(...a),
  fetchRondaParaCierre: (...a: unknown[]) => fetchRondaParaCierre(...a),
}))
vi.mock('@/lib/data/ronda-libre-scores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/ronda-libre-scores')>()),
  finalizarRondaLibre: (...a: unknown[]) => finalizarRondaLibre(...(a as [])),
}))

import { useFinalizeRonda } from '@/app/ronda-libre/[codigo]/score/hooks/useFinalizeRonda'
import { addToast } from '@/hooks/useToast'

async function finalizar(opts: Parameters<typeof useFinalizeRonda>[0] = baseOpts()) {
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
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'error', error: { code: '42501' }, tarjeta: TARJETA })
    const result = await finalizar()
    const titulos = vi.mocked(addToast).mock.calls.map(c => (c[0] as { title: string }).title)
    expect(titulos).toContain('No pudimos guardar la ronda en tu historial')
    expect(titulos).not.toContain('Ronda guardada')
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
    expect(result.current.roundDone).toBe(false)
  })

  it('si la lectura para cerrar falla (null): NO cierra la ronda para todos', async () => {
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'insertada', id: 'h1', tarjeta: TARJETA })
    // La primera lectura (tarjetas frescas) responde; la del cierre falla.
    fetchRondaParaCierre
      .mockResolvedValueOnce({ estado: 'en_curso', jugadores: [{ id: 'p1', scores: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 } }] })
      .mockResolvedValueOnce(null)
    await finalizar()
    expect(guardarTarjetaEnHistorial).toHaveBeenCalledTimes(1)
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
  })

  it('con todas las tarjetas completas sí cierra', async () => {
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'insertada', id: 'h1', tarjeta: TARJETA })
    await finalizar()
    expect(finalizarRondaLibre).toHaveBeenCalledTimes(1)
  })

  it('tarjeta de OTRA cuenta (el organizador anota por un jugador): no intenta el historial, avisa y cierra', async () => {
    // Antes del fix: insert → RLS 42501 en cada intento → la ronda no se podía cerrar nunca.
    const opts = baseOpts()
    const ronda = opts.ronda as unknown as { ronda_libre_jugadores: Array<Record<string, unknown>> }
    ronda.ronda_libre_jugadores[0] = { ...ronda.ronda_libre_jugadores[0], user_id: 'u2', nombre: 'Diego' }
    await finalizar(opts)
    expect(guardarTarjetaEnHistorial).not.toHaveBeenCalled()
    const titulos = vi.mocked(addToast).mock.calls.map(c => (c[0] as { title: string }).title)
    expect(titulos).toContain('Diego puede guardar esta tarjeta en su historial desde su cuenta')
    expect(finalizarRondaLibre).toHaveBeenCalledTimes(1)
  })

  it('tarjeta de un invitado: no entra al historial de quien anota', async () => {
    const opts = baseOpts()
    const ronda = opts.ronda as unknown as { ronda_libre_jugadores: Array<Record<string, unknown>> }
    ronda.ronda_libre_jugadores[0] = { ...ronda.ronda_libre_jugadores[0], user_id: null }
    await finalizar(opts)
    expect(guardarTarjetaEnHistorial).not.toHaveBeenCalled()
  })

  it('ronda ya cerrada por el otro (el ganador del match cerró primero): igual guarda MI tarjeta, sin reescribir golpes ni cerrar', async () => {
    fetchRondaParaCierre.mockResolvedValue({ estado: 'finalizada', jugadores: [{ id: 'p1', scores: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 } }] })
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'insertada', id: 'h1', tarjeta: TARJETA })
    const opts = baseOpts()
    const result = await finalizar(opts)
    expect(guardarTarjetaEnHistorial).toHaveBeenCalledTimes(1)
    expect(opts.saveScores).not.toHaveBeenCalled()
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
    expect(result.current.roundDone).toBe(true)
  })
})

describe('useFinalizeRonda — match play decidido antes del último hoyo', () => {
  // Ana gana 1 y 2 en una ronda de 3 hoyos → 2&1: el hoyo 3 no se juega.
  const PAR3: Record<number, number> = { 1: 4, 2: 4, 3: 4 }
  const holeDataMap = Object.fromEntries([1, 2, 3].map(n => [n, { numero: n, par: 4, stroke_index: n, yardaje: null }]))
  const ronda = {
    id: 'r1', codigo: 'ABC123', course_name: 'Los Leones', course_id: 'c1',
    holes: 3, estado: 'en_curso', tees: 'azul', fecha: '2026-10-03',
    formato_juego: 'match_play' as const, modo_juego: 'gross' as const,
    hoyo_inicio: 1, admin_mode: false, recorridos: null,
    ronda_libre_jugadores: [
      { id: 'p1', nombre: 'Ana', user_id: 'u1', scores: { 1: 3, 2: 3 }, handicap: 0, tees: 'azul' },
      { id: 'p2', nombre: 'Beto', user_id: 'u2', scores: { 1: 4, 2: 4 }, handicap: 0, tees: 'azul' },
    ],
  }
  const scores = { p1: { 1: 3, 2: 3 }, p2: { 1: 4, 2: 4 } }
  const opts = () => ({
    ...baseOpts(),
    ronda: ronda as never,
    scores,
    parMap: PAR3,
    holeDataMap,
    playerHcp: { p1: 0, p2: 0 },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'insertada', id: 'h1', tarjeta: { ...TARJETA, scores: [3, 3, 4], hoyos: [1, 2, 3], totalGross: 10 } })
    fetchRondaParaCierre.mockResolvedValue({ estado: 'en_curso', jugadores: [{ id: 'p1', scores: { 1: 3, 2: 3 } }, { id: 'p2', scores: { 1: 4, 2: 4 } }] })
  })

  it('no inventa par en el hoyo que el match no jugó', async () => {
    const o = opts()
    await finalizar(o)
    const [, guardados] = vi.mocked(o.saveScores).mock.calls[0] as unknown as [string, Record<number, number>]
    expect(guardados).toEqual({ 1: 3, 2: 3 })
    const [, input] = guardarTarjetaEnHistorial.mock.calls[0] as [unknown, { scores: Record<number, number> }]
    expect(input.scores).toEqual({ 1: 3, 2: 3 })
  })

  it('cierra la ronda para todos aunque el hoyo 3 esté vacío (el match no lo exige)', async () => {
    await finalizar(opts())
    expect(finalizarRondaLibre).toHaveBeenCalledTimes(1)
  })

  it('sin match (stroke play) un hoyo vacío SÍ impide cerrar para todos', async () => {
    const o = { ...opts(), ronda: { ...ronda, formato_juego: 'stroke_play' } as never }
    fetchRondaParaCierre.mockResolvedValue({ estado: 'en_curso', jugadores: [{ id: 'p1', scores: { 1: 3, 2: 3, 3: 4 } }, { id: 'p2', scores: { 1: 4, 2: 4 } }] })
    await finalizar(o)
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
  })

  it('la tarjeta local del rival está atrasada: el match sale de la BASE y no se inventa par en el hoyo no jugado', async () => {
    // El scorer individual no refresca la tarjeta del rival: localmente Beto no tiene
    // golpes, pero en la base ya anotó 1 y 2 → el match está decidido 2&1.
    const o = { ...opts(), scores: { p1: { 1: 3, 2: 3 }, p2: {} } }
    await finalizar(o)
    const [, guardados] = vi.mocked(o.saveScores).mock.calls[0] as unknown as [string, Record<number, number>]
    expect(guardados).toEqual({ 1: 3, 2: 3 })
    const [, input] = guardarTarjetaEnHistorial.mock.calls[0] as [unknown, { scoresPorJugador: Record<string, unknown> }]
    expect(input.scoresPorJugador.p2).toEqual({ 1: 4, 2: 4 })
  })

  it('sin señal para leer la ronda: no toca nada (ni golpes locales, ni base, ni historial) y avisa para reintentar', async () => {
    const o = { ...opts(), scores: { p1: { 1: 3, 2: 3 }, p2: {} } }
    fetchRondaParaCierre.mockResolvedValue(null)
    const result = await finalizar(o)
    expect(o.setScores).not.toHaveBeenCalled()
    expect(o.saveScores).not.toHaveBeenCalled()
    expect(guardarTarjetaEnHistorial).not.toHaveBeenCalled()
    expect(result.current.roundDone).toBe(false)
    const titulos = vi.mocked(addToast).mock.calls.map(c => (c[0] as { title: string }).title)
    expect(titulos).toContain('Sin conexión')
  })

  it('ronda descartada por su creador: dice que ya no existe (no "Sin conexión") y no toca nada', async () => {
    const o = opts()
    fetchRondaParaCierre.mockResolvedValue({ estado: 'no_existe', jugadores: [] })
    await finalizar(o)
    expect(o.saveScores).not.toHaveBeenCalled()
    expect(guardarTarjetaEnHistorial).not.toHaveBeenCalled()
    const titulos = vi.mocked(addToast).mock.calls.map(c => (c[0] as { title: string }).title)
    expect(titulos).toContain('Esta ronda ya no existe')
    expect(titulos).not.toContain('Sin conexión')
  })
})
