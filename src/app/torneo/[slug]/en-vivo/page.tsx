// src/app/torneo/[slug]/en-vivo/page.tsx
// Server component: resuelve datos crudos de Supabase y delega a LiveView (client).
// MVP: agregamos players + scores. teams y matches quedan como [] hasta que existan datos reales en BD.

import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import LiveView from './LiveView'
import type { LivePlayer, LiveTournament, LiveFormat, LiveMode, LiveStatus, LiveTeam } from './types'
import { normalizeStatus } from './normalize-status'
import { torneoEnVivo } from '@/golf/tournament-live-status'
import { fetchScrambleTeams, fetchBestBallTeams } from '@/lib/data/tournaments/teamLeaderboard'
import { computeScrambleStandings, computeFoursomeStandings, computeBestBallStandings } from '@/golf/leaderboard/team-standings'
import { buildLeaderboardFromLegacy } from '@/golf/leaderboard/build-from-legacy'
import type { TournamentLeaderboardContext } from '@/golf/leaderboard/types'
import {
  fetchCourseHoles,
  fetchLegacyHcpContext,
  fetchLegacyPlayers,
  buildFallbackCourseHoles,
  sumParDedupByHole,
} from '@/lib/data/tournaments/leaderboard'
import { scrambleResultsToLiveTeams, bestBallResultsToLiveTeams } from './scrambleTeamsToLive'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }> | { slug: string }
}

const VALID_FORMATS: LiveFormat[] = ['stroke_play', 'stableford', 'best_ball', 'scramble', 'match_play', 'foursome']

function normalizeFormat(raw: unknown): LiveFormat {
  if (typeof raw === 'string' && (VALID_FORMATS as string[]).includes(raw)) {
    return raw as LiveFormat
  }
  return 'stroke_play'
}

function normalizeModo(raw: unknown): LiveMode {
  if (raw === 'neto' || raw === 'gross') return raw
  return 'gross'
}

export default async function LivePage({ params }: PageProps) {
  const resolvedParams = await Promise.resolve(params)
  const supabase = await createClient()

  // 1) Torneo + curso + categorias + grupos (single round-trip)
  const { data: tournamentRaw } = await supabase
    .from('tournaments')
    .select(
      'id, slug, name, format, formato_juego, modo_juego, hole_count, total_rounds, status, date_start, date_end, course_id, courses(nombre, par_total), categories(id, name), tournament_groups(id, name)'
    )
    .eq('slug', resolvedParams.slug)
    .single()

  if (!tournamentRaw) notFound()
  const tournament = tournamentRaw as unknown as {
    id: string
    slug: string
    name: string
    format: string | null
    formato_juego: string | null
    modo_juego: string | null
    hole_count: number | null
    total_rounds: number | null
    status: string | null
    date_start: string | null
    date_end: string | null
    course_id: string | null
    courses: { nombre: string | null; par_total: number | null } | null
    categories: Array<{ id: string; name: string }> | null
    tournament_groups: Array<{ id: string; name: string }> | null
  }

  const parTotal = tournament.courses?.par_total ?? 72
  const holeCount = tournament.hole_count ?? 18

  // 2) Players (activos) — MISMA query y MISMO motor que el board de /torneo.
  //    Antes esta pantalla agregaba los scores por su cuenta y divergía: medía
  //    "a par" contra la vuelta completa (thru 3 salía líder a −60), nunca
  //    calculaba el neto (la columna quedaba vacía y el orden en modo neto era
  //    arbitrario) y los invitados aparecían como "Sin nombre".
  const dbPlayers = await fetchLegacyPlayers(supabase, tournament.id)
  const playerIds = dbPlayers.map((p) => p.id)

  // 4) Mapping player_id -> group_id desde tournament_group_players (filtro "solo mi grupo").
  const playerGroupMap = new Map<string, string>()
  if (playerIds.length > 0) {
    const { data: groupPlayersRaw } = await supabase
      .from('tournament_group_players')
      .select('group_id, player_id')
      .in('player_id', playerIds)
    if (groupPlayersRaw) {
      ;(groupPlayersRaw as unknown as Array<{ group_id: string; player_id: string }>).forEach((gp) => {
        playerGroupMap.set(gp.player_id, gp.group_id)
      })
    }
  }

  // 6) Determinar formato canonico. Priorizamos `formato_juego` (canonico nuevo) y caemos a `format` legacy.
  const rawFormat = tournament.formato_juego ?? tournament.format ?? 'stroke_play'
  const liveTournament: LiveTournament = {
    id: tournament.id,
    slug: tournament.slug,
    name: tournament.name,
    format: normalizeFormat(rawFormat),
    modo: normalizeModo(tournament.modo_juego),
    hole_count: holeCount,
    total_rounds: tournament.total_rounds ?? 1,
    par_total: parTotal,
    course_name: tournament.courses?.nombre ?? undefined,
    status: normalizeStatus(tournament.status),
    // Fuente única de liveness (misma que /torneo): date-aware, no solo status.
    live: torneoEnVivo(tournament.status, tournament.date_start, tournament.date_end, new Date()),
  }

  // 6b) Board individual: UNA sola computación, la del motor. `buildLeaderboardFromLegacy`
  //     ya resuelve nombre (invitados incluidos), neto con stroke index normalizado,
  //     "a par" contra los hoyos jugados, orden y countback. Acá sólo se proyecta su
  //     salida al shape que consume LiveView, sin recalcular nada.
  const individualHoles = tournament.course_id
    ? await fetchCourseHoles(supabase, tournament.course_id)
    : []
  const boardHoles = individualHoles.length > 0 ? individualHoles : buildFallbackCourseHoles(holeCount)
  const boardCtx: TournamentLeaderboardContext = {
    parTotal: sumParDedupByHole(boardHoles),
    totalHoyos: holeCount,
    modoJuego: liveTournament.modo as ModoJuego,
    formatoJuego: normalizeFormat(rawFormat) as FormatoJuego,
    courseHoles: boardHoles,
    // Course handicap por tee (mitad en vueltas de 9h), igual que /torneo, /tv y
    // la tarjeta del organizador. Fuente única: fetchLegacyHcpContext.
    hcp: await fetchLegacyHcpContext(supabase, tournament.id),
  }
  const board = buildLeaderboardFromLegacy(dbPlayers, boardCtx, liveTournament.total_rounds)
  const playerMetaById = new Map(
    dbPlayers.map((p) => [p.id, { categoryId: p.category_id ?? null, categoryName: p.categories?.name ?? undefined }]),
  )

  const players: Array<LivePlayer & { group_id?: string | null; category_id?: string | null }> =
    board.players.map((p) => {
      const meta = p.id ? playerMetaById.get(p.id) : undefined
      return {
        id: p.id ?? '',
        name: p.name,
        category_name: meta?.categoryName,
        // Columna "HCP Cancha": el course handicap COMPLETO (18h), igual que /torneo.
        handicap_index: p.hcpDisplay ?? p.hcp,
        scores_per_hole: p.scores.map((s) => s ?? 0),
        gross_total: p.grossTotal ?? 0,
        net_total: p.netTotal,
        points_total: p.stablefordTotal,
        vs_par: p.total,
        thru: p.holes,
        group_id: (p.id && playerGroupMap.get(p.id)) || null,
        category_id: meta?.categoryId ?? null,
      }
    })

  // 7) Equipos: standings desde grupos + ronda_equipos.
  //    - scramble/foursome: un score COMPARTIDO por equipo por hoyo (cambia el
  //      motor: calcularScramble vs calcularFoursome).
  //    - best_ball: score INDIVIDUAL por jugador; el motor toma la mejor bola
  //      neta por hoyo (fetchBestBallTeams lee los scores individuales + course
  //      handicap, paridad exacta con la tarjeta en cancha).
  let liveTeams: LiveTeam[] = []
  if ((liveTournament.format === 'scramble' || liveTournament.format === 'foursome') && tournament.course_id) {
    const { teams, memberNames } = await fetchScrambleTeams(supabase, tournament.id)
    if (teams.length > 0) {
      const courseHoles = await fetchCourseHoles(supabase, tournament.course_id)
      const holes = courseHoles.length > 0 ? courseHoles : buildFallbackCourseHoles(holeCount)
      const formato = liveTournament.format as FormatoJuego
      const modo = liveTournament.modo as ModoJuego
      const ordered = liveTournament.format === 'foursome'
        ? computeFoursomeStandings(teams, memberNames, holes, parTotal, formato, modo, holeCount)
        : computeScrambleStandings(teams, holes, parTotal, formato, modo, holeCount)
      liveTeams = scrambleResultsToLiveTeams(ordered, memberNames, liveTournament.modo)
    }
  } else if (liveTournament.format === 'best_ball' && tournament.course_id) {
    const courseHoles = await fetchCourseHoles(supabase, tournament.course_id)
    const holes = courseHoles.length > 0 ? courseHoles : buildFallbackCourseHoles(holeCount)
    // par para el course handicap = suma del par real de course_holes, deduplicado
    // por nº de hoyo (igual que el scorer: pm[numero]=par). Evita inflar el par en
    // canchas multi-recorrido (27/36h) con filas repetidas → mismo course handicap
    // que la tarjeta en cancha.
    const parForHcp = sumParDedupByHole(holes)
    const { teams, memberNames } = await fetchBestBallTeams(supabase, tournament.id, parForHcp)
    if (teams.length > 0) {
      const formato = liveTournament.format as FormatoJuego
      const modo = liveTournament.modo as ModoJuego
      const ordered = computeBestBallStandings(teams, holes, parTotal, formato, modo, holeCount)
      liveTeams = bestBallResultsToLiveTeams(ordered, memberNames, liveTournament.modo)
    }
  }

  return (
    <LiveView
      tournament={liveTournament}
      players={players}
      teams={liveTeams}
      matches={[]}
      categories={tournament.categories ?? []}
      groups={tournament.tournament_groups ?? []}
    />
  )
}
