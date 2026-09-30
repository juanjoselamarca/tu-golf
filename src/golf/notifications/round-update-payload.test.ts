import { describe, it, expect } from 'vitest'
import { buildRoundUpdatePlayers } from './round-update-payload'
import { maxHolesCompleted } from './spectator'

const parMap9 = { 1: 4, 2: 4, 3: 3, 4: 4, 5: 5, 6: 4, 7: 3, 8: 4, 9: 5 }

describe('buildRoundUpdatePlayers — payload del push desde scores vivos', () => {
  it('reproduce la ronda 4YDC3G (25-sep): tras guardar el hoyo 3 el push dice Thru 3, no 0', () => {
    // Snapshot al abrir la página: {} (ronda recién creada). Scores vivos: 3 hoyos.
    const snapshotScores = {}
    const liveScores = { 'j1': { 1: 6, 2: 5, 3: 4 } }
    const jugadores = [{ id: 'j1', nombre: 'Juan José Lamarca' }]

    const fromSnapshot = buildRoundUpdatePlayers({ jugadores, scores: { j1: snapshotScores }, parMap: parMap9, totalHoles: 9 })
    const fromLive = buildRoundUpdatePlayers({ jugadores, scores: liveScores, parMap: parMap9, totalHoles: 9 })

    // Así llegaba al endpoint antes del fix (maxHole 0 → 400 silencioso).
    expect(maxHolesCompleted(fromSnapshot)).toBe(0)
    // Así llega ahora.
    expect(maxHolesCompleted(fromLive)).toBe(3)
    expect(fromLive[0]).toEqual({ nombre: 'Juan José Lamarca', vsPar: 4, holesCompleted: 3, totalHoles: 9 })
  })

  it('acepta scores con claves string (JSONB) o number (estado React)', () => {
    const jugadores = [{ id: 'a', nombre: 'A' }, { id: 'b', nombre: 'B' }]
    const out = buildRoundUpdatePlayers({
      jugadores,
      scores: { a: { '1': 4, '2': 3 }, b: { 1: 5 } },
      parMap: parMap9, totalHoles: 9,
    })
    expect(out.map(p => p.holesCompleted)).toEqual([2, 1])
    expect(out.map(p => p.vsPar)).toEqual([-1, 1])
  })

  it('ignora hoyos fuera de la ronda (score en el 10 de una ronda de 9)', () => {
    const out = buildRoundUpdatePlayers({
      jugadores: [{ id: 'a', nombre: 'A' }],
      scores: { a: { 1: 4, 10: 4 } },
      parMap: parMap9, totalHoles: 9,
    })
    expect(out[0].holesCompleted).toBe(1)
  })

  it('jugador sin scores → 0 hoyos, vs-par 0', () => {
    const out = buildRoundUpdatePlayers({
      jugadores: [{ id: 'a', nombre: 'A' }],
      scores: {},
      parMap: parMap9, totalHoles: 9,
    })
    expect(out[0]).toMatchObject({ holesCompleted: 0, vsPar: 0 })
  })
})
