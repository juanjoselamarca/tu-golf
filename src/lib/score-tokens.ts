/**
 * Colores de resultado (eagle/birdie/par/bogey/doble+) que siguen el tema claro/oscuro.
 *
 * Fuente única para UI theme-aware: devuelve variables CSS (`--score-*-fg/bg` en globals.css),
 * que cambian solas con `data-theme`. Así una tarjeta sobre `var(--bg-surface)` no queda con
 * colores de modo claro en modo oscuro (ej. doble bogey #991b1b sobre navy = 2.06:1).
 *
 * Las superficies de un solo modo (brand-locked) siguen usando `getScoreColor` /
 * `getScoreColorLight` de `@/golf/core/colors`.
 */

import type { CSSProperties } from 'react'
import { getScoreResult, type ScoreResult } from '@/golf/core/colors'

/** Color de texto para un diferencial vs par (total de ronda u hoyo). */
export function scoreFgVar(diff: number): string {
  if (diff <= -2) return 'var(--score-eagle-fg)'
  if (diff === -1) return 'var(--score-birdie-fg)'
  if (diff === 0) return 'var(--text-3)'
  if (diff === 1) return 'var(--score-bogey-fg)'
  return 'var(--score-double-fg)'
}

/** Fondo + texto por resultado; la clasificación golpes vs par es la canónica (`getScoreResult`). */
const CELL_STYLE: Record<ScoreResult, CSSProperties> = {
  eagle_or_better: { background: 'var(--score-eagle-bg)', color: 'var(--score-eagle-fg)' },
  birdie: { background: 'var(--score-birdie-bg)', color: 'var(--score-birdie-fg)' },
  par: { background: 'var(--surface-soft)', color: 'var(--text)' },
  bogey: { background: 'var(--score-bogey-bg)', color: 'var(--score-bogey-fg)' },
  double_or_worse: { background: 'var(--score-double-bg)', color: 'var(--score-double-fg)' },
  no_score: { background: 'var(--score-empty-bg)', color: 'var(--score-empty-fg)' },
}

/** Fondo + texto de la celda de un hoyo según golpes vs par (0 o null = sin jugar). */
export function scoreCellStyle(score: number | null, par: number = 4): CSSProperties {
  return CELL_STYLE[getScoreResult(score, par)]
}

/** Chip "Birdie / Par / Bogey…" bajo el score del hoyo: fondo + texto + borde del resultado. */
export function scoreChipStyle(score: number, par: number): CSSProperties {
  if (getScoreResult(score, par) === 'par') return { background: 'var(--surface-soft)', color: 'var(--text-2)', border: '1px solid var(--border)' }
  const { background, color } = scoreCellStyle(score, par)
  return { background, color, border: '1px solid currentColor' }
}
