// src/app/torneo/[slug]/en-vivo/page.tsx
// Server component: resuelve datos crudos de Supabase y delega a LiveView (client).
// MVP: agregamos players + scores. teams y matches quedan como [] hasta que existan datos reales en BD.

import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import LiveView from './LiveView'
import type { LivePlayer, LiveTournament, LiveFormat, LiveMode, LiveStatus, LiveTeam } from './types'
import { normalizeStatus } from './normalize-status'
import { fetchScrambleTeams, fetchBestBallTeams } from '@/lib/data/tournaments/teamLeaderboard'
import { computeScrambleStandings, computeFoursomeStandings, computeBestBallStandings } from '@/golf/leaderboard/team-standings'
import { fetchCourseHoles, buildFallbackCourseHoles, sumParDedupByHole } from '@/lib/data/tournaments/leaderboard'
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
      'id, slug, name, format, formato_juego, modo_juego, hole_count, total_rounds, status, course_id, courses(nombre, par_total), categories(id, name), tournament_groups(id, name)'
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
    course_id: string | null
    courses: { nombre: string | null; par_total: number | null } | null
    categories: Array<{ id: string; name: string }> | null
    tournament_groups: Array<{ id: string; name: string }> | null
  }

  const parTotal = tournament.courses?.par_total ?? 72
  const holeCount = tournament.hole_count ?? 18

  // 2) Players (activos)
  const { data: playersRaw } = await supabase
    .from('players')
    .select(
      'id, user_id, handicap_at_registration, status, profiles(name), category_id, categories(name)'
    )
    .eq('tournament_id', tournament.id)
    .in('status', ['pending', 'approved', 'waitlist'])

  type PlayerRow = {
    id: string
    user_id: string | null
    handicap_at_registration: number | null
    status: string
    profiles: { name: string | null } | null
    category_id: string | null
    categories: { name: string | null } | null
  }
  const playerRows = ((playersRaw ?? []) as unknown) as PlayerRow[]

  // 3) Rondas + hole_scores (chain players -> rounds -> hole_scores)
  const playerIds = playerRows.map((p) => p.id)

  type RoundRow = { id: string; player_id: string; round_number: number | null }
  let rounds: RoundRow[] = []
  if (playerIds.length > 0) {
    const { data: roundsRaw } = await supabase
      .from('rounds')
      .select('id, player_id, round_number')
      .in('player_id', playerIds)
    rounds = ((roundsRaw ?? []) as unknown) as RoundRow[]
  }

  type ScoreRow = { id: string; round_id: string; hole_number: number; gross_score: number | null }
  let scores: ScoreRow[] = []
  const roundIds = rounds.map((r) => r.id)
  if (roundIds.length > 0) {
    const { data: scoresRaw } = await supabase
      .from('hole_scores')
      .select('id, round_id, hole_number, gross_score')
      .in('round_id', roundIds)
    scores = ((scoresRaw ?? []) as unknown) as ScoreRow[]
  }

  // 4) Mapping player_id -> group_id desde tournament_group_players (filtro "solo mi grupo").
  let playerGroupMap = new Map<string, string>()
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

  // 5) Agregar players con sus scores totales.
  const players: LivePlayer[] = playerRows.map((p) => {
    const roundsOfPlayer = rounds.filter((r) => r.player_id === p.id)
    const playerScores = scores.filter((s) => roundsOfPlayer.some((r) => r.id === s.round_id))
    const scoresPerHole = playerScores
      .map((s) => s.gross_score ?? 0)
      .filter((v): v is number => Number.isFinite(v))
    const grossTotal = scoresPerHole.reduce((a, b) => a + b, 0)
    const thru = playerScores.filter((s) => s.gross_score !== null).length

    // Atributos extendidos (group_id, category_id) que viajan en el shape pero no son parte de LiveBase.
    const ext: LivePlayer & { group_id?: string | null; category_id?: string | null } = {
      id: p.id,
      name: p.profiles?.name ?? 'Sin nombre',
      category_name: p.categories?.name ?? undefined,
      handicap_index: Number(p.handicap_at_registration ?? 0),
      scores_per_hole: scoresPerHole,
      gross_total: grossTotal,
      vs_par: grossTotal > 0 ? grossTotal - parTotal : 0,
      thru,
      group_id: playerGroupMap.get(p.id) ?? null,
      category_id: p.category_id ?? null,
    }
    return ext
  })

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
  }

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
