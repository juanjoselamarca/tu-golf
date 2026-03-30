import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
export const dynamic = 'force-dynamic'

// Standard par layout (used when course par data is unavailable)
const STANDARD_PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })

    const { data: rounds } = await supabase
      .from('historical_rounds')
      .select('scores, total_gross, metadata')
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

    // Pattern: front_nine_struggles (inverse of back_nine_collapse)
    if (front9Avg != null && back9Avg != null) {
      const diff = front9Avg - back9Avg
      if (diff > 2.5) {
        detected.push({
          pattern_type: 'front_nine_struggles',
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

    // Pattern: par_3_weakness
    {
      let par3Total = 0, par3Count = 0
      let otherTotal = 0, otherCount = 0
      for (const r of rounds) {
        const scores = r.scores as (number | null)[]
        if (!Array.isArray(scores)) continue
        for (let i = 0; i < Math.min(scores.length, 18); i++) {
          const s = scores[i]
          if (s == null) continue
          const par = STANDARD_PARS[i]
          const overPar = s - par
          if (par === 3) { par3Total += overPar; par3Count++ }
          else { otherTotal += overPar; otherCount++ }
        }
      }
      if (par3Count >= 5 && otherCount >= 5) {
        const par3AvgOver = par3Total / par3Count
        const otherAvgOver = otherTotal / otherCount
        // If par 3 avg is notably worse (>1.2 over par AND worse than other holes)
        if (par3AvgOver > 1.2 && par3AvgOver > otherAvgOver + 0.3) {
          detected.push({
            pattern_type: 'par_3_weakness',
            confidence: Math.min(Math.round((0.5 + (par3AvgOver - 1.2) * 0.15) * 100) / 100, 0.9),
            data_points: par3Count,
            metadata: {
              par3_avg_over: Math.round(par3AvgOver * 100) / 100,
              other_avg_over: Math.round(otherAvgOver * 100) / 100,
            },
          })
        }
      }
    }

    // Pattern: short_game_weakness
    // Compare par 4 performance (normalized) vs par 5 performance
    // If par 4s are notably worse, it suggests short game issues (approach/chipping on shorter holes)
    {
      let par4Total = 0, par4Count = 0
      let par5Total = 0, par5Count = 0
      for (const r of rounds) {
        const scores = r.scores as (number | null)[]
        if (!Array.isArray(scores)) continue
        for (let i = 0; i < Math.min(scores.length, 18); i++) {
          const s = scores[i]
          if (s == null) continue
          const par = STANDARD_PARS[i]
          if (par === 4) { par4Total += (s - par); par4Count++ }
          if (par === 5) { par5Total += (s - par); par5Count++ }
        }
      }
      if (par4Count >= 5 && par5Count >= 5) {
        const par4AvgOver = par4Total / par4Count
        const par5AvgOver = par5Total / par5Count
        // If par 4 over-par average is notably worse than par 5
        if (par4AvgOver > par5AvgOver + 0.5 && par4AvgOver > 1.0) {
          detected.push({
            pattern_type: 'short_game_weakness',
            confidence: Math.min(Math.round((0.45 + (par4AvgOver - par5AvgOver - 0.5) * 0.15) * 100) / 100, 0.9),
            data_points: par4Count + par5Count,
            metadata: {
              par4_avg_over: Math.round(par4AvgOver * 100) / 100,
              par5_avg_over: Math.round(par5AvgOver * 100) / 100,
            },
          })
        }
      }
    }

    // Pattern: post_bogey_spiral
    // After a bogey or worse, check if the next hole also has bogey+
    {
      let bogeyFollowedByBogey = 0, bogeyTotal = 0
      for (const r of rounds) {
        const scores = r.scores as (number | null)[]
        if (!Array.isArray(scores)) continue
        for (let i = 0; i < Math.min(scores.length, 18) - 1; i++) {
          const s = scores[i]
          const next = scores[i + 1]
          if (s == null || next == null) continue
          const par = STANDARD_PARS[i]
          const nextPar = STANDARD_PARS[i + 1]
          if (s >= par + 1) {
            bogeyTotal++
            if (next >= nextPar + 1) bogeyFollowedByBogey++
          }
        }
      }
      if (bogeyTotal >= 10) {
        const spiralRate = bogeyFollowedByBogey / bogeyTotal
        if (spiralRate > 0.4) {
          detected.push({
            pattern_type: 'post_bogey_spiral',
            confidence: Math.min(Math.round((0.4 + (spiralRate - 0.4) * 0.8) * 100) / 100, 0.9),
            data_points: bogeyTotal,
            metadata: {
              spiral_rate: Math.round(spiralRate * 100) / 100,
              bogey_count: bogeyTotal,
              followed_by_bogey: bogeyFollowedByBogey,
            },
          })
        }
      }
    }

    // Pattern: three_putt_frequency
    // Checks metadata for putts data if available
    {
      let threePutts = 0, totalGreens = 0
      for (const r of rounds) {
        const meta = r.metadata as Record<string, unknown> | null
        if (!meta) continue
        const putts = meta.putts as (number | null)[] | undefined
        if (!Array.isArray(putts)) continue
        for (const p of putts) {
          if (p == null) continue
          totalGreens++
          if (p >= 3) threePutts++
        }
      }
      if (totalGreens >= 18) {
        const threePuttRate = threePutts / totalGreens
        if (threePuttRate > 0.15) {
          detected.push({
            pattern_type: 'three_putt_frequency',
            confidence: Math.min(Math.round((0.5 + (threePuttRate - 0.15) * 2) * 100) / 100, 0.95),
            data_points: totalGreens,
            metadata: {
              three_putt_rate: Math.round(threePuttRate * 100) / 100,
              three_putts: threePutts,
              total_greens: totalGreens,
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
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500 })
  }
}
