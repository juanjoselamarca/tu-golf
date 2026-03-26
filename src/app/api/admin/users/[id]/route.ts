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

  const [profile, rondas, tournaments, taigerSessions, patterns] = await Promise.all([
    admin.from('profiles').select('*').eq('id', id).single(),
    admin.from('ronda_libre_jugadores').select('*', { count: 'exact', head: true }).eq('user_id', id),
    admin.from('players').select('*', { count: 'exact', head: true }).eq('user_id', id),
    admin.from('taiger_sessions').select('*', { count: 'exact', head: true }).eq('user_id', id),
    admin.from('player_patterns').select('*', { count: 'exact', head: true }).eq('user_id', id),
  ])

  if (profile.error) return NextResponse.json({ error: profile.error.message }, { status: 404 })

  return NextResponse.json({
    profile: profile.data,
    counts: {
      rondas: rondas.count ?? 0,
      tournaments: tournaments.count ?? 0,
      taigerSessions: taigerSessions.count ?? 0,
      patterns: patterns.count ?? 0,
    },
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
  const { name, email, indice, role } = body

  if (role && !['player', 'organizer', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role. Must be player, organizer, or admin.' }, { status: 400 })
  }

  // Cannot remove your own admin role
  if (role && role !== 'admin' && id === user!.id) {
    return NextResponse.json(
      { error: 'No puedes cambiar tu propio rol de admin' },
      { status: 403 }
    )
  }

  // Cannot remove the last admin
  if (role && role !== 'admin') {
    const { data: currentProfile } = await admin.from('profiles').select('role').eq('id', id).single()
    if (currentProfile?.role === 'admin') {
      const { count } = await admin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: 'No se puede quitar el ultimo admin del sistema' },
          { status: 409 }
        )
      }
    }
  }

  // Capture old role before update for logging
  let oldRole: string | null = null
  if (role !== undefined) {
    const { data: beforeProfile } = await admin.from('profiles').select('role').eq('id', id).single()
    oldRole = beforeProfile?.role ?? null
  }

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (email !== undefined) updates.email = email
  if (indice !== undefined) updates.indice = indice
  if (role !== undefined) updates.role = role

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await admin.from('profiles').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('analytics_events').insert({
    event_type: 'admin_action',
    user_id: user!.id,
    metadata: { action: 'update_user', entity: 'profiles', entityId: id, details: updates },
  })

  // Log role change as a separate event for health-check monitoring
  if (role !== undefined && oldRole !== null && oldRole !== role) {
    await admin.from('analytics_events').insert({
      event_type: 'role_changed',
      user_id: user!.id,
      metadata: {
        target_user_id: id,
        old_role: oldRole,
        new_role: role,
        changed_by: user!.id,
      },
    })
  }

  return NextResponse.json({ profile: data })
}
