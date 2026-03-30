import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
export const dynamic = 'force-dynamic'

interface AnalyticsEvent {
  event_type: string
  created_at: string
  user_id: string | null
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()
  const { searchParams } = new URL(request.url)
  const days = Math.min(Math.max(1, parseInt(searchParams.get('days') || '30')), 365)
  const since = new Date(Date.now() - days * 86400000).toISOString()

  // Get analytics events grouped by date
  const { data: events } = await admin.from('analytics_events')
    .select('event_type, created_at, user_id')
    .gte('created_at', since)
    .order('created_at', { ascending: true })

  // Group by date manually
  const byDate: Record<string, { dau: Set<string>; rondas: number; torneos: number; tarjetas: number }> = {}
  for (const e of (events as AnalyticsEvent[] || [])) {
    const fecha = e.created_at.split('T')[0]
    if (!byDate[fecha]) byDate[fecha] = { dau: new Set(), rondas: 0, torneos: 0, tarjetas: 0 }
    if (e.user_id) byDate[fecha].dau.add(e.user_id)
    if (e.event_type === 'ronda_creada') byDate[fecha].rondas++
    if (e.event_type === 'torneo_creado') byDate[fecha].torneos++
    if (e.event_type === 'tarjeta_historica_agregada') byDate[fecha].tarjetas++
  }

  const activity = Object.entries(byDate).map(([fecha, d]) => ({
    fecha,
    dau: d.dau.size,
    rondas: d.rondas,
    torneos: d.torneos,
    tarjetas: d.tarjetas,
  }))

  return NextResponse.json({ activity })
}
