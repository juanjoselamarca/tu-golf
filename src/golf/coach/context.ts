/**
 * buildPlayerContext — construye el contexto completo del jugador para tAIger+.
 *
 * Usado por:
 * - /api/taiger/context (endpoint legacy, lo expone via HTTP)
 * - /api/taiger/chat (consumo directo, sin fetch HTTP server-to-server)
 *
 * Procesa el 100% de las rondas del jugador (sin .limit) para que stats agregados
 * reflejen toda la historia. El detalle hoyo-por-hoyo se incluye solo para las
 * ultimas 10 rondas — el resto el coach lo consulta via tools (get_round_by_date,
 * get_round_by_id) cuando el jugador las menciona.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TaigerContext } from './prompts'

// PlayerContext es un alias de TaigerContext (definido en prompts.ts) para
// que buildContextString pueda consumir directo el output de buildPlayerContext.
export type PlayerContext = TaigerContext

function getHandicapRange(handicap: number | null): string {
  if (handicap == null) return '20-30'
  if (handicap <= 5) return '0-5'
  if (handicap <= 10) return '5-10'
  if (handicap <= 15) return '10-15'
  if (handicap <= 20) return '15-20'
  if (handicap <= 30) return '20-30'
  return '30+'
}

export async function buildPlayerContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlayerContext> {
  const profileRes = await supabase.from('profiles').select('name, indice, indice_golfers, nivel').eq('id', userId).single()
  const profile = profileRes.data
  const handicapRange = getHandicapRange(profile?.indice ?? null)

  const [roundsRes, patternsRes, sessionsRes, recommendationsRes, insightsRes] = await Promise.all([
    // 100% de las rondas — el bug previo de .limit(50) capeaba stats agregados.
    supabase.from('historical_rounds')
      .select('id, course_id, course_name, played_at, scores, total_gross, holes_played, courses(par_total)')
      .eq('user_id', userId)
      .order('played_at', { ascending: false }),
    supabase.from('player_patterns')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase.from('taiger_sessions')
      .select('id, session_type, created_at, next_focus, techniques_assigned, messages')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('taiger_recommendations')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('collective_insights')
      .select('*')
      .eq('handicap_range', handicapRange)
      .order('computed_at', { ascending: false })
      .limit(5),
  ])

  const rounds = roundsRes.data || []
  const patterns = patternsRes.data || []
  const sessions = sessionsRes.data || []
  const recommendations = recommendationsRes.data || []
  const collectiveInsights = insightsRes.data || []

  const validRounds = rounds.filter(r => r.total_gross != null)
  const totalRounds = validRounds.length

  let totalBirdies = 0, totalEagles = 0
  let front9Sum = 0, front9Count = 0
  let back9Sum = 0, back9Count = 0

  for (const r of validRounds) {
    const scores = r.scores as (number | null)[]
    if (!Array.isArray(scores)) continue
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i]
      if (s == null) continue
      if (s <= 2) totalEagles++
      if (s === 3) totalBirdies++
      if (i < 9) { front9Sum += s; front9Count++ }
      else        { back9Sum  += s; back9Count++ }
    }
  }

  const avgScore = totalRounds > 0
    ? Math.round(validRounds.reduce((a, r) => a + r.total_gross, 0) / totalRounds * 10) / 10
    : null
  const bestScore = totalRounds > 0 ? Math.min(...validRounds.map(r => r.total_gross)) : null
  const front9Avg = front9Count > 0 ? Math.round(front9Sum / front9Count * 9 * 10) / 10 : null
  const back9Avg = back9Count > 0 ? Math.round(back9Sum / back9Count * 9 * 10) / 10 : null

  // Detalle hoyo-por-hoyo de las ultimas 10 rondas (era 3, lo expandimos para
  // que el coach tenga mas contexto inmediato sin necesidad de tool calls).
  const top10CourseIds = Array.from(new Set(validRounds.slice(0, 10).map(r => r.course_id).filter(Boolean)))
  const courseParsMap: Record<string, Record<number, number>> = {}
  if (top10CourseIds.length > 0) {
    const { data: courseHoles } = await supabase
      .from('course_holes')
      .select('course_id, numero, par')
      .in('course_id', top10CourseIds)
      .order('numero')
    for (const h of courseHoles ?? []) {
      if (!courseParsMap[h.course_id]) courseParsMap[h.course_id] = {}
      courseParsMap[h.course_id][h.numero] = h.par
    }
  }

  const recentRounds = validRounds.slice(0, 10).map((r, idx) => {
    const scoresArr = Array.isArray(r.scores) ? (r.scores as (number | null)[]) : []
    const playedScores = scoresArr.filter(s => s != null && s > 0).length
    const expectedHoles = r.holes_played ?? (scoresArr.length || 18)
    const playedHoles = playedScores > 0 ? playedScores : expectedHoles
    const coursePars = r.course_id ? courseParsMap[r.course_id] : null
    const coursePar = (r as { courses?: { par_total?: number | null } | null })?.courses?.par_total ?? null

    // Regla del golf: vsPar = gross - par REAL de hoyos jugados.
    // Prioridad: pars hoyo a hoyo > escalado proporcional > 4 por hoyo.
    let parPlayed: number
    if (coursePars && scoresArr.length > 0) {
      let sum = 0
      for (let i = 0; i < scoresArr.length; i++) {
        const s = scoresArr[i]
        if (s != null && s > 0) sum += coursePars[i + 1] ?? 4
      }
      parPlayed = sum > 0 ? sum : playedHoles * 4
    } else if (coursePar && expectedHoles > 0) {
      parPlayed = Math.round((coursePar * playedHoles) / expectedHoles)
    } else {
      parPlayed = playedHoles * 4
    }

    return {
      course_name: r.course_name,
      course_id: r.course_id,
      played_at: r.played_at,
      total_gross: r.total_gross,
      holes_played: playedHoles,
      over_under: r.total_gross - parPlayed,
      scores: idx < 10 ? scoresArr : undefined,
      course_pars: idx < 10 && r.course_id ? (coursePars ?? null) : undefined,
    }
  })

  const lastSession = sessions.length > 0 ? sessions[0] : null

  return {
    player: {
      name: profile?.name || '',
      handicap: profile?.indice ?? null,
      indice: profile?.indice ?? null,
      total_rounds: totalRounds,
    },
    stats: {
      avg_score: avgScore,
      best_score: bestScore,
      total_birdies: totalBirdies,
      total_eagles: totalEagles,
      front9_avg: front9Avg,
      back9_avg: back9Avg,
    },
    patterns: patterns as PlayerContext['patterns'],
    recent_rounds: recentRounds.map(r => ({
      played_at: r.played_at ?? undefined,
      course_name: r.course_name ?? undefined,
      course_id: r.course_id ?? undefined,
      total_gross: r.total_gross,
      over_under: r.over_under,
      scores: r.scores,
      course_pars: r.course_pars,
    })),
    last_session: lastSession as PlayerContext['last_session'],
    recent_sessions: sessions as PlayerContext['recent_sessions'],
    active_recommendations: recommendations as PlayerContext['active_recommendations'],
    collective_insights: collectiveInsights as PlayerContext['collective_insights'],
  }
}
