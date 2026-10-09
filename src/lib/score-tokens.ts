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

/** Color de texto para un diferencial vs par (total de ronda u hoyo). */
export function scoreFgVar(diff: number): string {
  if (diff <= -2) return 'var(--score-eagle-fg)'
  if (diff === -1) return 'var(--score-birdie-fg)'
  if (diff === 0) return 'var(--text-3)'
  if (diff === 1) return 'var(--score-bogey-fg)'
  return 'var(--score-double-fg)'
}

/** Fondo + texto de la celda de un hoyo según golpes vs par. */
export function scoreCellStyle(score: number | null, par: number = 4): CSSProperties {
  if (score == null) return { background: 'var(--score-empty-bg)', color: 'var(--score-empty-fg)' }
  const diff = score - par
  if (diff <= -2) return { background: 'var(--score-eagle-bg)', color: 'var(--score-eagle-fg)' }
  if (diff === -1) return { background: 'var(--score-birdie-bg)', color: 'var(--score-birdie-fg)' }
  if (diff === 0) return { background: 'rgba(0,0,0,0.04)', color: 'var(--text)' }
  if (diff === 1) return { background: 'var(--score-bogey-bg)', color: 'var(--score-bogey-fg)' }
  return { background: 'var(--score-double-bg)', color: 'var(--score-double-fg)' }
}
