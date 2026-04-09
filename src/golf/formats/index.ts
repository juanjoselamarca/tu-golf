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

import type { ModoJuego, FormatoJuego, FormatCategory } from '../core/rules'
import type { ResumenRonda } from '../core/scoring'
import { calcularResumenRonda, scorePrimario, ordenarJugadores } from '../core/scoring'

// ─── Re-exports de cada formato ───

export { calcularMatchPlay, calcularNassau, calcularDiferenciaHandicap, displayDesdeJugador, colorResultadoHoyo, labelResultadoHoyo, CONCEDE } from './match-play'
export type { MatchResult, MatchHoleDetail, MatchPlayConfig, HoleResult, NassauResult } from './match-play'

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
  scorePrimario: (resumen: ResumenRonda) => resumen.totalStableford,
  ordenar: (jugadores, _modo: ModoJuego) =>
    ordenarJugadores(jugadores, 'stableford'),
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

export function getFormat(key: string): GolfFormat {
  return FORMATS[key] ?? strokePlay
}
