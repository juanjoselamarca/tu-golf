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
