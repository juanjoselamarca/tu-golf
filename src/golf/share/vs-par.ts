// ─── Dominio "compartir" · vs-par canónico ──────────────────────────────────
// Fuente ÚNICA del cálculo de vs-par para tarjetas/OG/share. Reemplaza el par
// fijo 36/72 que el metadata OG usaba (bug P0: en canchas par 70/71/73 el preview
// social mostraba un vs-par incorrecto).
//
// Puro: sin DOM, sin React, sin Supabase. Recibe datos ya cargados.
// Primera pieza del spec `2026-06-17-compartir-unificado-design.md` (src/golf/share/).

import { parPerHoleArray, type ParPerHoleInput } from '@/golf/core/holes'

/**
 * Par nominal de fallback cuando NO hay `par_per_hole` válido para la ronda.
 * 9h → 36, 18h → 72. Es un estimado, NO el par real de la cancha.
 */
export function parNominal(holesPlayed: number | null | undefined): number {
  return (holesPlayed ?? 18) <= 9 ? 36 : 72
}

/**
 * Resuelve el par total real de una ronda desde su snapshot `par_per_hole`.
 *
 * `par_per_hole` se guarda con la ronda al importar (JSONB objeto o array).
 * Se usa SOLO si su largo coincide con los hoyos jugados — así un snapshot de
 * 18 hoyos no contamina una ronda de 9 (sumaría ~72 contra un gross de 9h).
 *
 * @returns `{ parTotal, isRealPar }`. `isRealPar=false` ⇒ se usó el nominal.
 */
export function resolveParTotal(input: {
  holesPlayed: number | null | undefined
  parPerHole: ParPerHoleInput
}): { parTotal: number; isRealPar: boolean } {
  const arr = parPerHoleArray(input.parPerHole)
  const holes = input.holesPlayed ?? (arr ? arr.length : 18)

  if (arr && arr.length === holes) {
    return { parTotal: arr.reduce((a, b) => a + b, 0), isRealPar: true }
  }
  return { parTotal: parNominal(holes), isRealPar: false }
}

/** vs-par bruto de una ronda terminada: `gross - par`. */
export function computeVsParGross(gross: number, parTotal: number): number {
  return gross - parTotal
}

/** Etiqueta de vs-par para títulos OG/share: `'Par'`, `'+3'`, `'-2'`. */
export function formatVsParLabel(vs: number): string {
  if (vs === 0) return 'Par'
  return vs > 0 ? `+${vs}` : String(vs)
}
