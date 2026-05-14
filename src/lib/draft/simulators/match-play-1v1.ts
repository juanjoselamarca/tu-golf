// src/lib/draft/simulators/match-play-1v1.ts
//
// Simulador para Match Play con bracket_mode = 'one_vs_one'. Genera 5
// parejas enfrentadas (10 jugadores demo, A vs B en cada match) y para
// cada match construye el estado del match hoyo a hoyo:
//
// Notación oficial:
// - "a_up_N" / "b_up_N"  → un jugador va N hoyos arriba
// - "all_square"         → empate
// - "dormie_a" / "dormie_b" → el líder está N hoyos arriba con N hoyos
//   por jugar (no puede perder; rival solo puede empatar)
// - "match_over_a" / "match_over_b" → match cerrado antes del 18
//
// Cada hoyo decide independientemente quién gana (40% A, 40% B, 20% empate)
// y se acumula. Si en algún hoyo X la ventaja > hoyos que faltan, el match
// se cierra.
import type { TournamentConfig } from '../types'
import {
  DEMO_NAMES,
  type MatchPlayHoleStatus,
  type SimulatedMatchPlay1v1Match,
  type SimulatedMatchPlay1v1Result,
  getHoleCount,
  makeRng,
} from './_shared'

function simulateSingleMatch(
  rng: () => number,
  holeCount: number,
  matchId: string,
  player_a: { name: string; handicap_index: number },
  player_b: { name: string; handicap_index: number },
): SimulatedMatchPlay1v1Match {
  const holeStatus: MatchPlayHoleStatus[] = []
  let aUp = 0 // positivo = A arriba, negativo = B arriba, 0 = AS
  let matchClosedAtHole = -1
  let winner: 'a' | 'b' | 'tie' = 'tie'

  for (let h = 1; h <= holeCount; h++) {
    if (matchClosedAtHole !== -1) {
      // El match ya cerró; el resto de hoyos no se juegan (en match play
      // real). Para el simulador, marcamos status como cerrado.
      holeStatus.push({ hole: h, status: aUp > 0 ? 'match_over_a' : 'match_over_b' })
      continue
    }

    const r = rng()
    if (r < 0.4) aUp += 1 // A gana hoyo
    else if (r < 0.8) aUp -= 1 // B gana hoyo
    // 20% halved (no cambia aUp)

    const holesRemaining = holeCount - h
    let status: string
    if (aUp === 0) {
      status = 'all_square'
    } else if (Math.abs(aUp) > holesRemaining) {
      // Match cerrado
      matchClosedAtHole = h
      status = aUp > 0 ? 'match_over_a' : 'match_over_b'
    } else if (Math.abs(aUp) === holesRemaining && holesRemaining > 0) {
      // Dormie: líder arriba con tantos hoyos como faltan
      status = aUp > 0 ? 'dormie_a' : 'dormie_b'
    } else {
      const n = Math.abs(aUp)
      status = aUp > 0 ? `a_up_${n}` : `b_up_${n}`
    }
    holeStatus.push({ hole: h, status })
  }

  // Resultado final
  let final_result: string
  if (matchClosedAtHole !== -1) {
    const diff = Math.abs(aUp)
    const remainingAtClose = holeCount - matchClosedAtHole
    const winnerName = aUp > 0 ? player_a.name : player_b.name
    winner = aUp > 0 ? 'a' : 'b'
    final_result =
      remainingAtClose === 0
        ? `${winnerName} ganó ${diff}up`
        : `${winnerName} ganó ${diff}&${remainingAtClose}`
  } else if (aUp === 0) {
    winner = 'tie'
    final_result = 'AS'
  } else {
    // No cerró antes del 18; ganó por diferencia en el 18
    const winnerName = aUp > 0 ? player_a.name : player_b.name
    winner = aUp > 0 ? 'a' : 'b'
    final_result = `${winnerName} ganó ${Math.abs(aUp)}up`
  }

  return {
    match_id: matchId,
    player_a,
    player_b,
    hole_status: holeStatus,
    final_result,
    winner,
  }
}

export function simulateMatchPlay1v1(
  config: TournamentConfig,
  seed?: number,
): SimulatedMatchPlay1v1Result {
  const rng = makeRng(seed)
  const holeCount = getHoleCount(config)

  // 5 parejas enfrentadas = 10 jugadores demo (toda la lista)
  const matches: SimulatedMatchPlay1v1Match[] = []
  const pairCount = Math.floor(DEMO_NAMES.length / 2)
  for (let p = 0; p < pairCount; p++) {
    const aName = DEMO_NAMES[p * 2]
    const bName = DEMO_NAMES[p * 2 + 1]
    const player_a = { name: aName, handicap_index: Math.round((6 + p * 2) * 10) / 10 }
    const player_b = { name: bName, handicap_index: Math.round((8 + p * 2) * 10) / 10 }
    matches.push(simulateSingleMatch(rng, holeCount, `1v1-${p + 1}`, player_a, player_b))
  }

  return {
    kind: 'match_play_1v1',
    matches,
    format: 'match_play',
    hole_count: holeCount,
  }
}
