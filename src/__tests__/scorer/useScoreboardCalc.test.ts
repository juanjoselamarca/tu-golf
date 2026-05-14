import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useScoreboardCalc } from '@/app/ronda-libre/[codigo]/score/hooks/useScoreboardCalc'

describe('useScoreboardCalc', () => {
  const baseInput = {
    ronda: { holes: 18, modo_juego: 'gross' as const, formato_juego: 'stroke_play' as const, hoyo_inicio: 1 },
    activeJugadorId: 'p1',
    jugadores: [{ id: 'p1', nombre: 'Juanjo', user_id: 'u1', scores: {}, handicap: 11.1, tees: 'azul' }],
    scores: { p1: { 1: 4, 2: 5, 3: 3 } },
    parMap: { 1: 4, 2: 5, 3: 3, 4: 4, 5: 4, 6: 4, 7: 4, 8: 3, 9: 5 },
    holeDataMap: { 1: { numero: 1, par: 4, stroke_index: 1, yardaje: null } } as Record<number, import('@/types/ronda').HoleData>,
    playerHcp: { p1: 11 },
    currentHole: 1,
  }

  it('totalGross suma solo los hoyos con score', () => {
    const { result } = renderHook(() => useScoreboardCalc(baseInput))
    expect(result.current.totalGross).toBe(12) // 4+5+3
  })

  it('totalOverUnder = gross - par jugado', () => {
    const { result } = renderHook(() => useScoreboardCalc(baseInput))
    // par jugado = 4+5+3 = 12. gross 12. diff 0.
    expect(result.current.totalOverUnder).toBe(0)
  })

  it('modoJuego defaultea a gross si no está seteado', () => {
    const input = { ...baseInput, ronda: { ...baseInput.ronda, modo_juego: undefined as never } }
    const { result } = renderHook(() => useScoreboardCalc(input))
    expect(result.current.modoJuego).toBe('gross')
  })

  it('hasStrokeAdvantage no tira ReferenceError (regresión bug 12-may)', () => {
    const { result } = renderHook(() => useScoreboardCalc(baseInput))
    // El bug 12-may era: hasStrokeAdvantage usaba modoJuego antes de ser declarada.
    // Si el hook devuelve sin throw, eso lo verifica estructuralmente.
    expect(typeof result.current.strokeAdvantageOnHole).toBe('boolean')
  })

  it('frontNine / backNine split correctamente con 18 hoyos', () => {
    const input = { ...baseInput, scores: { p1: { 1: 4, 2: 4, 10: 5, 11: 5 } } }
    const { result } = renderHook(() => useScoreboardCalc(input))
    expect(result.current.f9Gross).toBe(8)
    expect(result.current.b9Gross).toBe(10)
  })
})
