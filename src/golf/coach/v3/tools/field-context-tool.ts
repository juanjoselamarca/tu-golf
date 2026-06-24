/**
 * Tool `field_context` (cerebro v3, Ola 1b §5.2). Le da al coach el "campo" donde
 * juega el jugador en TRES capas de priors externos:
 *   A) vs su hándicap: su valor vs la MEDIA verificada de su nivel (delta-vs-promedio,
 *      NO percentil: las distribuciones por hándicap no se publican — ver metric-map).
 *   B) ranking poblacional: "mejor que X% de los golfistas con hándicap".
 *   C) dificultad de la cancha vs la banda de referencia de su par.
 *
 * ANTI-ALUCINACIÓN (spec §5.2): el índice y la cancha se leen del usuario
 * autenticado SERVER-SIDE (mismo patrón que get_playing_handicap). El LLM SOLO
 * pasa `metric_key` — nunca el hándicap ni el percentil, así no los puede inventar.
 *
 * Se ofrece al modelo sólo con cerebro_v3_enabled. Se despacha por `executeTool`
 * (tools.ts), igual que get_playing_handicap, porque necesita el cliente
 * autenticado del request (RLS owner_read) — handleToolUse sólo trae userId.
 */
import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoundData } from '@/golf/coach/metrics'
import { loadFocusRounds } from '@/lib/data/focus'
import { measureFieldMetric, fieldMetricLabel } from '@/golf/coach/v3/priors/field-metrics'
import { priorMappingFor } from '@/golf/coach/v3/priors/metric-map'
import {
  getBenchmarkMeanAtIndex,
  getPopulationPercentile,
  getCourseNorm,
  type BenchmarkPoint,
} from '@/golf/coach/v3/priors/readers'
import { buildFieldContext, type FieldContextResult } from '@/golf/coach/v3/priors/field-context'

export const FIELD_CONTEXT_TOOL: Anthropic.Tool = {
  name: 'field_context',
  description:
    'Sitúa al jugador en su "campo": (A) cómo está esa métrica vs lo normal para SU hándicap, ' +
    '(B) en qué percentil poblacional está su índice ("mejor que X% de los golfistas"), y ' +
    '(C) qué tan difícil es su cancha reciente vs una de referencia. Úsala para dar perspectiva ' +
    'realista ("para tu hándicap, esto ya es bueno" o "acá tienes margen"). NUNCA inventes percentiles ' +
    'ni el hándicap: esta tool los calcula con datos reales del jugador. Tú solo eliges QUÉ métrica contextualizar.',
  input_schema: {
    type: 'object',
    properties: {
      metric_key: {
        type: 'string',
        description:
          'Métrica a contextualizar: "par3_avg_vs_par", "par4_avg_vs_par" o "par5_avg_vs_par" (tu promedio respecto a par en ese tipo de hoyo). Si la omitís, igual devuelve el ranking poblacional y la dificultad de cancha.',
      },
    },
    required: [],
  },
}

export type FieldContextToolResult = { ok: true; data: FieldContextResult } | { ok: false; error: string }

export interface FieldContextDeps {
  loadIndice: (userId: string) => Promise<number | null>
  loadRounds: (userId: string) => Promise<RoundData[]>
  /**
   * Media verificada del benchmark interpolada al índice EXACTO del jugador
   * (escala EXTERNA cruda; la conversión a interna se hace acá). null = sin media
   * sembrada. Sólo media (no percentiles): ver metric-map.distributionVerified.
   */
  loadBenchmarkMean: (externalMetricKey: string, indice: number) => Promise<number | null>
  loadPopulationBetterThanPct: (indice: number) => Promise<number | null>
  loadRecentCourse: (
    userId: string,
  ) => Promise<{ nombre: string; par: number | null; slope: number | null; course_rating: number | null } | null>
  loadBand: (par: number) => Promise<{ slope: number | null; course_rating: number | null } | null>
}

/** Deps reales sobre el cliente autenticado del request. */
export function defaultFieldContextDeps(supabase: SupabaseClient): FieldContextDeps {
  return {
    loadIndice: async (userId) => {
      const { data } = await supabase.from('profiles').select('indice').eq('id', userId).maybeSingle()
      return typeof data?.indice === 'number' ? data.indice : null
    },
    loadRounds: (userId) => loadFocusRounds(supabase, userId),
    loadBenchmarkMean: (externalMetricKey, indice) =>
      getBenchmarkMeanAtIndex(supabase, externalMetricKey, indice),
    loadPopulationBetterThanPct: (indice) => getPopulationPercentile(supabase, indice),
    loadRecentCourse: async (userId) => {
      const { data: round } = await supabase
        .from('historical_rounds')
        .select('course_id')
        .eq('user_id', userId)
        .not('course_id', 'is', null)
        .order('played_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const courseId = (round as { course_id?: string | null } | null)?.course_id
      if (!courseId) return null
      const { data: c } = await supabase
        .from('courses')
        .select('nombre, par_total, slope_rating, course_rating')
        .eq('id', courseId)
        .maybeSingle()
      if (!c) return null
      const row = c as { nombre?: string; par_total?: number | null; slope_rating?: number | null; course_rating?: number | null }
      return {
        nombre: row.nombre ?? 'tu cancha',
        par: typeof row.par_total === 'number' ? row.par_total : null,
        slope: typeof row.slope_rating === 'number' ? row.slope_rating : null,
        course_rating: typeof row.course_rating === 'number' ? row.course_rating : null,
      }
    },
    loadBand: async (par) => {
      const norm = await getCourseNorm(supabase, par)
      if (!norm) return null
      return { slope: norm.slope_rating, course_rating: norm.course_rating }
    },
  }
}

function metricLabelFor(metricKey: string): string {
  return fieldMetricLabel(metricKey) ?? metricKey
}

/**
 * Ejecuta la tool. `metric_key` es el ÚNICO input del LLM; todo lo demás se
 * resuelve server-side. Degradación conservadora (CERO FALLOS): si una capa no
 * tiene datos, esa capa reporta `disponible:false` con motivo; nunca rompe el chat.
 */
export async function fieldContext(
  ctx: { supabase: SupabaseClient; userId: string },
  input: Record<string, unknown>,
  deps: FieldContextDeps = defaultFieldContextDeps(ctx.supabase),
): Promise<FieldContextToolResult> {
  const metricKey = typeof input.metric_key === 'string' && input.metric_key.trim() ? input.metric_key.trim() : null

  const [indice, rounds, recentCourse] = await Promise.all([
    deps.loadIndice(ctx.userId),
    deps.loadRounds(ctx.userId),
    deps.loadRecentCourse(ctx.userId),
  ])

  // ── Capa A: valor del jugador vs benchmark del bucket ──────────────────
  const mapping = metricKey ? priorMappingFor(metricKey) : null
  let benchmarkInternal: BenchmarkPoint[] = []
  let lowerIsBetter = true
  // El valor del jugador se computa siempre que la métrica esté registrada en
  // FIELD_METRICS (par-3/4/5), así el motivo de degradación es exacto (distingue
  // "sin rondas" de "sin benchmark").
  const playerBaseline = metricKey ? measureFieldMetric(rounds, metricKey) : null
  const playerValue = playerBaseline ? playerBaseline.valor : null
  // Gate CERO FALLOS: la capa A (vs tu hándicap) sólo se arma con una MEDIA
  // verificada (meanVerified). El valor es la media de Shot Scope interpolada al
  // índice EXACTO del jugador. Se pasa como único punto p50 ⇒ buildFieldContext
  // da delta-vs-promedio y NO afirma percentil de sub-métrica (betterThanPct
  // exige >=2 puntos → null). El percentil exigiría distributionVerified, que
  // sigue en false (los percentiles por hándicap no se publican). Honesto por
  // construcción. Capas B y C son independientes.
  if (metricKey && mapping && mapping.meanVerified && indice != null) {
    const mean = await deps.loadBenchmarkMean(mapping.externalMetricKey, indice)
    if (mean != null) {
      benchmarkInternal = [{ percentile: 50, value: mapping.toInternal(mean) }]
      lowerIsBetter = mapping.lowerIsBetter
    }
  }

  // ── Capa B: ranking poblacional del índice ────────────────────────────
  const populationBetterThanPct = indice != null ? await deps.loadPopulationBetterThanPct(indice) : null

  // ── Capa C: dificultad de la cancha reciente vs banda ─────────────────
  const band = recentCourse && recentCourse.par != null ? await deps.loadBand(recentCourse.par) : null

  const result = buildFieldContext({
    metricLabel: metricKey ? metricLabelFor(metricKey) : 'tu juego',
    playerValue,
    benchmarkInternal,
    lowerIsBetter,
    indice,
    populationBetterThanPct,
    course: recentCourse,
    band,
  })
  return { ok: true, data: result }
}
