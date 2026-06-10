/**
 * Estimación de costo por modelo (USD por 1M tokens). Para tracking de
 * presupuesto/observabilidad, NO para facturación. Modelos desconocidos → 0.
 *
 * Fuente alternativa a futuro: llm_models.cost_per_1m_tokens_* (Fase 4, DB-driven).
 */
type Rate = { in: number; out: number }

const RATES: Record<string, Rate> = {
  'claude-haiku-4-5': { in: 0.25, out: 1.25 },
  'claude-haiku-4-5-20251001': { in: 0.25, out: 1.25 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-4-7': { in: 15, out: 75 },
  // Fable 5 (GA 09-jun-2026): $10/$50 por 1M. Habilitable en el coach vía
  // COACH_MODEL=claude-fable-5 (src/golf/coach/model.ts) — ~3× sonnet-4-6.
  'claude-fable-5': { in: 10, out: 50 },
  'gemini-2.5-flash': { in: 0.1, out: 0.4 },
  'gemini-2.5-flash-lite': { in: 0.05, out: 0.2 },
}

export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const r = RATES[model]
  if (!r) return 0
  return (tokensIn * r.in + tokensOut * r.out) / 1_000_000
}
