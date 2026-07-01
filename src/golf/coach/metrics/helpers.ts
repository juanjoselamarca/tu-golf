import { parPerHoleArray } from '@/golf/core/holes'
import { STANDARD_PARS } from '@/golf/coach/hole-pars'
import type { RoundData } from './types'

// Re-export para consumidores que importan STANDARD_PARS desde metrics (fuente
// canónica: hole-pars.ts). Ver metrics/index.ts.
export { STANDARD_PARS }

export function sum(xs: number[]): number {
  let s = 0
  for (const x of xs) s += x
  return s
}

export function pars(round: RoundData): number[] {
  // Normalizar a array (BD lo guarda como JSONB objeto, no array). Sólo
  // aceptamos 18 hoyos completos para métricas de full round — si vienen
  // 9 hoyos, las métricas 18h aplican fallback STANDARD_PARS (consistente
  // con validScores() que requiere length 18).
  const arr = parPerHoleArray(round.par_per_hole)
  return arr && arr.length === 18 ? arr : STANDARD_PARS
}

export function validScores(round: RoundData): { scores: number[]; pars: number[] } | null {
  if (!Array.isArray(round.scores)) return null
  const sc: number[] = []
  const pa = pars(round)
  for (let i = 0; i < 18; i++) {
    const s = round.scores[i]
    if (typeof s !== 'number') return null
    sc.push(s)
  }
  return { scores: sc, pars: pa }
}
