/**
 * Inputs PRIVADOS del GWI derivados del historial y de los patrones del coach
 * de cada jugador. Sólo se usan en el servidor (ver contrato en `./gwi.ts`).
 * Fuente única para las dos rutas `/api/gwi/*`: antes cada una tenía su copia
 * del filtro 9h/18h, del promedio y del mapeo de patrones.
 */

import { inferHoles } from '../core/holes'
import type { JugadorGWIInput } from './gwi'

export interface RondaHistoricaGWI {
  total_gross: number
  course_name?: string | null
  holes_played?: number | null
  scores?: number[] | null
}

/** Los únicos tipos de patrón del coach que el GWI modela. */
export const TIPOS_PATRON_GWI = ['back_nine_collapse', 'post_bogey_spiral'] as const
export type TipoPatronGWI = typeof TIPOS_PATRON_GWI[number]

export interface PatronGWIRow {
  pattern_type: string
  confidence: number
  metadata: Record<string, number> | null
}

export interface HistorialGWI {
  historicalAvg: number | null
  historicalRoundsCount: number
  courseAvg: number | null
  courseRoundsCount: number
}

export const SIN_HISTORIAL: HistorialGWI = { historicalAvg: null, historicalRoundsCount: 0, courseAvg: null, courseRoundsCount: 0 }

const promedioVsPar = (rondas: RondaHistoricaGWI[], parTotal: number) =>
  Math.round((rondas.reduce((s, r) => s + r.total_gross, 0) / rondas.length - parTotal) * 10) / 10

/**
 * Promedio histórico (y en esta cancha) vs par, sobre las rondas del MISMO tipo
 * (9 o 18 hoyos; `inferHoles` resuelve `holes_played` NULL desde `scores`):
 * mezclar 9h con 18h contamina el GWI. `rondas` viene ordenada de la más reciente
 * a la más antigua; `ventana.revisadas` acota cuántas se miran y `ventana.usadas`
 * cuántas del tipo correcto entran al promedio. Sin `cancha` = sin promedio por
 * cancha (la ruta de torneo no lo usa).
 */
export function historialGWI(
  rondas: RondaHistoricaGWI[],
  opts: {
    totalHoyos: number
    parTotal: number
    ventana: { revisadas: number; usadas: number }
    cancha?: { nombre: string | null }
  },
): HistorialGWI {
  const targetHoles = opts.totalHoyos <= 9 ? 9 : 18
  const delTipo = rondas
    .slice(0, opts.ventana.revisadas)
    .filter(r => inferHoles(r) === targetHoles)
    .slice(0, opts.ventana.usadas)
  if (delTipo.length === 0) return SIN_HISTORIAL

  const enLaCancha = opts.cancha ? delTipo.filter(r => r.course_name === opts.cancha!.nombre) : []
  return {
    historicalAvg: promedioVsPar(delTipo, opts.parTotal),
    historicalRoundsCount: delTipo.length,
    courseAvg: enLaCancha.length > 0 ? promedioVsPar(enLaCancha, opts.parTotal) : null,
    courseRoundsCount: enLaCancha.length,
  }
}

/**
 * Patrones activos del coach → `patterns` del GWI. Sin patrones = null.
 * `incluir` decide qué tipos entran (ver la ruta de torneo, que sólo usa el
 * colapso del back 9).
 */
export function patronesGWI(
  pats: PatronGWIRow[],
  incluir: ReadonlyArray<TipoPatronGWI> = TIPOS_PATRON_GWI,
): JugadorGWIInput['patterns'] {
  if (pats.length === 0) return null
  const out: NonNullable<JugadorGWIInput['patterns']> = {}
  for (const p of pats) {
    if (p.pattern_type === 'back_nine_collapse' && incluir.includes('back_nine_collapse')) {
      out.back9Collapse = { confidence: p.confidence, avgDiff: p.metadata?.diff ?? 3 }
    }
    if (p.pattern_type === 'post_bogey_spiral' && incluir.includes('post_bogey_spiral')) {
      out.postBogeySpiral = { confidence: p.confidence }
    }
  }
  return out
}
