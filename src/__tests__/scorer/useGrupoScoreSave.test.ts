import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { useGrupoScoreSave } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreSave'

const saveRondaLibreScores = vi.fn(async () => ({ error: null as unknown }))
vi.mock('@/lib/data/ronda-libre-scores', () => ({
  saveRondaLibreScores: (...a: unknown[]) => saveRondaLibreScores(...(a as [])),
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const addToast = vi.fn()
vi.mock('@/hooks/useToast', () => ({ addToast: (...a: unknown[]) => addToast(...a) }))
vi.mock('@/lib/ronda/helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ronda/helpers')>()), haptic: vi.fn() }))
const saveGroupScores = vi.fn()
vi.mock('@/lib/ronda/score-storage', () => ({ saveGroupScores: (...a: unknown[]) => saveGroupScores(...a), loadGroupScores: () => ({}) }))

const ronda = {
  id: 'r1', codigo: 'ABC', course_name: 'X', course_id: null, tees: 'azul', holes: 9, fecha: '2026-09-30', estado: 'en_curso',
  modo_juego: 'gross', formato_juego: 'stroke_play', hoyo_inicio: 1,
  ronda_libre_jugadores: [
    { id: 'p1', nombre: 'Ana', user_id: 'u1', scores: {} },
    { id: 'p2', nombre: 'Beto', user_id: null, scores: {} },
  ],
} as never
const PAR = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5 }

function montar(inicial: Record<string, Record<number, number>> = { p1: {}, p2: {} }, hole = 1) {
  return renderHook(() => {
    const [scores, setScores] = useState(inicial)
    const [currentHole, setCurrentHole] = useState(hole)
    const save = useGrupoScoreSave({ ronda, codigo: 'ABC', currentHole, scores, setScores, parMap: PAR })
    return { scores, setCurrentHole, save }
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  saveRondaLibreScores.mockReset()
  saveRondaLibreScores.mockResolvedValue({ error: null })
  addToast.mockClear()
  saveGroupScores.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('useGrupoScoreSave', () => {
  it('primer +: parte del par, respalda local y guarda ese jugador 500ms después (A2)', async () => {
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    expect(result.current.scores.p1[1]).toBe(5)
    expect(result.current.save.hasUnsaved).toBe(true)
    expect(saveGroupScores).toHaveBeenCalledWith('ABC', expect.objectContaining({ p1: { 1: 5 } }))
    expect(saveRondaLibreScores).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(1)
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, { codigo: 'ABC', jugadorId: 'p1', delta: { 1: 5 } })
    expect(result.current.save.saveStatus).toBe('saved')
    expect(result.current.save.hasUnsaved).toBe(false)
  })

  it('A1 anti-toque: cambiar un score existente pide 2 taps; el pending expira a los 2s', () => {
    const { result } = montar({ p1: { 1: 5 }, p2: {} })
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) })
    expect(result.current.scores.p1[1]).toBe(5) // no cambió
    expect(result.current.save.pendingScoreConfirm).toEqual({ jugadorId: 'p1', hole: 1 })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.save.pendingScoreConfirm).toBeNull()
    // Otra vez: 1er tap arma, 2º tap aplica.
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) })
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) })
    expect(result.current.scores.p1[1]).toBe(4)
    expect(result.current.save.pendingScoreConfirm).toBeNull()
  })

  it('A3 edit window: tras confirmar, 3s de correcciones libres sobre el mismo jugador/hoyo', () => {
    const { result } = montar({ p1: { 1: 9 }, p2: {} })
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) }) // arma
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) }) // confirma → 8
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) }) // libre → 7
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) }) // libre → 6
    expect(result.current.scores.p1[1]).toBe(6)
    act(() => { vi.advanceTimersByTime(3000) })
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) }) // ventana cerrada → pide confirmar
    expect(result.current.scores.p1[1]).toBe(6)
    expect(result.current.save.pendingScoreConfirm).toEqual({ jugadorId: 'p1', hole: 1 })
  })

  it('otro jugador no hereda la confirmación pendiente', () => {
    const { result } = montar({ p1: { 1: 5 }, p2: { 1: 5 } })
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    act(() => { result.current.save.handleScoreChange('p2', 1, 1) })
    expect(result.current.scores.p1[1]).toBe(5)
    expect(result.current.scores.p2[1]).toBe(5)
    expect(result.current.save.pendingScoreConfirm).toEqual({ jugadorId: 'p2', hole: 1 })
  })

  it('cambiar de hoyo limpia la confirmación pendiente', () => {
    const { result } = montar({ p1: { 1: 5 }, p2: {} })
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    expect(result.current.save.pendingScoreConfirm).not.toBeNull()
    act(() => { result.current.setCurrentHole(2) })
    expect(result.current.save.pendingScoreConfirm).toBeNull()
  })

  it('taps sucesivos → un solo save con el último valor (debounce rebatable)', async () => {
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    act(() => { vi.advanceTimersByTime(200) })
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    act(() => { vi.advanceTimersByTime(200) })
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(1)
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, { codigo: 'ABC', jugadorId: 'p1', delta: { 1: 7 } })
  })

  it('marcador único: anotar a Ana y a Beto en < 500ms guarda a LOS DOS (debounce por jugador)', async () => {
    // Prueba de fuego Los Leones 04-oct: un solo timer compartido cancelaba el save del
    // primer jugador; en el último hoyo (sin Siguiente) el bogey de B no llegaba a la BD.
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    act(() => { result.current.save.handleScoreChange('p2', 1, -1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, { codigo: 'ABC', jugadorId: 'p1', delta: { 1: 5 } })
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, { codigo: 'ABC', jugadorId: 'p2', delta: { 1: 3 } })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(2)
  })

  it('clamp 1..15 (GOLPES_MAX_POR_HOYO, lo que el "+" del scorer permite)', () => {
    const { result } = montar({ p1: { 1: 1 }, p2: { 1: 15 } })
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) })
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) })
    act(() => { result.current.save.handleScoreChange('p2', 1, 1) })
    act(() => { result.current.save.handleScoreChange('p2', 1, 1) })
    expect(result.current.scores.p1[1]).toBe(1)
    expect(result.current.scores.p2[1]).toBe(15)
  })

  it('save falla 3 veces → estado error + toast (el respaldo local ya está)', async () => {
    saveRondaLibreScores.mockResolvedValue({ error: { code: '08006' } })
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500 + 400 + 800 + 100) })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(3)
    expect(result.current.save.saveStatus).toBe('error')
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', title: 'No se pudo guardar el score' }))
  })

  it('saveAllScores: respalda local, guarda a todos y, offline, no toca el servidor', async () => {
    const { result } = montar({ p1: { 1: 4 }, p2: { 1: 5 } })
    await act(async () => { await result.current.save.saveAllScores() })
    expect(saveGroupScores).toHaveBeenCalledWith('ABC', { p1: { 1: 4 }, p2: { 1: 5 } })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(2)
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, { codigo: 'ABC', jugadorId: 'p2', delta: { 1: 5 } })
    expect(result.current.save.saveStatus).toBe('saved')

    saveRondaLibreScores.mockClear()
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await act(async () => { await result.current.save.saveAllScores({ p1: { 1: 4, 2: 4 }, p2: {} }) })
    expect(saveRondaLibreScores).not.toHaveBeenCalled()
    expect(result.current.save.saveStatus).toBe('error')
    onLine.mockRestore()
  })
})
