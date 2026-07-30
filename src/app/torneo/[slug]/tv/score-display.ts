// src/app/torneo/[slug]/tv/score-display.ts
//
// Cómo se muestra el score en la pantalla grande, según el modo/formato del
// torneo. Vive aparte de page.tsx para poder testearse sin renderizar.
//
// Existe porque stableford NO se puede pintar con la misma regla que stroke
// play: sus puntos no son un delta contra el par (no llevan signo) y van al
// revés (más es mejor). Formatearlos con la regla de stroke play mostraba al
// líder de 27 puntos como "+27" en ROJO — el color del peor score.

import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'

/** Neutro de la marca sobre fondo navy: sin semántica de bueno/malo. */
const NEUTRAL = '#edeae4'

export interface ScoreDisplayTournament {
  modo_juego: ModoJuego
  formato_juego: FormatoJuego
}

export interface ScoreDisplaySource {
  /** Score a par en la unidad del ranking (lo que el motor pone en `total`). */
  vsPar: number
  grossTotal?: number
  netTotal?: number
  stablefordTotal?: number
}

export function isStableford(t: ScoreDisplayTournament): boolean {
  return t.formato_juego === 'stableford'
}

/** Rótulo de la columna de score. */
export function scoreLabelFor(t: ScoreDisplayTournament): string {
  if (isStableford(t)) return 'Puntos'
  return t.modo_juego === 'neto' ? 'Score (net)' : 'Score (gross)'
}

/** Total en la unidad del torneo: puntos, golpes netos o golpes brutos. */
export function scoreTotalFor(p: ScoreDisplaySource, t: ScoreDisplayTournament): number {
  if (isStableford(t)) return p.stablefordTotal ?? 0
  return (t.modo_juego === 'neto' ? p.netTotal : p.grossTotal) ?? 0
}

/** Número grande de la fila. Stableford: puntos pelados, sin signo ni "E". */
export function primaryScoreText(
  p: ScoreDisplaySource,
  t: ScoreDisplayTournament,
  fmtVsPar: (n: number) => string,
): string {
  if (isStableford(t)) return String(p.stablefordTotal ?? 0)
  return fmtVsPar(p.vsPar)
}

/**
 * Color del número grande. En stableford queda NEUTRO a propósito: la escala
 * de `scoreColor` asume que menos es mejor, y no existe un umbral honesto de
 * "puntos par" que valga para 9 y 18 hoyos a la vez. Al líder ya lo destaca la
 * fila de posición 1.
 */
export function primaryScoreColor(
  p: ScoreDisplaySource,
  t: ScoreDisplayTournament,
  scoreColor: (diff: number) => string,
): string {
  if (isStableford(t)) return NEUTRAL
  return scoreColor(p.vsPar)
}

/**
 * Número chico bajo el grande (el total en golpes). En stableford NO va: sería
 * el mismo número repetido, porque arriba ya se muestran los puntos.
 */
export function secondaryScoreText(
  p: ScoreDisplaySource,
  t: ScoreDisplayTournament,
): string | null {
  if (isStableford(t)) return null
  return String(scoreTotalFor(p, t))
}
