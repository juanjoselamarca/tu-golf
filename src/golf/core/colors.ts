/**
 * Sistema de colores de golf — score results y Garmin mapping.
 * Merge de score-colors.ts + garmin-colors.ts en una sola fuente de verdad.
 */

import type { CSSProperties } from 'react'

// ═══════════════════════════════════════════════════════════
// SCORE RESULT COLORS (dark & light themes)
// ═══════════════════════════════════════════════════════════

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
    bg: 'rgba(11,107,166,0.15)',
    textColor: '#0B6BA6',
    border: '#0B6BA6',
    borderWidth: '2px',
    label: 'Eagle',
  },
  birdie: {
    bg: 'rgba(20,179,217,0.12)',
    textColor: '#14B3D9',
    border: '#14B3D9',
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
    bg: 'rgba(212,164,66,0.10)',
    textColor: '#D4A442',
    border: 'rgba(212,164,66,0.35)',
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

export const SCORE_STYLES_LIGHT: Record<ScoreResult, ScoreStyle> = {
  eagle_or_better: {
    bg: '#e8f4fa',
    textColor: '#0B6BA6',
    border: '#0B6BA6',
    borderWidth: '1px',
    label: 'Eagle',
  },
  birdie: {
    bg: '#e6f7fa',
    textColor: '#0e8a9e',
    border: '#14B3D9',
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
    bg: '#fef8ee',
    textColor: '#92700e',
    border: '#D4A442',
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

export function getHoleBoxStyle(grossScore: number | null | undefined, par: number | null | undefined): CSSProperties {
  const s = SCORE_STYLES[getScoreResult(grossScore, par)]
  return { border: `${s.borderWidth} solid ${s.border}`, background: s.bg }
}

export function getScoreNumberStyle(grossScore: number | null | undefined, par: number | null | undefined): CSSProperties {
  return { color: SCORE_STYLES[getScoreResult(grossScore, par)].textColor }
}

export function getHoleBoxStyleLight(grossScore: number | null | undefined, par: number | null | undefined): CSSProperties {
  const s = SCORE_STYLES_LIGHT[getScoreResult(grossScore, par)]
  return { background: s.bg, border: `${s.borderWidth} solid ${s.border}` }
}

export function getScoreNumberStyleLight(grossScore: number | null | undefined, par: number | null | undefined): CSSProperties {
  return { color: SCORE_STYLES_LIGHT[getScoreResult(grossScore, par)].textColor }
}

export function getHoleBarColor(grossScore: number | null | undefined, par: number | null | undefined): string {
  const result = getScoreResult(grossScore, par)
  if (result === 'no_score') return 'rgba(255,255,255,0.10)'
  return SCORE_STYLES[result].textColor
}

/**
 * Canonical Garmin score color for a vs-par differential (round total or hole).
 * Reemplaza patrones tipo `diff < 0 ? '#16a34a' : diff > 0 ? '#dc2626' : muted`
 * que perdían la distinción eagle/birdie/bogey/double de Garmin.
 *
 * Para UI sobre fondo blanco usa `getScoreColorLight`.
 */
export function getScoreColor(diff: number): string {
  if (diff <= -2) return SCORE_STYLES.eagle_or_better.textColor  // #0B6BA6
  if (diff === -1) return SCORE_STYLES.birdie.textColor          // #14B3D9
  if (diff === 0)  return SCORE_STYLES.par.textColor             // rgba muted white
  if (diff === 1)  return SCORE_STYLES.bogey.textColor           // #D4A442
  return SCORE_STYLES.double_or_worse.textColor                  // #dc2626
}

/** Versión para fondos claros — usa SCORE_STYLES_LIGHT. */
export function getScoreColorLight(diff: number): string {
  if (diff <= -2) return SCORE_STYLES_LIGHT.eagle_or_better.textColor  // #0B6BA6
  if (diff === -1) return SCORE_STYLES_LIGHT.birdie.textColor          // #0e8a9e (deeper cyan)
  if (diff === 0)  return SCORE_STYLES_LIGHT.par.textColor             // #6b7280
  if (diff === 1)  return SCORE_STYLES_LIGHT.bogey.textColor           // #92700e
  return SCORE_STYLES_LIGHT.double_or_worse.textColor                  // #991b1b
}

// ═══════════════════════════════════════════════════════════
// GARMIN GOLF COLOR SYSTEM
// Verificado contra capturas reales 24 Mar 2026.
// NO MODIFICAR sin verificacion contra app real de Garmin Golf.
// ═══════════════════════════════════════════════════════════

export const GARMIN_COLOR_TO_DIFF: Record<string, number> = {
  dark_blue: -2,
  blue: -2,
  light_blue: -1,
  celeste: -1,
  green: 0,
  none: 0,
  gold: 1,
  orange: 1,
  amber: 1,
  red: 2,
}

export const AMBIGUOUS_COLORS = ['red']

export function normalizeGarminColor(color: string): string {
  const c = color.toLowerCase().trim().replace(/[_-]/g, '')
  if (c === 'darkblue' || c === 'navy') return 'dark_blue'
  if (c === 'lightblue' || c === 'celeste' || c === 'cyan') return 'light_blue'
  if (c === 'green' || c === 'lime') return 'green'
  if (c === 'gold' || c === 'orange' || c === 'amber' || c === 'yellow') return 'gold'
  if (c === 'red' || c === 'crimson' || c === 'darkred') return 'red'
  if (c === 'blue') return 'light_blue'
  return 'green'
}

export function colorToDiff(color: string): number {
  const normalized = normalizeGarminColor(color)
  return GARMIN_COLOR_TO_DIFF[normalized] ?? 0
}

export function isAmbiguousColor(color: string): boolean {
  return AMBIGUOUS_COLORS.includes(normalizeGarminColor(color))
}
