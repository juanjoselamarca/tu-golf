/**
 * Métricas relativas por ronda (cerebro v3, Ola 2) — la base de "ver avance".
 *
 * Usa el `diferencial` WHS ya calculado por ronda (difficulty-adjusted) en vez de
 * reinventar la matemática de course handicap. delta_vs_handicap_expected =
 * diferencial − índice: negativo = jugaste mejor que tu handicap esa vuelta.
 *
 * 9h y 18h: el app guarda el diferencial 9h escalado ×2 a equivalente-18h
 * (indice-golfers.ts), así que ambos son comparables al índice. Las 9h legacy con
 * CR de 9 hoyos (<55, diferencial raw) se descartan. `strokes_over_par_round` de
 * una 9h es sobre 9 hoyos — siempre acompañado de `holes_played` para no
 * confundirlo con una 18h. Nunca producimos un número que no es comparable.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { parPerHoleArray, type ParPerHoleInput } from '@/golf/core/holes'

export interface HistoricalRoundRow {
  id: string
  total_gross: number | string | null
  holes_played: number | null
  par_per_hole: ParPerHoleInput | null
  diferencial: number | string | null
  /** CR de la ronda. Sirve para descartar 9h legacy con CR de 9 hoyos (<55),
   * donde el diferencial guardado es raw (no escalado a equiv-18h). */
  course_rating: number | string | null
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

/** CR mínimo creíble de 18 hoyos. Por debajo asumimos un CR de 9 hoyos (legacy). */
const MIN_18H_COURSE_RATING = 55

/**
 * Computa las métricas relativas de UNA ronda (9 o 18 hoyos), o null si no es
 * elegible. No inventa: excluida / hole-count inválido / sin diferencial / par /
 * índice / gross → null. El diferencial guardado ya viene en escala equivalente
 * a 18 hoyos (el app escala las 9h ×2, ver indice-golfers.ts), así que es
 * comparable al índice tanto para 9h como 18h.
 *
 * 9h legacy: rondas viejas guardaron un CR de 9 hoyos (<55) con diferencial raw
 * (no escalado) → no comparable → se descartan (anti-fantasía).
 */
export function computeRoundMetric(
  round: HistoricalRoundRow,
  userId: string,
  indice: number | null,
  target: number | null,
): RoundMetricInsert | null {
  if (round.excluded_from_handicap) return null
  const holes = round.holes_played
  if (holes !== 18 && holes !== 9) return null
  const gross = toNum(round.total_gross)
  if (gross == null) return null
  if (indice == null) return null

  // Descartar 9h legacy con CR de 9 hoyos: el diferencial guardado es raw 9h.
  if (holes === 9) {
    const cr = toNum(round.course_rating)
    if (cr == null || cr < MIN_18H_COURSE_RATING) return null
  }

  const dif = toNum(round.diferencial)
  if (dif == null) return null

  const parArr = round.par_per_hole ? parPerHoleArray(round.par_per_hole) : null
  if (!parArr || parArr.length < holes) return null
  // par de cancha sobre los hoyos jugados (9h: front 9, convención del app).
  const par_cancha = parArr.slice(0, holes).reduce((a, b) => a + b, 0)

  const hasTarget = target != null
  return {
    round_id: round.id,
    user_id: userId,
    strokes_over_par_round: gross - par_cancha,
    delta_vs_handicap_expected: round1(dif - indice),
    delta_vs_target_handicap: hasTarget ? round1(dif - target) : null,
    holes_played: holes,
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
    .select('id, total_gross, holes_played, par_per_hole, diferencial, course_rating, excluded_from_handicap')
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
