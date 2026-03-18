import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: rounds } = await supabase
      .from('historical_rounds')
      .select('scores, total_gross')
      .eq('user_id', user.id)
      .not('scores', 'is', null)
      .limit(50)

    if (!rounds || rounds.length < 5) {
      return NextResponse.json({
        message: 'Insuficientes rondas para detectar patrones (mínimo 5)',
        patterns: [],
      })
    }

    const holeTotals: number[] = Array(18).fill(0)
    const holeCounts: number[] = Array(18).fill(0)
    let front9Sum = 0, front9Count = 0
    let back9Sum  = 0, back9Count  = 0

    for (const r of rounds) {
      const scores = r.scores as (number | null)[]
      if (!Array.isArray(scores)) continue
      for (let i = 0; i < Math.min(scores.length, 18); i++) {
        const s = scores[i]
        if (s == null) continue
        holeTotals[i] += s
        holeCounts[i]++
        if (i < 9) { front9Sum += s; front9Count++ }
        else        { back9Sum  += s; back9Count++ }
      }
    }

    const front9Avg = front9Count > 0 ? (front9Sum / front9Count) * 9 : null
    const back9Avg  = back9Count  > 0 ? (back9Sum  / back9Count)  * 9 : null

    type PatternUpsert = {
      pattern_type: string
      confidence:   number
      data_points:  number
      metadata:     Record<string, number>
    }
    const detected: PatternUpsert[] = []

    // Pattern: back_nine_collapse
    if (front9Avg != null && back9Avg != null) {
      const diff = back9Avg - front9Avg
      if (diff > 2.5) {
        detected.push({
          pattern_type: 'back_nine_collapse',
          confidence:   Math.min(Math.round((0.5 + (diff - 2.5) * 0.1) * 100) / 100, 0.95),
          data_points:  rounds.length,
          metadata: {
            front9_avg: Math.round(front9Avg * 10) / 10,
            back9_avg:  Math.round(back9Avg  * 10) / 10,
            diff:       Math.round(diff * 10) / 10,
          },
        })
      }
    }

    // Pattern: first_hole_anxiety
    if (holeCounts[0] >= 3) {
      const hole1Avg = holeTotals[0] / holeCounts[0]
      const otherAvgs = holeTotals
        .slice(1)
        .map((t, i) => holeCounts[i + 1] > 0 ? t / holeCounts[i + 1] : null)
        .filter((v): v is number => v != null)

      if (otherAvgs.length > 0) {
        const othersAvg = otherAvgs.reduce((a, b) => a + b, 0) / otherAvgs.length
        if (hole1Avg > othersAvg * 1.3) {
          detected.push({
            pattern_type: 'first_hole_anxiety',
            confidence:   Math.min(Math.round((0.4 + (hole1Avg / othersAvg - 1.3) * 0.5) * 100) / 100, 0.9),
            data_points:  holeCounts[0],
            metadata: {
              hole1_avg:  Math.round(hole1Avg * 100) / 100,
              others_avg: Math.round(othersAvg * 100) / 100,
            },
          })
        }
      }
    }

    // Upsert each detected pattern
    for (const p of detected) {
      await supabase.from('player_patterns').upsert(
        { user_id: user.id, ...p, last_updated: new Date().toISOString() },
        { onConflict: 'user_id,pattern_type' }
      )
    }

    // Mark profile as recalculated
    await supabase.from('profiles').update({ patterns_need_recalc: false }).eq('id', user.id)

    return NextResponse.json({
      patterns: detected,
      message: `${detected.length} patrón(es) detectado(s) de ${rounds.length} rondas`,
    })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
