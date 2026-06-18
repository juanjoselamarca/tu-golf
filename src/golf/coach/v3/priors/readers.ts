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

export interface MeanPoint {
  /** hándicap exacto del punto publicado (ej 0, 5, 10, 15, 20, 25) */
  handicap: number;
  /** media verificada de la métrica en ese hándicap (unidades externas crudas) */
  mean: number;
}

/**
 * Interpola linealmente la MEDIA verificada en el índice EXACTO del jugador,
 * sobre los puntos publicados (capa A, medias Shot Scope). En los extremos
 * satura al punto más cercano: NO extrapola fuera del rango publicado, porque un
 * número fuera de la evidencia violaría CERO FALLOS. Devuelve null sin puntos.
 *
 * Interpolar una media ENTRE dos medias verificadas, sobre la curva monótona por
 * hándicap, es lectura transparente de la evidencia — no inventa la FORMA de la
 * distribución (eso sería el percentil de sub-métrica, que NO derivamos; ver
 * metric-map.distributionVerified).
 */
export function interpolateMeanAtIndex(points: MeanPoint[], index: number): number | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.handicap - b.handicap);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (index <= first.handicap) return first.mean;
  if (index >= last.handicap) return last.mean;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (index >= a.handicap && index <= b.handicap) {
      const span = b.handicap - a.handicap;
      return span === 0 ? a.mean : a.mean + ((b.mean - a.mean) * (index - a.handicap)) / span;
    }
  }
  return last.mean;
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
 * Media verificada del benchmark (capa A) interpolada al índice EXACTO del
 * jugador. Lee las filas percentile=50 (medias por punto de hándicap, etiquetadas
 * '0'/'5'/.../'25' en handicap_bucket) de un metricKey externo y las interpola.
 * Devuelve null si no hay medias sembradas o el índice no es finito. SÓLO medias
 * (percentile=50): los percentiles de sub-métricas NO se publican (ver
 * metric-map.distributionVerified) — por eso este reader no asume forma alguna.
 */
export async function getBenchmarkMeanAtIndex(
  supabase: SupabaseClient,
  externalMetricKey: string,
  index: number,
): Promise<number | null> {
  if (!Number.isFinite(index)) return null;
  const { data, error } = await supabase
    .from('external_priors_amateur_benchmarks')
    .select('handicap_bucket, value')
    .eq('metric_key', externalMetricKey)
    .eq('percentile', 50);
  if (error || !data) return null;
  const points: MeanPoint[] = [];
  for (const r of data as Array<{ handicap_bucket: string; value: number }>) {
    const handicap = Number(r.handicap_bucket);
    const mean = Number(r.value);
    if (Number.isFinite(handicap) && Number.isFinite(mean)) points.push({ handicap, mean });
  }
  return interpolateMeanAtIndex(points, index);
}

/** Prior listo para shrink(), en escala interna del catálogo. */
export interface InternalPrior {
  priorMean: number;
  /** varianza entre-jugadores (= sdTotal² del benchmark, que es entre-jugadores) */
  tau2Between: number;
  /** varianza ronda-a-ronda poblacional (de METRIC_PRIOR_MAP.withinRoundSd) */
  sigma2Within: number;
}

/**
 * Prior en la escala INTERNA del catálogo para un metricKey de foco, listo
 * para shrink(). Aplica la conversión de unidades de METRIC_PRIOR_MAP. Devuelve
 * null si el metricKey no tiene benchmark mapeado o no hay data suficiente.
 */
export async function getInternalPrior(
  supabase: SupabaseClient,
  bucket: HandicapBucket,
  focusMetricKey: string,
): Promise<InternalPrior | null> {
  const mapping = priorMappingFor(focusMetricKey);
  if (!mapping) return null;
  const points = await getBenchmarkPercentiles(supabase, bucket, mapping.externalMetricKey);
  const summary = summarizeDistribution(points);
  if (!summary) return null;
  // la sd es invariante ante el shift de unidades (resta de par); el benchmark
  // es entre-jugadores ⇒ sdTotal² = tau2Between directo.
  return {
    priorMean: mapping.toInternal(summary.mean),
    tau2Between: summary.sdTotal * summary.sdTotal,
    sigma2Within: mapping.withinRoundSd * mapping.withinRoundSd,
  };
}

export async function getPopulationPercentile(
  supabase: SupabaseClient,
  index: number,
  region = 'GLOBAL',
): Promise<number | null> {
  const { data, error } = await supabase
    .from('external_priors_handicap_dist')
    .select('handicap_bin, proportion, year')
    .eq('region', region)
    .eq('gender', 'all')
    .eq('age_bucket', 'all');
  if (error || !data) return null;
  // Code-review I2: si conviven varios años para el mismo corte, sumar sus bins
  // daría proporciones >1 y percentil corrupto. Acotamos al año más reciente
  // (una única distribución vigente). NOTA: scoping por source_id queda como
  // follow-up obligatorio antes de ingerir una 2ª fuente de capa B.
  const rows = data as Array<DistBin & { year?: number | null }>;
  const years = rows.map((r) => r.year).filter((y): y is number => typeof y === 'number');
  const maxYear = years.length ? Math.max(...years) : null;
  const scoped = maxYear != null ? rows.filter((r) => r.year === maxYear) : rows;
  return populationPercentileFromBins(scoped, index);
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
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as CourseNorm;
}
