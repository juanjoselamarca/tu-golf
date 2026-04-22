import type { RondaLibre } from './types'

export type RondaConScores = RondaLibre & {
  total_gross: number | null
  vsPar: number | null
  scores: number[] | null
  parPerHole: number[] | null
}

/**
 * Retorna la ronda más reciente si el usuario tiene al menos una finalizada
 * con fecha === fechaHoy. La lista ya viene filtrada por el dashboard para
 * estados != 'en_curso' y ordenada por created_at desc.
 *
 * Granularidad V1: día (no 4h). rondas_libres no tiene finalized_at. Si V2
 * necesita ventana horaria precisa, agregar ese campo por migración.
 *
 * @param rondas  lista de rondas finalizadas del usuario (enriquecida).
 * @param fechaHoy ISO date "YYYY-MM-DD" en Santiago TZ (ya calculada por el server).
 */
export function getUltimaRondaReciente(
  rondas: RondaConScores[],
  fechaHoy: string,
): RondaConScores | null {
  for (const r of rondas) {
    if (r.fecha === fechaHoy) return r
  }
  return null
}
