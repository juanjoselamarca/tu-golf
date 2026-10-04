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
import type { HoyoEstimado } from '@/golf/core/ajuste-whs'

/** Tarjeta tal como la guardan los scorers: hoyo → golpes, con claves número o string. */
export type ScoresDeTarjeta = Record<string | number, number | null | undefined>
type Scores = ScoresDeTarjeta

/**
 * Golpes de un hoyo, acepte la tarjeta claves numéricas (estado del scorer) o
 * string (JSONB de la base). FUENTE ÚNICA de esa lectura doble.
 */
export function scoreDelHoyo(scores: Scores, hoyo: number): number | undefined {
  const v = scores[hoyo] ?? scores[String(hoyo)]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
const scoreDe = scoreDelHoyo

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
  /**
   * Hoyos que NO se jugaron y no se inventan con par: en match play, los que el
   * rival concedió y los posteriores a decidirse el match (`hoyosSinTerminarDelMatch`).
   * El historial los estima con par neto (`ajustarTarjetaParaHistorial`).
   */
  noRellenar: readonly number[] = [],
): { scores: Record<number, number>; rellenados: number[] } {
  const next: Record<number, number> = {}
  for (const [k, v] of Object.entries(scores)) {
    if (typeof v === 'number' && Number.isFinite(v)) next[Number(k)] = v
  }
  const excluidos = new Set(noRellenar)
  const rellenados = hoyosSinMarcar(scores, hoyos).filter(h => !excluidos.has(h))
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
  // Sólo golpes reales (≥ 1). Un CONCEDE (-1) que llegue sin pasar por
  // `ajustarTarjetaParaHistorial` no es un score: queda como hoyo sin score, nunca
  // resta un golpe al total ni cuenta como hoyo jugado.
  const scores = hoyos.map(h => {
    const s = scoreDe(input.scores, h)
    return s != null && s >= 1 ? s : null
  })
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

/* ── La fila de `historical_rounds` ──────────────────────────────────────── */

/** CR y slope del tee jugado (18h) más, si el tee los publica, los de la mitad de 9. */
export interface RatingsDelTee {
  slope: number | null
  cr: number | null
  nineHole: { cr9h: number; slope9h: number } | null
}

/** Exactamente las columnas que escriben los dos finalizadores de ronda libre. */
export interface FilaHistorialRondaLibre {
  user_id: string
  course_name: string
  course_id: string | null
  played_at: string
  total_gross: number
  scores: (number | null)[]
  par_per_hole: Record<string, number> | null
  /**
   * Una tarjeta de ronda libre = UNA fila de historial (índice único en BD).
   * `estimados`: hoyos cuyo score es una estimación WHS (concedido, ganado sin
   * terminar, no jugado tras decidirse el match); sólo si hay alguno.
   */
  metadata: { hoyos: number[]; ronda_libre_jugador_id: string; estimados?: HoyoEstimado[] }
  holes_played: number
  tee_color: string | null
  privacy: 'private'
  slope_rating: number | null
  course_rating: number | null
  diferencial: number | null
  formato_juego: string
  modo_juego: string
  match_result: string | null
  team_name: string | null
}

/**
 * FUENTE ÚNICA de la forma de la fila. Los dos finalizadores (scorer
 * individual y de grupo) armaban el objeto cada uno por su lado; si uno
 * agregaba una columna y el otro no, la misma ronda quedaba distinta según
 * quién la cerrara. Puro: el diferencial y los ratings ya vienen resueltos.
 */
export function filaHistorialRondaLibre(input: {
  ronda: {
    course_name: string
    course_id?: string | null
    fecha?: string | null
    formato_juego?: string | null
    modo_juego?: string | null
  }
  userId: string
  jugadorId: string
  tarjeta: TarjetaHistorica
  tee: string | null
  ratings: RatingsDelTee
  diferencial: number | null
  matchResult?: string | null
  teamName?: string | null
  estimados?: HoyoEstimado[]
}): FilaHistorialRondaLibre {
  const { ronda, tarjeta } = input
  return {
    user_id: input.userId,
    course_name: ronda.course_name,
    course_id: ronda.course_id ?? null,
    played_at: ronda.fecha || new Date().toISOString().split('T')[0],
    total_gross: tarjeta.totalGross,
    scores: tarjeta.scores,
    par_per_hole: tarjeta.parPerHole,
    metadata: {
      hoyos: tarjeta.hoyos,
      ronda_libre_jugador_id: input.jugadorId,
      ...(input.estimados?.length ? { estimados: input.estimados } : {}),
    },
    holes_played: tarjeta.holesPlayed,
    tee_color: input.tee ?? null,
    privacy: 'private',
    slope_rating: input.ratings.slope,
    course_rating: input.ratings.cr,
    diferencial: input.diferencial,
    formato_juego: ronda.formato_juego ?? 'stroke_play',
    modo_juego: ronda.modo_juego ?? 'gross',
    match_result: input.matchResult ?? null,
    team_name: input.teamName ?? null,
  }
}
