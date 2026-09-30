// src/golf/notifications/round-update-payload.ts
//
// Jugadores para el push de "ronda actualizada" (/api/push/round-update),
// calculados desde los scores VIVOS del scorer.
//
// Causa raíz del bug "la notificación no se actualiza con la app cerrada"
// (inbox f6cca8e3): el scorer armaba este payload leyendo
// `ronda.ronda_libre_jugadores[].scores`, un snapshot que se setea UNA vez al
// abrir la página (useRondaScoreData). En una ronda recién creada ese snapshot
// tiene 0 hoyos → maxHole=0 → Zod (min 1) rechazaba con 400 → ningún push, nunca.
//
// Score por ronda: calcularScoreRonda (src/golf/core/round-score.ts), la única
// fuente de gross / vs-par / hoyos jugados. Puro.

import { calcularScoreRonda } from '@/golf/core/round-score'
import type { SpectatorPlayer } from './spectator'

export interface RoundUpdateJugador {
  id: string
  nombre: string
}

export interface RoundUpdatePayloadInput {
  jugadores: RoundUpdateJugador[]
  /** Scores vivos del scorer: jugadorId → (hoyo → golpes). */
  scores: Record<string, Record<number, number> | Record<string, number>>
  parMap: Record<number, number>
  totalHoles: number
  /** Hoyos jugados (`hoyosDeLaRonda`). Default 1..totalHoles. */
  hoyos?: readonly number[]
}

export function buildRoundUpdatePlayers(input: RoundUpdatePayloadInput): SpectatorPlayer[] {
  const { jugadores, scores, parMap, totalHoles, hoyos } = input
  return jugadores.map(j => {
    const { vsPar, holesPlayed } = calcularScoreRonda({
      scores: scores[j.id] ?? {},
      roundHoles: totalHoles,
      hoyos,
      parMap,
    })
    return { nombre: j.nombre, vsPar, holesCompleted: holesPlayed, totalHoles }
  })
}
