// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDemoSimulation, sinSalir, getScoreVsPar } from './useDemoSimulation'

afterEach(() => { vi.useRealTimers() })

describe('useDemoSimulation — orden del leaderboard demo (/leaderboard)', () => {
  it('quien no ha salido (0 hoyos) va al final: nunca encabeza con un "E" sin jugar', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useDemoSimulation())
    const { players } = result.current
    const primerSinSalir = players.findIndex(sinSalir)
    expect(primerSinSalir).toBeGreaterThan(0) // el demo arranca con jugadores sin salir
    // Todos los que vienen después tampoco han salido.
    expect(players.slice(primerSinSalir).every(sinSalir)).toBe(true)
    // Entre los que sí jugaron, orden por score vs par (menor primero).
    const jugados = players.slice(0, primerSinSalir).map(p => getScoreVsPar(p.scores))
    expect(jugados).toEqual([...jugados].sort((a, b) => a - b))
  })
})
