// src/lib/draft/simulators/team-scramble.ts
//
// Simulador para Scramble. Todos los miembros del equipo pegan, eligen la
// mejor pelota, todos juegan desde ahí. Resultado: 1 score por equipo por
// hoyo, típicamente bajo (3-5 en par 4).
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
  randomScrambleScore,
} from './_shared'

export function simulateTeamScramble(
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

    teams.push({
      team_id: `demo-team-${t + 1}`,
      team_name: `Equipo ${t + 1}`,
      players,
      // Scramble: scores bajos por hoyo (3-5 en par 4)
      scores: Array.from({ length: holeCount }, () => randomScrambleScore(rng)),
    })
  }

  return {
    kind: 'team',
    teams,
    format: 'scramble',
    hole_count: holeCount,
  }
}
