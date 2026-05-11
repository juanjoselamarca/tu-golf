// src/lib/draft/simulators/team-best-ball.ts
//
// Simulador para Best Ball (4 pelotas). Cada jugador del equipo juega su
// propia pelota; el score del equipo por hoyo = mínimo de los scores
// individuales del equipo en ese hoyo. Output: equipos con scores
// agregados (lista de 9 o 18 valores).
//
// Por default: equipos de `team_config.size` (default 2). Cantidad de
// equipos = floor(DEMO_NAMES.length / team_size).
import type { TournamentConfig } from '../types'
import {
  DEMO_NAMES,
  type SimulatedTeam,
  type SimulatedTeamResult,
  getHoleCount,
  makeRng,
  randomStrokeScore,
} from './_shared'

export function simulateTeamBestBall(
  config: TournamentConfig,
  seed?: number,
): SimulatedTeamResult {
  const rng = makeRng(seed)
  const holeCount = getHoleCount(config)
  const teamSize = config.team_config?.size ?? 2
  const teamCount = Math.max(1, Math.floor(DEMO_NAMES.length / teamSize))

  const teams: SimulatedTeam[] = []
  for (let t = 0; t < teamCount; t++) {
    const memberStart = t * teamSize
    const memberNames = DEMO_NAMES.slice(memberStart, memberStart + teamSize)
    const players = memberNames.map((name, i) => ({
      name,
      handicap_index: Math.round((6 + i * 4) * 10) / 10,
    }))

    // Cada jugador su set de scores individuales en par 4
    const individualScores = players.map(() =>
      Array.from({ length: holeCount }, () => randomStrokeScore(rng, 4)),
    )

    // Best ball: por hoyo, el score del equipo es el mínimo de los individuales
    const scores: number[] = []
    for (let h = 0; h < holeCount; h++) {
      let best = individualScores[0][h]
      for (let p = 1; p < individualScores.length; p++) {
        if (individualScores[p][h] < best) best = individualScores[p][h]
      }
      scores.push(best)
    }

    teams.push({
      team_id: `demo-team-${t + 1}`,
      team_name: `Equipo ${t + 1}`,
      players,
      scores,
    })
  }

  return {
    kind: 'team',
    teams,
    format: 'best_ball',
    hole_count: holeCount,
  }
}
