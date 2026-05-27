/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { Users } from '@/components/icons'
import TournamentTabs from '@/components/TournamentTabs'
import type { GroupData } from '@/components/TournamentTabs'
import { TournamentBottomSheet } from '@/components/TournamentBottomSheet'
import ShareResultsButton from '@/components/ShareResultsButton'
import { PLAYERS, PAR } from '@/lib/golf-data'
import type { Player } from '@/lib/golf-data'
import { createClient } from '@/utils/supabase/server'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import { formatLabel, type ModoJuego, type FormatoJuego } from '@/golf/core/rules'
import type { JugadorGWIInput } from '@/golf/stats/gwi'
import { resolveLeaderboardTies } from '@/golf/core/countback'
import type { CountbackPlayer, CountbackMode, CountbackResult } from '@/golf/core/countback'

interface DBPlayer {
  id: string
  handicap_at_registration: number | null
  player_name: string | null
  profiles: { name: string; indice: number | null } | null
  categories: { name: string } | null
  rounds: {
    id: string
    status: string
    total_gross: number
    total_net: number
    total_points: number
    round_number: number
    hole_scores: { hole_number: number; gross_score: number | null }[]
  }[]
}

interface DBTournament {
  id: string
  name: string
  slug: string
  format: string
  hole_count: number
  total_rounds: number
  modo_juego: ModoJuego | null
  formato_juego: FormatoJuego | null
  date_start: string | null
  status: string
  codigo: string | null
  afecta_estadisticas: boolean | null
  es_demo: boolean | null
  cover_image_url: string | null
  courses: { id: string; nombre: string; ciudad: string; par_total: number; slope_rating: number; course_rating: number } | null
}

// Types for ronda-libre-based scoring
interface DBTournamentGroup {
  id: string
  ronda_libre_id: string | null
  name: string
}

interface DBRondaLibreJugador {
  id: string
  nombre: string
  user_id: string | null
  scores: Record<string, number> | null
  handicap: number | null
  ronda_id: string
}

interface LeaderboardEntry {
  name: string
  handicap: number
  grossTotal: number
  netTotal: number
  stablefordTotal: number
  stablefordScores?: number[]
  vsPar: number
  holesPlayed: number
  scores: (number | null)[]
  status: 'live' | 'F'
  tieAnnotation?: string
}

interface DBCourseHole { numero: number; par: number; stroke_index: number }

interface TourneyStats {
  bestName:    string
  bestNet:     number
  avgNet:      number
  eagles:      number
  birdies:     number
  hardestHole: { hole: number; avg: number } | null
  easiestHole: { hole: number; avg: number } | null
}

function computeStats(dbPlayers: DBPlayer[], courseHoles: DBCourseHole[], parTotal: number): TourneyStats | null {
  const withScores = dbPlayers.filter((p) => p.rounds?.[0]?.hole_scores?.some((hs) => hs.gross_score != null))
  if (withScores.length === 0) return null

  const parMap = new Map<number, number>()
  courseHoles.forEach((h) => parMap.set(h.numero, h.par))

  // Las stats agregadas vs par (best card, avg neto) SOLO se calculan
  // sobre rondas terminadas. Una ronda parcial tiene total_gross y total_net
  // parciales, y compararlos contra parTotal completo da números absurdos
  // del tipo "líder a -28" cuando en realidad nadie terminó. Las stats por
  // hoyo (eagles, birdies, hole difficulty) sí usan rondas parciales porque
  // se calculan hoyo a hoyo.
  const totalHoles = courseHoles.length || 18
  const finished = withScores.filter((p) =>
    (p.rounds[0].hole_scores?.length ?? 0) >= totalHoles
    && p.rounds[0].total_net != null
  )

  // Best card (solo rondas terminadas)
  const bySortedNet = [...finished].sort((a, b) => (a.rounds[0].total_net ?? 999) - (b.rounds[0].total_net ?? 999))
  const bestName    = bySortedNet[0]?.profiles?.name ?? '—'
  const bestNet     = bySortedNet[0]?.rounds[0].total_net ?? 0

  // Avg net vs par (solo rondas terminadas)
  const netVals = finished.map((p) => (p.rounds[0].total_net ?? 0) - parTotal)
  const avgNet  = netVals.length > 0 ? netVals.reduce((s, v) => s + v, 0) / netVals.length : 0

  // Eagles, birdies, hole difficulty
  let eagles = 0, birdies = 0
  const holeSums: Record<number, { total: number; count: number }> = {}

  withScores.forEach((p) => {
    p.rounds[0].hole_scores.forEach((hs) => {
      if (hs.gross_score == null) return
      const par = parMap.get(hs.hole_number)
      if (par == null) return
      const diff = hs.gross_score - par
      if (diff <= -2) eagles++
      if (diff === -1) birdies++
      if (!holeSums[hs.hole_number]) holeSums[hs.hole_number] = { total: 0, count: 0 }
      holeSums[hs.hole_number].total += diff
      holeSums[hs.hole_number].count++
    })
  })

  let hardestHole: TourneyStats['hardestHole'] = null
  let easiestHole: TourneyStats['easiestHole'] = null
  let maxAvg = -Infinity, minAvg = Infinity

  Object.entries(holeSums).forEach(([hStr, { total, count }]) => {
    const avg = total / count
    const h   = parseInt(hStr)
    if (avg > maxAvg) { maxAvg = avg; hardestHole = { hole: h, avg } }
    if (avg < minAvg) { minAvg = avg; easiestHole = { hole: h, avg } }
  })

  return { bestName, bestNet, avgNet, eagles, birdies, hardestHole, easiestHole }
}

export default async function TorneoPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient()
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser()

  // Try to fetch real tournament
  const { data: rawTournament } = await supabase
    .from('tournaments')
    .select('id, name, slug, format, hole_count, total_rounds, modo_juego, formato_juego, date_start, status, codigo, afecta_estadisticas, es_demo, cover_image_url, courses(id, nombre, ciudad, par_total, slope_rating, course_rating)')
    .eq('slug', params.slug)
    .single()

  const tournament = rawTournament as unknown as DBTournament | null

  // Fetch real players if tournament found
  let players: Player[]                = []
  let gwiInputs: JugadorGWIInput[]     = []
  // Jugadores WD/DQ — visibles en footer del leaderboard por transparencia USGA.
  // Mantienen sus scores en BD pero no compiten por posición.
  let withdrawnPlayers: { name: string; status: 'withdrawn' | 'disqualified'; reason: string | null }[] = []
  let tournamentName                   = 'TPC Sawgrass Amateur 2025'
  let parTotal                         = 72
  let modoJuego: ModoJuego             = 'gross'
  let formatoJuego: FormatoJuego       = 'stroke_play'
  let totalHoyos                       = 18
  let dateDisplay                      = '12 Mar 2025'
  let isLive                           = false
  let isClosed                         = false
  let stats: TourneyStats | null       = null
  let resultados: {
    grossWinner: { name: string; score: number } | null
    netoWinner: { name: string; score: number } | null
    grossSecond: { name: string; score: number } | null
    netoSecond: { name: string; score: number } | null
    avgField: number
    totalEagles: number
    totalBirdies: number
  } | null = null
  let groupsData: GroupData[] = []
  let playerIdToIndex: Record<string, number> = {}
  let courseHoles: DBCourseHole[] = []

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

    // Course holes for stats + GWI
    if (tournament.courses?.id) {
      const { data: ch } = await supabase
        .from('course_holes').select('numero, par, stroke_index').eq('course_id', tournament.courses.id)
      courseHoles = (ch as DBCourseHole[]) || []
    }
    if (courseHoles.length === 0) {
      for (let i = 1; i <= totalHoyos; i++) courseHoles.push({ numero: i, par: 4, stroke_index: i })
    }

    // ── Check if tournament uses ronda-libre-based groups ──
    const { data: rawGroups } = await supabase
      .from('tournament_groups')
      .select('id, ronda_libre_id, name, tee_time, sort_order, tournament_group_players(player_id)')
      .eq('tournament_id', tournament.id)
      .order('sort_order')

    const groups = (rawGroups as unknown as (DBTournamentGroup & { tee_time: string | null; sort_order: number; tournament_group_players: { player_id: string }[] })[]) || []
    const hasRondaLibreGroups = groups.some((g) => g.ronda_libre_id != null)

    // Build groups data for the tabs component
    groupsData = groups.map(g => ({
      id: g.id,
      name: g.name,
      teeTime: g.tee_time ? new Date(g.tee_time).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }) : null,
      sortOrder: g.sort_order ?? 0,
      playerIds: (g.tournament_group_players || []).map((gp: { player_id: string }) => gp.player_id),
    }))

    if (hasRondaLibreGroups) {
      // ═══ NEW PATH: Aggregate scores from rondas libres ═══
      const rondaIds = groups.map((g) => g.ronda_libre_id).filter(Boolean) as string[]

      const { data: rawJugadores } = await supabase
        .from('ronda_libre_jugadores')
        .select('id, nombre, user_id, scores, handicap, ronda_id')
        .in('ronda_id', rondaIds)

      const jugadores = (rawJugadores as unknown as DBRondaLibreJugador[]) || []
      const holeMap = new Map(courseHoles.map((h) => [h.numero, h]))

      // Build leaderboard entries from ronda libre data
      const entries: LeaderboardEntry[] = jugadores.map((j) => {
        const hcp = j.handicap ?? 0
        const scoresMap = j.scores || {}
        const scoreArr = new Array(totalHoyos).fill(null) as (number | null)[]
        let grossTotal = 0, netTotal = 0, stablefordTotal = 0, holesPlayed = 0

        for (let h = 1; h <= totalHoyos; h++) {
          const gross = scoresMap[String(h)]
          if (gross != null) {
            scoreArr[h - 1] = gross
            grossTotal += gross
            const hole = holeMap.get(h)
            const strokes = hole ? strokesRecibidosEnHoyo(hcp, hole.stroke_index) : 0
            netTotal += gross - strokes
            if (hole) stablefordTotal += puntosStablefordHoyo(gross, hole.par, hcp, hole.stroke_index)
            holesPlayed++
          }
        }

        const parPlayed = courseHoles
          .filter((ch) => scoresMap[String(ch.numero)] != null)
          .reduce((sum, ch) => sum + ch.par, 0)

        const stablefordScores: number[] = formatoJuego === 'stableford'
          ? Array.from({ length: totalHoyos }, (_, i) => {
              const h = i + 1
              const gross = scoreArr[i] ?? 0
              if (gross === 0) return 0
              const hole = holeMap.get(h)
              if (!hole) return 0
              return puntosStablefordHoyo(gross, hole.par, hcp, hole.stroke_index)
            })
          : []

        return {
          name: j.nombre,
          handicap: hcp,
          grossTotal,
          netTotal,
          stablefordTotal,
          stablefordScores,
          vsPar: holesPlayed > 0 ? grossTotal - parPlayed : 0,
          holesPlayed,
          scores: scoreArr,
          status: (holesPlayed >= totalHoyos ? 'F' : 'live') as 'F' | 'live',
        }
      })

      // Sort by modo_juego
      entries.sort((a, b) => {
        if (formatoJuego === 'stableford') return (b.stablefordTotal || 0) - (a.stablefordTotal || 0)
        if (modoJuego === 'neto') return (a.netTotal || 999) - (b.netTotal || 999)
        return (a.grossTotal || 999) - (b.grossTotal || 999)
      })

      // Apply countback to resolve ties
      const cbMode: CountbackMode = formatoJuego === 'stableford' ? 'higher_wins' : 'lower_wins'
      const cbPlayers: CountbackPlayer[] = entries.map((e, idx) => ({
        id: String(idx),
        name: e.name,
        scores: formatoJuego === 'stableford' ? (e.stablefordScores ?? e.scores.map(s => s ?? 0)) : e.scores.map((s) => s ?? 0),
        primaryScore: formatoJuego === 'stableford' ? e.stablefordTotal : modoJuego === 'neto' ? e.netTotal : e.grossTotal,
      }))
      const cbResults = resolveLeaderboardTies(cbPlayers, cbMode)

      // Map countback annotations back to entries
      const annotationMap = new Map<string, string>()
      cbResults.forEach((r) => annotationMap.set(r.id, r.annotation))

      // Reorder entries by countback result
      const reorderedEntries = cbResults.map((r) => {
        const e = entries[parseInt(r.id)]
        return { ...e, tieAnnotation: annotationMap.get(r.id) || '' }
      })

      players = reorderedEntries.map((e, idx): Player => ({
        pos:     idx + 1,
        name:    e.tieAnnotation ? `${e.name} ${e.tieAnnotation}` : e.name,
        country: 'CL',
        cat:     'General',
        hcp:     e.handicap,
        today:   e.vsPar,
        total:   e.vsPar,
        holes:   e.holesPlayed,
        status:  e.status,
        scores:  e.scores,
      }))

      // GWI inputs from ronda libre data
      gwiInputs = jugadores.map((j) => {
        const hcp = j.handicap ?? 18
        const scoresMap = j.scores || {}
        let overUnderGross = 0, overUnderNeto = 0, totalSF = 0, hoyosComp = 0

        for (let h = 1; h <= totalHoyos; h++) {
          const gross = scoresMap[String(h)]
          if (gross == null) continue
          const hole = holeMap.get(h)
          if (!hole) continue
          hoyosComp++
          overUnderGross += gross - hole.par
          overUnderNeto += (gross - strokesRecibidosEnHoyo(hcp, hole.stroke_index)) - hole.par
          totalSF += puntosStablefordHoyo(gross, hole.par, hcp, hole.stroke_index)
        }

        const currentScore = formatoJuego === 'stableford' ? totalSF
          : modoJuego === 'neto' ? overUnderNeto : overUnderGross

        return {
          id:                   j.id,
          nombre:               j.nombre,
          handicapIndex:        hcp,
          currentScore,
          hoyosCompletados:     hoyosComp,
          modoJuego,
          formatoJuego,
          historicalAvg:        null,
          historicalRoundsCount: 0,
          courseAvg:            null,
          courseRoundsCount:    0,
          patterns:             null,
        } satisfies JugadorGWIInput
      })

    } else {
      // ═══ LEGACY PATH: Use hole_scores from rounds table ═══
      const { data: rawPlayers } = await supabase
        .from('players')
        .select(
          `id, handicap_at_registration, player_name,
           profiles(name, indice),
           categories(name),
           rounds(id, status, total_gross, total_net, total_points, round_number,
             hole_scores(hole_number, gross_score))`
        )
        .eq('tournament_id', tournament.id)
        .in('status', ['pending', 'approved', 'waitlist'])

      // WD/DQ en paralelo — se renderizan en footer del leaderboard con badge.
      const { data: rawWithdrawn } = await supabase
        .from('players')
        .select('status, status_reason, player_name, profiles(name)')
        .eq('tournament_id', tournament.id)
        .in('status', ['withdrawn', 'disqualified'])
      ;(rawWithdrawn as unknown as Array<{ status: 'withdrawn' | 'disqualified'; status_reason: string | null; player_name: string | null; profiles: { name: string } | null }> | null)?.forEach(p => {
        const displayName = p.profiles?.name ?? p.player_name
        if (displayName) {
          withdrawnPlayers.push({ name: displayName, status: p.status, reason: p.status_reason })
        }
      })

      const dbPlayers = (rawPlayers as unknown as DBPlayer[]) || []
      const tournamentTotalRounds = tournament.total_rounds ?? 1
      const isMultiRound = tournamentTotalRounds > 1

      if (dbPlayers.length > 0) {
        // Build intermediate entries for countback — multi-round aware
        const withRounds = dbPlayers.filter((p) => p.rounds?.length > 0)

        const legacyEntries = withRounds.map((p) => {
          const hcp = p.handicap_at_registration ?? 0
          // Sort rounds by round_number
          const sortedRounds = [...(p.rounds || [])].sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1))

          // Cumulative totals across all rounds
          let cumulGross = 0, cumulNet = 0, cumulPoints = 0, totalHolesPlayed = 0
          const roundTotals: { gross: number; net: number; points: number; holes: number }[] = []
          // Scores from the latest round for countback (single-round behavior for tiebreaking)
          let latestScores = new Array(totalHoyos).fill(null) as (number | null)[]
          let allFinished = true

          for (const round of sortedRounds) {
            cumulGross += round.total_gross ?? 0
            cumulNet += round.total_net ?? 0
            cumulPoints += round.total_points ?? 0

            const scores = new Array(totalHoyos).fill(null) as (number | null)[]
            ;(round.hole_scores || []).forEach((hs) => {
              if (hs.gross_score != null) scores[hs.hole_number - 1] = hs.gross_score
            })
            const roundHoles = scores.filter(s => s !== null).length
            totalHolesPlayed += roundHoles
            roundTotals.push({ gross: round.total_gross ?? 0, net: round.total_net ?? 0, points: round.total_points ?? 0, holes: roundHoles })

            if (round.status !== 'closed' && round.status !== 'official') allFinished = false
            latestScores = scores
          }

          // For single-round tournaments: vsPar is net - parTotal
          // For multi-round: vsPar is cumulative net - (parTotal * roundsPlayed)
          const roundsPlayed = sortedRounds.length
          const netVsPar = totalHolesPlayed > 0 ? cumulNet - (parTotal * roundsPlayed) : 0

          // Determine current round number for "today" display
          const latestRound = sortedRounds[sortedRounds.length - 1]
          const todayNet = latestRound ? (latestRound.total_net ?? 0) - parTotal : 0

          const legacyHoleMap = new Map(courseHoles.map((h) => [h.numero, h]))
          const stablefordScores: number[] = formatoJuego === 'stableford'
            ? Array.from({ length: totalHoyos }, (_, i) => {
                const h = i + 1
                const gross = latestScores[i] ?? 0
                if (gross === 0) return 0
                const hole = legacyHoleMap.get(h)
                if (!hole) return 0
                return puntosStablefordHoyo(gross, hole.par, hcp, hole.stroke_index)
              })
            : []

          return {
            dbPlayer: p,
            hcp,
            scores: latestScores,
            stablefordScores,
            holesPlayed: totalHolesPlayed,
            netVsPar,
            todayVsPar: isMultiRound ? todayNet : netVsPar,
            grossTotal: cumulGross,
            netTotal: cumulNet,
            stablefordTotal: cumulPoints,
            roundTotals,
            status: (allFinished ? 'F' : 'live') as 'F' | 'live',
          }
        })

        // Sort by cumulative score
        legacyEntries.sort((a, b) => {
          if (formatoJuego === 'stableford') return (b.stablefordTotal || 0) - (a.stablefordTotal || 0)
          if (modoJuego === 'neto') return (a.netTotal || 999) - (b.netTotal || 999)
          return (a.grossTotal || 999) - (b.grossTotal || 999)
        })

        // Apply countback
        const cbModeLegacy: CountbackMode = formatoJuego === 'stableford' ? 'higher_wins' : 'lower_wins'
        const cbPlayersLegacy: CountbackPlayer[] = legacyEntries.map((e, idx) => ({
          id: String(idx),
          name: e.dbPlayer.profiles?.name || 'Jugador',
          scores: formatoJuego === 'stableford' ? (e.stablefordScores ?? e.scores.map(s => s ?? 0)) : e.scores.map((s) => s ?? 0),
          primaryScore: formatoJuego === 'stableford' ? e.stablefordTotal : modoJuego === 'neto' ? e.netTotal : e.grossTotal,
        }))
        const cbResultsLegacy = resolveLeaderboardTies(cbPlayersLegacy, cbModeLegacy)

        players = cbResultsLegacy.map((r, idx): Player => {
          const e = legacyEntries[parseInt(r.id)]
          const nameWithAnnotation = r.annotation ? `${r.name} ${r.annotation}` : r.name

          return {
            pos:     idx + 1,
            name:    nameWithAnnotation,
            country: 'CL',
            cat:     e.dbPlayer.categories?.name ? `Cat. ${e.dbPlayer.categories.name}` : 'General',
            hcp:     e.hcp,
            today:   e.todayVsPar,
            total:   e.netVsPar,
            holes:   e.holesPlayed,
            status:  e.status,
            scores:  e.scores,
          }
        })

        // Build playerIdToIndex: DB player.id → index in players[]
        cbResultsLegacy.forEach((r, idx) => {
          const e = legacyEntries[parseInt(r.id)]
          playerIdToIndex[e.dbPlayer.id] = idx
        })

        // Players with no round yet (registered but not started)
        const noRound = dbPlayers.filter((p) => !p.rounds?.length)
        noRound.forEach((p, i) => {
          const playerIdx = players.length
          players.push({
            pos:     withRounds.length + i + 1,
            name:    p.profiles?.name ?? p.player_name ?? 'Jugador',
            country: 'CL',
            cat:     p.categories?.name ? `Cat. ${p.categories.name}` : 'General',
            hcp:     p.handicap_at_registration ?? 0,
            today:   0,
            total:   0,
            holes:   0,
            status:  'live',
            scores:  new Array(totalHoyos).fill(null),
          })
          playerIdToIndex[p.id] = playerIdx
        })
        stats = computeStats(dbPlayers, courseHoles, parTotal)

        // GWI inputs
        const holeMap = new Map(courseHoles.map((h) => [h.numero, h]))
        gwiInputs = dbPlayers
          .filter((p) => p.rounds?.length > 0)
          .map((p) => {
            const hcp        = p.handicap_at_registration ?? 18
            const holeScores = p.rounds[0].hole_scores ?? []
            let overUnderGross = 0, overUnderNeto = 0, totalSF = 0, hoyosComp = 0

            for (const hs of holeScores) {
              if (!hs.gross_score) continue
              const hole = holeMap.get(hs.hole_number)
              if (!hole) continue
              hoyosComp++
              overUnderGross += hs.gross_score - hole.par
              overUnderNeto  += (hs.gross_score - strokesRecibidosEnHoyo(hcp, hole.stroke_index)) - hole.par
              totalSF        += puntosStablefordHoyo(hs.gross_score, hole.par, hcp, hole.stroke_index)
            }

            const currentScore = formatoJuego === 'stableford' ? totalSF
              : modoJuego === 'neto' ? overUnderNeto : overUnderGross

            return {
              id:                   p.id,
              nombre:               p.profiles?.name ?? p.player_name ?? 'Jugador',
              handicapIndex:        hcp,
              currentScore,
              hoyosCompletados:     hoyosComp,
              modoJuego,
              formatoJuego,
              historicalAvg:        null,
              historicalRoundsCount: 0,
              courseAvg:            null,
              courseRoundsCount:    0,
              patterns:             null,
            } satisfies JugadorGWIInput
          })
      } else {
        players = []
      }
    }
  } else {
    // Demo fallback
    players  = PLAYERS
    parTotal = PAR.reduce((s: number, p: number) => s + p, 0)
    isLive   = true
  }

  // Compute tournament results when closed/published
  if (isClosed && players.length > 0) {
    // Players with finished rounds sorted by gross
    const finishedPlayers = players.filter((p) => p.status === 'F' && p.holes > 0)
    if (finishedPlayers.length > 0) {
      const byGross = [...finishedPlayers].sort((a, b) => {
        const aGross = (a.scores || []).reduce((sum: number, s: number | null) => sum + (s ?? 0), 0)
        const bGross = (b.scores || []).reduce((sum: number, s: number | null) => sum + (s ?? 0), 0)
        return aGross - bGross
      })
      const byNeto = [...finishedPlayers].sort((a, b) => a.total - b.total)

      const grossScore1 = byGross[0] ? (byGross[0].scores || []).reduce((sum: number, s: number | null) => sum + (s ?? 0), 0) : 0
      const grossScore2 = byGross[1] ? (byGross[1].scores || []).reduce((sum: number, s: number | null) => sum + (s ?? 0), 0) : 0
      const netoScore1 = byNeto[0] ? byNeto[0].total + parTotal : 0
      const netoScore2 = byNeto[1] ? byNeto[1].total + parTotal : 0

      const avgGross = finishedPlayers.reduce((sum: number, p) =>
        sum + (p.scores || []).reduce((s: number, sc: number | null) => s + (sc ?? 0), 0), 0) / finishedPlayers.length

      // Count eagles and birdies from stats or recompute
      const totalEagles = stats?.eagles ?? 0
      const totalBirdies = stats?.birdies ?? 0

      resultados = {
        grossWinner: byGross[0] ? { name: byGross[0].name, score: grossScore1 } : null,
        netoWinner:  byNeto[0]  ? { name: byNeto[0].name,  score: netoScore1 }  : null,
        grossSecond: byGross[1] ? { name: byGross[1].name, score: grossScore2 } : null,
        netoSecond:  byNeto[1]  ? { name: byNeto[1].name,  score: netoScore2 }  : null,
        avgField: avgGross,
        totalEagles,
        totalBirdies,
      }
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#ffffff' }}>

      {/* ── Clean dark header ── */}
      <div style={{ background: '#f8f9fa', borderBottom: '1px solid #e2e8f0' }}>
        {/* Top bar: solo logo. Modo TV removido del header público
            (decisión Juanjo inbox 35f4ee89, may 27). La ruta
            /torneo/[slug]/tv sigue accesible vía URL directa para casting. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '16px 20px 0', maxWidth: '1080px', margin: '0 auto' }}>
          <Link href="/" className="flex items-center gap-1 group" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '18px', color: '#1a1a2e' }}>Golfers</span>
            <span style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '18px', color: '#c4992a' }}>+</span>
          </Link>
        </div>

        {/* Hero: foto de portada del torneo. Cae limpiamente si no hay
            foto subida — el header sigue legible sin ella. */}
        {tournament?.cover_image_url && (
          <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '16px 20px 0' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tournament.cover_image_url}
              alt={`Portada de ${tournament.name}`}
              width={1600}
              height={900}
              loading="eager"
              style={{
                width: '100%',
                height: 'auto',
                aspectRatio: '16 / 9',
                objectFit: 'cover',
                borderRadius: '12px',
                display: 'block',
                background: '#e5e7eb',
              }}
            />
          </div>
        )}

        {/* Tournament info */}
        <div style={{ padding: '24px 20px 20px', maxWidth: '1080px', margin: '0 auto' }}>
          <h1 style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '24px',
            fontWeight: 700,
            color: '#1a1a2e',
            margin: '0 0 8px',
            lineHeight: 1.2,
          }}>
            {tournamentName}
          </h1>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '13px', color: '#4a5568' }}>
            {tournament?.courses?.nombre && <span>{tournament.courses.nombre}</span>}
            {tournament?.courses?.nombre && <span style={{ color: '#94a3b8' }}>&middot;</span>}
            <span>{totalHoyos}H</span>
            <span style={{ color: '#94a3b8' }}>&middot;</span>
            <span style={{
              display: 'inline-block',
              padding: '3px 10px',
              background: 'rgba(196,153,42,0.15)',
              color: '#c4992a',
              border: '1px solid rgba(196,153,42,0.32)',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              fontFamily: '"DM Mono", monospace',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>{formatLabel(formatoJuego, modoJuego)}</span>
            <span style={{ color: '#94a3b8' }}>&middot;</span>
            <span>{dateDisplay}</span>

            {/* Status indicator */}
            {isLive && (
              <>
                <span style={{ color: '#94a3b8' }}>&middot;</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span className="live-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                  <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>EN VIVO</span>
                </span>
              </>
            )}
            {isClosed && (
              <>
                <span style={{ color: '#94a3b8' }}>&middot;</span>
                <span style={{ color: '#c4992a', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>FINALIZADO</span>
              </>
            )}
          </div>

          {tournament?.codigo && (
            <div style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(196,153,42,0.06)', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '8px', padding: '6px 12px' }}>
              <span style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '12px', color: '#94a3b8' }}>Únete con</span>
              <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '14px', color: '#c4992a', fontWeight: 700, letterSpacing: '0.1em' }}>{tournament.codigo}</span>
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard */}
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
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#4a5568' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}><Users size={48} strokeWidth={1.5} /></div>
            <div style={{ fontSize: '18px', color: '#1a1a2e', marginBottom: '8px' }}>
              {tournament ? 'Sin jugadores inscritos aún' : 'Torneo no encontrado'}
            </div>
            <div style={{ fontSize: '14px' }}>
              {tournament
                ? 'El organizador está preparando el torneo.'
                : 'Verifica el link o vuelve al inicio.'}
            </div>
          </div>
        )}
      </div>

      {/* ── Results — compact premium layout (closed tournaments) ── */}
      {resultados && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div style={{ borderTop: '1px solid var(--border)', marginBottom: '24px' }} />

          {/* 1st place row — side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            {resultados.grossWinner && (
              <div style={{ background: '#f8f9fa', border: '1px solid rgba(196,153,42,0.25)', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>1° Gross</div>
                <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '15px', color: '#1a1a2e', fontWeight: 700 }}>{resultados.grossWinner.name}</div>
                <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '22px', color: '#c4992a', fontWeight: 700, marginTop: '2px' }}>{resultados.grossWinner.score}</div>
              </div>
            )}
            {resultados.netoWinner && (
              <div style={{ background: '#f8f9fa', border: '1px solid rgba(196,153,42,0.25)', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>1° Neto</div>
                <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '15px', color: '#1a1a2e', fontWeight: 700 }}>{resultados.netoWinner.name}</div>
                <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '22px', color: '#c4992a', fontWeight: 700, marginTop: '2px' }}>{resultados.netoWinner.score}</div>
              </div>
            )}
          </div>

          {/* 2nd place row — side by side, subtle */}
          {(resultados.grossSecond || resultados.netoSecond) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              {resultados.grossSecond && (
                <div style={{ background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px' }}>
                  <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>2° Gross</div>
                  <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '14px', color: '#1a1a2e', fontWeight: 600 }}>{resultados.grossSecond.name} <span style={{ color: '#4a5568' }}>({resultados.grossSecond.score})</span></div>
                </div>
              )}
              {resultados.netoSecond && (
                <div style={{ background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px' }}>
                  <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>2° Neto</div>
                  <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '14px', color: '#1a1a2e', fontWeight: 600 }}>{resultados.netoSecond.name} <span style={{ color: '#4a5568' }}>({resultados.netoSecond.score})</span></div>
                </div>
              )}
            </div>
          )}

          {/* Stats row — horizontal, compact */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', padding: '12px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Promedio</div>
              <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '20px', color: '#c4992a', fontWeight: 700 }}>{resultados.avgField.toFixed(1)}</div>
            </div>
            <div style={{ width: '1px', background: '#e2e8f0', alignSelf: 'stretch' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Eagles</div>
              <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '20px', color: '#c4992a', fontWeight: 700 }}>{resultados.totalEagles}</div>
            </div>
            <div style={{ width: '1px', background: '#e2e8f0', alignSelf: 'stretch' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Birdies</div>
              <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '20px', color: '#c4992a', fontWeight: 700 }}>{resultados.totalBirdies}</div>
            </div>
          </div>
        </div>
      )}

      {/* Share results button — only when closed/published */}
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

      {/* Premium footer — solo a no-logged users. Carece de sentido recomendar
          "crear cuenta gratis" a alguien que ya tiene sesion activa (inbox 22257fa0). */}
      {!viewer && (
        <footer style={{ borderTop: '1px solid rgba(196,153,42,0.08)', marginTop: '32px' }}>
          <div style={{ maxWidth: '480px', margin: '0 auto', padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', color: '#1a1a2e', fontWeight: 700, marginBottom: '4px' }}>
              <span>Golfers</span><span style={{ color: '#c4992a' }}>+</span>
            </div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>
              Scoring en vivo &middot; &Iacute;ndices &middot; Coach IA
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <Link href="/register" style={{
                background: '#c4992a', color: '#1a1a2e', fontWeight: 700, fontSize: '14px',
                padding: '12px 24px', borderRadius: '10px', textDecoration: 'none',
              }}>
                Crear cuenta gratis
              </Link>
              <Link href="/demo" style={{
                color: '#4a5568', fontSize: '14px', fontWeight: 500,
                padding: '12px 16px', textDecoration: 'none',
              }}>
                Ver demo
              </Link>
            </div>
          </div>
        </footer>
      )}

      {/* Retirados / Descalificados — transparencia USGA (scores preservados) */}
      {withdrawnPlayers.length > 0 && (
        <section style={{ maxWidth: '1080px', margin: '20px auto 0', padding: '0 20px' }}>
          <div style={{
            background: '#f8f9fa',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '16px 20px',
          }}>
            <div style={{
              fontSize: '11px',
              color: '#4a5568',
              fontFamily: '"DM Mono", ui-monospace, monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase' as const,
              fontWeight: 700,
              marginBottom: '10px',
            }}>
              No compiten por posición
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {withdrawnPlayers.map((wp, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                  <span style={{
                    background: wp.status === 'disqualified' ? 'rgba(220,38,38,0.10)' : 'rgba(156,163,175,0.15)',
                    color: wp.status === 'disqualified' ? '#991b1b' : '#4a5568',
                    fontSize: '9px',
                    fontWeight: 700,
                    fontFamily: '"DM Mono", ui-monospace, monospace',
                    letterSpacing: '0.08em',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    flexShrink: 0,
                  }}>
                    {wp.status === 'disqualified' ? 'DQ' : 'WD'}
                  </span>
                  <span style={{ color: '#1a1a2e', fontWeight: 500 }}>{wp.name}</span>
                  {wp.reason && (
                    <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: 'auto', fontStyle: 'italic' }}>
                      {wp.reason}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {tournament && <TournamentBottomSheet slug={tournament.slug} isLive={isLive} isDemo={!!tournament.es_demo} />}
    </div>
  )
}
