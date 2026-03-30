import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()
  const { id } = await params

  const [tournament, players, rounds] = await Promise.all([
    admin.from('tournaments').select('*').eq('id', id).single(),
    admin.from('players').select('*, profiles:user_id(id, name, email)').eq('tournament_id', id),
    admin.from('rounds')
      .select('*, player:player_id(id, user_id)')
      .in('player_id', (
        await admin.from('players').select('id').eq('tournament_id', id)
      ).data?.map(p => p.id) ?? []),
  ])

  if (tournament.error) return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 })

  return NextResponse.json({
    tournament: tournament.data,
    players: players.data ?? [],
    rounds: rounds.data ?? [],
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()
  const { id } = await params
  const body = await request.json()
  const { name, status, format, hole_count } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (status !== undefined) updates.status = status
  if (format !== undefined) updates.format = format
  if (hole_count !== undefined) updates.hole_count = hole_count

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 })
  }

  const { data, error } = await admin.from('tournaments').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: 'Error al procesar la solicitud. Intenta de nuevo.' }, { status: 500 })

  await admin.from('analytics_events').insert({
    event_type: 'admin_action',
    user_id: user!.id,
    metadata: { action: 'update_tournament', entity: 'tournaments', entityId: id, details: updates },
  })

  return NextResponse.json({ tournament: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()
  const { id } = await params

  // Get player IDs for cascade
  const { data: players } = await admin.from('players').select('id').eq('tournament_id', id)
  const playerIds = players?.map(p => p.id) ?? []

  if (playerIds.length > 0) {
    // Get round IDs for cascade
    const { data: rounds } = await admin.from('rounds').select('id').in('player_id', playerIds)
    const roundIds = rounds?.map(r => r.id) ?? []

    // Delete in order: hole_scores -> rounds -> players
    if (roundIds.length > 0) {
      await admin.from('hole_scores').delete().in('round_id', roundIds)
      await admin.from('rounds').delete().in('player_id', playerIds)
    }
    await admin.from('players').delete().eq('tournament_id', id)
  }

  const { error } = await admin.from('tournaments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Error al procesar la solicitud. Intenta de nuevo.' }, { status: 500 })

  await admin.from('analytics_events').insert({
    event_type: 'admin_action',
    user_id: user!.id,
    metadata: { action: 'delete_tournament', entity: 'tournaments', entityId: id, details: { playerIds } },
  })

  return NextResponse.json({ success: true })
}
