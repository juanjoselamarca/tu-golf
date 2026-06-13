/**
 * Estimación de costo por modelo (USD por 1M tokens). Para tracking de
 * presupuesto/observabilidad, NO para facturación. Modelos desconocidos → 0.
 *
 * Cache-aware (PR-0 medición de costo, 2026-06-12): el coach usa prompt caching
 * agresivo (cache_control ephemeral). Sin contar el caché el costo del coach sale
 * MAL — el cache_read es 0.1× el input y el cache_write 1.25×. El número honesto
 * de "costo por conversación" depende de esto.
 *
 * Tarifas de caché de Anthropic: write = input × 1.25, read = input × 0.10.
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

/** Multiplicadores de caché de Anthropic sobre la tarifa de input. */
const CACHE_WRITE_MULT = 1.25
const CACHE_READ_MULT = 0.1

export interface TokenUsage {
  /** Input NO servido de caché (lo que Anthropic llama `input_tokens` cuando hay caché). */
  tokensIn: number
  tokensOut: number
  /** Input servido de caché de prompt (0.1× tarifa input). */
  cacheRead?: number
  /** Input escrito a caché de prompt (1.25× tarifa input). */
  cacheWrite?: number
}

/**
 * Costo estimado en USD. Dos firmas:
 *  - `estimateCostUsd(model, { tokensIn, tokensOut, cacheRead?, cacheWrite? })` — cache-aware.
 *  - `estimateCostUsd(model, tokensIn, tokensOut)` — legacy posicional (call-sites del gateway).
 */
export function estimateCostUsd(model: string, usage: TokenUsage): number
export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number
export function estimateCostUsd(
  model: string,
  usageOrTokensIn: TokenUsage | number,
  tokensOut?: number,
): number {
  const r = RATES[model]
  if (!r) return 0
  const u: TokenUsage =
    typeof usageOrTokensIn === 'number'
      ? { tokensIn: usageOrTokensIn, tokensOut: tokensOut ?? 0 }
      : usageOrTokensIn
  const cacheRead = u.cacheRead ?? 0
  const cacheWrite = u.cacheWrite ?? 0
  return (
    (u.tokensIn * r.in +
      cacheWrite * r.in * CACHE_WRITE_MULT +
      cacheRead * r.in * CACHE_READ_MULT +
      u.tokensOut * r.out) /
    1_000_000
  )
}
