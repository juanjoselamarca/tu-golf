// src/lib/draft/simulators/index.ts
//
// Factory polimórfico: dado un `TournamentConfig`, devuelve la simulación
// correspondiente al formato (y, para match_play, al bracket_mode).
//
// Cobertura: 6 formatos + 2 sub-tipos de match_play = 7 simuladores.
// - stroke_play   → simulateIndividualStroke
// - stableford    → simulateIndividualStableford
// - best_ball     → simulateTeamBestBall
// - scramble      → simulateTeamScramble
// - foursome      → simulateTeamFoursome
// - match_play + bracket_mode in {single_elimination, round_robin}
//                 → simulateMatchPlayBracket
// - match_play + bracket_mode = one_vs_one
//                 → simulateMatchPlay1v1
//
// Si el seed se pasa, todos los simuladores son determinísticos (útil para
// tests). Sin seed, usan Math.random.
import type { TournamentConfig } from '../types'
import { simulateIndividualStroke } from './individual-stroke'
import { simulateIndividualStableford } from './individual-stableford'
import { simulateTeamBestBall } from './team-best-ball'
import { simulateTeamScramble } from './team-scramble'
import { simulateTeamFoursome } from './team-foursome'
import { simulateMatchPlayBracket } from './match-play-bracket'
import { simulateMatchPlay1v1 } from './match-play-1v1'
import type { AnySimulationResult } from './_shared'

export type { AnySimulationResult } from './_shared'
export {
  simulateIndividualStroke,
  simulateIndividualStableford,
  simulateTeamBestBall,
  simulateTeamScramble,
  simulateTeamFoursome,
  simulateMatchPlayBracket,
  simulateMatchPlay1v1,
}

export function simulate(config: TournamentConfig, seed?: number): AnySimulationResult {
  switch (config.format) {
    case 'stroke_play':
      return simulateIndividualStroke(config, seed)
    case 'stableford':
      return simulateIndividualStableford(config, seed)
    case 'best_ball':
      return simulateTeamBestBall(config, seed)
    case 'scramble':
      return simulateTeamScramble(config, seed)
    case 'foursome':
      return simulateTeamFoursome(config, seed)
    case 'match_play': {
      const bracketMode = config.match_play_config?.bracket_mode ?? 'single_elimination'
      if (bracketMode === 'one_vs_one') {
        return simulateMatchPlay1v1(config, seed)
      }
      return simulateMatchPlayBracket(config, seed)
    }
    default: {
      const _exhaustive: never = config.format
      throw new Error(`Formato desconocido: ${_exhaustive as string}`)
    }
  }
}
