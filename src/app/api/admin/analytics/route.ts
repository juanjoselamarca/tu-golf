import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()
  const now = Date.now()
  const d7 = new Date(now - 7 * 86400000).toISOString()
  const d30 = new Date(now - 30 * 86400000).toISOString()
  const d90 = new Date(now - 90 * 86400000).toISOString()

  // Parallel queries
  const [
    totalUsers, new7d, new30d, new90d,
    allProfiles, usersWithRounds, usersWithHistorical,
    usersWithTaiger, roundsPerUser, topUsers,
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', d7),
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', d30),
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', d90),
    // For funnel: fetch all user IDs to cross-reference
    admin.from('profiles').select('id, created_at').order('created_at', { ascending: false }),
    // Users who have at least one ronda libre (as jugador)
    admin.from('ronda_libre_jugadores').select('user_id').not('user_id', 'is', null),
    admin.from('historical_rounds').select('user_id').not('user_id', 'is', null),
    admin.from('taiger_sessions').select('user_id'),
    // Rounds per user for engagement
    admin.from('ronda_libre_jugadores').select('user_id, id').not('user_id', 'is', null),
    // Top users by activity (analytics_events)
    admin.from('analytics_events').select('user_id').not('user_id', 'is', null).gte('created_at', d30),
  ])

  const total = totalUsers.count ?? 0

  // Funnel
  const uniqueRoundUsers = new Set((usersWithRounds.data ?? []).map((r: { user_id: string }) => r.user_id)).size
  const uniqueHistoricalUsers = new Set((usersWithHistorical.data ?? []).map((r: { user_id: string }) => r.user_id)).size
  const uniqueTaigerUsers = new Set((usersWithTaiger.data ?? []).map((r: { user_id: string }) => r.user_id)).size

  // Growth by day (last 30 days)
  const profilesByDay: Record<string, number> = {}
  for (const p of (allProfiles.data ?? [])) {
    const day = p.created_at.split('T')[0]
    profilesByDay[day] = (profilesByDay[day] || 0) + 1
  }
  const growth = Object.entries(profilesByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, count]) => ({ date: date.slice(5), count }))

  // Engagement: rounds per user distribution
  const roundsByUser: Record<string, number> = {}
  for (const r of (roundsPerUser.data ?? [])) {
    if (r.user_id) roundsByUser[r.user_id] = (roundsByUser[r.user_id] || 0) + 1
  }
  const roundCounts = Object.values(roundsByUser)
  const avgRoundsPerUser = roundCounts.length > 0 ? roundCounts.reduce((a, b) => a + b, 0) / roundCounts.length : 0

  // Top active users (by event count in last 30 days)
  const eventsByUser: Record<string, number> = {}
  for (const e of (topUsers.data ?? [])) {
    if (e.user_id) eventsByUser[e.user_id] = (eventsByUser[e.user_id] || 0) + 1
  }
  const topUserIds = Object.entries(eventsByUser)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([uid, count]) => ({ userId: uid, events: count }))

  // Fetch names for top users
  const topIds = topUserIds.map(u => u.userId)
  const { data: topProfiles } = topIds.length > 0
    ? await admin.from('profiles').select('id, name, email').in('id', topIds)
    : { data: [] }
  const nameMap = new Map((topProfiles ?? []).map(p => [p.id, p.name || p.email || 'Usuario']))

  return NextResponse.json({
    growth: {
      total,
      new7d: new7d.count ?? 0,
      new30d: new30d.count ?? 0,
      new90d: new90d.count ?? 0,
      byDay: growth,
    },
    funnel: {
      registered: total,
      firstRound: uniqueRoundUsers,
      historicalCard: uniqueHistoricalUsers,
      taiger: uniqueTaigerUsers,
      pro: 0,
    },
    engagement: {
      avgRoundsPerUser: Math.round(avgRoundsPerUser * 10) / 10,
      totalRoundsPlayed: roundCounts.reduce((a, b) => a + b, 0),
      topUsers: topUserIds.map(u => ({
        ...u,
        name: nameMap.get(u.userId) || 'Usuario',
      })),
    },
  })
}
