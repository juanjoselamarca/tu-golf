import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
export const dynamic = 'force-dynamic'

const EVENT_CONFIG: Record<string, { icon: string; type: string; template: string }> = {
  ronda_creada: { icon: 'flag', type: 'round', template: '{name} creó una ronda libre' },
  score_registrado: { icon: 'person-standing', type: 'score', template: '{name} registró score' },
  torneo_creado: { icon: 'trophy', type: 'tournament', template: '{name} creó un torneo' },
  tarjeta_historica_agregada: { icon: 'clipboard-list', type: 'score', template: '{name} agregó tarjeta histórica' },
  taiger_session_start: { icon: 'bot', type: 'taiger', template: '{name} inició sesión tAIger' },
  user_registered: { icon: 'user', type: 'register', template: '{name} se registró en la plataforma' },
  ronda_finalizada: { icon: 'check-circle', type: 'round', template: '{name} finalizó su ronda' },
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()

  const { data: rawEvents } = await admin.from('analytics_events')
    .select('id, event_type, created_at, user_id, metadata')
    .order('created_at', { ascending: false })
    .limit(50)

  if (!rawEvents?.length) return NextResponse.json({ events: [] })

  // Get unique user IDs to fetch names
  const userIds = Array.from(new Set(rawEvents.filter(e => e.user_id).map(e => e.user_id)))
  const { data: profiles } = userIds.length > 0
    ? await admin.from('profiles').select('id, name').in('id', userIds)
    : { data: [] }

  const nameMap = new Map((profiles ?? []).map(p => [p.id, p.name || 'Usuario']))

  const events = rawEvents.map(e => {
    const config = EVENT_CONFIG[e.event_type] || { icon: 'ℹ️', type: 'system', template: e.event_type }
    const name = e.user_id ? (nameMap.get(e.user_id) || 'Usuario') : 'Sistema'
    const time = new Date(e.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    return {
      id: e.id,
      time,
      icon: config.icon,
      type: config.type,
      message: config.template.replace('{name}', name),
    }
  })

  return NextResponse.json({ events })
}
