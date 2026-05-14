// src/lib/draft/simulators/team-foursome.ts
//
// Simulador para Foursome (alternate shot). Cada pareja juega 1 sola
// pelota turnándose los golpes. Output: parejas con 1 score por hoyo,
// típicamente 4-6 en par 4 (más alto que stroke por el ritmo alternado).
//
// Foursome es siempre de 2 jugadores por equipo. Si team_config.size
// existe y no es 2, igualmente lo forzamos a 2 acá (regla del formato).
import type { TournamentConfig } from '../types'
import {
  DEMO_NAMES,
  type SimulatedTeam,
  type SimulatedTeamResult,
  getHoleCount,
  makeRng,
  randomFoursomeScore,
} from './_shared'

export function simulateTeamFoursome(
  config: TournamentConfig,
  seed?: number,
): SimulatedTeamResult {
  const rng = makeRng(seed)
  const holeCount = getHoleCount(config)
  // Foursome = alternate shot = SIEMPRE parejas de 2
  const teamSize = 2
  const teamCount = Math.max(1, Math.floor(DEMO_NAMES.length / teamSize))

  const teams: SimulatedTeam[] = []
  for (let t = 0; t < teamCount; t++) {
    const memberStart = t * teamSize
    const memberNames = DEMO_NAMES.slice(memberStart, memberStart + teamSize)
    const players = memberNames.map((name, i) => ({
      name,
      handicap_index: Math.round((7 + i * 3) * 10) / 10,
    }))

    teams.push({
      team_id: `demo-foursome-${t + 1}`,
      team_name: `Pareja ${t + 1}`,
      players,
      // Foursome alternate shot: 4-6 por hoyo en par 4
      scores: Array.from({ length: holeCount }, () => randomFoursomeScore(rng)),
    })
  }

  return {
    kind: 'team',
    teams,
    format: 'foursome',
    hole_count: holeCount,
  }
}
