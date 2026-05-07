/**
 * POST /api/taiger/plans/[id]/accept
 *
 * El usuario aceptó formalmente el plan que tAIger+ le asignó. Registra
 * coach_events('plan_accepted_by_user', { plan_id }) para auditoría
 * (dashboard del agente puede medir tasa de aceptación).
 *
 * El plan ya está activo en BD desde el momento de save_plan; este
 * endpoint solo registra la confirmación humana, NO modifica el plan.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const planId = params.id
  if (!planId || planId.length < 8) {
    return NextResponse.json({ error: 'invalid_plan_id' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verificar que el plan existe y le pertenece al usuario (defensivo —
  // el cliente solo recibe planes propios via stream, pero validamos).
  const { data: plan, error: planErr } = await admin
    .from('coach_plans')
    .select('id, user_id, status, pattern_id')
    .eq('id', planId)
    .maybeSingle()
  if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 })
  if (!plan) return NextResponse.json({ error: 'plan_not_found' }, { status: 404 })
  if (plan.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data: evt, error: evtErr } = await admin
    .from('coach_events')
    .insert({
      user_id: user.id,
      type: 'plan_accepted_by_user',
      payload: {
        plan_id: planId,
        pattern_id: plan.pattern_id,
        plan_status_at_accept: plan.status,
      },
      related_plan_id: planId,
    })
    .select('id')
    .single()

  if (evtErr) return NextResponse.json({ error: evtErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, event_id: evt.id })
}
