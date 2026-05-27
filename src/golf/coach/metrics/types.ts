export type ComputedMetric = {
  value: number | null
  reason: string
  metadata?: Record<string, unknown>
}
