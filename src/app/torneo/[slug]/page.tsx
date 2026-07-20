// src/app/torneo/[slug]/page.tsx
//
// Vista pública del torneo. Orchestrator delgado: carga datos vía
// `src/lib/data/tournaments/leaderboard.ts`, arma rankings con
// `src/golf/leaderboard/`, y compone los sub-componentes UI.
//
// Refactor 26-may-2026: 917 LOC → <200 LOC (regla "el que toca, ordena").
//   - Lógica de scoring → src/golf/leaderboard/
//   - Queries Supabase → src/lib/data/tournaments/leaderboard.ts
//   - Sub-componentes JSX → components/*

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
  buildFallbackCourseHoles,
  fetchCourseHoles,
  fetchLegacyPlayers,
  fetchRondaLibreJugadoresConCourseHcp,
  fetchTournamentBySlug,
  fetchTournamentGroups,
  fetchWithdrawnPlayers,
  sumParDedupByHole,
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

import { TournamentHeader } from './components/TournamentHeader'
import { TournamentResults } from './components/TournamentResults'
import { TournamentWithdrawnList } from './components/TournamentWithdrawnList'
import { TournamentEmptyState } from './components/TournamentEmptyState'
import { TournamentFooter } from './components/TournamentFooter'
import type { TournamentResultados, WithdrawnEntry } from './types'

export default async function TorneoPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient()
  // Ruta PÚBLICA (no está en protectedRoutes del middleware): acá getUser() es la
  // frontera de confianza, no se puede usar getPageUser() porque un token forjado
  // no dispararía redirect y getSession() devolvería un viewer falso.
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser()
  const tournament = await fetchTournamentBySlug(supabase, params.slug)

  // Slug inexistente → 404 honesto. Antes caía a un leaderboard DEMO
  // hardcodeado (PLAYERS/PAR): el invitado con un link mal pegado veía nombres
  // inventados y creía estar en otro torneo. Una app que inventa datos es peor
  // que una que dice "no existe" (CERO FALLOS, 20-jul-2026).
  if (!tournament) notFound()

  // ── Defaults ────────────────────────────────────────────────────────
  let players: Player[]                       = []
  let playersByGross: Player[]                = []
  let playersByNeto: Player[]                 = []
  let gwiInputs: JugadorGWIInput[]            = []
  let withdrawnPlayers: WithdrawnEntry[]      = []
  let tournamentName                          = 'TPC Sawgrass Amateur 2025'
  let parTotal                                = 72
  let modoJuego: ModoJuego                    = 'gross'
  let formatoJuego: FormatoJuego              = 'stroke_play'
  let totalHoyos                              = 18
  let dateDisplay                             = '12 Mar 2025'
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

  if (tournament) {
    tournamentName = tournament.name
    parTotal       = tournament.courses?.par_total ?? 72
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

    courseHoles = tournament.courses?.id
      ? await fetchCourseHoles(supabase, tournament.courses.id)
      : []
    if (courseHoles.length === 0) {
      courseHoles = buildFallbackCourseHoles(totalHoyos)
    }

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
      // Resuelve el handicap de cada jugador a COURSE HANDICAP por su tee (mismo
      // cálculo que la tarjeta en cancha) para que el neto/stableford de la tabla
      // coincida con el del jugador. En cancha estándar (slope 113, CR=par) o sin
      // cancha vinculada es idéntico al índice → sin cambio. parTotal deduplicado
      // por hoyo (lo que usa el scorer), no la columna courses.par_total.
      const parParaHcp = sumParDedupByHole(courseHoles)
      const jugadores = await fetchRondaLibreJugadoresConCourseHcp(supabase, rondaIds, parParaHcp)
      const out = buildLeaderboardFromRondaLibre(jugadores, ctx)
      players = out.players
      playersByGross = out.playersByGross
      playersByNeto = out.playersByNeto
      gwiInputs = out.gwiInputs
    } else {
      withdrawnPlayers = await fetchWithdrawnPlayers(supabase, tournament.id)
      const dbPlayers = await fetchLegacyPlayers(supabase, tournament.id)
      const out = buildLeaderboardFromLegacy(dbPlayers, ctx, tournament.total_rounds ?? 1)
      players = out.players
      playersByGross = out.playersByGross
      playersByNeto = out.playersByNeto
      gwiInputs = out.gwiInputs
      playerIdToIndex = out.playerIdToIndex
      stats = dbPlayers.length > 0 ? computeStats(dbPlayers, courseHoles, parTotal) : null
    }

    // Standings de equipos: el grupo de salida ES el equipo.
    //  - scramble/foursome: un score COMPARTIDO por equipo por hoyo (cambia el motor).
    //  - best_ball: score INDIVIDUAL por jugador; el motor toma la mejor bola
    //    neta por hoyo (paridad exacta con la tarjeta en cancha).
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
      // par para el course handicap = suma del par de course_holes deduplicado por
      // nº de hoyo (igual que el scorer; evita inflar el par en canchas 27/36h).
      const parForHcp = sumParDedupByHole(courseHoles)
      const { teams, memberNames } = await fetchBestBallTeams(supabase, tournament.id, parForHcp)
      if (teams.length > 0) {
        const ordered = computeBestBallStandings(teams, courseHoles, parTotal, formatoJuego, modoJuego, totalHoyos)
        teamStandings = bestBallResultsToLiveTeams(ordered, memberNames, modoJuego)
        orderedTeams = ordered
        teamMemberNames = memberNames
      }
    }
  }

  if (isClosed) {
    // Torneo por equipos → podio de parejas (del mismo board ya ordenado + con
    // desempate). Individual → podio gross/neto de jugadores. "Un concepto, una
    // fuente": el ganador sale del board, no de un cálculo paralelo.
    if (isTeamFormat(formatoJuego) && orderedTeams.length > 0) {
      resultados = computeTeamTournamentResults(orderedTeams, teamMemberNames, modoJuego, formatoJuego)
    } else if (players.length > 0) {
      resultados = computeTournamentResults(playersByGross, playersByNeto, parTotal, stats)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#ffffff' }}>
      <TournamentHeader
        tournamentName={tournamentName}
        slug={tournament?.slug ?? null}
        courseName={tournament?.courses?.nombre ?? null}
        totalHoyos={totalHoyos}
        formatLabel={formatLabel(formatoJuego, modoJuego)}
        dateDisplay={dateDisplay}
        isLive={isLive}
        isClosed={isClosed}
        coverImageUrl={tournament?.cover_image_url ?? null}
        codigo={tournament?.codigo ?? null}
      />

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
          <TournamentEmptyState tournamentFound={tournament !== null} />
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

      {/* Footer CTA registro/demo — solo a usuarios sin sesión. No tiene
          sentido recomendar "crear cuenta" a alguien ya logueado (inbox 22257fa0). */}
      {!viewer && <TournamentFooter />}

      <TournamentWithdrawnList withdrawnPlayers={withdrawnPlayers} />

      {tournament && (
        <TournamentBottomSheet slug={tournament.slug} isLive={isLive} isDemo={!!tournament.es_demo} />
      )}
    </div>
  )
}
