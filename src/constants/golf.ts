// ─── Golf Constants & Helpers ────────────────────────────────────────────────

// Paleta Garmin canónica (verificada contra capturas reales 24-Mar-2026).
// Valores alineados con src/golf/core/colors.ts — NO divergir sin verificar.
export const SCORE_COLORS = {
  eagle_or_better: '#0B6BA6',  // azul oscuro — eagle o mejor (-2 y menos)
  birdie:          '#14B3D9',  // celeste — birdie (-1)
  par:             '#edeae4',  // ivory — par (0)
  bogey:           '#D4A442',  // dorado/naranja — bogey (+1)
  double_or_worse: '#dc2626',  // rojo — doble bogey o peor (+2+)
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
  if (score === 1) return 'HOYO EN UNO'
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
