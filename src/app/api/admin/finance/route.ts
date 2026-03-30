import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()

  const [
    totalUsers, taigerSessions, pushSubs,
    profiles, tournaments, rounds, holeScores,
    historical, rondasLibres, analyticsEvents,
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('taiger_sessions').select('*', { count: 'exact', head: true }),
    admin.from('push_subscriptions').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('tournaments').select('*', { count: 'exact', head: true }),
    admin.from('rounds').select('*', { count: 'exact', head: true }),
    admin.from('hole_scores').select('*', { count: 'exact', head: true }),
    admin.from('historical_rounds').select('*', { count: 'exact', head: true }),
    admin.from('rondas_libres').select('*', { count: 'exact', head: true }),
    admin.from('analytics_events').select('*', { count: 'exact', head: true }),
  ])

  // Estimate costs based on usage
  const taigerCalls = taigerSessions.count ?? 0
  const estimatedClaudeCost = Math.round(taigerCalls * 0.02 * 100) / 100 // ~$0.02 per session

  return NextResponse.json({
    totalUsers: totalUsers.count ?? 0,
    proUsers: 0, // Not yet launched
    mrr: 0,
    arr: 0,
    costs: {
      supabase: { plan: 'Free', cost: 0, usage: `${(profiles.count ?? 0) + (rounds.count ?? 0) + (holeScores.count ?? 0)} rows`, limit: '500MB / 50K rows' },
      vercel: { plan: 'Hobby', cost: 0, usage: 'Serverless', limit: '100GB bandwidth' },
      claude: { plan: 'Pay-per-use', cost: estimatedClaudeCost, usage: `${taigerCalls} sesiones`, limit: 'N/A' },
      push: { plan: 'VAPID (free)', cost: 0, usage: `${pushSubs.count ?? 0} suscripciones`, limit: 'N/A' },
    },
    dbStats: {
      profiles: profiles.count ?? 0,
      tournaments: tournaments.count ?? 0,
      rounds: rounds.count ?? 0,
      hole_scores: holeScores.count ?? 0,
      historical_rounds: historical.count ?? 0,
      rondas_libres: rondasLibres.count ?? 0,
      analytics_events: analyticsEvents.count ?? 0,
    },
  })
}
