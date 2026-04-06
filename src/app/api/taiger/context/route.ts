import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
export const dynamic = 'force-dynamic'

function getHandicapRange(handicap: number | null): string {
  if (handicap == null) return '20-30'
  if (handicap <= 5) return '0-5'
  if (handicap <= 10) return '5-10'
  if (handicap <= 15) return '10-15'
  if (handicap <= 20) return '15-20'
  if (handicap <= 30) return '20-30'
  return '30+'
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })

    const profileRes = await supabase.from('profiles').select('name, indice, indice_golfers, nivel').eq('id', user.id).single()
    const profile = profileRes.data
    const handicapRange = getHandicapRange(profile?.indice ?? null)

    const [roundsRes, patternsRes, sessionsRes, recommendationsRes, insightsRes] = await Promise.all([
      supabase.from('historical_rounds')
        .select('id, course_name, played_at, scores, total_gross, holes_played')
        .eq('user_id', user.id)
        .order('played_at', { ascending: false })
        .limit(50),
      supabase.from('player_patterns')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active'),
      supabase.from('taiger_sessions')
        .select('id, session_type, created_at, next_focus, techniques_assigned, messages')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('taiger_recommendations')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('collective_insights')
        .select('*')
        .eq('handicap_range', handicapRange)
        .order('computed_at', { ascending: false })
        .limit(5),
    ])

    const rounds  = roundsRes.data   || []
    const patterns = patternsRes.data || []
    const sessions = sessionsRes.data || []
    const recommendations = recommendationsRes.data || []
    const collectiveInsights = insightsRes.data || []

    // Compute stats
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

    const avgScore  = totalRounds > 0
      ? Math.round(validRounds.reduce((a, r) => a + r.total_gross, 0) / totalRounds * 10) / 10
      : null
    const bestScore = totalRounds > 0 ? Math.min(...validRounds.map(r => r.total_gross)) : null
    const front9Avg = front9Count > 0 ? Math.round(front9Sum / front9Count * 9 * 10) / 10 : null
    const back9Avg  = back9Count  > 0 ? Math.round(back9Sum  / back9Count  * 9 * 10) / 10 : null

    const recentRounds = validRounds.slice(0, 5).map(r => {
      const holes = r.holes_played ?? (Array.isArray(r.scores) ? r.scores.filter(Boolean).length : 18)
      const par = holes <= 9 ? 36 : 72
      return {
        course_name: r.course_name,
        played_at:   r.played_at,
        total_gross: r.total_gross,
        holes_played: holes,
        over_under:  r.total_gross - par,
      }
    })

    const lastSession = sessions.length > 0 ? sessions[0] : null

    return NextResponse.json({
      player: {
        name:              profile?.name  || '',
        handicap:          profile?.indice ?? null,
        indice_golfers:    profile?.indice_golfers ?? null,
        nivel:             profile?.nivel ?? 1,
        total_rounds:      totalRounds,
        indice_nota: profile?.indice_golfers
          ? (profile?.indice && Math.abs(profile.indice - profile.indice_golfers) >= 1.5
              ? `Diferencia de ${Math.abs(profile.indice - profile.indice_golfers).toFixed(1)} puntos entre índice oficial (${profile.indice}) y rendimiento real (${profile.indice_golfers}).`
              : null)
          : null,
      },
      stats: {
        avg_score:     avgScore,
        best_score:    bestScore,
        total_birdies: totalBirdies,
        total_eagles:  totalEagles,
        front9_avg:    front9Avg,
        back9_avg:     back9Avg,
      },
      patterns,
      recent_rounds: recentRounds,
      last_session:  lastSession,
      recent_sessions: sessions,
      active_recommendations: recommendations,
      collective_insights: collectiveInsights,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
