/**
 * POST /api/admin/taiger/agent-health/review
 *
 * Admin marca un hallucination_check como 'false_positive' o 'real'.
 * Registra coach_events('hallucination_review', ...) — NO modifica el
 * evento original. Si se reenvía el mismo target_event_id, registra
 * un evento más (la UI muestra el último).
 *
 * Spec: D6 cerrojo del shadow validator.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const inputSchema = z.object({
  event_id: z.number().int().positive(),
  verdict: z.enum(['false_positive', 'real']),
  notes: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'input_invalid', details: parsed.error.issues[0]?.message }, { status: 400 })
  }
  const { event_id, verdict, notes } = parsed.data

  const admin = createAdminClient()

  // Verificar que el target evento existe y es un hallucination_check
  const { data: target, error: tErr } = await admin
    .from('coach_events')
    .select('id, user_id, type, related_session_id')
    .eq('id', event_id)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'event_not_found' }, { status: 404 })
  if (target.type !== 'hallucination_check') {
    return NextResponse.json({ error: 'event_type_invalid' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('coach_events')
    .insert({
      user_id: target.user_id,
      type: 'hallucination_review',
      payload: {
        target_event_id: event_id,
        verdict,
        notes: notes ?? null,
        reviewed_by_admin_id: user!.id,
      },
      related_session_id: target.related_session_id,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, review_id: data.id })
}
