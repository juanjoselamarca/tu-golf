// DECISIÓN DE DISEÑO: Opción A — #16a34a (verde Tailwind) como base.
// Razón: consistencia con 30+ archivos que ya usan este color en toda la app.

import type { CSSProperties } from 'react'

export type ScoreResult =
  | 'eagle_or_better'
  | 'birdie'
  | 'par'
  | 'bogey'
  | 'double_or_worse'
  | 'no_score'

export function getScoreResult(
  grossScore: number | null | undefined,
  par: number | null | undefined
): ScoreResult {
  if (grossScore == null || par == null || grossScore === 0) return 'no_score'
  const diff = grossScore - par
  if (diff <= -2) return 'eagle_or_better'
  if (diff === -1) return 'birdie'
  if (diff === 0) return 'par'
  if (diff === 1) return 'bogey'
  return 'double_or_worse'
}

interface ScoreStyle {
  bg: string
  textColor: string
  border: string
  borderWidth: string
  label: string
}

export const SCORE_STYLES: Record<ScoreResult, ScoreStyle> = {
  eagle_or_better: {
    bg: 'rgba(196,153,42,0.15)',
    textColor: '#c4992a',
    border: '#c4992a',
    borderWidth: '2px',
    label: 'Eagle',
  },
  birdie: {
    bg: 'rgba(22,163,74,0.12)',
    textColor: '#16a34a',
    border: '#16a34a',
    borderWidth: '2px',
    label: 'Birdie',
  },
  par: {
    bg: 'rgba(255,255,255,0.05)',
    textColor: 'rgba(255,255,255,0.6)',
    border: 'rgba(255,255,255,0.12)',
    borderWidth: '1px',
    label: 'Par',
  },
  bogey: {
    bg: 'rgba(217,119,6,0.10)',
    textColor: '#d97706',
    border: 'rgba(217,119,6,0.35)',
    borderWidth: '1px',
    label: 'Bogey',
  },
  double_or_worse: {
    bg: 'rgba(220,38,38,0.12)',
    textColor: '#dc2626',
    border: 'rgba(220,38,38,0.3)',
    borderWidth: '2px',
    label: 'Doble+',
  },
  no_score: {
    bg: 'rgba(255,255,255,0.02)',
    textColor: 'rgba(255,255,255,0.2)',
    border: 'rgba(255,255,255,0.04)',
    borderWidth: '1px',
    label: '',
  },
}

// Light theme variant (for white-background leaderboard)
export const SCORE_STYLES_LIGHT: Record<ScoreResult, ScoreStyle> = {
  eagle_or_better: {
    bg: '#fef3c7',
    textColor: '#92400e',
    border: '#fbbf24',
    borderWidth: '1px',
    label: 'Eagle',
  },
  birdie: {
    bg: '#dcfce7',
    textColor: '#166534',
    border: '#86efac',
    borderWidth: '1px',
    label: 'Birdie',
  },
  par: {
    bg: '#f9fafb',
    textColor: '#6b7280',
    border: '#e5e7eb',
    borderWidth: '1px',
    label: 'Par',
  },
  bogey: {
    bg: '#fef3c7',
    textColor: '#92400e',
    border: '#fecaca',
    borderWidth: '1px',
    label: 'Bogey',
  },
  double_or_worse: {
    bg: '#fee2e2',
    textColor: '#991b1b',
    border: '#f87171',
    borderWidth: '1px',
    label: 'Doble+',
  },
  no_score: {
    bg: '#f3f4f6',
    textColor: '#d1d5db',
    border: '#e5e7eb',
    borderWidth: '1px',
    label: '',
  },
}

/** Style para el contenedor del box de hoyo (dark theme). */
export function getHoleBoxStyle(
  grossScore: number | null | undefined,
  par: number | null | undefined
): CSSProperties {
  const s = SCORE_STYLES[getScoreResult(grossScore, par)]
  return {
    border: `${s.borderWidth} solid ${s.border}`,
    background: s.bg,
  }
}

/** Style para el número de score (dark theme). */
export function getScoreNumberStyle(
  grossScore: number | null | undefined,
  par: number | null | undefined
): CSSProperties {
  return { color: SCORE_STYLES[getScoreResult(grossScore, par)].textColor }
}

/** Style para el contenedor del box de hoyo (light theme). */
export function getHoleBoxStyleLight(
  grossScore: number | null | undefined,
  par: number | null | undefined
): CSSProperties {
  const s = SCORE_STYLES_LIGHT[getScoreResult(grossScore, par)]
  return {
    background: s.bg,
    border: `${s.borderWidth} solid ${s.border}`,
  }
}

/** Style para el número de score (light theme). */
export function getScoreNumberStyleLight(
  grossScore: number | null | undefined,
  par: number | null | undefined
): CSSProperties {
  return { color: SCORE_STYLES_LIGHT[getScoreResult(grossScore, par)].textColor }
}

/** Color de fondo para segmentos de la barra de 18 hoyos (scoring page). */
export function getHoleBarColor(
  grossScore: number | null | undefined,
  par: number | null | undefined
): string {
  const result = getScoreResult(grossScore, par)
  if (result === 'no_score') return 'rgba(255,255,255,0.10)'
  return SCORE_STYLES[result].textColor
}
