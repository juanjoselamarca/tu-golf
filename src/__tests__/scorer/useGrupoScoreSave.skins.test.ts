/**
 * Skins: la X («Fuera del hoyo») viaja por el mismo camino que los golpes (respaldo, cola de pendientes, RPC) sin
 * volverse nunca un número. Fuera del skins no hay mapa de la X y una X que llegara no se anota.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { useGrupoScoreSave } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreSave'
import { leerPendientes, loadGroupFuera } from '@/lib/ronda/score-storage'

const saveRondaLibreScores = vi.fn(async () => ({ error: null as unknown }))
vi.mock('@/lib/data/ronda-libre-scores', () => ({
  saveRondaLibreScores: (...a: unknown[]) => saveRondaLibreScores(...(a as [])),
  saveRondaEquiposScores: vi.fn(async () => ({ error: null })),
  ERRCODE_SIN_RESPUESTA: 'SIN_RESPUESTA',
}))
const { cliente } = vi.hoisted(() => ({
  cliente: {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { estado: 'en_curso' }, error: null }) }) }) }),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }) },
  },
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => cliente }))
vi.mock('@/hooks/useToast', () => ({ addToast: vi.fn() }))
vi.mock('@/lib/ronda/helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ronda/helpers')>()), haptic: vi.fn() }))

const ronda = {
  id: 'r1', codigo: 'SKN', course_name: 'X', course_id: null, tees: 'azul', holes: 9, fecha: '2026-11-25', estado: 'en_curso',
  modo_juego: 'gross', formato_juego: 'skins', hoyo_inicio: 1,
  ronda_libre_jugadores: [
    { id: 'p1', nombre: 'Ana', user_id: 'u1', scores: {} },
    { id: 'p2', nombre: 'Beto', user_id: null, scores: {} },
  ],
} as never
const PAR = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5 }

function montar(opts: { inicial?: Record<string, Record<number, number>>; fuera?: Record<string, Record<number, true>>; skins?: boolean } = {}) {
  return renderHook(() => {
    const [scores, setScores] = useState(opts.inicial ?? { p1: {}, p2: {} })
    const [fuera, setFuera] = useState<Record<string, Record<number, true>>>(opts.fuera ?? {})
    const save = useGrupoScoreSave({
      ronda, codigo: 'SKN', currentHole: 1, scores, setScores, parMap: PAR,
      fueraDelHoyo: opts.skins === false ? undefined : { fuera, setFuera },
    })
    return { scores, fuera, save }
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  saveRondaLibreScores.mockReset()
  saveRondaLibreScores.mockResolvedValue({ error: null })
})
afterEach(() => vi.useRealTimers())

describe('useGrupoScoreSave — X del skins', () => {
  it('X en un hoyo vacío: sin golpes, respaldada y enviada como "X" a la RPC', async () => {
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 'X') })
    expect(result.current.scores.p1[1]).toBeUndefined()
    expect(result.current.fuera.p1).toEqual({ 1: true })
    expect(loadGroupFuera('SKN')).toEqual({ p1: { 1: true } })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(saveRondaLibreScores).toHaveBeenCalledWith(cliente, { codigo: 'SKN', jugadorId: 'p1', delta: { 1: 'X' } })
    expect(leerPendientes('SKN')).toEqual({})
  })

  it('sin red: la X queda en la cola de pendientes y sube cuando vuelve el servidor', async () => {
    saveRondaLibreScores.mockResolvedValue({ error: { code: 'SIN_RESPUESTA' } })
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 'X') })
    await act(async () => { await vi.advanceTimersByTimeAsync(500 + 400 + 800) })
    expect(leerPendientes('SKN')).toEqual({ p1: { 1: 'X' } })
    expect(result.current.save.pendienteDeEnvio).toBe(true)
    saveRondaLibreScores.mockResolvedValue({ error: null })
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000 + 1_300) })
    expect(saveRondaLibreScores).toHaveBeenLastCalledWith(cliente, expect.objectContaining({ jugadorId: 'p1', delta: { 1: 'X' } }))
    expect(leerPendientes('SKN')).toEqual({})
  })

  it('X sobre golpes pide el 2º toque (A1) y borra los golpes del hoyo', () => {
    const { result } = montar({ inicial: { p1: { 1: 6 }, p2: {} } })
    act(() => { result.current.save.handleScoreChange('p1', 1, 'X') })
    expect(result.current.scores.p1[1]).toBe(6)
    expect(result.current.save.pendingScoreConfirm).toEqual({ jugadorId: 'p1', hole: 1 })
    act(() => { result.current.save.handleScoreChange('p1', 1, 'X') })
    expect(result.current.scores.p1[1]).toBeUndefined()
    expect(result.current.fuera.p1).toEqual({ 1: true })
    expect(leerPendientes('SKN')).toEqual({ p1: { 1: 'X' } })
  })

  it('X → número: el 1er cambio confirmado deja el par y saca la X (en pantalla, respaldo y cola)', async () => {
    const { result } = montar({ fuera: { p1: { 1: true } } })
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) }) // arma (la X es un valor anotado)
    expect(result.current.fuera.p1).toEqual({ 1: true })
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) }) // confirma
    expect(result.current.scores.p1[1]).toBe(4)
    expect(result.current.fuera.p1).toEqual({})
    expect(loadGroupFuera('SKN')).toEqual({ p1: {} })
    expect(leerPendientes('SKN')).toEqual({ p1: { 1: 4 } })
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) }) // ventana A3: libre
    expect(result.current.scores.p1[1]).toBe(5)
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(saveRondaLibreScores).toHaveBeenCalledWith(cliente, { codigo: 'SKN', jugadorId: 'p1', delta: { 1: 5 } })
  })

  it('X sobre X no hace nada (ni pide confirmar ni reenvía)', () => {
    const { result } = montar({ fuera: { p1: { 1: true } } })
    act(() => { result.current.save.handleScoreChange('p1', 1, 'X') })
    expect(result.current.save.pendingScoreConfirm).toBeNull()
    expect(leerPendientes('SKN')).toEqual({})
  })

  it('fuera del skins (sin mapa de la X) una X no se anota', async () => {
    const { result } = montar({ skins: false })
    act(() => { result.current.save.handleScoreChange('p1', 1, 'X') })
    expect(result.current.scores.p1).toEqual({})
    expect(leerPendientes('SKN')).toEqual({})
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(saveRondaLibreScores).not.toHaveBeenCalled()
  })
})

describe('useGrupoScoreSave — updaters puros', () => {
  it('los updaters de golpes y de la X dan lo mismo llamados dos veces, y el toque se anota una sola vez', async () => {
    const updaters: { scores: ((p: never) => unknown)[]; fuera: ((p: never) => unknown)[] } = { scores: [], fuera: [] }
    const { result } = renderHook(() => {
      const [scores, setScoresReal] = useState<Record<string, Record<number, number>>>({ p1: { 1: 5 }, p2: {} })
      const [fuera, setFueraReal] = useState<Record<string, Record<number, true>>>({})
      const setScores: typeof setScoresReal = a => { if (typeof a === 'function') updaters.scores.push(a as never); setScoresReal(a) }
      const setFuera: typeof setFueraReal = a => { if (typeof a === 'function') updaters.fuera.push(a as never); setFueraReal(a) }
      const save = useGrupoScoreSave({ ronda, codigo: 'SKN', currentHole: 1, scores, setScores, parMap: PAR, fueraDelHoyo: { fuera, setFuera } })
      return { scores, fuera, save }
    })
    // X en un hoyo vacío: un toque basta.
    act(() => { result.current.save.handleScoreChange('p1', 2, 'X') })
    expect(updaters.scores).toHaveLength(1)
    expect(updaters.fuera).toHaveLength(1)
    const base = { p1: { 1: 5, 2: 4 }, p2: {} }
    const u = updaters.scores[0] as (p: typeof base) => typeof base
    expect(u(u(base))).toEqual(u(base))
    expect(u(base).p1).toEqual({ 1: 5 })
    const f = updaters.fuera[0] as (p: Record<string, Record<number, true>>) => Record<string, Record<number, true>>
    expect(f(f({}))).toEqual({ p1: { 2: true } })
    // Una sola X pendiente (no dos), y el estado final es el calculado.
    expect(leerPendientes('SKN')).toEqual({ p1: { 2: 'X' } })
    expect(result.current.fuera).toEqual({ p1: { 2: true } })
    expect(result.current.scores.p1).toEqual({ 1: 5 })
  })

  it('dos toques seguidos antes de re-renderizar se suman (el estado sale de la ref, no de un render viejo)', () => {
    const { result } = montar()
    act(() => {
      result.current.save.handleScoreChange('p1', 3, 1)
      result.current.save.handleScoreChange('p1', 3, 1)
    })
    // Par 3: el primer toque deja 4 y el segundo 5 (sin anti-toque: subir de a uno no pide confirmación).
    expect(result.current.scores.p1[3]).toBe(5)
  })
})
