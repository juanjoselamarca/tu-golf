/**
 * Capa de datos de la home del coach (/coach).
 *
 * Todas las lecturas de la pantalla en un lugar: sesiones, patrones, plan activo
 * con sus outcomes de las últimas 4 semanas y rondas. La página solo deriva y pinta.
 *
 * Las rondas son las NORMALIZADAS de /perfil/stats (`fetchRondasNormalizadas`):
 * pares reales, bucket 9/18 y motivo fuera de números, sin espejos FedeGolf. Así el
 * Mental Index, el costo y la curva cuentan lo mismo que el resto de la app.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'
import { fetchRondasNormalizadas } from '@/lib/data/historial'
import type { RondaNormalizada } from '@/golf/stats/rondas-normalizadas'

export interface CoachSession {
  id: string
  session_type: string
  created_at: string
  next_focus: string | null
}

export interface CoachPatternRow {
  id: string
  pattern_type: string
  confidence: number
  data_points: number
  status: string
  first_detected: string
}

export interface CoachPlanRow {
  id: string
  pattern_id: string
  hypothesis: string
  rule: string
  status: string
  created_at: string
  duration_days: number
}

export interface CoachOutcomeRow {
  target_reached: boolean
  compliance: string
  played_at: string
}

export interface CoachHomeData {
  sessions: CoachSession[]
  primarySessionId: string | null
  patterns: CoachPatternRow[]
  plan: CoachPlanRow | null
  /** Outcomes del plan activo de las últimas 4 semanas, más reciente primero. */
  outcomes: CoachOutcomeRow[]
  /** Más reciente primero. null si la lectura falló: nunca confundir con "sin rondas". */
  rondas: RondaNormalizada[] | null
}

const CUATRO_SEMANAS_MS = 28 * 24 * 60 * 60 * 1000

function reportar(error: unknown, consulta: string, userId: string): void {
  if (error) void captureError(error, { context: `fetchCoachHome:${consulta}`, userId })
}

export async function fetchCoachHome(supabase: SupabaseClient, userId: string): Promise<CoachHomeData> {
  // Todas las queries en paralelo, server-side (sin waterfall de hidratación).
  const [sessionsRes, primaryRes, patternsRes, planRes, rondas] = await Promise.all([
    supabase.from('taiger_sessions').select('id, session_type, created_at, next_focus').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    supabase.from('taiger_sessions').select('id').eq('user_id', userId).eq('is_primary', true).maybeSingle(),
    supabase.from('player_patterns').select('id, pattern_type, confidence, data_points, status, first_detected').eq('user_id', userId).in('status', ['active', 'monitoring']),
    supabase.from('coach_plans').select('id, pattern_id, hypothesis, rule, status, created_at, duration_days').eq('user_id', userId).eq('status', 'active').maybeSingle(),
    // fetchRondasNormalizadas reporta su propio error (captureError) y devuelve null.
    fetchRondasNormalizadas(supabase, userId),
  ])
  reportar(sessionsRes.error, 'sesiones', userId)
  reportar(primaryRes.error, 'sesion_principal', userId)
  reportar(patternsRes.error, 'patrones', userId)
  reportar(planRes.error, 'plan', userId)

  const plan = (planRes.data as CoachPlanRow | null) ?? null
  let outcomes: CoachOutcomeRow[] = []
  if (plan) {
    const fourWeeksAgo = new Date(Date.now() - CUATRO_SEMANAS_MS).toISOString()
    const outcomesRes = await supabase.from('plan_outcomes').select('target_reached, compliance, played_at').eq('plan_id', plan.id).gte('played_at', fourWeeksAgo).order('played_at', { ascending: false })
    reportar(outcomesRes.error, 'outcomes', userId)
    outcomes = (outcomesRes.data as CoachOutcomeRow[] | null) ?? []
  }

  return {
    sessions: (sessionsRes.data as CoachSession[] | null) ?? [],
    primarySessionId: (primaryRes.data as { id: string } | null)?.id ?? null,
    patterns: (patternsRes.data as CoachPatternRow[] | null) ?? [],
    plan,
    outcomes,
    rondas,
  }
}
