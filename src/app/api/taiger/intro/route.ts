/**
 * Opener proactivo de tAIger+ — primer mensaje cuando el usuario abre el chat sin
 * haber escrito nada, + chips de arranque (preguntas sugeridas). Determinístico:
 * usa la data del jugador, sin llamar al LLM (cero costo, instantáneo).
 *
 * Handler DELGADO (regla "el que toca, ordena"): solo I/O (auth + 5 queries). La
 * selección de opener/hook/chips vive en `src/golf/coach/intro.ts` (pura, testeada).
 *
 * NO persiste en taiger_sessions. Si el usuario responde, el opener se materializa
 * como primer turno en el primer POST a /api/taiger/chat (ver useTaigerChat).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { buildIntro, type IntroContext } from '@/golf/coach/intro'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

  const latest = latestRoundRes.data
  const plan = planRes.data
  const outcomes = outcomesCountRes.data ?? []

  const ctx: IntroContext = {
    name: firstName(profileRes.data?.name),
    roundDaysAgo: daysAgo(latest?.played_at),
    courseLabel: latest?.course_name ?? 'la cancha',
    lastGross: typeof latest?.total_gross === 'number' ? latest.total_gross : null,
    hasPlan: !!plan,
    planPatternId: plan?.pattern_id ?? null,
    outcomesCount: outcomes.length,
    targetsReached: outcomes.filter(o => o.target_reached).length,
    totalRounds: totalRoundsRes.count ?? 0,
  }

  const { opener, hook_type, chips } = buildIntro(ctx)

  return NextResponse.json(
    { opener, hook_type, chips, generated_at: new Date().toISOString() },
    { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } },
  )
}
