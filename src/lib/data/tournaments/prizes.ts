// src/lib/data/tournaments/prizes.ts
//
// Mapeo de `PrizeConfig` (wizard) → fila para insertar en `tournament_prizes`.
// Vive en lib/data porque es el contrato entre la app y la tabla.
//
// Reglas:
// - `kind` (gross|neto) solo persiste para `category_position` — los otros
//   tipos no son ranking-based.
// - Match Play descarta `kind` para todos los premios: el modo del torneo
//   manda (un solo bracket gross XOR neto).
// - Mantener este mapeo en un único lugar facilita validar y testear sin
//   depender del route handler.

import type { PrizeConfig, TournamentFormat } from '@/lib/draft/types'

export interface PrizeInsertRow {
  tournament_id: string
  type: PrizeConfig['type']
  description: string
  position?: number
  hole_number?: number
  kind: 'gross' | 'neto' | null
}

export function mapPrizeForInsert(
  prize: PrizeConfig,
  tournamentId: string,
  format: TournamentFormat,
): PrizeInsertRow {
  const isMatchPlay = format === 'match_play'
  const kindApplies = prize.type === 'category_position' && !isMatchPlay
  return {
    tournament_id: tournamentId,
    type: prize.type,
    description: prize.description,
    position: prize.position,
    hole_number: prize.hole_number,
    kind: kindApplies ? (prize.kind ?? null) : null,
  }
}
