// ─── Golf Constants & Helpers ────────────────────────────────────────────────

export const SCORE_COLORS = {
  eagle_or_better: '#c8a55a',  // gold
  birdie:          '#22c55e',  // verde
  par:             '#edeae4',  // ivory
  bogey:           '#dc2626',  // rojo
  double_or_worse: '#dc2626',  // rojo
} as const

export function getScoreColor(score: number, par: number): string {
  const diff = score - par
  if (diff <= -2) return SCORE_COLORS.eagle_or_better
  if (diff === -1) return SCORE_COLORS.birdie
  if (diff === 0)  return SCORE_COLORS.par
  if (diff === 1)  return SCORE_COLORS.bogey
  return SCORE_COLORS.double_or_worse
}

export function getScoreLabel(score: number, par: number): string {
  if (score === 1) return 'HOYO EN UNO ⚡'
  const diff = score - par
  if (diff <= -2) return 'EAGLE'
  if (diff === -1) return 'BIRDIE'
  if (diff === 0)  return 'PAR'
  if (diff === 1)  return 'BOGEY'
  if (diff === 2)  return 'DOBLE'
  if (diff === 3)  return 'TRIPLE'
  return `+${diff}`
}

export function formatOverUnder(overUnder: number): string {
  if (overUnder === 0) return 'E'
  if (overUnder > 0)   return `+${overUnder}`
  return String(overUnder)
}
