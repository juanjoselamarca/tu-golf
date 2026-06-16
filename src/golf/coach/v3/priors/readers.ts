// src/golf/coach/v3/priors/readers.ts
// Lecturas tipadas de los priors externos (Ola 1b). La lógica de resumen es
// pura (testeable sin DB); los fetchers son envoltorios finos sobre Supabase
// con inyección de cliente (patrón loadFocusCatalog).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HandicapBucket } from './buckets';
import { priorMappingFor } from './metric-map';

export interface BenchmarkPoint {
  percentile: number;
  value: number;
}

/** Resumen de la distribución del prior, en unidades EXTERNAS (crudas). */
export interface PriorSummary {
  mean: number;
  /** desvío estándar TOTAL de la población (entre-jugadores + ruido ronda-a-ronda) */
  sdTotal: number;
}

export interface CourseNorm {
  par: number | null;
  slope_rating: number | null;
  course_rating: number | null;
}

// ── Lógica pura ──────────────────────────────────────────────────────────

/**
 * Resume percentiles en {mean, sdTotal}. mean ≈ p50; sd estimada del rango
 * p10–p90 (≈ 2.563σ para normal) con fallback a IQR p25–p75 (≈ 1.349σ).
 * Devuelve null si no hay forma de estimar la dispersión.
 */
export function summarizeDistribution(points: BenchmarkPoint[]): PriorSummary | null {
  if (points.length === 0) return null;
  const byP = new Map<number, number>(points.map((p) => [p.percentile, p.value]));
  const values = points.map((p) => p.value).sort((a, b) => a - b);
  const mean = byP.get(50) ?? values[Math.floor(values.length / 2)];

  let sdTotal: number | null = null;
  const p10 = byP.get(10);
  const p90 = byP.get(90);
  if (p10 != null && p90 != null) {
    sdTotal = (p90 - p10) / 2.563;
  } else {
    const p25 = byP.get(25);
    const p75 = byP.get(75);
    if (p25 != null && p75 != null) sdTotal = (p75 - p25) / 1.349;
  }
  if (sdTotal == null || sdTotal <= 0) return null;
  return { mean, sdTotal };
}

export interface DistBin {
  handicap_bin: string;
  proportion: number;
}

function binLowerBound(bin: string): number {
  const n = parseInt(bin, 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Percentil poblacional: "mejor que X% de los golfistas" (0–100).
 * Menos hándicap = mejor. Aproximación v1: proporción en bins con cota inferior
 * estrictamente mayor (peores) + mitad del bin propio.
 */
export function populationPercentileFromBins(bins: DistBin[], index: number): number | null {
  if (bins.length === 0) return null;
  const sorted = [...bins].sort((a, b) => binLowerBound(a.handicap_bin) - binLowerBound(b.handicap_bin));
  // bin propio: el de mayor cota inferior que sea <= index
  let ownIdx = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (binLowerBound(sorted[i].handicap_bin) <= index) ownIdx = i;
  }
  const ownLower = binLowerBound(sorted[ownIdx].handicap_bin);
  let worse = 0;
  for (const b of sorted) {
    if (binLowerBound(b.handicap_bin) > ownLower) worse += b.proportion;
  }
  const betterThan = worse + sorted[ownIdx].proportion / 2;
  return Math.round(Math.min(1, Math.max(0, betterThan)) * 100);
}

// ── Fetchers (Supabase, cliente inyectado) ───────────────────────────────

export async function getBenchmarkPercentiles(
  supabase: SupabaseClient,
  bucket: HandicapBucket,
  externalMetricKey: string,
): Promise<BenchmarkPoint[]> {
  const { data, error } = await supabase
    .from('external_priors_amateur_benchmarks')
    .select('percentile, value')
    .eq('handicap_bucket', bucket)
    .eq('metric_key', externalMetricKey)
    .order('percentile', { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({ percentile: Number(r.percentile), value: Number(r.value) }));
}

/**
 * Prior en la escala INTERNA del catálogo para un metricKey de foco.
 * Aplica la conversión de unidades de METRIC_PRIOR_MAP. Devuelve null si el
 * metricKey no tiene benchmark mapeado o no hay data suficiente.
 */
export async function getInternalPrior(
  supabase: SupabaseClient,
  bucket: HandicapBucket,
  focusMetricKey: string,
): Promise<PriorSummary | null> {
  const mapping = priorMappingFor(focusMetricKey);
  if (!mapping) return null;
  const points = await getBenchmarkPercentiles(supabase, bucket, mapping.externalMetricKey);
  const summary = summarizeDistribution(points);
  if (!summary) return null;
  // convertir media a escala interna; la sd es invariante ante el shift (resta de par)
  return { mean: mapping.toInternal(summary.mean), sdTotal: summary.sdTotal };
}

export async function getPopulationPercentile(
  supabase: SupabaseClient,
  index: number,
  region = 'GLOBAL',
): Promise<number | null> {
  const { data, error } = await supabase
    .from('external_priors_handicap_dist')
    .select('handicap_bin, proportion')
    .eq('region', region)
    .eq('gender', 'all')
    .eq('age_bucket', 'all');
  if (error || !data) return null;
  return populationPercentileFromBins(data as DistBin[], index);
}

export async function getCourseNorm(
  supabase: SupabaseClient,
  par: number,
  region = 'GLOBAL',
): Promise<CourseNorm | null> {
  const { data, error } = await supabase
    .from('external_priors_course_norms')
    .select('par, slope_rating, course_rating')
    .eq('region', region)
    .eq('par', par)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as CourseNorm;
}
