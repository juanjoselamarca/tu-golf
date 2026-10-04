/**
 * src/golf/ronda-libre/tarjeta-para-historial.ts
 *
 * FUENTE ÚNICA (pura) de la tarjeta que va al historial: resultado del match
 * desde la perspectiva del jugador y ajuste WHS de los hoyos que no terminó
 * (concedidos, ganados sin terminar, no jugados tras decidirse el match). La usan
 * el guardado (`contextoDeTarjeta`, que carga hoyos y course handicaps de la base)
 * y "Resumen de tu ronda" (vista previa con los mismos datos que ya tiene la
 * pantalla), así lo que el jugador ve antes de guardar es lo que se guarda.
 */

import { ajustarTarjetaParaHistorial, type HoyoEstimado } from '@/golf/core/ajuste-whs'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { hoyosNoJugadosDelMatch, resultadoDesdePerspectiva } from '@/golf/formats/match-play'
import { matchDeLaRonda, type HoyoDelMatch } from './match-de-la-ronda'
import type { RondaLibre } from '@/types/ronda'

type Golpes = Record<string | number, number | null | undefined>

export interface TarjetaParaHistorial {
  /** Golpes listos para el historial (con los hoyos sin terminar ya estimados). */
  scores: Golpes
  /** "Ganó 3&2" / "Perdió 1 UP" / "Empate" / "Sin terminar (2 UP)"; `null` fuera de match play. */
  matchResult: string | null
  /** Hoyos cuyo score es una estimación WHS. */
  estimados: HoyoEstimado[]
}

export function tarjetaParaHistorial(input: {
  ronda: Pick<RondaLibre, 'formato_juego' | 'holes' | 'modo_juego' | 'hoyo_inicio'> & {
    ronda_libre_jugadores: ReadonlyArray<{ id: string; nombre: string }>
  }
  jugadorId: string
  /** La tarjeta que se guarda. */
  scores: Golpes
  /** Tarjetas de todos los jugadores (el match necesita al rival). */
  scoresPorJugador: Record<string, Golpes | null | undefined>
  /** Hoyos de la ronda en orden de juego (`hoyosDeLaRonda`). */
  hoyos: readonly number[]
  parMap: Record<number, number>
  /** Par y SI de cada hoyo de la ronda (los del scorer / `loadRondaLibre`). */
  hoyosConSi: readonly HoyoDelMatch[]
  /** Course handicap de SCORING por jugador (`courseHandicapsDeRonda`). */
  courseHcpPorJugador: Record<string, number | null | undefined>
  /** Jugadores sin índice declarado (WHS 3.1b: tope par + 5). */
  sinIndice: ReadonlySet<string>
}): TarjetaParaHistorial {
  const { ronda, jugadorId, scoresPorJugador, hoyos, parMap, hoyosConSi, courseHcpPorJugador, sinIndice } = input
  // Sólo el match play tiene hoyos concedidos: el resto pasa tal cual.
  if (ronda.formato_juego !== 'match_play') return { scores: input.scores, matchResult: null, estimados: [] }

  const match = matchDeLaRonda({
    ronda, scoresPorJugador: { ...scoresPorJugador, [jugadorId]: input.scores }, hoyos: hoyosConSi,
    courseHcpPorJugador, perspectivaId: jugadorId,
  })
  const rival = ronda.ronda_libre_jugadores.find(j => j.id !== jugadorId)
  const ajuste = ajustarTarjetaParaHistorial({
    scores: input.scores,
    hoyos,
    parMap,
    siPorHoyo: normalizedStrokeIndexByHole([...hoyosConSi], ronda.holes ?? 18, hoyos),
    courseHcp: sinIndice.has(jugadorId) ? null : (courseHcpPorJugador[jugadorId] ?? 0),
    totalHoyos: ronda.holes ?? 18,
    rival: rival ? { scores: scoresPorJugador[rival.id] ?? {}, courseHcp: courseHcpPorJugador[rival.id] ?? 0 } : null,
    hoyosNoJugados: match ? hoyosNoJugadosDelMatch(match) : [],
  })
  return {
    scores: ajuste.scores,
    matchResult: match ? resultadoDesdePerspectiva(match, 'a') : null,
    estimados: ajuste.estimados,
  }
}
