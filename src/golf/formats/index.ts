/**
 * Registry de formatos de juego.
 * Cada formato implementa GolfFormat para que el resto de la app
 * no necesite saber los detalles de cada modalidad.
 *
 * Para agregar un nuevo formato (ej: match-play):
 * 1. Crear match-play.ts con la lógica específica
 * 2. Registrar en FORMATS
 * 3. Toda la app lo soporta automáticamente
 */

import type { FormatCategory } from '../core/rules'
import { calcularResumenRonda, scorePrimario, ordenarJugadores } from '../core/scoring'
import { captureError } from '@/lib/error-tracking'

// ─── Re-exports de cada formato ───

export { calcularMatchPlay, calcularNassau, calcularDiferenciaHandicap, displayDesdeJugador, colorResultadoHoyo, labelResultadoHoyo, CONCEDE } from './match-play'
export type { MatchResult, MatchHoleDetail, MatchPlayConfig, MatchPlayNames, HoleResult, NassauResult } from './match-play'

export { calcularBestBall, scorePrimarioBestBall, ordenarEquiposBestBall } from './best-ball'
export type { BestBallTeam, BestBallPlayer, BestBallTeamResult, BestBallHoleDetail } from './best-ball'

export { calcularScramble, calcularHandicapScramble, scorePrimarioScramble, ordenarEquiposScramble } from './scramble'
export type { ScrambleTeam, ScrambleTeamResult, ScrambleHoleDetail } from './scramble'

export { calcularFoursome, calcularHandicapFoursome, teePlayerEnHoyo, scorePrimarioFoursome, ordenarEquiposFoursome } from './foursome'
export type { FoursomeTeam, FoursomeTeamResult, FoursomeHoleDetail } from './foursome'

// ─── GolfFormat interface ───

export interface GolfFormat {
  name: string
  description: string
  category: FormatCategory
  calcularResumen: typeof calcularResumenRonda
  scorePrimario: typeof scorePrimario
  ordenar: typeof ordenarJugadores
}

const strokePlay: GolfFormat = {
  name: 'Stroke Play',
  description: 'Gana el jugador con menos golpes totales',
  category: 'individual',
  calcularResumen: calcularResumenRonda,
  scorePrimario,
  ordenar: ordenarJugadores,
}

const stableford: GolfFormat = {
  name: 'Stableford',
  description: 'Gana el jugador con más puntos Stableford',
  category: 'individual',
  calcularResumen: calcularResumenRonda,
  scorePrimario,
  ordenar: ordenarJugadores,
}

/**
 * Match Play, Best Ball, Scramble y Foursome usan motores separados
 * porque su lógica es fundamentalmente distinta (hoyo a hoyo, equipos, etc.).
 * Se registran aquí para que getFormat() no falle, pero la lógica real
 * está en sus archivos respectivos.
 */
const matchPlay: GolfFormat = {
  name: 'Match Play',
  description: 'Hoyo a hoyo — gana quien gane más hoyos',
  category: 'head_to_head',
  calcularResumen: calcularResumenRonda,
  scorePrimario,
  ordenar: ordenarJugadores,
}

const bestBall: GolfFormat = {
  name: 'Best Ball',
  description: 'Equipo: cuenta el mejor score individual por hoyo',
  category: 'team',
  calcularResumen: calcularResumenRonda,
  scorePrimario,
  ordenar: ordenarJugadores,
}

const scramble: GolfFormat = {
  name: 'Scramble',
  description: 'Equipo: todos tiran, eligen el mejor y juegan desde ahí',
  category: 'team',
  calcularResumen: calcularResumenRonda,
  scorePrimario,
  ordenar: ordenarJugadores,
}

const foursome: GolfFormat = {
  name: 'Foursome',
  description: 'Equipo de 2: tiros alternados, una bola',
  category: 'team',
  calcularResumen: calcularResumenRonda,
  scorePrimario,
  ordenar: ordenarJugadores,
}

export const FORMATS: Record<string, GolfFormat> = {
  stroke_play: strokePlay,
  stableford,
  match_play: matchPlay,
  best_ball: bestBall,
  scramble,
  foursome,
}

/** Claves canónicas reconocidas por el motor. */
export const KNOWN_FORMAT_KEYS = Object.keys(FORMATS) as ReadonlyArray<string>

/**
 * Claves de formatos POR EQUIPO (category 'team'): best_ball, scramble, foursome.
 * Derivado del registry — fuente única. Reemplaza los `['best_ball','scramble','foursome']`
 * que estaban duplicados por toda la app.
 */
export const TEAM_FORMAT_KEYS = KNOWN_FORMAT_KEYS.filter(k => FORMATS[k].category === 'team')

/** True si el formato es por equipos (best_ball / scramble / foursome). */
export function isTeamFormat(key: string | null | undefined): boolean {
  return !!key && FORMATS[key]?.category === 'team'
}

/**
 * Claves de formatos de BOLA COMPARTIDA: scramble y foursome (una sola bola por
 * equipo). NO incluye best_ball (cada jugador juega su propia bola). Distinto de
 * `TEAM_FORMAT_KEYS` — usado para el scoring compartido (un score por equipo/hoyo).
 */
export const SHARED_BALL_FORMAT_KEYS = ['scramble', 'foursome'] as const

/** True si el formato usa una sola bola compartida por equipo (scramble / foursome). */
export function isSharedBallFormat(key: string | null | undefined): boolean {
  return key === 'scramble' || key === 'foursome'
}

/**
 * True si el formato puntúa por puntos Stableford (neto por hoyo → puntos).
 *
 * Fuente canónica del predicado "¿es stableford?" (tracking 30-jul-2026): estaba
 * reescrito inline en ~10 archivos productivos. Se migra cada call-site al tocar
 * su flujo — primero el scorer del organizador y su Resumen.
 */
export function isStablefordFormat(key: string | null | undefined): boolean {
  return key === 'stableford'
}

/**
 * FUENTE ÚNICA de "¿qué formato juega este torneo?".
 *
 * `tournaments` guarda el formato en DOS columnas: `formato_juego` (la canónica
 * nueva) y `format` (la legacy). Cuando discrepan, gana `formato_juego`; `format`
 * queda de respaldo para las filas viejas que sólo lo tienen a él.
 *
 * Por qué existe: el scorer del organizador decidía si escribir puntos
 * stableford mirando `format`, mientras su propio tab Resumen y toda la vista
 * pública rankeaban mirando `formato_juego`. En prod hay 4 torneos donde los dos
 * campos discrepan (3 con `format='stableford'` y `formato_juego='stroke_play'`),
 * así que la misma pantalla escribía puntos de un formato y ordenaba por otro.
 * Los 4 son de prueba y en borrador, con cero hoyos con puntos: unificar no
 * altera ningún dato persistido.
 */
export function resolveFormatoJuego(t: {
  formato_juego?: string | null
  format?: string | null
}): string {
  return t.formato_juego ?? t.format ?? 'stroke_play'
}

/**
 * Devuelve el GolfFormat para `key`. Si `key` no está registrada,
 * cae a stroke_play PERO registra el caso vía captureError para que
 * el equipo lo vea en `error_logs` (antes se tragaba en silencio).
 *
 * Para call sites donde una key desconocida debe ser un error duro
 * (creación de torneo, validador de config), usar `getFormatStrict`.
 */
export function getFormat(key: string): GolfFormat {
  const fmt = FORMATS[key]
  if (!fmt) {
    void captureError(
      new Error(`getFormat(): formato desconocido "${key}" — cayendo a stroke_play`),
      {
        context: 'golf.formats.getFormat',
        level: 'warning',
        meta: { key, knownFormats: KNOWN_FORMAT_KEYS },
      },
    )
    return strokePlay
  }
  return fmt
}

/**
 * Igual que getFormat() pero tira en vez de caer al fallback.
 * Usar en boundaries que NO deben aceptar formatos inválidos
 * (ej: persistencia de torneos, validación de config de wizard).
 */
export function getFormatStrict(key: string): GolfFormat {
  const fmt = FORMATS[key]
  if (!fmt) {
    throw new Error(
      `Formato desconocido: "${key}". Formatos válidos: ${KNOWN_FORMAT_KEYS.join(', ')}`,
    )
  }
  return fmt
}

// ─── Eligibilidad para índice de handicap ───────────────────────────────────
//
// Fuente ÚNICA del predicado "¿esta ronda cuenta para el cálculo del índice?".
// Basado en reglas WHS: solo stroke play y stableford, con datos de cancha
// (slope + CR), mínimo 9 hoyos, y sin exclusión manual del usuario.
//
// Consumidores: badge del historial (RoundCard), motor de cálculo de índice.

export interface CuentaParaIndiceResult {
  cuenta: boolean
  razon: string
}

/**
 * Determina si una ronda es elegible para el cálculo del índice de handicap.
 *
 * Orden de evaluación: exclusión manual → formato → datos de cancha → hoyos.
 * La primera condición que falla produce la razón; si ninguna falla, cuenta.
 */
export function cuentaParaIndice(round: {
  formato_juego?: string | null
  excluded_from_handicap?: boolean
  slope_rating?: number | null
  course_rating?: number | null
  holes_played?: number | null
  scores?: (number | null)[] | null
}): CuentaParaIndiceResult {
  // 1. Exclusión manual del usuario (prioridad máxima: decisión explícita)
  if (round.excluded_from_handicap) {
    return { cuenta: false, razon: 'Excluida manualmente' }
  }

  // 2. Formato: solo stroke play y stableford cuentan para índice WHS
  const fmt = round.formato_juego ?? 'stroke_play'
  if (isTeamFormat(fmt)) {
    const label = FORMATS[fmt]?.name ?? fmt
    return { cuenta: false, razon: `${label} no cuenta para índice` }
  }
  if (fmt === 'match_play') {
    return { cuenta: false, razon: 'Match Play no cuenta para índice' }
  }

  // 3. Datos de cancha necesarios para calcular diferencial
  if (!round.slope_rating || !round.course_rating) {
    return { cuenta: false, razon: 'Sin datos de cancha (slope/CR)' }
  }

  // 4. Mínimo 9 hoyos jugados (WHS acepta 9 y 18)
  const holesPlayed = round.holes_played
    ?? round.scores?.filter((s) => s != null).length
    ?? 0
  if (holesPlayed < 9) {
    return { cuenta: false, razon: 'Menos de 9 hoyos' }
  }

  return { cuenta: true, razon: 'Cuenta para tu índice' }
}
