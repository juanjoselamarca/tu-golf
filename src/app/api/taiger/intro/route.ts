/**
 * Opener proactivo de tAIger+ — primer mensaje cuando el usuario abre el chat
 * sin haber escrito nada. Determinístico: usa la data del jugador para armar
 * un hook concreto, sin llamar al LLM (cero costo, instantáneo).
 *
 * Reglas de prioridad (primer match gana):
 *  1. Última ronda <24h           → "Vi que jugaste ayer en X. ¿Cómo te sentiste?"
 *  2. Última ronda 1-7d con score → "Hace N días jugaste 87 en X. ¿Qué pasó en el back?"
 *  3. Plan activo con outcomes    → "Tu plan de back_nine viene mejorando. ¿Cómo va?"
 *  4. Plan activo sin outcomes    → "Asignamos foco en X. ¿Pudiste salir esta semana?"
 *  5. >7d sin jugar pero hay data → "Hace N días que no jugás. ¿Cuándo salís?"
 *  6. <3 rondas                   → "Bienvenido. Contame de tu última ronda."
 *  7. Fallback                    → "Hola {nombre}, ¿en qué te puedo ayudar hoy?"
 *
 * NO persiste en taiger_sessions. Si el usuario responde, el opener se incluye
 * en el primer POST a /api/taiger/chat como contexto, pero la sesión real solo
 * captura los turnos que sí se enviaron.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface IntroResponse {
  opener: string
  hook_type:
    | 'recent_round'
    | 'last_round_with_score'
    | 'plan_with_progress'
    | 'plan_no_progress'
    | 'long_absence'
    | 'newcomer'
    | 'fallback'
  generated_at: string
}

function firstName(full: string | null | undefined): string {
  if (!full) return ''
  const trimmed = full.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0]
}

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 })

  const [profileRes, latestRoundRes, planRes, outcomesCountRes, totalRoundsRes] = await Promise.all([
    supabase.from('profiles').select('name, indice').eq('id', user.id).maybeSingle(),
    supabase
      .from('historical_rounds')
      .select('played_at, total_gross, course_name')
      .eq('user_id', user.id)
      .not('scores', 'is', null)
      .order('played_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('coach_plans')
      .select('id, pattern_id, rule, baseline_value, target_value, target_op, created_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('plan_outcomes')
      .select('id, target_reached, compliance', { count: 'exact', head: false })
      .eq('user_id', user.id),
    supabase
      .from('historical_rounds')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ])

  const name = firstName(profileRes.data?.name)
  const handle = name || 'jugador'
  const latest = latestRoundRes.data
  const plan = planRes.data
  const outcomes = outcomesCountRes.data ?? []
  const outcomesCount = outcomes.length
  const targetsReached = outcomes.filter(o => o.target_reached).length
  const totalRounds = totalRoundsRes.count ?? 0

  const round_days_ago = daysAgo(latest?.played_at)
  const courseLabel = latest?.course_name ?? 'la cancha'

  const now = new Date().toISOString()

  // 1) Última ronda < 24h
  if (latest && round_days_ago !== null && round_days_ago === 0) {
    const hookText = name
      ? `Vi que jugaste hoy en ${courseLabel}, ${name}. ¿Cómo te sentiste?`
      : `Vi que jugaste hoy en ${courseLabel}. ¿Cómo te sentiste?`
    return ok({ opener: hookText, hook_type: 'recent_round', generated_at: now })
  }

  // 2) Última ronda 1-7 días, con score
  if (latest && round_days_ago !== null && round_days_ago >= 1 && round_days_ago <= 7 && typeof latest.total_gross === 'number') {
    const dayWord = round_days_ago === 1 ? 'ayer' : `hace ${round_days_ago} días`
    const greeting = name ? `${name}, ` : ''
    const opener = `${greeting}${dayWord} jugaste ${latest.total_gross} en ${courseLabel}. ¿Querés repasar la ronda o trabajar algo puntual?`
    return ok({ opener, hook_type: 'last_round_with_score', generated_at: now })
  }

  // 3) Plan activo con outcomes registrados
  if (plan && outcomesCount > 0) {
    const trend = targetsReached >= Math.ceil(outcomesCount / 2) ? 'viene mejorando' : 'todavía está en progreso'
    const greeting = name ? `${name}, ` : ''
    const opener = `${greeting}tu plan actual sobre ${humanPattern(plan.pattern_id)} ${trend} (${targetsReached}/${outcomesCount} rondas en target). ¿Cómo lo sentís?`
    return ok({ opener, hook_type: 'plan_with_progress', generated_at: now })
  }

  // 4) Plan activo sin outcomes aún
  if (plan && outcomesCount === 0) {
    const greeting = name ? `${name}, ` : ''
    const opener = `${greeting}arrancamos hace poco con foco en ${humanPattern(plan.pattern_id)}. ¿Pudiste salir a la cancha o practicar?`
    return ok({ opener, hook_type: 'plan_no_progress', generated_at: now })
  }

  // 5) >7 días sin jugar
  if (latest && round_days_ago !== null && round_days_ago > 7) {
    const opener = name
      ? `Hace ${round_days_ago} días que no anotás una ronda, ${name}. ¿Cuándo salís de nuevo?`
      : `Hace ${round_days_ago} días que no anotás una ronda. ¿Cuándo salís de nuevo?`
    return ok({ opener, hook_type: 'long_absence', generated_at: now })
  }

  // 6) Newcomer: <3 rondas en la app
  if (totalRounds < 3) {
    const opener = name
      ? `Bienvenido, ${name}. Para arrancar fuerte: contame cómo viene tu juego últimamente o pegame el score de tu última ronda.`
      : `Bienvenido. Para arrancar fuerte: contame cómo viene tu juego últimamente o pegame el score de tu última ronda.`
    return ok({ opener, hook_type: 'newcomer', generated_at: now })
  }

  // 7) Fallback
  const opener = name
    ? `Hola ${name}, ¿en qué te puedo ayudar hoy?`
    : `Hola, ¿en qué te puedo ayudar hoy?`
  return ok({ opener, hook_type: 'fallback', generated_at: now })

  // helper local para evitar repetir el headers
  function ok(payload: IntroResponse) {
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' },
    })
  }
}

function humanPattern(id: string): string {
  const map: Record<string, string> = {
    back_nine_collapse: 'el back nine',
    front_nine_struggles: 'el front nine',
    first_hole_anxiety: 'el primer hoyo',
    par_3_weakness: 'los pares 3',
    short_game_weakness: 'el juego corto',
    post_bogey_spiral: 'la recuperación post-bogey',
    three_putt_frequency: 'los three putts',
    pressure_deterioration: 'el cierre bajo presión',
    driving_inconsistency: 'la consistencia desde el tee',
  }
  return map[id] ?? 'tu plan activo'
}
