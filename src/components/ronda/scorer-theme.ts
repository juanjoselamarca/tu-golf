/**
 * Tokens de color de los scorers de ronda libre (individual y de grupo).
 * Un solo objeto para los dos: antes cada página tenía su copia y una
 * mezclaba `var(--brand)` con el hex del mismo dorado.
 *
 * Todo son tokens del design system: en dark `--bg-surface` resuelve a navy
 * y en light a blanco (header y barra inferior salían blancos sobre cuerpo
 * oscuro cuando estaban hardcodeados — inbox 8eda9722).
 */
export const SCORER_THEME = {
  bg: 'var(--bg)',
  card: 'var(--bg-surface)',
  text: 'var(--text)',
  textMuted: 'var(--text-2)',
  textFaint: 'var(--text-3)',
  border: 'var(--border)',
  badgeBg: 'var(--bg)',
  badgeBorder: 'var(--border)',
  badgeText: 'var(--text-2)',
  scoreText: 'var(--text)',
  scoreDimmed: 'var(--text-3)',
  buttonBg: 'var(--bg)',
  buttonBorder: 'var(--border)',
  buttonText: 'var(--text-2)',
  navBg: 'var(--bg-surface)',
  headerBg: 'var(--bg-surface)',
  /** Dorado de marca (= `--brand`). */
  gold: '#C4992A',
} as const

export type ScorerTheme = typeof SCORER_THEME
