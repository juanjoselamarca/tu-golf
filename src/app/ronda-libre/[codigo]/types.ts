// ─── Tipos locales de la vista live de ronda-libre ([codigo]/page.tsx) ──────
// Extraídos del componente monolítico durante el refactor (job "Resultados v2").
// Los tipos de dominio (RondaLibre, Jugador, etc.) viven en @/types/ronda.

import type { RondaLibre } from '@/types/ronda'

/** Equipo de una ronda por equipos (best_ball / scramble / foursome). */
export interface Equipo {
  id: string
  nombre: string
  handicap_equipo: number | null
  jugadorIds: string[]
  scores: Record<string, number>
}

/** Score que el admin está editando en el modal. */
export interface EditingScore {
  jugadorId: string
  hole: number
  currentScore: number
}

/** Resultado del fetch de la ronda + datos derivados de cancha y handicaps. */
export interface RondaLibreBundle {
  ronda: RondaLibre
  parMap: Record<number, number>
  siMap: Record<number, number>
  courseHcpMap: Record<string, number>
  equipos: Equipo[]
}

/**
 * Estado de la carga de la ronda:
 * - `ok`: datos cargados.
 * - `not_found`: 404 real (código inexistente) → mostrar pantalla "no encontrada".
 * - `transient`: error de red/auth → reintentar en el próximo poll, conservar data previa.
 * - `error`: excepción → mostrar UI de reintento.
 */
export type LoadRondaResult =
  | ({ status: 'ok' } & RondaLibreBundle)
  | { status: 'not_found' }
  | { status: 'transient' }
  | { status: 'error' }
