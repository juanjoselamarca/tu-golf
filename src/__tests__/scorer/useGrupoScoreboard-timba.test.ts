// Timba libre: la hoja de Finalizar dice quién queda con par en el hoyo en pantalla, y solo si alguien ya lo
// anotó (si nadie lo tocó, el hoyo no se jugó: 2ª revisión del PR C2).
import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useGrupoScoreboard } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreboard'
import { FORMATO_PERSONALIZADO } from '@/golf/formats/personalizado/config'
import type { HoleData, Jugador } from '@/types/ronda'

const orden = Array.from({ length: 18 }, (_, i) => i + 1)
const parMap = Object.fromEntries(orden.map(h => [h, 4]))
const holeDataMap: Record<number, HoleData> = Object.fromEntries(orden.map(h => [h, { numero: h, par: 4, stroke_index: h, yardaje: null }]))
const jugadores = [
  { id: 'p1', nombre: 'Ana', user_id: null, scores: {} },
  { id: 'p2', nombre: 'Beto', user_id: null, scores: {} },
  { id: 'p3', nombre: 'Carla', user_id: null, scores: {} },
] as unknown as Jugador[]
const nueve = Object.fromEntries(orden.slice(0, 9).map(h => [h, 4]))

const montar = (scores: Record<string, Record<number, number>>, currentHole: number, retiros?: Record<string, number>) =>
  renderHook(() => useGrupoScoreboard({
    ronda: { holes: 18, modo_juego: 'gross', formato_juego: FORMATO_PERSONALIZADO } as never,
    jugadores, scores, parMap, holeDataMap, playerHcp: {}, equipos: [], ordenHoyos: orden, currentHole,
    isLastHole: currentHole === 18, matchResult: null, retiros,
  })).result.current

describe('useGrupoScoreboard — Timba: par del hoyo en pantalla', () => {
  it('jugaron 9 y el scorer quedó en el 10 sin anotar: nadie queda con par y el 10 cuenta como no jugado', () => {
    const b = montar({ p1: nueve, p2: nueve, p3: nueve }, 10)
    expect(b.parEnPantallaTimba).toBeNull()
    expect(b.hoyosSinJugarTimba).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
    expect(b.hoyosPorMarcar).toBe(0)
  })
  it('Ana anotó el 10: Beto y Carla quedan con par (el retirado no)', () => {
    const b = montar({ p1: { ...nueve, 10: 5 }, p2: nueve, p3: nueve }, 10)
    expect(b.parEnPantallaTimba).toEqual({ hoyo: 10, nombres: ['Beto', 'Carla'] })
    expect(montar({ p1: { ...nueve, 10: 5 }, p2: nueve, p3: nueve }, 10, { p3: 5 }).parEnPantallaTimba)
      .toEqual({ hoyo: 10, nombres: ['Beto'] })
  })
})
