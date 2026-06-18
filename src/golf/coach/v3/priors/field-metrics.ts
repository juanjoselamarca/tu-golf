// src/golf/coach/v3/priors/field-metrics.ts
// Métricas que field_context puede contextualizar "vs lo normal de tu hándicap",
// independientes del catálogo de FOCO. field_context sitúa cualquier métrica con
// benchmark externo (ej. par-4/par-5 avg vs par), aunque NO sea un patrón que el
// coach elija como foco — por eso vive acá y no en FOCUS_CATALOG.
import type { ComputedMetric, RoundData } from '@/golf/coach/metrics'
import { computePar3VsPar, computePar4VsPar, computePar5VsPar } from '@/golf/coach/metrics'

export interface FieldBaseline {
  valor: number
  muestra: number
}

interface FieldMetricDef {
  label: string
  measure: (round: RoundData) => ComputedMetric
}

/** Registro de métricas contextualizables por field_context. */
export const FIELD_METRICS: Record<string, FieldMetricDef> = {
  par3_avg_vs_par: { label: 'Juego en par 3', measure: computePar3VsPar },
  par4_avg_vs_par: { label: 'Juego en par 4', measure: computePar4VsPar },
  par5_avg_vs_par: { label: 'Juego en par 5', measure: computePar5VsPar },
}

/** Etiqueta legible de una métrica de field_context (null si no está registrada). */
export function fieldMetricLabel(metricKey: string): string | null {
  return FIELD_METRICS[metricKey]?.label ?? null
}

/**
 * Promedio de la métrica per-ronda sobre las rondas con valor no nulo (misma
 * matemática que el `aggregate` del catálogo de foco). Devuelve null si la
 * métrica no está registrada o no hay rondas con dato. CERO FALLOS: nunca lanza.
 */
export function measureFieldMetric(rounds: RoundData[], metricKey: string): FieldBaseline | null {
  const def = FIELD_METRICS[metricKey]
  if (!def) return null
  let sum = 0
  let n = 0
  for (const r of rounds) {
    const m = def.measure(r)
    if (m.value != null) {
      sum += m.value
      n++
    }
  }
  if (n === 0) return null
  return { valor: Math.round((sum / n) * 100) / 100, muestra: n }
}
