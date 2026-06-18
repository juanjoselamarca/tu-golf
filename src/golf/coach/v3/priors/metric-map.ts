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
  /**
   * Gate de calidad de dato (CERO FALLOS) — la MEDIA del bucket por hándicap está
   * VERIFICADA y es citable (no provisional). Habilita SOLO el delta-vs-promedio
   * de field_context capa A ("para tu hándicap lo normal es X; vos hacés Y").
   * NUNCA habilita un percentil (eso requiere la distribución, gate aparte).
   * par3 = true: medias por par-type publicadas por Shot Scope (N>100k), citadas.
   */
  meanVerified: boolean;
  /**
   * Gate de calidad de dato (CERO FALLOS) — la DISTRIBUCIÓN/percentiles por
   * hándicap está VERIFICADA contra dato real publicado (no solo la media, no
   * derivada con un modelo). Habilita (a) el shrinkage empirical-Bayes en
   * get-focus y (b) cualquier afirmación de PERCENTIL de sub-métrica en
   * field_context. Hoy SIEMPRE false: las distribuciones por hándicap NO se
   * publican (Broadie las omite, DECADE las encierra, USGA no las da por hoyo);
   * derivar un percentil con un modelo sería precisión de teatro → prohibido. Se
   * activará al computar la distribución real desde nuestra data con N suficiente
   * por bucket, o al licenciar un dataset con percentiles reales.
   */
  distributionVerified: boolean;
}

export const METRIC_PRIOR_MAP: Record<string, PriorMapping> = {
  // Catálogo: par3_avg_vs_par = promedio en par 3 RESPECTO a par (ej +0.6).
  // Externo: score_par3 = strokes absolutos (ej 3.6). Conversión: restar par (3).
  // El benchmark de capa A es una distribución ENTRE-JUGADORES (promedios por
  // jugador) ⇒ su spread es tau2Between directo, sin restar within.
  par3_avg_vs_par: {
    externalMetricKey: 'score_par3',
    toInternal: (v) => v - 3,
    withinRoundSd: 0.5, // PRELIMINAR — sólo alimentaría el shrinkage, hoy apagado
    lowerIsBetter: true,
    // Media por hándicap VERIFICADA (Shot Scope, medias por par-type) → delta-vs-promedio vivo.
    meanVerified: true,
    // Percentiles por hándicap NO publicados → shrinkage y percentil siguen apagados.
    distributionVerified: false,
  },
};

export function priorMappingFor(metricKey: string): PriorMapping | null {
  return METRIC_PRIOR_MAP[metricKey] ?? null;
}
