import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const HANDICAP_RANGES = ['0-5', '5-10', '10-15', '15-20', '20-30', '30+'] as const

function getHandicapRange(indice: number | null): string {
  if (indice == null) return '20-30'
  if (indice <= 5) return '0-5'
  if (indice <= 10) return '5-10'
  if (indice <= 15) return '10-15'
  if (indice <= 20) return '15-20'
  if (indice <= 30) return '20-30'
  return '30+'
}

export async function GET(request: NextRequest) {
  // Verify cron auth
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Acceso no autorizado' }, { status: 401 })
    }
  }

  const admin = createAdminClient()

  try {
    // Get all profiles with their handicap
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, indice')

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ message: 'Sin perfiles encontrados', insights: 0 })
    }

    // Group users by handicap range
    const usersByRange: Record<string, string[]> = {}
    for (const range of HANDICAP_RANGES) {
      usersByRange[range] = []
    }
    for (const p of profiles) {
      const range = getHandicapRange(p.indice)
      if (usersByRange[range]) {
        usersByRange[range].push(p.id)
      }
    }

    // Batch fetch ALL patterns and recommendations in 2 queries instead of 2×N
    const allUserIds = profiles.map(p => p.id)
    const [{ data: allPatterns }, { data: allRecs }] = await Promise.all([
      admin.from('player_patterns').select('user_id, pattern_type, confidence').in('user_id', allUserIds).eq('status', 'active'),
      admin.from('taiger_recommendations').select('user_id, category, focus_area, status').in('user_id', allUserIds),
    ])

    // Index by user_id for fast lookup
    const patternsByUser = new Map<string, typeof allPatterns>()
    const recsByUser = new Map<string, typeof allRecs>()
    for (const p of allPatterns ?? []) {
      if (!patternsByUser.has(p.user_id)) patternsByUser.set(p.user_id, [])
      patternsByUser.get(p.user_id)!.push(p)
    }
    for (const r of allRecs ?? []) {
      if (!recsByUser.has(r.user_id)) recsByUser.set(r.user_id, [])
      recsByUser.get(r.user_id)!.push(r)
    }

    let totalInserts = 0
    const insightsBatch: Array<{
      pattern_type: string; handicap_range: string; insight: string;
      sample_size: number; confidence: number; computed_at: string;
    }> = []

    for (const range of HANDICAP_RANGES) {
      const userIds = usersByRange[range]
      if (userIds.length < 5) continue

      // Filter from pre-fetched data (no additional queries)
      const patterns = userIds.flatMap(uid => patternsByUser.get(uid) ?? [])
      const recommendations = userIds.flatMap(uid => recsByUser.get(uid) ?? [])

      // Compute most common patterns
      if (patterns && patterns.length > 0) {
        const patternCounts: Record<string, { count: number; totalConf: number }> = {}
        for (const p of patterns) {
          if (!patternCounts[p.pattern_type]) {
            patternCounts[p.pattern_type] = { count: 0, totalConf: 0 }
          }
          patternCounts[p.pattern_type].count++
          patternCounts[p.pattern_type].totalConf += (p.confidence ?? 0)
        }

        const sortedPatterns = Object.entries(patternCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 3)

        const patternDescriptions: Record<string, string> = {
          back_nine_collapse: 'caída de rendimiento en los últimos 9 hoyos',
          three_putt_frequency: 'alta frecuencia de 3-putts',
          par_3_weakness: 'dificultad en hoyos par 3',
          front_nine_struggles: 'arranque lento en los primeros 9 hoyos',
          short_game_weakness: 'juego corto por debajo del nivel esperado',
          post_bogey_spiral: 'tendencia a encadenar bogeys consecutivos',
          first_hole_anxiety: 'score alto en el primer hoyo',
          driving_inconsistency: 'variabilidad en los tiros de salida',
          pressure_deterioration: 'caída bajo presión competitiva',
        }

        for (const [patternType, data] of sortedPatterns) {
          const pct = Math.round((data.count / userIds.length) * 100)
          const avgConf = data.totalConf / data.count
          const desc = patternDescriptions[patternType] ?? patternType
          const insight = `${pct}% de los jugadores con índice ${range} presenta ${desc}`

          insightsBatch.push({
            pattern_type: patternType,
            handicap_range: range,
            insight,
            sample_size: userIds.length,
            confidence: Math.round(avgConf * 100) / 100,
            computed_at: new Date().toISOString(),
          })
          totalInserts++
        }
      }

      // Compute most effective recommendation categories
      if (recommendations && recommendations.length > 0) {
        const catCounts: Record<string, { total: number; resolved: number }> = {}
        for (const r of recommendations) {
          const cat = (r as { category: string }).category
          if (!catCounts[cat]) {
            catCounts[cat] = { total: 0, resolved: 0 }
          }
          catCounts[cat].total++
          if ((r as { status: string }).status === 'resolved' || (r as { status: string }).status === 'improving') {
            catCounts[cat].resolved++
          }
        }

        const bestCategory = Object.entries(catCounts)
          .filter(([, v]) => v.total >= 3)
          .sort((a, b) => (b[1].resolved / b[1].total) - (a[1].resolved / a[1].total))
          .slice(0, 1)

        for (const [category, data] of bestCategory) {
          const effectiveRate = Math.round((data.resolved / data.total) * 100)
          const insight = `Recomendaciones de tipo "${category}" tienen ${effectiveRate}% de efectividad en jugadores con índice ${range}`

          insightsBatch.push({
            pattern_type: `recommendation_effectiveness_${category}`,
            handicap_range: range,
            insight,
            sample_size: data.total,
            confidence: Math.round((data.resolved / data.total) * 100) / 100,
            computed_at: new Date().toISOString(),
          })
          totalInserts++
        }
      }
    }

    // Batch upsert all insights in a single operation
    if (insightsBatch.length > 0) {
      await admin.from('collective_insights').upsert(
        insightsBatch,
        { onConflict: 'pattern_type,handicap_range', ignoreDuplicates: false }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${totalInserts} insights computados`,
      insights: totalInserts,
    })
  } catch (err) {
    console.error('[cron/taiger-insights] Error:', err)
    return NextResponse.json({ error: 'Error al calcular insights. Intenta de nuevo.' }, { status: 500 })
  }
}
