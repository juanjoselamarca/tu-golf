/**
 * Catálogo de foco cargado desde `pattern_definitions` (Ola 3 — el cerebro
 * guarda y crece). La metadata declarativa (label, acción, umbrales, estado)
 * vive en la DB; la matemática gen-0 sigue en código, ligada por `pattern_key`
 * vía MEASURE_BY_KEY. Cambiar acción/estado/umbral de un patrón = UPDATE, no merge.
 *
 * Fallback al catálogo de código si la DB está vacía o falla — el coach nunca
 * se queda sin patrones (CERO FALLOS).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { FOCUS_CATALOG, MEASURE_BY_KEY, type FocusCandidate } from './catalog'

interface PatternDefRow {
  pattern_key: string
  name: string
  formula_payload: {
    metric_key?: string
    accion?: string
    min_confidence?: number
    min_sample?: number
  } | null
}

export async function loadFocusCatalog(supabase: SupabaseClient): Promise<FocusCandidate[]> {
  const { data, error } = await supabase
    .from('pattern_definitions')
    .select('pattern_key, name, formula_payload')
    .eq('status', 'active')

  if (error || !data || data.length === 0) return FOCUS_CATALOG

  const candidates: FocusCandidate[] = []
  for (const row of data as PatternDefRow[]) {
    const measure = MEASURE_BY_KEY[row.pattern_key]
    if (!measure) continue // sin binding de código (gen-0) → se ignora; declarativo full = Ola 5
    const p = row.formula_payload ?? {}
    // Fila incompleta (acción/métrica faltante): NO emitir un foco con acción vacía
    // al coach — se salta y cae a los demás candidatos / fallback (CERO FALLOS).
    if (!p.accion || !p.metric_key) continue
    candidates.push({
      patternId: row.pattern_key,
      metricKey: p.metric_key,
      label: row.name,
      accion: p.accion,
      minConfidence: typeof p.min_confidence === 'number' ? p.min_confidence : 0.5,
      minSample: typeof p.min_sample === 'number' ? p.min_sample : 3,
      measure,
    })
  }
  // Si por algún motivo no quedó ninguno ligable, fallback al código.
  return candidates.length > 0 ? candidates : FOCUS_CATALOG
}
