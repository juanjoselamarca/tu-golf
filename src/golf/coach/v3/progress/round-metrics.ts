/**
 * Métricas relativas por ronda (cerebro v3, Ola 2) — la base de "ver avance".
 *
 * Usa el `diferencial` WHS ya calculado por ronda (difficulty-adjusted) en vez de
 * reinventar la matemática de course handicap. delta_vs_handicap_expected =
 * diferencial − índice: negativo = jugaste mejor que tu handicap esa vuelta.
 *
 * v1 SOLO 18 hoyos: el diferencial de 9h está en otra escala (no comparable al
 * índice 18h) — mezclarlos es el bug histórico 9h/18h. 9h queda como follow-up
 * con el escalado WHS correcto. Nunca producimos un número que no es comparable.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { parPerHoleArray, type ParPerHoleInput } from '@/golf/core/holes'

export interface HistoricalRoundRow {
  id: string
  total_gross: number | null
  holes_played: number | null
  par_per_hole: ParPerHoleInput | null
  diferencial: number | string | null
  excluded_from_handicap: boolean | null
}

export interface RoundMetricInsert {
  round_id: string
  user_id: string
  strokes_over_par_round: number
  delta_vs_handicap_expected: number
  delta_vs_target_handicap: number | null
  holes_played: number
  par_cancha: number
  handicap_at_time: number | null
  target_at_time: number | null
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Computa las métricas relativas de UNA ronda, o null si no es elegible
 * (no inventa: 9h, excluida, sin diferencial/par/índice/gross → null).
 */
export function computeRoundMetric(
  round: HistoricalRoundRow,
  userId: string,
  indice: number | null,
  target: number | null,
): RoundMetricInsert | null {
  if (round.excluded_from_handicap) return null
  if (round.holes_played !== 18) return null
  if (typeof round.total_gross !== 'number') return null
  if (indice == null) return null
  const dif = toNum(round.diferencial)
  if (dif == null) return null
  const parArr = round.par_per_hole ? parPerHoleArray(round.par_per_hole) : null
  if (!parArr || parArr.length !== 18) return null

  const par_cancha = parArr.reduce((a, b) => a + b, 0)
  const hasTarget = target != null
  return {
    round_id: round.id,
    user_id: userId,
    strokes_over_par_round: round.total_gross - par_cancha,
    delta_vs_handicap_expected: round1(dif - indice),
    delta_vs_target_handicap: hasTarget ? round1(dif - target) : null,
    holes_played: 18,
    par_cancha,
    handicap_at_time: indice,
    target_at_time: hasTarget ? target : null,
  }
}

/**
 * Computa y persiste (idempotente) las métricas de TODAS las rondas elegibles
 * del usuario. ON CONFLICT DO NOTHING preserva el snapshot ya guardado
 * (handicap_at_time queda congelado al primer cómputo). Service_role.
 */
export async function backfillRoundMetrics(
  admin: SupabaseClient,
  userId: string,
): Promise<{ inserted: number; eligible: number }> {
  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .select('indice, target_handicap')
    .eq('id', userId)
    .single()
  if (profErr) throw profErr
  const indice = toNum(prof?.indice)
  const target = toNum(prof?.target_handicap)

  const { data: rounds, error: rErr } = await admin
    .from('historical_rounds')
    .select('id, total_gross, holes_played, par_per_hole, diferencial, excluded_from_handicap')
    .eq('user_id', userId)
  if (rErr) throw rErr

  const inserts = (rounds ?? [])
    .map((r) => computeRoundMetric(r as HistoricalRoundRow, userId, indice, target))
    .filter((x): x is RoundMetricInsert => x !== null)
  if (inserts.length === 0) return { inserted: 0, eligible: 0 }

  const { error: upErr } = await admin
    .from('round_metrics')
    .upsert(inserts, { onConflict: 'round_id', ignoreDuplicates: true })
  if (upErr) throw upErr
  return { inserted: inserts.length, eligible: inserts.length }
}
