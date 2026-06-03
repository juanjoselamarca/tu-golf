/**
 * Builders de rondas sintéticas compartidos por los tests del motor de foco.
 * Vive aparte de los .test para que importarlos NO re-ejecute suites ajenas.
 */
import type { RoundData } from '@/golf/coach/metrics'
import type { SelectFocusInput } from '../types'

export const STD_PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]

export function round(
  id: string,
  scores: (number | null)[],
  opts: { playedAt?: string; pars?: number[]; totalGross?: number; metadata?: Record<string, unknown> } = {},
): RoundData {
  const pars = opts.pars ?? STD_PARS
  const parObj: Record<string, number> = {}
  pars.forEach((p, i) => (parObj[String(i + 1)] = p))
  const gross =
    opts.totalGross ?? scores.reduce<number>((a, s) => a + (typeof s === 'number' ? s : 0), 0)
  return {
    id,
    scores,
    total_gross: gross,
    par_per_hole: parObj,
    played_at: opts.playedAt ?? '2026-05-01T12:00:00Z',
    metadata: opts.metadata ?? null,
  }
}

/** [B,B,P,P] repetido: espiral post-bogey aislada (balanceada front/back). */
export function spiralRound(id: string): RoundData {
  const scores = STD_PARS.map((par, i) => (i % 4 < 2 ? par + 1 : par))
  return round(id, scores)
}

/** Hoyo 1 desastroso + par 3 flojos: dispara varios patrones a la vez. */
export function multiPatternRound(id: string): RoundData {
  const scores = STD_PARS.map((par, i) => {
    if (i === 0) return par + 3
    if (par === 3) return par + 2
    return par
  })
  return round(id, scores)
}

/** Par 4 flojos (+2), par 5 y par 3 en par: dispara juego corto débil (par4 >> par5). */
export function shortGameRound(id: string): RoundData {
  const scores = STD_PARS.map((par) => (par === 4 ? par + 2 : par))
  return round(id, scores)
}

/** 9 hoyos con espiral: detect dispara, pero la métrica PLAN exige 18 → sin foco. */
export function nineHoleSpiral(id: string): RoundData {
  const pars9 = STD_PARS.slice(0, 9)
  const scores = pars9.map((par, i) => (i % 4 < 2 ? par + 1 : par))
  return round(id, scores, { pars: pars9 })
}

export const NO_TARGET: SelectFocusInput['target'] = {
  currentHandicap: null,
  targetHandicap: null,
  targetDeadline: null,
}
