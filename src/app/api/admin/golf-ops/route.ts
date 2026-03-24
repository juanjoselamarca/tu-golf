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
    tournaments, tournamentsList,
    rondasLibres, rondasEnCurso, rondasFinalizadas,
    totalRounds, totalHoleScores,
    taigerSessions, taigerSessionsList, patterns,
    courses,
  ] = await Promise.all([
    admin.from('tournaments').select('*', { count: 'exact', head: true }),
    admin.from('tournaments').select('id, name, slug, status, created_at, hole_count').order('created_at', { ascending: false }).limit(20),
    admin.from('rondas_libres').select('*', { count: 'exact', head: true }),
    admin.from('rondas_libres').select('*', { count: 'exact', head: true }).eq('estado', 'en_curso'),
    admin.from('rondas_libres').select('*', { count: 'exact', head: true }).eq('estado', 'finalizada'),
    admin.from('rounds').select('*', { count: 'exact', head: true }),
    admin.from('hole_scores').select('*', { count: 'exact', head: true }),
    admin.from('taiger_sessions').select('*', { count: 'exact', head: true }),
    admin.from('taiger_sessions').select('id, session_type, created_at, user_id').order('created_at', { ascending: false }).limit(20),
    admin.from('player_patterns').select('pattern_type, status'),
    admin.from('courses').select('id, nombre, ciudad, pais'),
  ])

  // Pattern distribution
  const patternDist: Record<string, number> = {}
  for (const p of (patterns.data ?? [])) {
    patternDist[p.pattern_type] = (patternDist[p.pattern_type] || 0) + 1
  }

  // tAIger session type distribution
  const sessionTypes: Record<string, number> = {}
  for (const s of (taigerSessionsList.data ?? [])) {
    sessionTypes[s.session_type] = (sessionTypes[s.session_type] || 0) + 1
  }

  return NextResponse.json({
    tournaments: {
      total: tournaments.count ?? 0,
      list: tournamentsList.data ?? [],
    },
    rondasLibres: {
      total: rondasLibres.count ?? 0,
      enCurso: rondasEnCurso.count ?? 0,
      finalizadas: rondasFinalizadas.count ?? 0,
    },
    scoring: {
      totalRounds: totalRounds.count ?? 0,
      totalHoleScores: totalHoleScores.count ?? 0,
    },
    taiger: {
      totalSessions: taigerSessions.count ?? 0,
      sessionTypes,
      recentSessions: taigerSessionsList.data ?? [],
      patternDistribution: patternDist,
    },
    courses: {
      total: (courses.data ?? []).length,
      list: courses.data ?? [],
    },
  })
}
