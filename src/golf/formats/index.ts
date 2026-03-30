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

import type { ModoJuego } from '../core/rules'
import type { ResumenRonda } from '../core/scoring'
import { calcularResumenRonda, scorePrimario, ordenarJugadores } from '../core/scoring'

export interface GolfFormat {
  name: string
  description: string
  calcularResumen: typeof calcularResumenRonda
  scorePrimario: typeof scorePrimario
  ordenar: typeof ordenarJugadores
}

const strokePlay: GolfFormat = {
  name: 'Stroke Play',
  description: 'Gana el jugador con menos golpes totales',
  calcularResumen: calcularResumenRonda,
  scorePrimario,
  ordenar: ordenarJugadores,
}

const stableford: GolfFormat = {
  name: 'Stableford',
  description: 'Gana el jugador con más puntos Stableford',
  calcularResumen: calcularResumenRonda,
  scorePrimario: (resumen: ResumenRonda) => resumen.totalStableford,
  ordenar: (jugadores, _modo: ModoJuego) =>
    ordenarJugadores(jugadores, 'stableford'),
}

export const FORMATS: Record<string, GolfFormat> = {
  stroke_play: strokePlay,
  stableford,
  // Futuros:
  // match_play: matchPlay,
  // best_ball: bestBall,
  // foursome: foursome,
  // scramble: scramble,
}

export function getFormat(key: string): GolfFormat {
  return FORMATS[key] ?? strokePlay
}
