// src/golf/core/hole-scoring.ts
//
// FUENTE ÚNICA del puntaje de UN hoyo: golpes recibidos, neto y puntos.
//
// Por qué existe: Golfers+ tiene dos pantallas que escriben el score de un
// torneo — el scorer del organizador y el del jugador — y las dos persisten
// `net_score` y `points` con `POST /api/game`. Cada una calculaba esos dos
// números por su cuenta, y el del jugador lo hacía con el ÍNDICE CRUDO en vez
// del course handicap del gate: en un torneo `hcp_calc_mode='whs'` sobre cancha
// con slope ≠ 113 los dos guardaban netos distintos para el mismo golpe.
//
// La misma pregunta ("¿cuánto vale este hoyo para este jugador?") se contesta
// acá una sola vez. El handicap entra ya resuelto — quién lo resuelve es
// `resolveScoringCourseHcp`, el gate por torneo.

import { puntosStablefordHoyo, strokesRecibidosEnHoyo } from './scoring'
import { isStablefordFormat, resolveFormatoJuego } from '@/golf/formats'

export interface PuntajeDeHoyo {
  /** Golpes de handicap que el jugador recibe EN ESTE hoyo. */
  strokesRecibidos: number
  /** Gross menos los golpes recibidos. Es el valor que se persiste. */
  neto: number
  /** Puntos stableford. 0 en cualquier otro formato — nunca un número inventado. */
  puntos: number
}

/**
 * El formato del torneo, en cualquiera de las dos formas en que llega:
 * la clave ya resuelta, o la fila con sus dos columnas (`formato_juego`
 * canónica + `format` legacy, que en prod discrepan en 4 torneos).
 */
export type FormatoDelHoyo =
  | string
  | null
  | undefined
  | { formato_juego?: string | null; format?: string | null }

export interface PuntajeDeHoyoArgs {
  gross: number
  par: number
  /**
   * El handicap con el que se REPARTEN los golpes. Es el course handicap que
   * devuelve `resolveScoringCourseHcp`, NO el índice del jugador. El nombre es
   * explícito a propósito: mientras el parámetro se llamó `handicapIndex`, los
   * call sites le pasaron índices durante meses sin que nada chillara.
   */
  courseHandicap: number
  strokeIndex: number
  holeCount: number
  formato: FormatoDelHoyo
}

function esStableford(formato: FormatoDelHoyo): boolean {
  if (formato == null) return false
  if (typeof formato === 'string') return isStablefordFormat(formato)
  return isStablefordFormat(resolveFormatoJuego(formato))
}

export function puntajeDeHoyo(args: PuntajeDeHoyoArgs): PuntajeDeHoyo {
  const { gross, par, courseHandicap, strokeIndex, holeCount, formato } = args

  const strokesRecibidos = strokesRecibidosEnHoyo(courseHandicap, strokeIndex, holeCount)

  return {
    strokesRecibidos,
    neto: gross - strokesRecibidos,
    puntos: esStableford(formato)
      ? puntosStablefordHoyo(gross, par, courseHandicap, strokeIndex, holeCount)
      : 0,
  }
}
