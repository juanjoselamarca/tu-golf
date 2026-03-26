import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()
  const { id: rondaId } = await params
  const body = await request.json()
  const { jugadorId, scores } = body

  if (!jugadorId || !scores) {
    return NextResponse.json({ error: 'jugadorId and scores are required' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('ronda_libre_jugadores')
    .update({ scores })
    .eq('id', jugadorId)
    .eq('ronda_id', rondaId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('analytics_events').insert({
    event_type: 'admin_action',
    user_id: user!.id,
    metadata: { action: 'edit_ronda_scores', entity: 'ronda_libre_jugadores', entityId: jugadorId, details: { rondaId, scores } },
  })

  return NextResponse.json({ jugador: data })
}
