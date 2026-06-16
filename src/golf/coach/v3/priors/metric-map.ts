// src/golf/coach/v3/priors/metric-map.ts
// Liga cada metricKey del catálogo de foco (escala interna del baseline,
// vs-par / orientación PLAN_METRIC) con el benchmark externo
// (external_priors_amateur_benchmarks.metric_key, en unidades crudas).
// Sin este mapeo el shrinkage mezclaría peras con manzanas (spec §4).
//
// Solo se mapean métricas con benchmark externo confiable y unidades
// reconciliables. Una métrica sin entrada acá NO recibe shrinkage
// (el motor usa el valor del jugador tal cual).

export interface PriorMapping {
  /** metric_key en external_priors_amateur_benchmarks */
  externalMetricKey: string;
  /** convierte el valor externo (unidades crudas) a la escala interna del baseline */
  toInternal: (externalValue: number) => number;
  /**
   * Desvío estándar ronda-a-ronda POBLACIONAL del bucket (no del jugador), en
   * escala interna. Alimenta sigma2Within del shrinkage. PRELIMINAR: a verificar
   * con la curaduría de números (mismo paso que reemplaza el seed preliminar).
   */
  withinRoundSd: number;
  /**
   * Dirección de calidad: true = menos es mejor (scores vs par, three-putts,
   * dispersión). Lo usa field_context para situar al jugador en su bucket. Las
   * métricas de foco son todas "menos es mejor"; el flag lo deja explícito.
   */
  lowerIsBetter: boolean;
}

export const METRIC_PRIOR_MAP: Record<string, PriorMapping> = {
  // Catálogo: par3_avg_vs_par = promedio en par 3 RESPECTO a par (ej +0.6).
  // Externo: score_par3 = strokes absolutos (ej 3.6). Conversión: restar par (3).
  // El benchmark de capa A es una distribución ENTRE-JUGADORES (promedios por
  // jugador) ⇒ su spread es tau2Between directo, sin restar within.
  par3_avg_vs_par: {
    externalMetricKey: 'score_par3',
    toInternal: (v) => v - 3,
    withinRoundSd: 0.5, // PRELIMINAR
    lowerIsBetter: true,
  },
};

export function priorMappingFor(metricKey: string): PriorMapping | null {
  return METRIC_PRIOR_MAP[metricKey] ?? null;
}
