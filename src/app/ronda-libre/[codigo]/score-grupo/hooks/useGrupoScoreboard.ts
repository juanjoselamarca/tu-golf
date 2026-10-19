'use client'

import { useMemo } from 'react'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import { normalizeStrokeIndexMap } from '@/golf/core/stroke-index'
import { getMissingHoles } from '@/lib/ronda/helpers'
import { hoyosAnotados, puedeFinalizar, totalesDeTarjeta, type TotalesDeTarjeta } from '@/golf/ronda-libre/progreso-de-ronda'
import { etiquetaDeModalidad } from '@/golf/ronda-libre/etiqueta-modalidad'
import { hoyosDeBolaCompartida, isSharedBallFormat, totalesBolaCompartida, type TotalesBolaCompartida } from '@/golf/formats'
import type { FormatoJuego, HoleData, Jugador, ModoJuego, RondaLibre } from '@/types/ronda'

export interface GrupoScoreboard {
  totalHoles: number
  par: number
  holeData: HoleData
  modoJuego: ModoJuego
  formatoJuego: FormatoJuego
  modoLabel: string
  showNetStableford: boolean
  isMatchPlay: boolean
  /**
   * SI normalizado (permutación 1..totalHoles) SÓLO para alocar golpes en los
   * indicadores del scorer de equipo (dot del progress row, hint "GOLPES"): SI de
   * catálogo 18h-impar en 9h perdía golpes. El SI que se MUESTRA sigue siendo el de
   * catálogo (holeData.stroke_index). Misma fuente canónica que board/scorer/card.
   */
  siAllocByHole: Record<number, number>
  /**
   * HCP con el que se marcan los puntos de golpe. En Match Play Neto es la
   * DIFERENCIA NETA contra el de menor HCP (que juega scratch); en stroke
   * play / stableford cada jugador usa su HCP absoluto.
   */
  getDotHcp: (playerId: string) => number
  holesWithScores: (jugadorId: string) => number
  /** Hoyos anotados de la tarjeta que más lleva (THRU del header): jugador, o equipo en bola compartida. */
  maxThru: number
  canFinalize: boolean
  /** Hoyos sin marcar entre TODAS las tarjetas (de equipo en bola compartida): si > 0, finalizar pide confirmar el relleno con par. */
  totalMissingScores: number
  getPlayerTotal: (jugadorId: string) => TotalesDeTarjeta
  /** Golpes que recibe el jugador en el hoyo actual. */
  strokesOnHole: (jugadorId: string) => number
  /** Máximo de golpes recibidos en el hoyo actual (hint GOLPES): entre jugadores, o entre equipos en bola compartida. */
  maxStrokesOnHole: number
  /** Fila de progreso: el hoyo tiene score en todas las tarjetas que se anotan. */
  hoyoCompleto: (hoyo: number) => boolean
  /** Fila de progreso (punto dorado): alguna tarjeta recibe golpe en el hoyo (sólo neto). */
  hoyoConGolpe: (hoyo: number) => boolean
  /** Scramble / foursome: totales del equipo con el motor del board (#602). */
  totalesDeEquipo: (equipoId: string) => TotalesBolaCompartida | null
}

type EquipoDeBolaCompartida = { id: string; nombre: string; scores: Record<string, number>; handicap_equipo: number | null }

/**
 * Cálculos derivados del scorer de GRUPO (puros, memoizados). Totales y
 * progreso salen de `progreso-de-ronda` (fuente única compartida con el
 * scorer individual) sobre los hoyos DE LA RONDA.
 *
 * Scramble / foursome (#602): se anota UNA tarjeta por equipo y juega el handicap
 * del EQUIPO, así que THRU, hoyos faltantes, GOLPES y la fila de progreso salen de
 * los equipos (`totalesBolaCompartida`, el motor del board), no de las tarjetas
 * individuales, que en esos formatos están vacías.
 */
export function useGrupoScoreboard(input: {
  ronda: Pick<RondaLibre, 'holes' | 'modo_juego' | 'formato_juego'> | null
  jugadores: Jugador[]
  scores: Record<string, Record<number, number>>
  parMap: Record<number, number>
  holeDataMap: Record<number, HoleData>
  playerHcp: Record<string, number>
  /** Equipos de la ronda (`[]` en formatos individuales). */
  equipos: readonly EquipoDeBolaCompartida[]
  ordenHoyos: readonly number[]
  currentHole: number
  isLastHole: boolean
}): GrupoScoreboard {
  const { ronda, jugadores, scores, parMap, holeDataMap, playerHcp, equipos, ordenHoyos, currentHole, isLastHole } = input
  const holes = ronda?.holes
  const modo = ronda?.modo_juego
  const formato = ronda?.formato_juego

  return useMemo<GrupoScoreboard>(() => {
    const totalHoles = holes ?? ordenHoyos.length
    const par = parMap[currentHole] ?? 4
    const holeData = holeDataMap[currentHole] ?? { numero: currentHole, par, stroke_index: currentHole, yardaje: null }
    const siAllocByHole: Record<number, number> = normalizeStrokeIndexMap(
      Object.fromEntries(ordenHoyos.map(h => [h, holeDataMap[h]?.stroke_index ?? h])),
      totalHoles,
      ordenHoyos,
    )
    const modoJuego = (modo || 'gross') as ModoJuego
    const formatoJuego = (formato || 'stroke_play') as FormatoJuego
    const modoLabel = etiquetaDeModalidad(modoJuego, formatoJuego)
    const showNetStableford = modoJuego !== 'gross'
    const isMatchPlay = formatoJuego === 'match_play'

    const getDotHcp = (playerId: string): number => {
      const absHcp = playerHcp[playerId] ?? 0
      if (!isMatchPlay) return absHcp
      const hcps = jugadores.map(p => playerHcp[p.id] ?? 0)
      const minHcp = hcps.length > 0 ? Math.min(...hcps) : 0
      return Math.max(0, absHcp - minHcp)
    }

    const holesWithScores = (jId: string) => hoyosAnotados(scores[jId], ordenHoyos)
    const getPlayerTotal = (jId: string) => totalesDeTarjeta(scores[jId], ordenHoyos, parMap)
    const strokesEnHoyo = (jId: string, h: number) => strokesRecibidosEnHoyo(getDotHcp(jId), siAllocByHole[h] ?? h, totalHoles)
    const strokesOnHole = (jId: string) => strokesRecibidosEnHoyo(getDotHcp(jId), siAllocByHole[currentHole] ?? holeData.stroke_index, totalHoles)

    // Tarjetas que se anotan: una por equipo en bola compartida, una por jugador en el resto.
    const bolaCompartida = isSharedBallFormat(formatoJuego)
    const totalesPorEquipo = new Map<string, TotalesBolaCompartida>()
    if (bolaCompartida) {
      const hoyos = hoyosDeBolaCompartida(ordenHoyos, parMap, holeDataMap)
      const formatoEquipo = formatoJuego === 'foursome' ? 'foursome' : 'scramble'
      for (const e of equipos) totalesPorEquipo.set(e.id, totalesBolaCompartida(formatoEquipo, e, hoyos))
    }
    const tarjetas: Array<{ scores: Record<string | number, number> | undefined; golpesEnHoyo: (h: number) => number }> = bolaCompartida
      ? equipos.map(e => ({ scores: e.scores, golpesEnHoyo: (h: number) => totalesPorEquipo.get(e.id)?.golpesPorHoyo[h] ?? 0 }))
      : jugadores.map(j => ({ scores: scores[j.id], golpesEnHoyo: (h: number) => strokesEnHoyo(j.id, h) }))

    const maxThru = Math.max(...tarjetas.map(t => hoyosAnotados(t.scores, ordenHoyos)), 0)
    const canFinalize = puedeFinalizar(maxThru, isLastHole)
    const totalMissingScores = tarjetas.reduce(
      (sum, t) => sum + getMissingHoles(t.scores ?? {}, totalHoles, ordenHoyos).length, 0,
    )
    const maxStrokesOnHole = Math.max(...tarjetas.map(t => t.golpesEnHoyo(currentHole)), 0)
    const hoyoCompleto = (h: number) => tarjetas.length > 0 && tarjetas.every(t => t.scores?.[h] != null)
    const hoyoConGolpe = (h: number) => showNetStableford && tarjetas.some(t => t.golpesEnHoyo(h) > 0)
    const totalesDeEquipo = (id: string) => totalesPorEquipo.get(id) ?? null

    return {
      totalHoles, par, holeData, modoJuego, formatoJuego, modoLabel, showNetStableford, isMatchPlay,
      siAllocByHole, getDotHcp, holesWithScores, maxThru, canFinalize, totalMissingScores, getPlayerTotal,
      strokesOnHole, maxStrokesOnHole, hoyoCompleto, hoyoConGolpe, totalesDeEquipo,
    }
  }, [holes, modo, formato, jugadores, scores, parMap, holeDataMap, playerHcp, equipos, ordenHoyos, currentHole, isLastHole])
}
