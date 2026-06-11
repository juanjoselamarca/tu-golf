import type { ComputedMetric, RoundData } from './types'
import { validScores } from './helpers'

/**
 * Gap de juego corto per-ronda (patrón `short_game_weakness`):
 * mean(score−par | par 4) − mean(score−par | par 5).
 * Mínimos por ronda: ≥5 hoyos par 4 y ≥2 par 5 con score; si no, degrada honesto.
 */
export function computeShortGameGap(round: RoundData): ComputedMetric {
  const v = validScores(round)
  if (!v) return { value: null, reason: 'incomplete_18_holes' }

  let par4Total = 0, par4Count = 0
  let par5Total = 0, par5Count = 0
  for (let i = 0; i < 18; i++) {
    if (v.pars[i] === 4) { par4Total += v.scores[i] - 4; par4Count++ }
    else if (v.pars[i] === 5) { par5Total += v.scores[i] - 5; par5Count++ }
  }
  if (par4Count < 5 || par5Count < 2) return { value: null, reason: 'insufficient_par45_holes' }

  const gap = par4Total / par4Count - par5Total / par5Count
  return { value: gap, reason: 'computed', metadata: { par4_count: par4Count, par5_count: par5Count } }
}
