/**
 * src/golf/ronda-libre/golpes-por-hoyo.ts
 *
 * FUENTE ÚNICA del rango de golpes que se pueden anotar en un hoyo del scorer.
 * Antes: el "+" se deshabilitaba en 15 (escrito en 4 componentes) y el clamp de
 * los hooks era 19 (definido dos veces). Se conserva 15, que es lo que el jugador
 * ve hoy. La BD (`validate_score_delta`) acepta hasta 20: queda margen.
 */
export const GOLPES_MIN_POR_HOYO = 1
export const GOLPES_MAX_POR_HOYO = 15

export function limitarGolpes(golpes: number): number {
  return Math.max(GOLPES_MIN_POR_HOYO, Math.min(GOLPES_MAX_POR_HOYO, golpes))
}

/** ¿Se puede sumar un golpe más? (deshabilita el "+"). */
export function puedeSumarGolpe(golpes: number | null | undefined): boolean {
  return golpes == null || golpes < GOLPES_MAX_POR_HOYO
}
