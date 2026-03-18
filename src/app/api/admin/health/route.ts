import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()

  // Check Supabase
  let supabaseOk = false
  let supabaseMs = 0
  try {
    const start = Date.now()
    const { error } = await admin.from('profiles').select('id').limit(1)
    supabaseMs = Date.now() - start
    supabaseOk = !error
  } catch {
    supabaseOk = false
  }

  // Check ESPN API
  let espnOk = false
  let espnMs = 0
  try {
    const start = Date.now()
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard', { signal: AbortSignal.timeout(5000) })
    espnMs = Date.now() - start
    espnOk = res.ok
  } catch {
    espnOk = false
  }

  // DB table counts
  const [profiles, tournaments, rounds, holeScores, historical, rondasLibres, analytics] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('tournaments').select('*', { count: 'exact', head: true }),
    admin.from('rounds').select('*', { count: 'exact', head: true }),
    admin.from('hole_scores').select('*', { count: 'exact', head: true }),
    admin.from('historical_rounds').select('*', { count: 'exact', head: true }),
    admin.from('rondas_libres').select('*', { count: 'exact', head: true }),
    admin.from('analytics_events').select('*', { count: 'exact', head: true }),
  ])

  return NextResponse.json({
    services: {
      supabase: { ok: supabaseOk, ms: supabaseMs },
      espn: { ok: espnOk, ms: espnMs },
      claude: {
        ok: !!process.env.ANTHROPIC_API_KEY,
        ms: 0,
        status: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not_configured'
      },
      garmin: { ok: false, ms: 0, status: 'not_configured' },
      vercel: { ok: true, ms: 0, commit: process.env.VERCEL_GIT_COMMIT_SHA || 'local' },
    },
    tables: {
      profiles: profiles.count ?? 0,
      tournaments: tournaments.count ?? 0,
      rounds: rounds.count ?? 0,
      hole_scores: holeScores.count ?? 0,
      historical_rounds: historical.count ?? 0,
      rondas_libres: rondasLibres.count ?? 0,
      analytics_events: analytics.count ?? 0,
    },
    env: {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      GARMIN_CLIENT_ID: !!process.env.GARMIN_CLIENT_ID,
    },
  })
}
