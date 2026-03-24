import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()

  const [
    totalUsers, newUsers7d, newUsers30d,
    totalTournaments, tournaments30d,
    totalRounds, freeRounds7d,
    totalHistorical,
    taigerSessions, usersWithPatterns,
    totalRondasLibres,
    recentProfiles,
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    admin.from('profiles').select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    admin.from('tournaments').select('*', { count: 'exact', head: true }),
    admin.from('tournaments').select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    admin.from('rounds').select('*', { count: 'exact', head: true }),
    admin.from('rondas_libres').select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    admin.from('historical_rounds').select('*', { count: 'exact', head: true }),
    admin.from('taiger_sessions').select('*', { count: 'exact', head: true }),
    admin.from('player_patterns').select('user_id', { count: 'exact', head: true }),
    admin.from('rondas_libres').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('created_at')
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('created_at', { ascending: true }),
  ])

  // Build sparkline: new users per day for last 30 days
  const dailyCounts: Record<string, number> = {}
  for (const p of (recentProfiles.data ?? [])) {
    const day = p.created_at.split('T')[0]
    dailyCounts[day] = (dailyCounts[day] || 0) + 1
  }
  // Fill in all 30 days (including zeros)
  const newUsersDaily: number[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0]
    newUsersDaily.push(dailyCounts[d] || 0)
  }

  return NextResponse.json({
    users: {
      total: totalUsers.count ?? 0,
      new7d: newUsers7d.count ?? 0,
      new30d: newUsers30d.count ?? 0,
    },
    tournaments: {
      total: totalTournaments.count ?? 0,
      last30d: tournaments30d.count ?? 0,
    },
    rounds: {
      total: totalRounds.count ?? 0,
      freeRoundsTotal: totalRondasLibres.count ?? 0,
      freeRounds7d: freeRounds7d.count ?? 0,
    },
    historical: {
      total: totalHistorical.count ?? 0,
    },
    taiger: {
      sessions: taigerSessions.count ?? 0,
      usersWithPatterns: usersWithPatterns.count ?? 0,
    },
    proUsers: 0,
    sparklines: {
      newUsersDaily,
    },
  })
}
