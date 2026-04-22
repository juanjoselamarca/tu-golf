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
import { getNivel } from '@/lib/mi-golf/niveles'
import { getTaigerLine } from '@/lib/mi-golf/taiger-line'
import { getVsPar } from '@/lib/mi-golf/par'
import type { Tournament, RondaLibre, HistoricalRound, ComunidadMensaje } from '@/lib/mi-golf/types'

export const dynamic = 'force-dynamic'

type ActivePlayerTournament = { tournaments: Tournament | null }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const params = await searchParams
  void params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const userName = user.user_metadata?.name || user.email?.split('@')[0] || 'Golfista'

  const [
    { data: myTournamentsRaw },
    { data: playedRaw },
    { data: rondasRaw },
    { count: initialRounds },
    { data: activePlayerTournamentsRaw },
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
    supabase.from('profiles').select('indice, indice_golfers').eq('id', user.id).single(),
    supabase.from('taiger_sessions').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('historical_rounds').select('id, total_gross, course_name, played_at, diferencial, holes_played, scores, par_per_hole').eq('user_id', user.id).order('played_at', { ascending: false }).limit(50),
  ])

  const myOrganizedTournaments = (myTournamentsRaw as unknown as Tournament[]) || []
  const playedTournaments = ((playedRaw || []).map((p) => (p as unknown as { tournaments: Tournament | null }).tournaments).filter(Boolean)) as Tournament[]
  const rondasLibres = (rondasRaw as RondaLibre[]) || []
  const activeTournaments = ((activePlayerTournamentsRaw || []).map((p) => (p as unknown as ActivePlayerTournament).tournaments).filter(Boolean)) as Tournament[]
  const historico: HistoricalRound[] = ((historicoRaw as unknown as Array<Record<string, unknown>>) || []).map(row => ({
    id: row.id as string,
    total_gross: (row.total_gross as number | null) ?? null,
    course_name: (row.course_name as string | null) ?? null,
    played_at: (row.played_at as string | null) ?? null,
    diferencial: (row.diferencial as number | null) ?? null,
    holes_played: (row.holes_played as number | null) ?? null,
    scores: (row.scores as number[] | null) ?? null,
    parPerHole: (row.par_per_hole as number[] | null) ?? null,
  }))

  const activeRonda = rondasLibres.find((r) => r.estado === 'en_curso') ?? null
  const finishedRondasRaw = rondasLibres.filter((r) => r.estado !== 'en_curso')

  const finishedRondas = finishedRondasRaw.map((r) => {
    const match = historico.find((h) => h.course_name === r.course_name && h.played_at === r.fecha)
    return {
      ...r,
      total_gross: match?.total_gross ?? null,
      vsPar: match ? getVsPar(match.total_gross, match.holes_played) : null,
      scores: match?.scores ?? null,
      parPerHole: match?.parPerHole ?? null,
    }
  })

  const now = Date.now()
  const sieteDias = 7 * 86400000
  const enriquecidosPlaying = activeTournaments.map((t) => {
    const diasRestantes = t.date_start
      ? Math.floor((new Date(t.date_start).getTime() - now) / 86400000)
      : 0
    return { ...t, horaSalida: null as string | null, diasRestantes }
  })

  const torneoInminente = enriquecidosPlaying.find(
    (t) => t.diasRestantes >= 0 && new Date(t.date_start ?? '').getTime() - now <= sieteDias
  ) ?? null

  const enriquecidosOrganizing = myOrganizedTournaments
    .filter((t) => t.status === 'open' || t.status === 'in_progress' || t.status === 'active')
    .map((t) => ({ ...t, inscritos: 0, hoyoActual: null as number | null }))

  const finalizadosRecientes = [...playedTournaments, ...myOrganizedTournaments]
    .filter((t) => t.status === 'finished' || t.status === 'closed')
    .slice(0, 2)
    .map((t) => ({ ...t, posicionFinal: null as string | null, totalJugadores: null as number | null }))

  const indiceGolfers = (userProfile?.indice_golfers as number | null) ?? null
  const totalRounds = initialRounds ?? 0
  const nivel = indiceGolfers != null ? getNivel(indiceGolfers) : null
  const stats = calcularStatsForma(historico)
  const tendencia = calcularTendencia(indiceGolfers, historico)
  const ultimasGross = historico
    .slice(0, 5)
    .map((r) => r.total_gross)
    .filter((g): g is number => g != null)
    .reverse()

  const taigerLine = getTaigerLine({
    tendencia,
    golpesHastaSiguienteNivel: nivel?.golpes_hasta_siguiente ?? null,
    nombreSiguienteNivel: nivel?.nombre_siguiente ?? null,
    taigerSessionCount: taigerSessionCount ?? 0,
    totalRounds,
  })

  const fechaHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })

  const hcpDisplay = indiceGolfers != null ? indiceGolfers.toFixed(1) : null

  const comunidad: ComunidadMensaje = null

  const activeRondaSummary = activeRonda
    ? { hoyoActual: 1, totalHoyos: 18, scoreParcial: null as number | null }
    : null

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <PostLoginRedirect />
      <ExperiencePopupWrapper />

      <MiGolfTabs
        competencia={
          <CompetenciaTab
            userName={userName}
            hcpDisplay={hcpDisplay}
            activeRonda={activeRonda}
            activeRondaSummary={activeRondaSummary}
            torneoInminente={torneoInminente}
            playingInTournaments={enriquecidosPlaying}
            organizingTournaments={enriquecidosOrganizing}
            recentFinishedTournaments={finalizadosRecientes}
            finishedRondas={finishedRondas}
            historico={historico}
            comunidad={comunidad}
            fechaHoy={fechaHoy}
          />
        }
        identidad={
          <IdentidadTab
            userName={userName}
            indiceGolfers={indiceGolfers}
            nivel={nivel}
            rondasConDiferencial={rondasConDiferencial ?? 0}
            totalRounds={totalRounds}
            taigerSessionCount={taigerSessionCount ?? 0}
            stats={stats}
            taigerLine={taigerLine}
            ultimasGross={ultimasGross}
          />
        }
      />
    </div>
  )
}
