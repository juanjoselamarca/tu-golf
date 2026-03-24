import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()
  const { id } = await params

  const [ronda, jugadores] = await Promise.all([
    admin.from('rondas_libres').select('*').eq('id', id).single(),
    admin.from('ronda_libre_jugadores').select('*, profiles:user_id(id, name, email)').eq('ronda_id', id),
  ])

  if (ronda.error) return NextResponse.json({ error: ronda.error.message }, { status: 404 })

  return NextResponse.json({
    ronda: ronda.data,
    jugadores: jugadores.data ?? [],
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()
  const { id } = await params
  const body = await request.json()
  const { estado } = body

  if (estado && !['en_curso', 'finalizada'].includes(estado)) {
    return NextResponse.json({ error: 'Invalid estado. Must be en_curso or finalizada.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (estado !== undefined) updates.estado = estado

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await admin.from('rondas_libres').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('analytics_events').insert({
    event_type: 'admin_action',
    user_id: user!.id,
    metadata: { action: 'update_ronda_libre', entity: 'rondas_libres', entityId: id, details: updates },
  })

  return NextResponse.json({ ronda: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()
  const { id } = await params

  // Delete jugadores first, then the ronda
  await admin.from('ronda_libre_jugadores').delete().eq('ronda_id', id)
  const { error } = await admin.from('rondas_libres').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('analytics_events').insert({
    event_type: 'admin_action',
    user_id: user!.id,
    metadata: { action: 'delete_ronda_libre', entity: 'rondas_libres', entityId: id },
  })

  return NextResponse.json({ success: true })
}
