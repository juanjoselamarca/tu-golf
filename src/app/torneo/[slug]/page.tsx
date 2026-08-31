// src/app/torneo/[slug]/page.tsx
//
// Vista publica del torneo. Orchestrator delgado: carga datos via
// `src/lib/data/tournaments/leaderboard.ts`, arma rankings con
// `src/golf/leaderboard/`, y compone los sub-componentes UI.
//
// Refactor 26-may-2026: 917 LOC -> <200 LOC (regla "el que toca, ordena").
//   - Logica de scoring -> src/golf/leaderboard/
//   - Queries Supabase -> src/lib/data/tournaments/leaderboard.ts
//   - Sub-componentes JSX -> components/*

import Link from 'next/link'
import TournamentTabs from '@/components/TournamentTabs'
import type { GroupData } from '@/components/TournamentTabs'
import TeamLeaderboard from './en-vivo/formats/TeamLeaderboard'
import type { LiveTeam } from './en-vivo/types'
import { torneoEnVivo } from '@/golf/tournament-live-status'
import { fetchScrambleTeams, fetchBestBallTeams } from '@/lib/data/tournaments/teamLeaderboard'
import { computeScrambleStandings, computeFoursomeStandings, computeBestBallStandings } from '@/golf/leaderboard/team-standings'
import { scrambleResultsToLiveTeams, bestBallResultsToLiveTeams } from './en-vivo/scrambleTeamsToLive'
import { TournamentBottomSheet } from '@/components/TournamentBottomSheet'
import ShareResultsButton from '@/components/ShareResultsButton'
import { notFound } from 'next/navigation'
import type { Player } from '@/lib/golf-data'
import { createClient } from '@/utils/supabase/server'
import { formatLabel, type ModoJuego, type FormatoJuego } from '@/golf/core/rules'
import type { JugadorGWIInput } from '@/golf/stats/gwi'

import {
  fetchCourseHoles,
  fetchEnrolledPlayerCount,
  fetchEnrolledPlayerNames,
  fetchLegacyHcpContext,
  fetchLegacyPlayers,
  fetchRondaLibreJugadoresConCourseHcp,
  fetchTournamentBySlug,
  fetchTournamentGroups,
  fetchWithdrawnPlayers,
} from '@/lib/data/tournaments/leaderboard'
import {
  buildLeaderboardFromLegacy,
  buildLeaderboardFromRondaLibre,
  computeStats,
  computeTournamentResults,
  computeTeamTournamentResults,
  buildTeamPodium,
  type CourseHole,
  type TourneyStats,
  type TournamentLeaderboardContext,
  type TeamStandingForPodium,
} from '@/golf/leaderboard'
import { isTeamFormat, isSharedBallFormat } from '@/golf/formats'
import { esInscribible } from '@/lib/data/tournaments/joinFlow'

import { TournamentHeader } from './components/TournamentHeader'
import { TournamentNavTabs } from './components/TournamentNavTabs'
import { TournamentEventCard } from './components/TournamentEventCard'
import { TournamentPodium } from './components/TournamentPodium'
import { TournamentResults } from './components/TournamentResults'
import { TournamentWithdrawnList } from './components/TournamentWithdrawnList'
import { TournamentEmptyState } from './components/TournamentEmptyState'
import { TournamentFooter } from './components/TournamentFooter'
import type { TournamentResultados, WithdrawnEntry } from './types'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { parDeLaRondaDelTorneo } from '@/golf/core/course-handicap'
import { Suspense } from 'react'
import { GuestClaim } from './components/GuestClaim'
import { SITE_URL } from '@/lib/site-url'

export default async function TorneoPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient()
  // Ruta PUBLICA (no esta en protectedRoutes del middleware): aca getUser() es la
  // frontera de confianza, no se puede usar getPageUser() porque un token forjado
  // no dispararia redirect y getSession() devolveria un viewer falso.
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser()
  const tournament = await fetchTournamentBySlug(supabase, params.slug)

  // Slug inexistente -> 404 honesto.
  if (!tournament) notFound()

  // ── Check si el viewer ya esta inscrito ─────────────────────────────
  let viewerIsParticipant = false
  if (viewer) {
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('user_id', viewer.id)
      .maybeSingle()
    viewerIsParticipant = !!existingPlayer
  }
  const isOpen = esInscribible(tournament.status ?? '')
  const canJoin = isOpen && !viewerIsParticipant

  // ── Defaults ────────────────────────────────────────────────────────
  let players: Player[]                       = []
  let playersByGross: Player[]                = []
  let playersByNeto: Player[]                 = []
  let gwiInputs: JugadorGWIInput[]            = []
  let withdrawnPlayers: WithdrawnEntry[]      = []
  let tournamentName                          = tournament.name
  let parTotal                                = 72
  let modoJuego: ModoJuego                    = 'gross'
  let formatoJuego: FormatoJuego              = 'stroke_play'
  let totalHoyos                              = 18
  let dateDisplay                             = ''
  let isLive                                  = false
  let isClosed                                = false
  let stats: TourneyStats | null              = null
  let resultados: TournamentResultados | null = null
  let groupsData: GroupData[]                 = []
  let playerIdToIndex: Record<string, number> = {}
  let courseHoles: CourseHole[]               = []
  let teamStandings: LiveTeam[]               = []
  let orderedTeams: TeamStandingForPodium[]   = []
  let teamMemberNames: Record<string, string[]> = {}

  // Datos para la tarjeta de evento (torneos abiertos)
  let enrolledCount = 0
  let enrolledNames: string[] = []

  {
    modoJuego      = tournament.modo_juego ?? 'gross'
    formatoJuego   = tournament.formato_juego ?? 'stroke_play'
    totalHoyos     = tournament.hole_count ?? 18
    isLive         = torneoEnVivo(tournament.status, tournament.date_start, tournament.date_end, new Date())
    isClosed       = tournament.status === 'closed' || tournament.status === 'published'

    if (tournament.date_start) {
      dateDisplay = new Date(tournament.date_start).toLocaleDateString('es-CL', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    }

    const catalogo = tournament.courses?.id
      ? await fetchCourseHoles(supabase, tournament.courses.id)
      : []
    courseHoles = hoyosDeLaVuelta(catalogo, totalHoyos)
    parTotal = parDeLaRondaDelTorneo(catalogo, totalHoyos, tournament.courses?.par_total)

    const groups = await fetchTournamentGroups(supabase, tournament.id)
    const hasRondaLibreGroups = groups.some((g) => g.ronda_libre_id != null)

    groupsData = groups.map((g) => ({
      id: g.id,
      name: g.name,
      teeTime: g.tee_time
        ? new Date(g.tee_time).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
        : null,
      sortOrder: g.sort_order ?? 0,
      playerIds: (g.tournament_group_players || []).map((gp) => gp.player_id),
    }))

    const ctx: TournamentLeaderboardContext = {
      parTotal, totalHoyos, modoJuego, formatoJuego, courseHoles,
    }

    if (hasRondaLibreGroups) {
      const rondaIds = groups.map((g) => g.ronda_libre_id).filter(Boolean) as string[]
      const jugadores = await fetchRondaLibreJugadoresConCourseHcp(supabase, rondaIds, parTotal)
      const out = buildLeaderboardFromRondaLibre(jugadores, ctx)
      players = out.players
      playersByGross = out.playersByGross
      playersByNeto = out.playersByNeto
      gwiInputs = out.gwiInputs
    } else {
      const [withdrawn, dbPlayers, hcp] = await Promise.all([
        fetchWithdrawnPlayers(supabase, tournament.id),
        fetchLegacyPlayers(supabase, tournament.id),
        fetchLegacyHcpContext(supabase, tournament.id),
      ])
      withdrawnPlayers = withdrawn
      const out = buildLeaderboardFromLegacy(dbPlayers, { ...ctx, hcp }, tournament.total_rounds ?? 1)
      players = out.players
      playersByGross = out.playersByGross
      playersByNeto = out.playersByNeto
      gwiInputs = out.gwiInputs
      playerIdToIndex = out.playerIdToIndex
      stats = dbPlayers.length > 0 ? computeStats(dbPlayers, courseHoles, playersByNeto) : null
    }

    // Standings de equipos
    if (isSharedBallFormat(formatoJuego)) {
      const { teams, memberNames } = await fetchScrambleTeams(supabase, tournament.id)
      if (teams.length > 0) {
        const ordered = formatoJuego === 'foursome'
          ? computeFoursomeStandings(teams, memberNames, courseHoles, parTotal, formatoJuego, modoJuego, totalHoyos)
          : computeScrambleStandings(teams, courseHoles, parTotal, formatoJuego, modoJuego, totalHoyos)
        teamStandings = scrambleResultsToLiveTeams(ordered, memberNames, modoJuego)
        orderedTeams = ordered
        teamMemberNames = memberNames
      }
    } else if (formatoJuego === 'best_ball') {
      const { teams, memberNames } = await fetchBestBallTeams(supabase, tournament.id, parTotal)
      if (teams.length > 0) {
        const ordered = computeBestBallStandings(teams, courseHoles, parTotal, formatoJuego, modoJuego, totalHoyos)
        teamStandings = bestBallResultsToLiveTeams(ordered, memberNames, modoJuego)
        orderedTeams = ordered
        teamMemberNames = memberNames
      }
    }

    // Info de inscritos para la tarjeta de evento (torneos abiertos/sin scores)
    if (isOpen || (players.length === 0 && teamStandings.length === 0 && !isClosed)) {
      const [count, names] = await Promise.all([
        fetchEnrolledPlayerCount(supabase, tournament.id),
        fetchEnrolledPlayerNames(supabase, tournament.id),
      ])
      enrolledCount = count
      enrolledNames = names
    }
  }

  if (isClosed) {
    if (isTeamFormat(formatoJuego) && orderedTeams.length > 0) {
      resultados = computeTeamTournamentResults(orderedTeams, teamMemberNames, modoJuego, formatoJuego)
    } else if (players.length > 0) {
      resultados = computeTournamentResults(playersByGross, playersByNeto, parTotal, stats)
    }
  }

  // ── Podio top 3 para torneos cerrados ──────────────────────────────
  const podiumEntries = (() => {
    if (!isClosed) return []
    if (isTeamFormat(formatoJuego) && orderedTeams.length > 0) {
      return buildTeamPodium(orderedTeams, teamMemberNames, modoJuego, formatoJuego, 3)
        .map((t) => ({ pos: t.pos, name: t.name, score: t.score }))
    }
    if (players.length > 0) {
      return players.slice(0, 3).map((p, i) => ({
        pos: i + 1,
        name: p.name,
        score: p.total === 0 ? 'E' : p.total > 0 ? `+${p.total}` : `${p.total}`,
      }))
    }
    return []
  })()

  const hasData = players.length > 0 || teamStandings.length > 0
  const showEventCard = isOpen || (!hasData && !isClosed)

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <TournamentHeader
        tournamentName={tournamentName}
        courseName={tournament?.courses?.nombre ?? null}
        totalHoyos={totalHoyos}
        format={formatoJuego}
        modo={modoJuego}
        status={tournament?.status ?? null}
        live={isLive}
        dateDisplay={dateDisplay}
        coverImageUrl={tournament?.cover_image_url ?? null}
        codigo={tournament?.codigo ?? null}
        slug={params.slug}
      />

      {/* ── Nav tabs ── */}
      <div style={{ marginTop: '12px' }}>
        <TournamentNavTabs
          slug={params.slug}
          activeTab="info"
          showJoinTab={canJoin}
          showLiveTab={isLive || (tournament.status === 'in_progress')}
        />
      </div>

      {/* ── Tarjeta de evento (torneos abiertos / sin scores) ── */}
      {showEventCard && (
        <div style={{ marginTop: '16px' }}>
          <TournamentEventCard
            dateStart={tournament.date_start}
            courseName={tournament?.courses?.nombre ?? null}
            courseCity={tournament?.courses?.ciudad ?? null}
            formatoJuego={formatoJuego}
            modoJuego={modoJuego}
            totalHoyos={totalHoyos}
            maxPlayers={tournament.max_players ?? null}
            enrolledCount={enrolledCount}
            enrolledNames={enrolledNames}
          />
        </div>
      )}

      {/* ── CTA "Unirme" + invitar por WhatsApp ── */}
      {canJoin && (
        <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '16px 16px 0' }}>
          <Link
            href={`/torneo/${params.slug}/unirse`}
            className="dark:bg-amber-500 dark:text-gray-950"
            style={{
              display: 'block',
              width: '100%',
              background: 'var(--brand-gold, #c4992a)',
              color: 'var(--brand-dark, #070d18)',
              fontWeight: 700,
              fontSize: '16px',
              padding: '14px 24px',
              borderRadius: '12px',
              textDecoration: 'none',
              textAlign: 'center',
              letterSpacing: '-0.01em',
              minHeight: '48px',
            }}
          >
            Inscribirme en este torneo
          </Link>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Te invito al torneo ${tournamentName} en Golfers+. Inscr\u00edbete ac\u00e1: ${SITE_URL}/torneo/${params.slug}/unirse`)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              marginTop: '8px',
              fontSize: '14px',
              color: '#25D366',
              fontWeight: 600,
              textDecoration: 'none',
              padding: '8px',
              minHeight: '44px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.019-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Invitar amigos por WhatsApp
          </a>
        </div>
      )}

      {/* ── Podio top 3 (torneo cerrado) ── */}
      {isClosed && podiumEntries.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <TournamentPodium entries={podiumEntries} />
        </div>
      )}

      {/* ── Leaderboard / Empty state ── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-7">
        {teamStandings.length > 0 ? (
          <TeamLeaderboard teams={teamStandings} />
        ) : players.length > 0 ? (
          <TournamentTabs
            players={players}
            playersByGross={playersByGross}
            playersByNeto={playersByNeto}
            groups={groupsData}
            modoJuego={modoJuego}
            totalHoyos={totalHoyos}
            isLive={isLive}
            gwiInputs={gwiInputs}
            playerIdToIndex={playerIdToIndex}
            formato={formatoJuego}
            courseHoles={courseHoles}
            courseName={tournament?.courses?.nombre}
            formatLabel={formatLabel(formatoJuego, modoJuego)}
          />
        ) : (
          !showEventCard && <TournamentEmptyState tournamentFound={tournament !== null} />
        )}
      </div>

      {resultados && <TournamentResults resultados={resultados} />}

      {isClosed && (players.length > 0 || orderedTeams.length > 0) && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 text-center">
          <ShareResultsButton
            tournamentName={tournamentName}
            courseName={tournament?.courses?.nombre ?? 'Cancha'}
            dateDisplay={dateDisplay}
            parTotal={parTotal}
            topPlayers={
              isTeamFormat(formatoJuego) && orderedTeams.length > 0
                ? buildTeamPodium(orderedTeams, teamMemberNames, modoJuego, formatoJuego, 5)
                    .map((t) => ({ pos: t.pos, name: t.name, score: t.score }))
                : players.slice(0, 5).map((p, i) => ({
                    pos: i + 1,
                    name: p.name,
                    score: p.total === 0 ? 'E' : p.total > 0 ? `+${p.total}` : `${p.total}`,
                  }))
            }
          />
        </div>
      )}

      {/* Footer CTA registro/demo -- solo a usuarios sin sesion Y sin data */}
      {!viewer && players.length === 0 && teamStandings.length === 0 && <TournamentFooter />}

      <TournamentWithdrawnList withdrawnPlayers={withdrawnPlayers} />

      {tournament && (
        <TournamentBottomSheet slug={tournament.slug} isLive={isLive} isDemo={!!tournament.es_demo} />
      )}

      {/* Migrar datos de invitado a cuenta recien creada (invisible) */}
      <Suspense fallback={null}>
        <GuestClaim slug={params.slug} isAuthenticated={!!viewer} />
      </Suspense>
    </div>
  )
}
