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
    .select('scores, total_gross, holes_played, metadata, course_id, courses(par_total)')
    .eq('user_id', userId)
    .not('scores', 'is', null)
    .limit(50)

  if (!rounds || rounds.length < 5) {
    return { detected: 0, total_rounds: rounds?.length ?? 0, patterns: [] }
  }

  // Pre-cargar par-por-hoyo de las canchas vistas (evita N queries).
  // Sin esto, el motor de patrones asumía par 72 universal — inválido en canchas
  // par 70/71 y en cualquier layout no estándar.
  const courseIds = Array.from(new Set(
    rounds.map(r => (r as { course_id?: string | null }).course_id).filter((x): x is string => !!x)
  ))
  const holeParsByCourse: Record<string, number[]> = {}
  if (courseIds.length > 0) {
    const { data: holesData } = await supabase
      .from('course_holes')
      .select('course_id, numero, par')
      .in('course_id', courseIds)
      .order('numero')
    for (const h of (holesData ?? []) as Array<{ course_id: string; numero: number; par: number }>) {
      if (!holeParsByCourse[h.course_id]) holeParsByCourse[h.course_id] = []
      holeParsByCourse[h.course_id][h.numero - 1] = h.par
    }
  }

  // Map DB rows to PatternRound interface (solo rondas de 18 hoyos para patrones)
  const patternRounds: PatternRound[] = rounds
    .filter(r => {
      const holes = (r as Record<string, unknown>).holes_played as number | null
      return !holes || holes >= 18
    })
    .map(r => {
      const courseId = (r as { course_id?: string | null }).course_id ?? null
      const holePars = courseId ? holeParsByCourse[courseId] : undefined
      return {
        scores: r.scores as (number | null)[],
        total_gross: r.total_gross,
        par_total: ((r as Record<string, unknown>).courses as { par_total?: number } | null)?.par_total ?? 72,
        course_name: '',
        played_at: '',
        hole_pars: holePars && holePars.length >= 18 ? holePars : undefined,
        metadata: r.metadata as Record<string, unknown> | null,
      }
    })

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
