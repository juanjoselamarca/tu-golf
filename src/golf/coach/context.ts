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
import { OR_EXCLUDE_FEDEGOLF } from '@/lib/data/historical-rounds-filters'
import type { TaigerContext } from './prompts'
import { parPerHoleArray, parPlayedFromRound } from '@/golf/core/compare'
import { inferHoles } from '@/golf/core/holes'

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

  const [roundsRes, patternsRes, sessionsRes, recommendationsRes, insightsRes, activePlanRes, recentOutcomesRes, planHistoryRes] = await Promise.all([
    // 100% de las rondas — el bug previo de .limit(50) capeaba stats agregados.
    supabase.from('historical_rounds')
      .select('id, course_id, course_name, played_at, scores, total_gross, holes_played, par_per_hole, courses(par_total)')
      .eq('user_id', userId)
      .or(OR_EXCLUDE_FEDEGOLF) // tarjetas FedeGolf (score-only) fuera del contexto del coach
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
    // Cerebro v2 §5.6 — memoria longitudinal sobre plan activo
    supabase.from('coach_plans')
      .select('id, pattern_id, hypothesis, rule, metric, target_value, target_op, baseline_value, duration_days, created_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase.from('plan_outcomes')
      .select('played_at, metric_value, delta_vs_baseline, target_reached, compliance, plan_id')
      .eq('user_id', userId)
      .order('played_at', { ascending: false })
      .limit(5),
    supabase.from('coach_plans')
      .select('pattern_id, resolution_reason, created_at, resolved_at')
      .eq('user_id', userId)
      .in('status', ['resolved', 'expired', 'superseded', 'cancelled'])
      .order('resolved_at', { ascending: false })
      .limit(3),
  ])

  const rounds = roundsRes.data || []
  const patterns = patternsRes.data || []
  const sessions = sessionsRes.data || []
  const recommendations = recommendationsRes.data || []
  const collectiveInsights = insightsRes.data || []
  const activePlan = activePlanRes.data ?? null
  const recentOutcomesRaw = recentOutcomesRes.data ?? []
  const planHistoryRaw = (planHistoryRes.data ?? []) as Array<{
    pattern_id: string
    resolution_reason: string | null
    created_at: string
    resolved_at: string | null
  }>

  const activePlanId = (activePlan as { id?: string } | null)?.id ?? null
  const recentOutcomes = activePlanId
    ? (recentOutcomesRaw as Array<{
        played_at: string
        metric_value: number
        delta_vs_baseline: number | null
        target_reached: boolean
        compliance: 'full' | 'partial' | 'none' | 'unknown'
        plan_id: string
      }>)
        .filter(o => o.plan_id === activePlanId)
        .map(o => ({
          played_at: o.played_at,
          metric_value: o.metric_value,
          delta_vs_baseline: o.delta_vs_baseline,
          target_reached: o.target_reached,
          compliance: o.compliance,
        }))
    : []

  const planHistory = planHistoryRaw.map(p => ({
    pattern_id: p.pattern_id,
    resolution_reason: p.resolution_reason,
    created_at: p.created_at,
    resolved_at: p.resolved_at,
    total_outcomes: 0,
    full_compliance_count: 0,
  }))

  const validRounds = rounds.filter(r => r.total_gross != null)
  const totalRounds = validRounds.length

  // Modelo híbrido (15-may-2026): normalizar cada ronda a equivalente 18h
  // usando proyección lineal (alineado con WHS chileno: federación ingresa
  // rondas 9h × 2 al historial). El avg primario que ve el LLM es sobre
  // TODAS las rondas en esta escala unificada — coherente con el handicap
  // que el user ya conoce desde su perfil.
  //
  // Mantenemos los avgs reales por bucket (no normalizados) como métricas
  // secundarias para que el coach pueda calcular `mental_fatigue_delta` y
  // comentar la diferencia entre lo que el user proyectaría desde sus 9h
  // y lo que realmente hace en 18h reales (donde sí pega el cansancio).
  const validRounds18 = validRounds.filter(r => inferHoles(r) === 18)
  const validRounds9 = validRounds.filter(r => inferHoles(r) === 9)

  let totalBirdies = 0, totalEagles = 0
  let front9Sum = 0, front9Count = 0
  let back9Sum = 0, back9Count = 0

  for (const r of validRounds) {
    const scores = r.scores as (number | null)[]
    if (!Array.isArray(scores)) continue
    // par_per_hole denormalizado en la ronda (parser lo guarda al importar).
    // Sin esto, el conteo asumia par 4 → eagle en par 3 (score 2) contado como
    // eagle, birdie en par 5 (score 4) contado como par. tAIger+ recibia sesgo.
    const roundPars = (r as { par_per_hole?: Record<string, number> | null }).par_per_hole ?? null
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i]
      if (s == null) continue
      const par = (roundPars?.[String(i + 1)] ?? 4)
      const diff = s - par
      if (diff <= -2) totalEagles++
      else if (diff === -1) totalBirdies++
      if (i < 9) { front9Sum += s; front9Count++ }
      else        { back9Sum  += s; back9Count++ }
    }
  }

  // Equivalente 18h por ronda: gross × (18 / holes_played).
  // Si holes_played es inválido o desconocido para una ronda específica
  // (no debería pasar tras migration 20260514, pero defensivo), la
  // skipeamos del cálculo normalizado.
  const equivScores18: number[] = []
  for (const r of validRounds) {
    const holes = inferHoles(r)
    if (holes === 9 || holes === 18) {
      equivScores18.push(r.total_gross * (18 / holes))
    }
  }
  const avgScore = equivScores18.length > 0
    ? Math.round(equivScores18.reduce((a, n) => a + n, 0) / equivScores18.length * 10) / 10
    : null
  const bestScore = equivScores18.length > 0 ? Math.round(Math.min(...equivScores18) * 10) / 10 : null

  // Métricas reales por bucket — NO normalizadas. Sirven para el delta de
  // cansancio mental y para que el coach pueda hablar de "tu 18h real" o
  // "tu 9h real" sin recurrir a proyecciones.
  const realAvg18h = validRounds18.length > 0
    ? Math.round(validRounds18.reduce((a, r) => a + r.total_gross, 0) / validRounds18.length * 10) / 10
    : null
  const realAvg9h = validRounds9.length > 0
    ? Math.round(validRounds9.reduce((a, r) => a + r.total_gross, 0) / validRounds9.length * 10) / 10
    : null

  // Delta de cansancio mental: si el jugador proyectara linealmente su 9h
  // a 18h, debería puntuar (realAvg9h × 2). Lo que realmente hace en 18h
  // (realAvg18h) menos esa proyección es lo que pierde por cansancio mental
  // / fatiga / pérdida de foco después del hoyo 9. Solo es estadísticamente
  // útil con ≥3 rondas en cada bucket; sino, lo dejamos en null.
  const mentalFatigueDelta = (realAvg18h != null && realAvg9h != null && validRounds18.length >= 3 && validRounds9.length >= 3)
    ? Math.round((realAvg18h - realAvg9h * 2) * 10) / 10
    : null
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
    const roundParPerHole = (r as { par_per_hole?: Record<string, number> | null }).par_per_hole ?? null
    const coursePars = r.course_id ? courseParsMap[r.course_id] : null
    const coursePar = (r as { courses?: { par_total?: number | null } | null })?.courses?.par_total ?? null

    // Regla del golf: vsPar = gross - par REAL de hoyos jugados.
    // Prioridad:
    //   1) par_per_hole denormalizado en la ronda (parser lo guarda al importar — autoridad)
    //   2) course_holes lookup (depende de course_id valido y matcheo)
    //   3) escalado proporcional desde courses.par_total
    //   4) playedHoles * 4 (ultimo recurso)
    let parPlayed: number
    const fromRound = parPlayedFromRound(scoresArr, roundParPerHole)
    if (fromRound != null) {
      parPlayed = fromRound
    } else if (coursePars && scoresArr.length > 0) {
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

    // Para el contexto del LLM, expone los pares hoyo a hoyo cuando hay datos
    // (priorizando par_per_hole de la ronda; sino el lookup de course_holes).
    let coursePartsForLLM: Record<number, number> | null = null
    if (idx < 10) {
      const arr = parPerHoleArray(roundParPerHole, scoresArr.length || expectedHoles)
      if (arr) {
        coursePartsForLLM = {}
        for (let i = 0; i < arr.length; i++) coursePartsForLLM[i + 1] = arr[i]
      } else if (coursePars) {
        coursePartsForLLM = coursePars
      }
    }

    return {
      course_name: r.course_name,
      course_id: r.course_id,
      played_at: r.played_at,
      total_gross: r.total_gross,
      holes_played: playedHoles,
      over_under: r.total_gross - parPlayed,
      scores: idx < 10 ? scoresArr : undefined,
      course_pars: coursePartsForLLM ?? undefined,
    }
  })

  const lastSession = sessions.length > 0 ? sessions[0] : null

  return {
    player: {
      name: profile?.name || '',
      handicap: profile?.indice ?? null,
      indice: profile?.indice ?? null,
      // Índice Golfers+ computado desde las rondas (proxy del WHS). Fallback para
      // mostrar stats cuando el jugador aún no registró índice oficial — si no, un
      // usuario con 125 rondas importadas veía "Sin suficientes datos estadísticos".
      indice_golfers: profile?.indice_golfers ?? null,
      total_rounds: totalRounds,
    },
    stats: {
      avg_score: avgScore,
      best_score: bestScore,
      real_avg_18h: realAvg18h,
      real_avg_9h: realAvg9h,
      rounds_18h: validRounds18.length,
      rounds_9h: validRounds9.length,
      mental_fatigue_delta: mentalFatigueDelta,
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
    active_plan: activePlan as PlayerContext['active_plan'],
    recent_outcomes: recentOutcomes,
    plan_history: planHistory,
  }
}
