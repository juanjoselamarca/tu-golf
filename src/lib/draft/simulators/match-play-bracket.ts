// src/lib/draft/simulators/match-play-bracket.ts
//
// Simulador para Match Play con bracket_mode = 'single_elimination' o
// 'round_robin'.
//
// - single_elimination: 8 jugadores demo → cuartos (4 matches) → semis
//   (2) → final (1). Total 7 matches.
// - round_robin: 4 jugadores demo, todos contra todos. C(4,2) = 6 matches.
//
// Cada match tiene un resultado en notación Match Play estándar:
//   "X&Y" — ganó por X hoyos cuando faltaban Y para terminar. Ej. "3&2"
//   significa "3 arriba con 2 por jugar" (terminó en hoyo 16).
//   "1up"  — ganó por un hoyo en el 18.
//   "AS"   — all square (empate al 18).
//
// El resultado X&Y solo es válido si X > Y (sino no habría podido cerrar).
import type { TournamentConfig } from '../types'
import {
  DEMO_NAMES,
  type MatchPlayMatch,
  type SimulatedMatchPlayBracketResult,
  getHoleCount,
  makeRng,
} from './_shared'

function generateMatchResult(rng: () => number, holeCount: number): { result: string; winner: 'a' | 'b' | 'tie' } {
  // ~10% AS (empate), 90% alguien gana
  const r = rng()
  if (r < 0.1) return { result: 'AS', winner: 'tie' }

  // El ganador es A si la siguiente moneda lo dice
  const winner: 'a' | 'b' = rng() < 0.5 ? 'a' : 'b'

  // X = diferencia de hoyos al cerrar (entre 1 y holeCount-1)
  // Y = hoyos que faltaban al cerrar (entre 0 y X-1)
  // Restricción: X > Y siempre. Si Y=0, notación es "Xup" o si el hoyo es
  // el último, simplemente "Xup".
  // Distribución sensata: X entre 1 y ~5; Y entre 0 y X-1.
  const maxX = Math.min(5, holeCount - 1)
  const x = 1 + Math.floor(rng() * maxX) // 1..maxX
  const y = Math.floor(rng() * x) // 0..x-1

  if (y === 0) {
    return { result: `${x}up`, winner }
  }
  return { result: `${x}&${y}`, winner }
}

function buildSingleElimination(rng: () => number, holeCount: number): MatchPlayMatch[] {
  // 8 jugadores → 7 matches
  const players = DEMO_NAMES.slice(0, 8).map((name, i) => ({
    name,
    handicap_index: Math.round((4 + i * 2.5) * 10) / 10,
  }))

  const matches: MatchPlayMatch[] = []

  // Cuartos: 4 matches (1v8, 2v7, 3v6, 4v5)
  const quarters: Array<[number, number]> = [
    [0, 7],
    [1, 6],
    [2, 5],
    [3, 4],
  ]
  const quarterWinners: Array<{ name: string; handicap_index: number }> = []
  quarters.forEach((pair, idx) => {
    const { result, winner } = generateMatchResult(rng, holeCount)
    matches.push({
      match_id: `qf-${idx + 1}`,
      round_label: 'Cuartos',
      player_a: players[pair[0]],
      player_b: players[pair[1]],
      result,
      winner,
    })
    // En bracket simulado, "tie" se rompe a favor de a (mock simple)
    const winsA = winner === 'a' || winner === 'tie'
    quarterWinners.push(winsA ? players[pair[0]] : players[pair[1]])
  })

  // Semis: 2 matches
  const semiWinners: Array<{ name: string; handicap_index: number }> = []
  for (let i = 0; i < 2; i++) {
    const a = quarterWinners[i * 2]
    const b = quarterWinners[i * 2 + 1]
    const { result, winner } = generateMatchResult(rng, holeCount)
    matches.push({
      match_id: `sf-${i + 1}`,
      round_label: 'Semifinal',
      player_a: a,
      player_b: b,
      result,
      winner,
    })
    const winsA = winner === 'a' || winner === 'tie'
    semiWinners.push(winsA ? a : b)
  }

  // Final
  const { result, winner } = generateMatchResult(rng, holeCount)
  matches.push({
    match_id: 'final',
    round_label: 'Final',
    player_a: semiWinners[0],
    player_b: semiWinners[1],
    result,
    winner,
  })

  return matches
}

function buildRoundRobin(rng: () => number, holeCount: number): MatchPlayMatch[] {
  // 4 jugadores, todos contra todos: C(4,2) = 6 matches
  const players = DEMO_NAMES.slice(0, 4).map((name, i) => ({
    name,
    handicap_index: Math.round((5 + i * 3) * 10) / 10,
  }))

  const matches: MatchPlayMatch[] = []
  let matchIdx = 1
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const { result, winner } = generateMatchResult(rng, holeCount)
      matches.push({
        match_id: `rr-${matchIdx}`,
        round_label: `Grupo · J${i + 1} vs J${j + 1}`,
        player_a: players[i],
        player_b: players[j],
        result,
        winner,
      })
      matchIdx++
    }
  }
  return matches
}

export function simulateMatchPlayBracket(
  config: TournamentConfig,
  seed?: number,
): SimulatedMatchPlayBracketResult {
  const rng = makeRng(seed)
  const holeCount = getHoleCount(config)
  const bracketMode = config.match_play_config?.bracket_mode ?? 'single_elimination'

  // Este simulador cubre single_elimination y round_robin.
  // one_vs_one tiene su propio simulador (match-play-1v1.ts).
  if (bracketMode === 'one_vs_one') {
    throw new Error(
      'simulateMatchPlayBracket no soporta bracket_mode=one_vs_one; usar simulateMatchPlay1v1',
    )
  }

  const matches =
    bracketMode === 'round_robin'
      ? buildRoundRobin(rng, holeCount)
      : buildSingleElimination(rng, holeCount)

  return {
    kind: 'match_play_bracket',
    bracket_mode: bracketMode,
    matches,
    format: 'match_play',
    hole_count: holeCount,
  }
}
