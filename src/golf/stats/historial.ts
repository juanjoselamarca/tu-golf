/**
 * Agregados del historial — FUENTE CANÓNICA del concepto "stats del historial".
 *
 * Movida pura desde src/app/api/historial/stats/route.ts (refactor "el que
 * toca, ordena"): la matemática de golf sale del route handler para que la
 * consuman DOS callers sin duplicarse (regla "un concepto, una fuente"):
 *   - el Server Component /perfil/historial (elimina el waterfall
 *     hidratar → auth → fetch /api/historial/stats), y
 *   - el route /api/historial/stats (que queda como wrapper delgado).
 *
 * PRESERVA el fix del bug inbox 2268163d / PR #254 ("los eagles no me calzan"):
 * los pares por cancha se arman con buildCourseParMap (indexado por `numero`,
 * order-independent) — NUNCA recalcular pares de otra forma. La paginación
 * determinista por (course_id, numero) vive en la capa de datos
 * (src/lib/data/historial.ts) y también es parte del mismo fix.
 *
 * Desde 16-nov-2026 la normalización y los agregados viven en
 * rondas-normalizadas.ts (compartidos con /perfil/stats); acá queda la
 * agrupación por mes y el wrapper computeHistorialStats.
 *
 * Función pura: sin I/O, sin supabase, 100% testeable unit.
 */

import type { CourseCandidate } from '@/golf/courses/matching'
import {
  agregarRondas,
  aRondaDeHistorial,
  normalizarRondas,
  type AgregadosDeRondas,
  type CourseHoleRow,
  type RawStatsRound,
  type RondaNormalizada,
  type StatsHistorialRound,
} from './rondas-normalizadas'

// ─── Tipos (canónicos en rondas-normalizadas; re-exportados por compatibilidad) ──

export type {
  BestRound,
  CourseBreakdownItem,
  CourseHoleRow,
  RawStatsRound,
  StatsHistorialRound,
} from './rondas-normalizadas'

export interface RoundsByMonth {
  month: string
  label: string
  rounds: StatsHistorialRound[]
}

export interface HistorialStats extends AgregadosDeRondas {
  roundsByMonth: RoundsByMonth[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function getMonthLabel(dateStr: string): string {
  const [year, monthStr] = dateStr.split('-')
  const monthIdx = parseInt(monthStr, 10) - 1
  return `${MONTH_NAMES[monthIdx]} ${year}`
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7) // "2026-03"
}

// ─── Cálculo ──────────────────────────────────────────────────────────────────

/**
 * Stats del historial a partir de rondas YA normalizadas: los agregados de
 * agregarRondas (la misma función que usa /perfil/stats) + la agrupación por mes.
 */
export function historialStatsDeRondas(rondas: RondaNormalizada[]): HistorialStats {
  const monthMap = new Map<string, StatsHistorialRound[]>()
  for (const r of rondas) {
    const key = getMonthKey(r.played_at)
    if (!monthMap.has(key)) monthMap.set(key, [])
    monthMap.get(key)!.push(aRondaDeHistorial(r))
  }
  const roundsByMonth: RoundsByMonth[] = Array.from(monthMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0])) // newest first
    .map(([key, rounds]) => ({ month: key, label: getMonthLabel(rounds[0].played_at), rounds }))

  return { ...agregarRondas(rondas), roundsByMonth }
}

/**
 * Agrega el historial completo de un usuario: conteo hoyo-a-hoyo con pares
 * REALES, promedios vs par 18h/9h, mejores rondas, breakdown por cancha (solo
 * 18h) y agrupación por mes. Qué entra a cada número lo decide normalizarRondas
 * (fuente única compartida con /perfil/stats).
 *
 * Cualquier cambio acá impacta a la vez la página y el API (a propósito: una
 * sola fuente).
 */
export function computeHistorialStats(
  rawRounds: RawStatsRound[],
  allCourses: CourseCandidate[],
  allHoles: CourseHoleRow[],
): HistorialStats {
  return historialStatsDeRondas(normalizarRondas(rawRounds, allCourses, allHoles))
}
