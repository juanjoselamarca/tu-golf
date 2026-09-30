/**
 * src/golf/ronda-libre/tarjeta-historica.ts
 *
 * FUENTE ÚNICA de cómo una tarjeta de ronda libre pasa a `historical_rounds`.
 * La usan los dos finalizadores (`score/hooks/useFinalizeRonda` y
 * `score-grupo/page`), que antes armaban el array cada uno por su lado y los
 * dos leían los hoyos 1..N.
 *
 * Convención de `historical_rounds` (la de TODOS sus writers y readers: game/
 * actions, imports, /tarjeta/[id], RoundCard, coach): `scores` y `par_per_hole`
 * son POSICIONALES y van en ORDEN DE NÚMERO DE HOYO, nunca en orden de juego —
 * una ronda de 18 que sale del 10 se guarda 1..18 igual que una que sale del 1.
 * `par_per_hole` lleva claves "1".."N" (lo que exige `parPerHoleArray`). Una
 * ronda de 9 que parte en el 10 se guarda como 9 posiciones con los golpes y
 * pares de los hoyos 10..18; el número real de cada posición queda en
 * `metadata.hoyos`.
 */

import { hoyosDesdeElUno } from '@/golf/core/hoyos-jugados'

type Scores = Record<string | number, number | null | undefined>

function scoreDe(scores: Scores, hoyo: number): number | undefined {
  const v = scores[hoyo] ?? scores[String(hoyo)]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Hoyos de la ronda que todavía no tienen score, en orden de juego. */
export function hoyosSinMarcar(scores: Scores, hoyos: readonly number[]): number[] {
  return hoyos.filter(h => scoreDe(scores, h) == null)
}

/**
 * Completa con par los hoyos de la ronda sin marcar (el último hoyo jugado en
 * par sin tocar +/- nunca se persiste: no hay "siguiente hoyo" que dispare el
 * auto-relleno). SÓLO toca hoyos de `hoyos`: una ronda de 9 desde el 10 no
 * recibe hoyos 1..9 inventados. No muta el input.
 */
export function completarHoyosSinMarcarConPar(
  scores: Scores,
  hoyos: readonly number[],
  parMap: Record<number, number>,
): { scores: Record<number, number>; rellenados: number[] } {
  const next: Record<number, number> = {}
  for (const [k, v] of Object.entries(scores)) {
    if (typeof v === 'number' && Number.isFinite(v)) next[Number(k)] = v
  }
  const rellenados = hoyosSinMarcar(scores, hoyos)
  for (const h of rellenados) next[h] = parMap[h] ?? 4
  return { scores: next, rellenados }
}

export interface TarjetaHistorica {
  /** Golpes por número de hoyo ascendente; `null` en los hoyos sin score. */
  scores: (number | null)[]
  /** Par de cada hoyo jugado, claves "1".."N" posicionales. `null` si falta algún par. */
  parPerHole: Record<string, number> | null
  totalGross: number
  holesPlayed: number
  /** Número real del hoyo de cada posición, ascendente (va a `metadata.hoyos`). */
  hoyos: number[]
}

export function armarTarjetaHistorica(input: {
  scores: Scores
  hoyos?: readonly number[]
  roundHoles: number
  parMap: Record<number, number>
}): TarjetaHistorica {
  // Orden por NÚMERO de hoyo (ver convención arriba), no por orden de juego.
  const hoyos = [...(input.hoyos ?? hoyosDesdeElUno(input.roundHoles))].sort((a, b) => a - b)
  const scores = hoyos.map(h => scoreDe(input.scores, h) ?? null)
  const jugados = scores.filter((s): s is number => s != null)

  // Sin inventar pares: si el mapa no trae el par de algún hoyo jugado, se
  // guarda null y los consumidores caen a la cancha, como antes de este campo.
  let parPerHole: Record<string, number> | null = {}
  for (let i = 0; i < hoyos.length; i++) {
    const par = input.parMap[hoyos[i]]
    if (typeof par !== 'number' || !Number.isFinite(par)) { parPerHole = null; break }
    parPerHole[String(i + 1)] = par
  }

  return {
    scores,
    parPerHole,
    totalGross: jugados.reduce((a, b) => a + b, 0),
    holesPlayed: jugados.length,
    hoyos,
  }
}
