/**
 * Match Play Neto — formato hoyo a hoyo.
 *
 * Reglas R&A/USGA:
 * - Se juega 1v1 (individual match play)
 * - Se calcula la DIFERENCIA de course handicap entre ambos jugadores
 * - El jugador de mayor handicap recibe strokes = diferencia
 * - Los strokes se distribuyen por stroke index (SI 1 primero)
 * - Se compara score NETO hoyo a hoyo → won / lost / halved
 * - Si un jugador lleva más hoyos de ventaja que hoyos restantes → match terminado
 * - Resultado se expresa como "3&2", "1 UP", "All Square"
 */

import { strokesRecibidosEnHoyo } from '../core/scoring'
import { normalizedStrokeIndexByHole } from '../core/stroke-index'

// ─── Types ───

export type HoleResult = 'won_a' | 'won_b' | 'halved' | 'not_played' | 'conceded_a' | 'conceded_b'

export interface MatchHoleDetail {
  numero: number
  par: number
  strokeIndex: number
  grossA: number | null
  grossB: number | null
  /** Strokes que recibe el jugador que tiene mayor HCP (0 para el otro) */
  strokesA: number
  strokesB: number
  netoA: number | null
  netoB: number | null
  result: HoleResult
  /** Estado acumulado del match DESPUÉS de este hoyo: positivo = A arriba, negativo = B arriba */
  matchState: number
  /** true si el match ya estaba terminado antes de este hoyo */
  afterMatchEnd: boolean
}

export interface MatchResult {
  holes: MatchHoleDetail[]
  /** Hoyos jugados (con score de ambos) */
  holesPlayed: number
  /** Hoyos restantes en el recorrido */
  holesRemaining: number
  /** Estado actual: positivo = A arriba, negativo = B arriba, 0 = all square */
  state: number
  /** true si el match terminó antes del último hoyo */
  isFinished: boolean
  /** 'a' | 'b' | null (null = all square o en curso) */
  winner: 'a' | 'b' | null
  /** Texto del resultado: "3&2", "2&1", "1 UP", "All Square", "2 UP con 5 por jugar" */
  display: string
  /** Hoyos ganados por cada jugador */
  holesWonA: number
  holesWonB: number
  holesHalved: number
}

export interface MatchPlayConfig {
  /** Course handicap del jugador A (ya ajustado por slope/CR). Ignorado si modo='gross'. */
  courseHandicapA: number
  /** Course handicap del jugador B (ya ajustado por slope/CR). Ignorado si modo='gross'. */
  courseHandicapB: number
  /** Total de hoyos del recorrido (9 o 18) */
  totalHoles: number
  /**
   * Modo de scoring: 'gross' ignora handicap completamente (no aplica diferencia),
   * 'neto' aplica la diferencia de course handicap (R&A Rule 6.2a).
   * Si no se especifica, default = 'neto' (backward compatibility).
   */
  modo?: 'gross' | 'neto'
}

export interface MatchPlayNames {
  nombreA?: string
  nombreB?: string
}

// ─── Handicap: strokes que recibe cada jugador ───

/**
 * Calcula la diferencia de handicap para match play individual.
 * R&A Rule 6.2a: 100% de la diferencia de course handicaps.
 *
 * Retorna [strokesA, strokesB] donde uno es 0 y el otro es la diferencia.
 * Si ambos tienen el mismo handicap, ambos son 0.
 */
export function calcularDiferenciaHandicap(
  courseHandicapA: number,
  courseHandicapB: number
): [number, number] {
  const diff = Math.abs(courseHandicapA - courseHandicapB)
  if (courseHandicapA > courseHandicapB) {
    return [diff, 0]
  }
  if (courseHandicapB > courseHandicapA) {
    return [0, diff]
  }
  return [0, 0]
}

/**
 * Calcula strokes que recibe un jugador en un hoyo específico,
 * basado en su DIFERENCIA de handicap (no su handicap completo).
 *
 * En match play, solo se usa la diferencia entre jugadores.
 * Los strokes se asignan por stroke index: SI 1 recibe primero.
 */
export function strokesMatchPlayEnHoyo(
  diferenciaHandicap: number,
  strokeIndex: number
): number {
  return strokesRecibidosEnHoyo(diferenciaHandicap, strokeIndex)
}

// ─── Score neto de un hoyo en match play ───

function netoMatchPlay(
  gross: number,
  diferenciaHandicap: number,
  strokeIndex: number
): number {
  return gross - strokesMatchPlayEnHoyo(diferenciaHandicap, strokeIndex)
}

// ─── Resultado de un hoyo ───

function resultadoHoyo(netoA: number, netoB: number): HoleResult {
  if (netoA < netoB) return 'won_a'
  if (netoB < netoA) return 'won_b'
  return 'halved'
}

// ─── Display del estado del match ───

function displayMatchState(state: number, nombres?: MatchPlayNames): string {
  if (state === 0) return 'AS' // All Square
  const abs = Math.abs(state)
  const quien = state > 0
    ? (nombres?.nombreA?.split(' ')[0] ?? 'A')
    : (nombres?.nombreB?.split(' ')[0] ?? 'B')
  return `${abs} UP ${quien}`
}

/**
 * Genera el texto de resultado final del match.
 *
 * - Match terminado temprano: "3&2" (3 arriba con 2 por jugar)
 * - Ganado en el último hoyo: "1 UP"
 * - Empate: "All Square"
 * - En curso: "2 UP A con 5 por jugar"
 */
function displayResultado(
  state: number,
  holesRemaining: number,
  isFinished: boolean,
  totalHoles: number,
  holesPlayed: number,
  nombres?: MatchPlayNames
): string {
  // Match en curso (no todos los hoyos jugados y no terminó temprano)
  if (!isFinished && holesPlayed < totalHoles) {
    if (state === 0) return 'All Square'
    const abs = Math.abs(state)
    const quien = state > 0
      ? (nombres?.nombreA?.split(' ')[0] ?? 'A')
      : (nombres?.nombreB?.split(' ')[0] ?? 'B')
    return `${abs} UP ${quien} con ${holesRemaining} por jugar`
  }

  // All Square al final
  if (state === 0) return 'All Square'

  // Ganado en el último hoyo
  if (holesRemaining === 0) {
    const abs = Math.abs(state)
    return `${abs} UP`
  }

  // Terminado temprano: "X&Y"
  const abs = Math.abs(state)
  return `${abs}&${holesRemaining}`
}

// ─── Motor principal ───

/** Valor especial: hoyo concedido */
export const CONCEDE = -1

/**
 * Calcula el estado completo de un match play neto.
 *
 * @param scoresA - Scores gross del jugador A: Record<"1"|"2"|..., number>
 * @param scoresB - Scores gross del jugador B: Record<"1"|"2"|..., number>
 * @param holes - Datos de los hoyos del recorrido (par, stroke_index)
 * @param config - Handicaps de cancha y total de hoyos
 * @returns Estado completo del match
 */
export function calcularMatchPlay(
  scoresA: Record<string, number>,
  scoresB: Record<string, number>,
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  config: MatchPlayConfig,
  nombres?: MatchPlayNames
): MatchResult {
  const { courseHandicapA, courseHandicapB, totalHoles, modo = 'neto' } = config
  // En modo gross, no se aplica handicap — todos juegan con sus scores brutos
  const [diffA, diffB] = modo === 'gross'
    ? [0, 0]
    : calcularDiferenciaHandicap(courseHandicapA, courseHandicapB)

  const sortedHoles = [...holes]
    .sort((a, b) => a.numero - b.numero)
    .slice(0, totalHoles)

  let matchState = 0
  let holesPlayed = 0
  let holesWonA = 0
  let holesWonB = 0
  let holesHalved = 0
  let isFinished = false
  let finishedAtHole = totalHoles

  // SI normalizado (permutación 1..N) para ALOCAR golpes de match play (SI 1 = más
  // difícil recibe primero). Idempotente si el SI ya es válido. El strokeIndex que se
  // MUESTRA en el detalle del hoyo se mantiene crudo (data de catálogo).
  const siAlloc = normalizedStrokeIndexByHole(sortedHoles, totalHoles)

  const holeDetails: MatchHoleDetail[] = sortedHoles.map((hole) => {
    const keyStr = String(hole.numero)
    const rawA = scoresA[keyStr]
    const rawB = scoresB[keyStr]

    const hasScoreA = rawA !== undefined && rawA !== null && rawA > 0
    const hasScoreB = rawB !== undefined && rawB !== null && rawB > 0
    const concededA = rawA === CONCEDE
    const concededB = rawB === CONCEDE

    // Si el match ya terminó, los hoyos restantes no se juegan
    if (isFinished) {
      return {
        numero: hole.numero,
        par: hole.par,
        strokeIndex: hole.stroke_index,
        grossA: hasScoreA ? rawA : null,
        grossB: hasScoreB ? rawB : null,
        strokesA: strokesMatchPlayEnHoyo(diffA, siAlloc[hole.numero] ?? hole.stroke_index),
        strokesB: strokesMatchPlayEnHoyo(diffB, siAlloc[hole.numero] ?? hole.stroke_index),
        netoA: null,
        netoB: null,
        result: 'not_played' as HoleResult,
        matchState,
        afterMatchEnd: true,
      }
    }

    const strkA = strokesMatchPlayEnHoyo(diffA, siAlloc[hole.numero] ?? hole.stroke_index)
    const strkB = strokesMatchPlayEnHoyo(diffB, siAlloc[hole.numero] ?? hole.stroke_index)

    // Concesiones — R&A 3.2c: cuando un hoyo se concede, ningún score se registra
    if (concededA) {
      // A concede el hoyo → B gana, pero ambos scores quedan null
      holesPlayed++
      holesWonB++
      matchState--
      const holesRemaining = totalHoles - holesPlayed
      if (Math.abs(matchState) > holesRemaining) {
        isFinished = true
        finishedAtHole = hole.numero
      }
      return {
        numero: hole.numero, par: hole.par, strokeIndex: hole.stroke_index,
        grossA: null, grossB: null,
        strokesA: strkA, strokesB: strkB, netoA: null, netoB: null,
        result: 'conceded_a' as HoleResult, matchState, afterMatchEnd: false,
      }
    }
    if (concededB) {
      // B concede el hoyo → A gana, pero ambos scores quedan null
      holesPlayed++
      holesWonA++
      matchState++
      const holesRemaining = totalHoles - holesPlayed
      if (Math.abs(matchState) > holesRemaining) {
        isFinished = true
        finishedAtHole = hole.numero
      }
      return {
        numero: hole.numero, par: hole.par, strokeIndex: hole.stroke_index,
        grossA: null, grossB: null,
        strokesA: strkA, strokesB: strkB, netoA: null, netoB: null,
        result: 'conceded_b' as HoleResult, matchState, afterMatchEnd: false,
      }
    }

    // Sin scores aún → hoyo pendiente
    if (!hasScoreA || !hasScoreB) {
      return {
        numero: hole.numero, par: hole.par, strokeIndex: hole.stroke_index,
        grossA: hasScoreA ? rawA : null, grossB: hasScoreB ? rawB : null,
        strokesA: strkA, strokesB: strkB,
        netoA: hasScoreA ? rawA - strkA : null,
        netoB: hasScoreB ? rawB - strkB : null,
        result: 'not_played' as HoleResult, matchState, afterMatchEnd: false,
      }
    }

    // Ambos tienen score → calcular resultado
    const netA = netoMatchPlay(rawA, diffA, hole.stroke_index)
    const netB = netoMatchPlay(rawB, diffB, hole.stroke_index)
    const result = resultadoHoyo(netA, netB)

    holesPlayed++
    if (result === 'won_a') { holesWonA++; matchState++ }
    else if (result === 'won_b') { holesWonB++; matchState-- }
    else { holesHalved++ }

    // Verificar si el match termina
    const holesRemaining = totalHoles - holesPlayed
    if (Math.abs(matchState) > holesRemaining) {
      isFinished = true
      finishedAtHole = hole.numero
    }

    return {
      numero: hole.numero, par: hole.par, strokeIndex: hole.stroke_index,
      grossA: rawA, grossB: rawB,
      strokesA: strkA, strokesB: strkB,
      netoA: netA, netoB: netB,
      result, matchState, afterMatchEnd: false,
    }
  })

  // Si se jugaron todos los hoyos, el match está terminado
  if (holesPlayed === totalHoles) {
    isFinished = true
  }

  const holesRemaining = totalHoles - holesPlayed
  const winner = isFinished
    ? (matchState > 0 ? 'a' : matchState < 0 ? 'b' : null)
    : null

  return {
    holes: holeDetails,
    holesPlayed,
    holesRemaining,
    state: matchState,
    isFinished,
    winner,
    display: displayResultado(matchState, holesRemaining, isFinished, totalHoles, holesPlayed, nombres),
    holesWonA,
    holesWonB,
    holesHalved,
  }
}

// ─── Utilidades para UI ───

/**
 * Texto corto para mostrar el estado del match desde la perspectiva de un jugador.
 * Ej: "2 UP", "1 DOWN", "AS"
 */
export function displayDesdeJugador(
  state: number,
  perspectiva: 'a' | 'b'
): string {
  const adjusted = perspectiva === 'a' ? state : -state
  if (adjusted === 0) return 'AS'
  if (adjusted > 0) return `${adjusted} UP`
  return `${Math.abs(adjusted)} DN`
}

/**
 * Color semántico para el resultado de un hoyo.
 */
export function colorResultadoHoyo(
  result: HoleResult,
  perspectiva: 'a' | 'b'
): 'green' | 'red' | 'gray' | 'neutral' {
  if (result === 'halved') return 'gray'
  if (result === 'not_played') return 'neutral'
  if (perspectiva === 'a') {
    return (result === 'won_a' || result === 'conceded_b') ? 'green' : 'red'
  }
  return (result === 'won_b' || result === 'conceded_a') ? 'green' : 'red'
}

/**
 * Texto descriptivo del resultado de un hoyo para leaderboard/historial.
 */
export function labelResultadoHoyo(result: HoleResult): string {
  switch (result) {
    case 'won_a': return 'Ganó A'
    case 'won_b': return 'Ganó B'
    case 'halved': return 'Empate'
    case 'conceded_a': return 'Concedido por A'
    case 'conceded_b': return 'Concedido por B'
    case 'not_played': return '—'
  }
}

// ─── Nassau ───

export interface NassauResult {
  front: MatchResult
  back: MatchResult
  overall: MatchResult
}

/**
 * Calcula Nassau: tres matches en uno.
 * - Front 9 (hoyos 1-9)
 * - Back 9 (hoyos 10-18)
 * - Overall (18 hoyos)
 *
 * Cada sub-match se calcula independientemente.
 * Requiere recorrido de 18 hoyos.
 */
export function calcularNassau(
  scoresA: Record<string, number>,
  scoresB: Record<string, number>,
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  config: MatchPlayConfig,
  nombres?: MatchPlayNames
): NassauResult | null {
  // Nassau requiere 18 hoyos (front 9 + back 9)
  const frontHoles = holes.filter((h) => h.numero <= 9)
  const backHoles = holes.filter((h) => h.numero > 9)

  if (frontHoles.length === 0 || backHoles.length === 0) {
    return null
  }

  const front = calcularMatchPlay(scoresA, scoresB, frontHoles, {
    ...config,
    totalHoles: frontHoles.length,
  }, nombres)

  const back = calcularMatchPlay(scoresA, scoresB, backHoles, {
    ...config,
    totalHoles: backHoles.length,
  }, nombres)

  const overall = calcularMatchPlay(scoresA, scoresB, holes, config, nombres)

  return { front, back, overall }
}
