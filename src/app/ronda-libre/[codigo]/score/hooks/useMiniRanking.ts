'use client'

import { useMemo } from 'react'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { totalesDeTarjeta } from '@/golf/ronda-libre/progreso-de-ronda'
import type { RondaLibre } from '@/types/ronda'

export interface RankingEntry {
  id: string
  nombre: string
  vsPar: number
  holesPlayed: number
  gross: number
}

/**
 * Mini ranking del scorer (sheet colapsable, multi-jugador): cada jugador
 * con al menos un hoyo anotado, ordenado por score a par. Los totales salen
 * de `totalesDeTarjeta` (fuente única) sobre los hoyos DE LA RONDA.
 */
export function useMiniRanking(
  ronda: RondaLibre | null,
  scores: Record<string, Record<number, number>>,
  parMap: Record<number, number>,
): RankingEntry[] {
  return useMemo(() => {
    if (!ronda) return []
    const hoyos = hoyosDeLaRonda(ronda.hoyo_inicio, ronda.holes)
    return ronda.ronda_libre_jugadores
      .map(j => {
        const t = totalesDeTarjeta(scores[j.id], hoyos, parMap)
        return { id: j.id, nombre: j.nombre, vsPar: t.vsPar, holesPlayed: t.holesPlayed, gross: t.gross }
      })
      .filter(j => j.holesPlayed > 0)
      .sort((a, b) => a.vsPar - b.vsPar)
  }, [ronda, scores, parMap])
}
