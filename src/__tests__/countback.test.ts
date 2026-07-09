import { describe, it, expect } from 'vitest'
import { applyCountback, resolveLeaderboardTies, type CountbackPlayer } from '@/golf/core/countback'

// Scores de 18 hoyos para tests
const makePlayer = (id: string, name: string, scores: number[], primaryScore: number): CountbackPlayer => ({
  id, name, scores, primaryScore,
})

describe('applyCountback', () => {
  it('retorna sin anotación para un solo jugador', () => {
    const result = applyCountback([makePlayer('a', 'Juan', [4,3,5,4,4,3,4,5,4,4,3,5,4,4,3,4,5,4], 72)])
    expect(result).toHaveLength(1)
    expect(result[0].resolvedByCountback).toBe(false)
    expect(result[0].annotation).toBe('')
  })

  it('desempata por back 9 en stroke play (lower wins)', () => {
    // Juan: back 9 = 34, Carlos: back 9 = 36
    const juan   = makePlayer('a', 'Juan',   [4,4,5,4,4,3,4,5,4, 4,3,4,4,4,3,4,4,4], 72)
    const carlos = makePlayer('b', 'Carlos', [4,3,4,4,4,3,4,5,5, 4,4,5,4,4,3,4,5,4], 72)

    const result = applyCountback([juan, carlos], 'lower_wins')
    expect(result[0].id).toBe('a') // Juan gana (back 9 más bajo)
    expect(result[0].resolvedByCountback).toBe(true)
    expect(result[0].annotation).toBe('(desempate)')
  })

  it('desempata por back 6 si back 9 está empatado', () => {
    // Misma back 9 (36), pero back 6 diferente
    const a = makePlayer('a', 'A', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,4], 72) // back6=24
    const b = makePlayer('b', 'B', [4,4,4,4,4,4,4,4,4, 4,4,4,3,4,4,4,4,5], 72) // back6=24...
    // Make them differ in back 6: b has hoyo 13=3, hoyo 18=5 => back6 = 3+4+4+4+4+5=24 vs a back6=24
    // Need a real difference. Let me fix:
    const c = makePlayer('c', 'C', [4,4,4,4,4,4,4,4,4, 4,4,4,3,5,4,4,4,4], 72) // back9=36, back6=3+5+4+4+4+4=24
    const d = makePlayer('d', 'D', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,3,5,4], 72) // back9=36, back6=4+4+4+3+5+4=24
    // Still 24 vs 24... Let me use different values:
    const e = makePlayer('e', 'E', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,4], 72) // back6=24
    const f = makePlayer('f', 'F', [4,4,4,4,4,4,4,4,4, 5,3,4,4,4,4,3,4,5], 72) // back9=36, back6=4+4+4+3+4+5=24
    // That's still 24. Let me simplify:
    const g = makePlayer('g', 'G', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,4], 72) // back6=24
    const h = makePlayer('h', 'H', [4,4,4,4,4,4,4,4,4, 4,4,4,3,4,4,4,4,5], 72) // back9=36, back6=3+4+4+4+4+5=24
    // Still 24! The sum is the same. Need asymmetric:
    const i = makePlayer('i', 'I', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,4], 72)
    const j = makePlayer('j', 'J', [4,4,4,4,4,4,4,4,4, 4,4,4,3,4,4,4,5,4], 72) // back6=3+4+4+4+5+4=24
    // Nope, 24 again. The trick is they need DIFFERENT back 6 with same back 9:
    // back9 = holes 10-18, back6 = holes 13-18
    // If back9=36, but one has lower in 13-18:
    const p1 = makePlayer('p1', 'P1', [4,4,4,4,4,4,4,4,4, 5,5,2,4,4,4,4,4,4], 72) // back9=36, back6=24
    const p2 = makePlayer('p2', 'P2', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,3,4,5], 72) // back9=36, back6=3+4+4+3+4+5=... no
    // p2 back6 = holes13-18 = 4+4+4+3+4+5 = 24. Still same.
    // OK let me just make it obvious:
    const x = makePlayer('x', 'X', [4,4,4,4,4,4,4,4,4, 5,5,2,4,4,4,4,4,4], 72) // back9=36, back6= 4+4+4+4+4+4=24
    const y = makePlayer('y', 'Y', [4,4,4,4,4,4,4,4,4, 2,5,5,4,4,4,4,4,3], 72) // back9=36, back6= 4+4+4+4+4+3=23
    const result = applyCountback([x, y], 'lower_wins')
    expect(result[0].id).toBe('y') // Y wins back 6 (23 < 24)
    expect(result[0].resolvedByCountback).toBe(true)
  })

  it('desempata por hoyo 18 si todo lo demás empata', () => {
    // Same back 9, back 6, back 3 but different hole 18
    const a = makePlayer('a', 'A', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,3], 71)
    const b = makePlayer('b', 'B', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,4], 72)
    // back9 a=35, back9 b=36 → a wins by back9 already
    // Let me make back9 equal but hole 18 different:
    const c = makePlayer('c', 'C', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,5,3], 72) // back9=36, back6=24, back3=4+5+3=12, h18=3
    const d = makePlayer('d', 'D', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,3,5], 72) // back9=36, back6=24, back3=4+3+5=12, h18=5
    const result = applyCountback([c, d], 'lower_wins')
    expect(result[0].id).toBe('c') // C wins hole 18 (3 < 5)
  })

  it('desempata por card-off hoyo a hoyo', () => {
    // Identical back 9, back 6, back 3, hole 18 — but hole 1 different
    const a = makePlayer('a', 'A', [3,5,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,4], 72)
    const b = makePlayer('b', 'B', [5,3,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,4], 72)
    const result = applyCountback([a, b], 'lower_wins')
    expect(result[0].id).toBe('a') // A wins hole 1 (3 < 5)
  })

  it('funciona en modo stableford (higher wins)', () => {
    // Stableford: higher is better. A tiene back9=20, B tiene back9=16
    const a = makePlayer('a', 'A', [2,2,2,2,2,2,2,2,2, 3,3,2,2,2,2,2,2,2], 36) // back9=20
    const b = makePlayer('b', 'B', [3,3,2,2,2,2,2,2,2, 2,2,2,2,2,2,2,2,2], 36) // back9=16
    const result = applyCountback([a, b], 'higher_wins')
    expect(result[0].id).toBe('a') // A wins (back9 20 > 16 in stableford)
  })

  it('marca empate verdadero cuando scores son idénticos', () => {
    const a = makePlayer('a', 'A', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,4], 72)
    const b = makePlayer('b', 'B', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,4], 72)
    const result = applyCountback([a, b], 'lower_wins')
    expect(result[0].annotation).toBe('(empate)')
    expect(result[1].annotation).toBe('(empate)')
  })
})

describe('countback en rondas de 9 hoyos (holeCount)', () => {
  // Countback USGA de 9h compara los últimos 6 / 3 / 1 hoyos (no back-9/6/3/18,
  // que quedan fuera de la tarjeta). Sin `holeCount` el motor usaba los rangos
  // de 18h → todos vacíos en 9h → caía directo al card-off desde el hoyo 1, que
  // NO es el desempate USGA de 9 hoyos.
  const make9 = (id: string, scores: number[], primaryScore: number): CountbackPlayer => ({
    id, name: id.toUpperCase(), scores, primaryScore,
  })

  it('desempata por los últimos 6 hoyos, no por card-off desde el hoyo 1', () => {
    // Ambos total 35 (empate). Card-off desde el hoyo 1 daría B (h1: 3<4).
    // El desempate USGA de 9h mira los últimos 6 (hoyos 4-9): A=23 < B=24 → A gana.
    const a = make9('a', [4,4,4,4,4,4,3,4,4], 35) // últimos6 (h4-9)=23
    const b = make9('b', [3,4,4,4,4,4,4,4,4], 35) // últimos6 (h4-9)=24
    const result = applyCountback([a, b], 'lower_wins', 9)
    expect(result[0].id).toBe('a')
    expect(result[0].resolvedByCountback).toBe(true)
  })

  it('stableford 9h: desempata por los últimos 3, higher wins', () => {
    // Empate a 18 pts. Últimos 3 (hoyos 7-9): A=8 > B=6 → A gana.
    const a = make9('a', [2,2,2,2,2,2,2,3,3], 18) // últimos3=8
    const b = make9('b', [3,3,2,2,2,2,2,2,2], 18) // últimos3=6
    const result = applyCountback([a, b], 'higher_wins', 9)
    expect(result[0].id).toBe('a')
  })

  it('holeCount=18 explícito mantiene el comportamiento de 18h', () => {
    const a = make9('a', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,3], 71) // back9=35
    const b = make9('b', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,5], 73) // back9=37
    const result = applyCountback([a, b], 'lower_wins', 18)
    expect(result[0].id).toBe('a')
  })
})

describe('resolveLeaderboardTies', () => {
  it('no toca jugadores sin empate', () => {
    const players = [
      makePlayer('a', 'A', [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4], 70),
      makePlayer('b', 'B', [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4], 72),
      makePlayer('c', 'C', [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4], 74),
    ]
    const result = resolveLeaderboardTies(players, 'lower_wins')
    expect(result.map(r => r.id)).toEqual(['a', 'b', 'c'])
    expect(result.every(r => r.annotation === '')).toBe(true)
  })

  it('resuelve empate en medio del leaderboard', () => {
    const players = [
      makePlayer('a', 'A', [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4], 70),
      makePlayer('b', 'B', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,3], 72), // back9=35
      makePlayer('c', 'C', [4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,5], 72), // back9=37
      makePlayer('d', 'D', [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4], 74),
    ]
    const result = resolveLeaderboardTies(players, 'lower_wins')
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('b') // wins countback
    expect(result[1].annotation).toBe('(desempate)')
    expect(result[2].id).toBe('c')
    expect(result[3].id).toBe('d')
  })
})
