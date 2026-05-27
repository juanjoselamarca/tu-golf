import type { ParPerHoleInput } from '@/golf/core/holes'

export type ComputedMetric = {
  value: number | null
  reason: string
  metadata?: Record<string, unknown>
}

export interface RoundData {
  id: string
  scores: (number | null)[] | null
  total_gross: number | null
  // BD guarda JSONB objeto `{"1":4,...}`. Aceptamos ambos shapes para tolerar
  // legacy + tests con arrays. Normalizar siempre con `parPerHoleArray()`
  // antes de usar — NO castear directo a `number[]`.
  par_per_hole: ParPerHoleInput
  played_at: string
  metadata: Record<string, unknown> | null
}
