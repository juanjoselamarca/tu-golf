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
import { TournamentBottomSheet } from '@/components/TournamentBottomSheet'
import ShareResultsButton from '@/components/ShareResultsButton'
import { PLAYERS, PAR } from '@/lib/golf-data'
import type { Player } from '@/lib/golf-data'
import { createClient } from '@/utils/supabase/server'
import { formatLabel, type ModoJuego, type FormatoJuego } from '@/golf/core/rules'
import type { JugadorGWIInput } from '@/golf/stats/gwi'

import {
  buildFallbackCourseHoles,
  fetchCourseHoles,
  fetchLegacyPlayers,
  fetchRondaLibreJugadores,
  fetchTournamentBySlug,
  fetchTournamentGroups,
  fetchWithdrawnPlayers,
} from '@/lib/data/tournaments/leaderboard'
import {
  buildLeaderboardFromLegacy,
  buildLeaderboardFromRondaLibre,
  computeStats,
  computeTournamentResults,
  type CourseHole,
  type TourneyStats,
  type TournamentLeaderboardContext,
} from '@/golf/leaderboard'

import { TournamentHeader } from './components/TournamentHeader'
import { TournamentResults } from './components/TournamentResults'
import { TournamentWithdrawnList } from './components/TournamentWithdrawnList'
import { TournamentEmptyState } from './components/TournamentEmptyState'
import { TournamentFooter } from './components/TournamentFooter'
import type { TournamentResultados, WithdrawnEntry } from './types'

export default async function TorneoPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient()
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser()
  const tournament = await fetchTournamentBySlug(supabase, params.slug)

  // ── Defaults para fallback demo (cuando slug no existe) ─────────────
  let players: Player[]                       = []
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

  if (tournament) {
    tournamentName = tournament.name
    parTotal       = tournament.courses?.par_total ?? 72
    modoJuego      = tournament.modo_juego ?? 'gross'
    formatoJuego   = tournament.formato_juego ?? 'stroke_play'
    totalHoyos     = tournament.hole_count ?? 18
    isLive         = tournament.status === 'active' || tournament.status === 'in_progress'
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
      const jugadores = await fetchRondaLibreJugadores(supabase, rondaIds)
      const out = buildLeaderboardFromRondaLibre(jugadores, ctx)
      players = out.players
      gwiInputs = out.gwiInputs
    } else {
      withdrawnPlayers = await fetchWithdrawnPlayers(supabase, tournament.id)
      const dbPlayers = await fetchLegacyPlayers(supabase, tournament.id)
      const out = buildLeaderboardFromLegacy(dbPlayers, ctx, tournament.total_rounds ?? 1)
      players = out.players
      gwiInputs = out.gwiInputs
      playerIdToIndex = out.playerIdToIndex
      stats = dbPlayers.length > 0 ? computeStats(dbPlayers, courseHoles, parTotal) : null
    }
  } else {
    // Demo fallback (slug no encontrado)
    players  = PLAYERS
    parTotal = PAR.reduce((s: number, p: number) => s + p, 0)
    isLive   = true
  }

  if (isClosed && players.length > 0) {
    resultados = computeTournamentResults(players, parTotal, stats)
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
        {players.length > 0 ? (
          <TournamentTabs
            players={players}
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

      {isClosed && players.length > 0 && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 text-center">
          <ShareResultsButton
            tournamentName={tournamentName}
            courseName={tournament?.courses?.nombre ?? 'Cancha'}
            dateDisplay={dateDisplay}
            parTotal={parTotal}
            topPlayers={players.slice(0, 5).map((p, i) => ({
              pos: i + 1,
              name: p.name,
              score: p.total === 0 ? 'E' : p.total > 0 ? `+${p.total}` : `${p.total}`,
            }))}
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
