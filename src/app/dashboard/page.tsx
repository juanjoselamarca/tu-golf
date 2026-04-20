// src/app/dashboard/page.tsx
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { ExperiencePopupWrapper } from '@/components/ExperiencePopupWrapper'
import { PostLoginRedirect } from '@/components/PostLoginRedirect'
import { MiGolfTabs } from '@/components/mi-golf/MiGolfTabs'
import { CompetenciaTab } from '@/components/mi-golf/CompetenciaTab'
import { IdentidadTab } from '@/components/mi-golf/IdentidadTab'
import { calcularTendencia } from '@/lib/mi-golf/tendencia'
import { calcularStatsForma } from '@/lib/mi-golf/stats'
import { selectDailyInsight } from '@/lib/mi-golf/insights'
import type { Tournament, RondaLibre, HistoricalRound } from '@/lib/mi-golf/types'

export const dynamic = 'force-dynamic'

type ActivePlayerTournament = { tournaments: Tournament | null }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const params = await searchParams
  const isWelcome = params.welcome === 'true'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const userName = user.user_metadata?.name || user.email?.split('@')[0] || 'Golfista'

  const [
    { data: myTournamentsRaw },
    { data: playedRaw },
    { data: rondasRaw },
    { count: initialRounds },
    { data: activeTournamentsRaw },
    { count: rondasConDiferencial },
    { data: userProfile },
    { count: taigerSessionCount },
    { data: historicoRaw },
  ] = await Promise.all([
    supabase.from('tournaments').select('id, name, slug, status, date_start, courses(nombre)').eq('organizer_id', user.id).order('created_at', { ascending: false }),
    supabase.from('players').select('tournaments(id, name, slug, status, date_start, courses(nombre))').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('rondas_libres').select('id, codigo, course_name, fecha, estado').eq('creador_id', user.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('historical_rounds').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('players').select('tournaments!inner(id, name, slug, status, date_start, courses(nombre))').eq('user_id', user.id).in('tournaments.status', ['open', 'in_progress']),
    supabase.from('historical_rounds').select('*', { count: 'exact', head: true }).eq('user_id', user.id).not('diferencial', 'is', null),
    supabase.from('profiles').select('indice, indice_golfers, cpi_score, cpi_status').eq('id', user.id).single(),
    supabase.from('taiger_sessions').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('historical_rounds').select('id, total_gross, course_name, played_at, diferencial').eq('user_id', user.id).order('played_at', { ascending: false }).limit(50),
  ])

  const myTournaments = (myTournamentsRaw as unknown as Tournament[]) || []
  const playedTournaments = ((playedRaw || []).map((p) => (p as unknown as { tournaments: Tournament | null }).tournaments).filter(Boolean)) as Tournament[]
  const rondasLibres = (rondasRaw as RondaLibre[]) || []
  const activeTournaments = ((activeTournamentsRaw || []).map((p) => (p as unknown as ActivePlayerTournament).tournaments).filter(Boolean)) as Tournament[]
  const historico = (historicoRaw as HistoricalRound[]) || []
  const activeRonda = rondasLibres.find((r) => r.estado === 'en_curso') ?? null
  const finishedRondas = rondasLibres.filter((r) => r.estado !== 'en_curso')
  const totalRounds = initialRounds ?? 0
  const indiceGolfers = (userProfile?.indice_golfers as number | null) ?? null
  const cpiScore = (userProfile?.cpi_score as number | null) ?? null
  const cpiStatus = (userProfile?.cpi_status as string | null) ?? null

  const isNewUser = isWelcome || (myTournaments.length === 0 && rondasLibres.length === 0 && totalRounds === 0 && playedTournaments.length === 0)

  const tendencia = calcularTendencia(indiceGolfers, historico)
  const stats = calcularStatsForma(historico)
  const fechaHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  const insight = selectDailyInsight({
    userId: user.id,
    fecha: fechaHoy,
    historico,
    taigerSessionCount: taigerSessionCount ?? 0,
  })

  const finalizadosJugador = playedTournaments.filter((t) => t.status === 'finished' || t.status === 'closed')

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <PostLoginRedirect />
      <ExperiencePopupWrapper />

      <MiGolfTabs
        competencia={
          <CompetenciaTab
            userName={userName}
            activeRonda={activeRonda}
            activeTournaments={activeTournaments}
            myTournaments={myTournaments}
            playedTournaments={finalizadosJugador}
            finishedRondas={finishedRondas}
            isNewUser={isNewUser}
          />
        }
        identidad={
          <IdentidadTab
            userName={userName}
            indiceGolfers={indiceGolfers}
            rondasConDiferencial={rondasConDiferencial ?? 0}
            totalRounds={totalRounds}
            taigerSessionCount={taigerSessionCount ?? 0}
            tendencia={tendencia}
            stats={stats}
            insight={insight}
            cpiScore={cpiScore}
            cpiStatus={cpiStatus}
          />
        }
      />
    </div>
  )
}
