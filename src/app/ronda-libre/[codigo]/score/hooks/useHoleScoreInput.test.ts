import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useState } from 'react'

const lsSave = vi.fn()
const enviar = vi.fn()
vi.mock('@/lib/ronda/score-storage', () => ({ saveScores: (...a: unknown[]) => lsSave(...a) }))
vi.mock('@/lib/ronda/helpers', () => ({ haptic: () => {} }))

import { useHoleScoreInput } from './useHoleScoreInput'
import { CONCEDE } from '@/golf/formats/match-play'

/** El hook real con el estado de la página: scores + "sin guardar". */
function useScorerDePrueba(bloqueado: boolean, isMatchPlay = false) {
  const [scores, setScores] = useState<Record<string, Record<number, number>>>({ j1: { 3: 6, 9: 7 } })
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const input = useHoleScoreInput({
    codigo: 'ABC', activeJugadorId: 'j1', isMatchPlay, currentHole: 9, parMap: { 9: 5 },
    setScores, setHasUnsaved, enviar, bloqueado,
  })
  return { ...input, scores, hasUnsaved }
}

describe('useHoleScoreInput', () => {
  beforeEach(() => { lsSave.mockClear(); enviar.mockClear() })

  it('anota el golpe y lo respalda en el teléfono', () => {
    const { result } = renderHook(() => useScorerDePrueba(false))
    act(() => result.current.handleScoreChange(9, 8))
    expect(result.current.scores.j1[9]).toBe(8)
    expect(result.current.hasUnsaved).toBe(true)
    expect(lsSave).toHaveBeenCalledWith('ABC', 'j1', { 3: 6, 9: 8 })
  })

  // Reproducido en prod (22-oct, ronda 2W1R32): el hoyo 3 corregido de 6 a 4
  // desde la barra de hoyos nunca llegó al servidor (sólo "Siguiente" enviaba);
  // al recargar, la BD lo devolvía a 6 y el total volvía a 39.
  it('cada golpe agenda el envío de la tarjeta completa al servidor, no sólo "Siguiente"', () => {
    const { result } = renderHook(() => useScorerDePrueba(false))
    act(() => result.current.handleScoreChange(3, 4))
    expect(enviar).toHaveBeenLastCalledWith('j1', { 3: 4, 9: 7 })
  })

  it('conceder el hoyo también se envía al servidor', () => {
    const { result } = renderHook(() => useScorerDePrueba(false, true))
    act(() => result.current.handleConcedeHole())
    expect(enviar).toHaveBeenLastCalledWith('j1', { 3: 6, 9: CONCEDE })
  })

  // Reproducido en prod (18-oct, ronda 4W2I4K): un + durante "Finalizando..."
  // cambiaba la pantalla a 8 pero la tarjeta guardada quedaba en 7, y "Ronda
  // completada" decía 48 con la grilla sumando 49.
  it('con Finalizar en curso no acepta golpes: la pantalla no se aparta de lo guardado', () => {
    const { result } = renderHook(() => useScorerDePrueba(true))
    act(() => result.current.handleScoreChange(9, 8))
    expect(result.current.scores.j1[9]).toBe(7)
    expect(result.current.hasUnsaved).toBe(false)
    expect(lsSave).not.toHaveBeenCalled()
    expect(enviar).not.toHaveBeenCalled()
  })

  it('con Finalizar en curso tampoco concede el hoyo en match play', () => {
    const { result } = renderHook(() => useScorerDePrueba(true, true))
    act(() => result.current.handleConcedeHole())
    expect(result.current.scores.j1[9]).toBe(7)
    expect(lsSave).not.toHaveBeenCalled()
  })

  it('sin bloqueo, conceder anota CONCEDE en el hoyo actual', () => {
    const { result } = renderHook(() => useScorerDePrueba(false, true))
    act(() => result.current.handleConcedeHole())
    expect(result.current.scores.j1[9]).toBe(CONCEDE)
  })
})
