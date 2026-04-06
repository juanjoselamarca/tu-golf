/**
 * Detección de patrones server-side: fetch rounds + detect + upsert.
 *
 * Usado por:
 * - /api/taiger/patterns (endpoint)
 * - /api/import/confirm (post-importación)
 * - Cualquier contexto server que tenga un SupabaseClient autenticado
 */

import { detectPatterns, type PatternRound } from './patterns'
import type { SupabaseClient } from '@supabase/supabase-js'

interface DetectResult {
  detected: number
  total_rounds: number
  patterns: Array<{ pattern_type: string; confidence: number; metadata?: Record<string, unknown> }>
}

export async function detectAndSavePatterns(
  supabase: SupabaseClient,
  userId: string,
): Promise<DetectResult> {
  const { data: rounds } = await supabase
    .from('historical_rounds')
    .select('scores, total_gross, holes_played, metadata')
    .eq('user_id', userId)
    .not('scores', 'is', null)
    .limit(50)

  if (!rounds || rounds.length < 5) {
    return { detected: 0, total_rounds: rounds?.length ?? 0, patterns: [] }
  }

  // Map DB rows to PatternRound interface (solo rondas de 18 hoyos para patrones)
  const patternRounds: PatternRound[] = rounds
    .filter(r => {
      const holes = (r as Record<string, unknown>).holes_played as number | null
      return !holes || holes >= 18
    })
    .map(r => ({
      scores: r.scores as (number | null)[],
      total_gross: r.total_gross,
      par_total: 72,
      course_name: '',
      played_at: '',
      metadata: r.metadata as Record<string, unknown> | null,
    }))

  const detected = detectPatterns(patternRounds)

  // Upsert each detected pattern
  const upserted: DetectResult['patterns'] = []
  for (const d of detected) {
    await supabase.from('player_patterns').upsert(
      {
        user_id: userId,
        pattern_type: d.pattern.id,
        confidence: d.confidence,
        data_points: rounds.length,
        metadata: d.metadata ?? {},
        last_updated: new Date().toISOString(),
        status: 'active',
      },
      { onConflict: 'user_id,pattern_type' },
    )
    upserted.push({
      pattern_type: d.pattern.id,
      confidence: d.confidence,
      metadata: d.metadata,
    })
  }

  // Mark profile as recalculated
  await supabase.from('profiles').update({ patterns_need_recalc: false }).eq('id', userId)

  return { detected: upserted.length, total_rounds: rounds.length, patterns: upserted }
}
