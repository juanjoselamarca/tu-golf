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
  const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString()

  const [activeUsersRes, liveRoundsRes, supabasePing] = await Promise.all([
    admin.from('analytics_events')
      .select('user_id')
      .gte('created_at', fifteenMinAgo)
      .not('user_id', 'is', null),
    admin.from('rondas_libres')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'en_curso'),
    Promise.resolve(admin.from('profiles').select('id').limit(1)).then(r => ({ ok: !r.error }))
      .catch(() => ({ ok: false })),
  ])

  // Count unique users
  const uniqueUsers = new Set((activeUsersRes.data ?? []).map((e: { user_id: string }) => e.user_id))

  return NextResponse.json({
    activeUsers: uniqueUsers.size,
    liveRounds: liveRoundsRes.count ?? 0,
    supabaseOk: supabasePing.ok,
    timestamp: new Date().toISOString(),
  })
}
