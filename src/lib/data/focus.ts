/**
 * Capa de datos del motor de foco (cerebro v3, Ola 2). Acceso RLS-safe vía el
 * cliente autenticado del request — NO service_role. Sin lógica de golf acá:
 * sólo trae filas y las normaliza al shape RoundData / FocusTarget.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParPerHoleInput } from '@/golf/core/holes'
import type { RoundData } from '@/golf/coach/metrics'
import type { FocusTarget } from '@/golf/coach/v3/focus/types'

/**
 * `historical_rounds.scores` se guarda como array o, en filas legacy, como
 * objeto JSONB `{"1":4,...}`. Normaliza ambos a array indexado por hoyo (1-based).
 */
export function normalizeScores(raw: unknown): (number | null)[] | null {
  if (raw == null) return null
  if (Array.isArray(raw)) return raw as (number | null)[]
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const keys = Object.keys(obj)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 1)
    if (keys.length === 0) return null
    const max = Math.max(...keys)
    const arr: (number | null)[] = []
    for (let i = 1; i <= max; i++) {
      const v = obj[String(i)]
      arr.push(typeof v === 'number' ? v : null)
    }
    return arr
  }
  return null
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Todas las rondas del jugador (sin límite) en shape RoundData, recientes primero. */
export async function loadFocusRounds(
  supabase: SupabaseClient,
  userId: string,
): Promise<RoundData[]> {
  const { data, error } = await supabase
    .from('historical_rounds')
    .select('id, scores, total_gross, par_per_hole, played_at, metadata')
    .eq('user_id', userId)
    .order('played_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: String((r as { id: unknown }).id),
    scores: normalizeScores((r as { scores: unknown }).scores),
    total_gross: numOrNull((r as { total_gross: unknown }).total_gross),
    par_per_hole: (r as { par_per_hole: ParPerHoleInput }).par_per_hole,
    played_at: String((r as { played_at: unknown }).played_at ?? ''),
    metadata: ((r as { metadata: unknown }).metadata ?? null) as Record<string, unknown> | null,
  }))
}

/** Handicap actual (índice) + meta del jugador. Campos target_* de la migración Ola 2. */
export async function loadFocusTarget(
  supabase: SupabaseClient,
  userId: string,
): Promise<FocusTarget> {
  const { data, error } = await supabase
    .from('profiles')
    .select('indice, target_handicap, target_deadline')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return {
    currentHandicap: numOrNull(data?.indice),
    targetHandicap: numOrNull(data?.target_handicap),
    targetDeadline: (data?.target_deadline as string | null) ?? null,
  }
}
