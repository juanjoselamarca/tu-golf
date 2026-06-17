import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useScoreboardCalc, type ModoJuego, type FormatoJuego } from '@/app/ronda-libre/[codigo]/score/hooks/useScoreboardCalc'
import type { HoleData, Jugador } from '@/types/ronda'

type RondaInput = Parameters<typeof useScoreboardCalc>[0]['ronda']

const playerJuanjo: Jugador = { id: 'p1', nombre: 'Juanjo', user_id: 'u1', scores: {}, handicap: 11.1, tees: 'azul' }
const playerRival: Jugador = { id: 'p2', nombre: 'Rival', user_id: 'u2', scores: {}, handicap: 5.0, tees: 'azul' }

describe('useScoreboardCalc', () => {
  const baseRonda: RondaInput = {
    holes: 18,
    modo_juego: 'gross',
    formato_juego: 'stroke_play',
    hoyo_inicio: 1,
  }

  const baseInput = {
    ronda: baseRonda,
    activeJugadorId: 'p1',
    jugadores: [playerJuanjo],
    scores: { p1: { 1: 4, 2: 5, 3: 3 } },
    parMap: { 1: 4, 2: 5, 3: 3, 4: 4, 5: 4, 6: 4, 7: 4, 8: 3, 9: 5 },
    holeDataMap: { 1: { numero: 1, par: 4, stroke_index: 1, yardaje: null } } as Record<number, HoleData>,
    playerHcp: { p1: 11 },
    currentHole: 1,
    currentHoleIdx: 0,
  }

  it('totalGross suma solo los hoyos con score', () => {
    const { result } = renderHook(() => useScoreboardCalc(baseInput))
    expect(result.current.totals.totalGross).toBe(12) // 4+5+3
  })

  it('totalOverUnder = gross - par jugado', () => {
    const { result } = renderHook(() => useScoreboardCalc(baseInput))
    // par jugado = 4+5+3 = 12. gross 12. diff 0.
    expect(result.current.totals.totalOverUnder).toBe(0)
  })

  it('modoJuego defaultea a gross si no está seteado', () => {
    const input = { ...baseInput, ronda: { ...baseInput.ronda, modo_juego: undefined as unknown as ModoJuego } }
    const { result } = renderHook(() => useScoreboardCalc(input))
    expect(result.current.mode.modoJuego).toBe('gross')
  })

  it('formatoJuego defaultea a stroke_play si no está seteado', () => {
    const input = { ...baseInput, ronda: { ...baseInput.ronda, formato_juego: undefined as unknown as FormatoJuego } }
    const { result } = renderHook(() => useScoreboardCalc(input))
    expect(result.current.mode.formatoJuego).toBe('stroke_play')
  })

  it('hasStrokeAdvantage no tira ReferenceError (regresión bug 12-may)', () => {
    const { result } = renderHook(() => useScoreboardCalc(baseInput))
    // El bug 12-may era: hasStrokeAdvantage usaba modoJuego antes de ser declarada.
    // Si el hook devuelve sin throw, eso lo verifica estructuralmente.
    expect(typeof result.current.current.strokeAdvantageOnHole).toBe('boolean')
  })

  it('frontNine / backNine split correctamente con 18 hoyos', () => {
    const input = { ...baseInput, scores: { p1: { 1: 4, 2: 4, 10: 5, 11: 5 } } }
    const { result } = renderHook(() => useScoreboardCalc(input))
    expect(result.current.nines.f9Gross).toBe(8)
    expect(result.current.nines.b9Gross).toBe(10)
  })

  // ── Nit 7: edge cases ─────────────────────────────────────────────────

  it('edge: empty scores → totalGross 0 y holesPlayed 0', () => {
    const input = { ...baseInput, scores: { p1: {} } }
    const { result } = renderHook(() => useScoreboardCalc(input))
    expect(result.current.totals.totalGross).toBe(0)
    expect(result.current.totals.holesPlayed).toBe(0)
    expect(result.current.totals.totalOverUnder).toBe(0)
    // canFinalize false: 0 hoyos jugados y no es el último hoyo.
    expect(result.current.flags.canFinalize).toBe(false)
  })

  it('edge: stableford → showStableford true y displayTotal usa puntos', () => {
    const input = {
      ...baseInput,
      ronda: { ...baseInput.ronda, formato_juego: 'stableford' as const },
      // Cargar holeDataMap para los hoyos con score para que stableford compute.
      holeDataMap: {
        1: { numero: 1, par: 4, stroke_index: 1, yardaje: null },
        2: { numero: 2, par: 5, stroke_index: 5, yardaje: null },
        3: { numero: 3, par: 3, stroke_index: 9, yardaje: null },
      } as Record<number, HoleData>,
    }
    const { result } = renderHook(() => useScoreboardCalc(input))
    expect(result.current.mode.showStableford).toBe(true)
    expect(result.current.mode.modoLabel).toBe('Stableford')
    // displayTotal === totalStableford cuando es stableford.
    expect(result.current.display.displayTotal).toBe(result.current.neto.totalStableford)
  })

  it('edge: match play 2-player con diferencia de hcp → strokeAdvantageOnHole true en SI donde solo Juanjo recibe stroke', () => {
    // Juanjo (hcp 11) recibe stroke en SI 1..11; rival (hcp 5) recibe en SI 1..5.
    // Ventaja real para Juanjo: SI 6..11. SI 1..5 empatan (ambos reciben), SI 12..18 vacíos.
    const input = {
      ...baseInput,
      ronda: {
        ...baseInput.ronda,
        formato_juego: 'match_play' as const,
        modo_juego: 'neto' as const,
        ronda_libre_jugadores: [playerJuanjo, playerRival],
      },
      jugadores: [playerJuanjo, playerRival],
      playerHcp: { p1: 11, p2: 5 },
      // currentHole apunta a un hoyo cuyo stroke_index cae en 6..11 (ventaja Juanjo).
      currentHole: 7,
      currentHoleIdx: 6,
      holeDataMap: {
        7: { numero: 7, par: 4, stroke_index: 6, yardaje: null },
      } as Record<number, HoleData>,
    }
    const { result } = renderHook(() => useScoreboardCalc(input))
    expect(result.current.current.strokeAdvantageOnHole).toBe(true)
    // SI 6..11: solo Juanjo recibe → ventaja.
    expect(result.current.strokeAdvantageOn(6)).toBe(true)
    expect(result.current.strokeAdvantageOn(11)).toBe(true)
    // SI 1..5: ambos reciben stroke → sin ventaja (empate).
    expect(result.current.strokeAdvantageOn(1)).toBe(false)
    // SI 12..18: ninguno recibe stroke → sin ventaja.
    expect(result.current.strokeAdvantageOn(18)).toBe(false)
  })

  it('strokeAdvantageOn expuesto desde el hook (Nit 3)', () => {
    const { result } = renderHook(() => useScoreboardCalc(baseInput))
    expect(typeof result.current.strokeAdvantageOn).toBe('function')
  })

  // ── isStrokePlayNeto: sin golpes por hoyo en stroke play neto ─────────────
  // Reporte inbox 17-jun (Juanjo): en stroke play neto el hándicap se aplica al
  // total, no por hoyo → no se marcan golpes por hoyo. En match play y stableford
  // los golpes por hoyo SÍ importan, así que el flag debe quedar false ahí.
  describe('isStrokePlayNeto', () => {
    it('true sólo en stroke play + neto', () => {
      const input = { ...baseInput, ronda: { ...baseInput.ronda, formato_juego: 'stroke_play' as const, modo_juego: 'neto' as const } }
      const { result } = renderHook(() => useScoreboardCalc(input))
      expect(result.current.mode.isStrokePlayNeto).toBe(true)
      // showNet también true, pero isStrokePlayNeto lo distingue de match play neto.
      expect(result.current.mode.showNet).toBe(true)
    })

    it('false en stroke play gross (no hay golpes que ocultar)', () => {
      const input = { ...baseInput, ronda: { ...baseInput.ronda, formato_juego: 'stroke_play' as const, modo_juego: 'gross' as const } }
      const { result } = renderHook(() => useScoreboardCalc(input))
      expect(result.current.mode.isStrokePlayNeto).toBe(false)
    })

    it('false en match play neto (los golpes por hoyo deciden hoyos)', () => {
      const input = { ...baseInput, ronda: { ...baseInput.ronda, formato_juego: 'match_play' as const, modo_juego: 'neto' as const } }
      const { result } = renderHook(() => useScoreboardCalc(input))
      expect(result.current.mode.isStrokePlayNeto).toBe(false)
      // showNet sigue true en match play neto — por eso no se puede gatear con showNet.
      expect(result.current.mode.showNet).toBe(true)
    })

    it('false en stableford (los golpes por hoyo dan los puntos)', () => {
      const input = { ...baseInput, ronda: { ...baseInput.ronda, formato_juego: 'stableford' as const, modo_juego: 'neto' as const } }
      const { result } = renderHook(() => useScoreboardCalc(input))
      expect(result.current.mode.isStrokePlayNeto).toBe(false)
    })
  })
})
