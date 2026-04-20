import { describe, it, expect } from 'vitest'
import { rankTeams, type RankTeamsInput } from './team-ranking'

// parMap + siMap mínimos para una "ronda" de 9 hoyos par-4
const parMap = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, 4]))
const siMap = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, i + 1]))

const baseJugadores = [
  { id: 'j1', nombre: 'Ana',    handicap: 10, scores: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 } },
  { id: 'j2', nombre: 'Bruno',  handicap: 20, scores: { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5, 9: 5 } },
  { id: 'j3', nombre: 'Carla',  handicap: 15, scores: { 1: 6, 2: 6, 3: 6, 4: 6, 5: 6, 6: 6, 7: 6, 8: 6, 9: 6 } },
  { id: 'j4', nombre: 'Diego',  handicap: 8,  scores: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3 } },
]

const baseEquipos = [
  { id: 'e1', nombre: 'Team A', handicap_equipo: null, jugadorIds: ['j1', 'j4'], scores: { 1: 3, 2: 4, 3: 3, 4: 4, 5: 3, 6: 4, 7: 3, 8: 4, 9: 3 } },
  { id: 'e2', nombre: 'Team B', handicap_equipo: null, jugadorIds: ['j2', 'j3'], scores: { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5, 9: 5 } },
]

const baseInput: RankTeamsInput = {
  equipos: baseEquipos,
  jugadores: baseJugadores,
  parMap, siMap, holes: 9,
  formato: 'scramble',
  modo: 'gross',
}

describe('rankTeams', () => {
  it('retorna [] para formato individual (no team format)', () => {
    expect(rankTeams({ ...baseInput, formato: 'stroke_play' })).toEqual([])
    expect(rankTeams({ ...baseInput, formato: 'stableford' })).toEqual([])
    expect(rankTeams({ ...baseInput, formato: 'match_play' })).toEqual([])
  })

  it('retorna [] si no hay equipos', () => {
    expect(rankTeams({ ...baseInput, equipos: [] })).toEqual([])
  })

  it('retorna [] si parMap está vacío', () => {
    expect(rankTeams({ ...baseInput, parMap: {} })).toEqual([])
  })

  it('scramble gross: ordena por totalGross ascendente', () => {
    const rows = rankTeams({ ...baseInput, formato: 'scramble', modo: 'gross' })
    expect(rows).toHaveLength(2)
    expect(rows[0].nombre).toBe('Team A') // 31 strokes < 45
    expect(rows[1].nombre).toBe('Team B')
  })

  it('scramble neto: ordena por overUnderNeto ascendente (bug fix Apr-18)', () => {
    const rows = rankTeams({ ...baseInput, formato: 'scramble', modo: 'neto' })
    // El bug de Apr-18 era que `isStab = formato === 'stableford' || modo === 'neto'`
    // hacía que estos equipos se ordenaran por totalStableford (0), rompiendo orden.
    // Verificamos que el score mostrado es totalNeto, no 0.
    expect(rows[0].score).toBeGreaterThan(0)
    expect(rows[0].diff).not.toBe(0)
  })

  it('best_ball gross: usa el mejor score del equipo por hoyo', () => {
    const rows = rankTeams({
      ...baseInput,
      formato: 'best_ball',
      equipos: [
        { id: 'e1', nombre: 'Team A', handicap_equipo: null, jugadorIds: ['j1', 'j4'], scores: {} },
        { id: 'e2', nombre: 'Team B', handicap_equipo: null, jugadorIds: ['j2', 'j3'], scores: {} },
      ],
    })
    expect(rows).toHaveLength(2)
    // Team A: Diego (3s) mejor que Ana (4s) → 27 gross
    // Team B: Bruno (5s) mejor que Carla (6s) → 45 gross
    expect(rows[0].nombre).toBe('Team A')
    expect(rows[0].score).toBe(27)
  })

  it('foursome gross: usa scores de equipo (alternating)', () => {
    const rows = rankTeams({
      ...baseInput,
      formato: 'foursome',
      equipos: [
        { id: 'e1', nombre: 'Team A', handicap_equipo: null, jugadorIds: ['j1', 'j4'], scores: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 } },
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].score).toBe(36)
  })

  it('incluye nombres de jugadores en el row', () => {
    const rows = rankTeams(baseInput)
    expect(rows[0].jugadores).toContain('Ana')
    expect(rows[0].jugadores).toContain('Diego')
  })
})
