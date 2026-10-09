// FUENTE ÚNICA de cómo se ESCRIBE el score de un ranking de torneo.
//
// El signo es del resultado vs par ("+3", "E", "-2"). Los puntos Stableford no
// llevan signo: 36 puntos son "36", no "+36". El bug (podio y columna PUNTOS de
// /torneo con "+36") venía de pasar los puntos por el formatter de vs par.

import { formatVsPar } from '@/golf/share/vs-par'

/** Puntos Stableford: sin signo. `conUnidad` agrega " pts" (podio, compartir). */
export function formatPuntosStableford(puntos: number, { conUnidad = false }: { conUnidad?: boolean } = {}): string {
  return conUnidad ? `${puntos} pts` : String(puntos)
}

/**
 * El score de una fila según lo que ES: puntos Stableford (ranking por puntos) o
 * resultado vs par (gross/neto). Quien llama decide `esPuntos` con el mismo
 * criterio con que armó el ranking.
 */
export function formatScoreDelRanking(valor: number, esPuntos: boolean, opciones: { conUnidad?: boolean } = {}): string {
  return esPuntos ? formatPuntosStableford(valor, opciones) : formatVsPar(valor)
}
