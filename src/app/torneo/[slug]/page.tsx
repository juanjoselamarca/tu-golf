/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import LeaderboardTable from '@/components/LeaderboardTable'
import GWILeaderboard from '@/components/GWILeaderboard'
import { TournamentBottomSheet } from '@/components/TournamentBottomSheet'
import { PLAYERS, PAR } from '@/lib/golf-data'
import type { Player } from '@/lib/golf-data'
import { createClient } from '@/utils/supabase/server'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import type { ModoJuego } from '@/golf/core/rules'
import type { JugadorGWIInput } from '@/golf/stats/gwi'

interface DBPlayer {
  id: string
  handicap_at_registration: number | null
  profiles: { name: string; indice: number | null } | null
  categories: { name: string } | null
  rounds: {
    id: string
    status: string
    total_gross: number
    total_net: number
    total_points: number
    hole_scores: { hole_number: number; gross_score: number | null }[]
  }[]
}

interface DBTournament {
  id: string
  name: string
  slug: string
  format: string
  hole_count: number
  modo_juego: ModoJuego | null
  date_start: string | null
  status: string
  codigo: string | null
  courses: { id: string; nombre: string; ciudad: string; par_total: number } | null
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
  vsPar: number
  holesPlayed: number
  scores: (number | null)[]
  status: 'live' | 'F'
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

  // Best card
  const bySortedNet = [...withScores].sort((a, b) => (a.rounds[0].total_net ?? 999) - (b.rounds[0].total_net ?? 999))
  const bestName    = bySortedNet[0]?.profiles?.name ?? '—'
  const bestNet     = bySortedNet[0]?.rounds[0].total_net ?? 0

  // Avg net vs par
  const netVals = withScores.filter((p) => p.rounds[0].total_net != null)
    .map((p) => p.rounds[0].total_net - parTotal)
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

function fmtNet(n: number) {
  if (n === 0) return 'E'
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1)
}

export default async function TorneoPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient()

  // Try to fetch real tournament
  const { data: rawTournament } = await supabase
    .from('tournaments')
    .select('id, name, slug, format, hole_count, modo_juego, date_start, status, codigo, courses(id, nombre, ciudad, par_total)')
    .eq('slug', params.slug)
    .single()

  const tournament = rawTournament as unknown as DBTournament | null

  // Fetch real players if tournament found
  let players: Player[]                = []
  let gwiInputs: JugadorGWIInput[]     = []
  let tournamentName                   = 'TPC Sawgrass Amateur 2025'
  let parTotal                         = 72
  let modoJuego: ModoJuego             = 'gross'
  let totalHoyos                       = 18
  let dateDisplay                      = '12 Mar 2025'
  let isLive                           = false
  let stats: TourneyStats | null       = null

  if (tournament) {
    tournamentName = tournament.name
    parTotal       = tournament.courses?.par_total ?? 72
    modoJuego      = tournament.modo_juego ?? 'gross'
    totalHoyos     = tournament.hole_count ?? 18
    isLive         = tournament.status === 'active' || tournament.status === 'in_progress'

    if (tournament.date_start) {
      dateDisplay = new Date(tournament.date_start).toLocaleDateString('es-CL', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    }

    // Course holes for stats + GWI
    let courseHoles: DBCourseHole[] = []
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
      .select('id, ronda_libre_id, name')
      .eq('tournament_id', tournament.id)

    const groups = (rawGroups as unknown as DBTournamentGroup[]) || []
    const hasRondaLibreGroups = groups.some((g) => g.ronda_libre_id != null)

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
        let grossTotal = 0, netTotal = 0, holesPlayed = 0

        for (let h = 1; h <= totalHoyos; h++) {
          const gross = scoresMap[String(h)]
          if (gross != null) {
            scoreArr[h - 1] = gross
            grossTotal += gross
            const hole = holeMap.get(h)
            const strokes = hole ? strokesRecibidosEnHoyo(hcp, hole.stroke_index) : 0
            netTotal += gross - strokes
            holesPlayed++
          }
        }

        const parPlayed = courseHoles
          .filter((ch) => scoresMap[String(ch.numero)] != null)
          .reduce((sum, ch) => sum + ch.par, 0)

        return {
          name: j.nombre,
          handicap: hcp,
          grossTotal,
          netTotal,
          vsPar: holesPlayed > 0 ? grossTotal - parPlayed : 0,
          holesPlayed,
          scores: scoreArr,
          status: (holesPlayed >= totalHoyos ? 'F' : 'live') as 'F' | 'live',
        }
      })

      // Sort by modo_juego
      entries.sort((a, b) => {
        if (modoJuego === 'neto') return (a.netTotal || 999) - (b.netTotal || 999)
        return (a.grossTotal || 999) - (b.grossTotal || 999)
      })

      players = entries.map((e, idx): Player => ({
        pos:     idx + 1,
        name:    e.name,
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

        const currentScore = modoJuego === 'stableford' ? totalSF
          : modoJuego === 'neto' ? overUnderNeto : overUnderGross

        return {
          id:                   j.id,
          nombre:               j.nombre,
          handicapIndex:        hcp,
          currentScore,
          hoyosCompletados:     hoyosComp,
          modoJuego,
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
          `id, handicap_at_registration,
           profiles(name, indice),
           categories(name),
           rounds(id, status, total_gross, total_net, total_points,
             hole_scores(hole_number, gross_score))`
        )
        .eq('tournament_id', tournament.id)

      const dbPlayers = (rawPlayers as unknown as DBPlayer[]) || []

      if (dbPlayers.length > 0) {
        // Map to Player type expected by LeaderboardTable
        const sorted = dbPlayers
          .filter((p) => p.rounds?.length > 0)
          .sort((a, b) => {
            const an = a.rounds[0].total_net ?? 999
            const bn = b.rounds[0].total_net ?? 999
            return an - bn
          })

        players = sorted.map((p, idx): Player => {
          const round  = p.rounds[0]
          const hcp    = p.handicap_at_registration ?? 0
          const scores = new Array(18).fill(null) as (number | null)[]

          ;(round.hole_scores || []).forEach((hs) => {
            if (hs.gross_score != null) scores[hs.hole_number - 1] = hs.gross_score
          })

          const holesPlayed = scores.filter((s) => s !== null).length
          const netVsPar    = holesPlayed > 0 ? round.total_net - parTotal : 0

          return {
            pos:     idx + 1,
            name:    p.profiles?.name || 'Jugador',
            country: 'CL',
            cat:     p.categories?.name ? `Cat. ${p.categories.name}` : 'General',
            hcp,
            today:   netVsPar,
            total:   netVsPar,
            holes:   holesPlayed,
            status:  round.status === 'closed' || round.status === 'official' ? 'F' : 'live',
            scores,
          }
        })

        // Players with no round yet (registered but not started)
        const noRound = dbPlayers.filter((p) => !p.rounds?.length)
        noRound.forEach((p, i) => {
          players.push({
            pos:     sorted.length + i + 1,
            name:    p.profiles?.name || 'Jugador',
            country: 'CL',
            cat:     p.categories?.name ? `Cat. ${p.categories.name}` : 'General',
            hcp:     p.handicap_at_registration ?? 0,
            today:   0,
            total:   0,
            holes:   0,
            status:  'live',
            scores:  new Array(18).fill(null),
          })
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

            const currentScore = modoJuego === 'stableford' ? totalSF
              : modoJuego === 'neto' ? overUnderNeto : overUnderGross

            return {
              id:                   p.id,
              nombre:               p.profiles?.name ?? 'Jugador',
              handicapIndex:        hcp,
              currentScore,
              hoyosCompletados:     hoyosComp,
              modoJuego,
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

  // Use real cover or default golf photo
  const coverImage = 'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=1920&q=80'

  return (
    <div className="min-h-screen bg-bg-deep">

      {/* Tournament header */}
      <div className="relative overflow-hidden" style={{ height: 280 }}>
        <img
          src={coverImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(7,13,24,0.35) 0%, rgba(7,13,24,0.92) 100%)' }}
        />

        {/* Logo */}
        <div className="absolute top-4 left-4 sm:top-5 sm:left-6 z-10">
          <Link href="/" className="flex items-center gap-1 group">
            <span className="font-display font-bold text-lg text-ivory group-hover:text-ivory/80 transition-colors">Golfers</span>
            <span className="font-display font-bold text-lg text-gold group-hover:text-gold-light transition-colors">+</span>
          </Link>
        </div>

        {/* TV button */}
        {tournament && (
          <div className="absolute top-4 right-4 sm:top-5 sm:right-6 z-10">
            <Link
              href={`/torneo/${tournament.slug}/tv`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: 'rgba(14,28,47,0.85)', border: '1px solid rgba(196,153,42,0.3)', color: '#c4992a', padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              📺 Modo TV
            </Link>
          </div>
        )}

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center text-center px-4 pb-4 pt-16">
          {isLive && (
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-gold live-dot inline-block" />
              <span className="font-sans font-semibold text-sm" style={{ color: '#c4992a' }}>EN VIVO</span>
            </div>
          )}

          <h1 className="font-display font-bold text-ivory mb-3" style={{ fontSize: 'clamp(24px, 4.5vw, 36px)', lineHeight: 1.1 }}>
            {tournamentName}
          </h1>

          <p className="font-sans text-sm text-gray-soft">
            Par {parTotal}
            {tournament?.courses?.nombre && <> &nbsp;·&nbsp; {tournament.courses.nombre}</>}
            {tournament?.courses?.ciudad && <>, {tournament.courses.ciudad}</>}
            {dateDisplay && <> &nbsp;·&nbsp; {dateDisplay}</>}
          </p>

          {tournament?.codigo && (
            <div style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(14,28,47,0.7)', border: '1px solid rgba(196,153,42,0.25)', borderRadius: '8px', padding: '5px 12px' }}>
              <span style={{ fontSize: '11px', color: '#94a8c0' }}>Codigo:</span>
              <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: '#c4992a', letterSpacing: '0.1em' }}>{tournament.codigo}</span>
            </div>
          )}
        </div>
      </div>

      <div className="gold-divider" />

      {/* Leaderboard */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-7">
        {/* Modo badge */}
        {tournament && (
          <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ background: 'rgba(196,153,42,0.12)', border: '1px solid rgba(196,153,42,0.25)', color: '#c4992a', fontSize: '12px', padding: '3px 10px', borderRadius: '8px', fontWeight: 600 }}>
              {modoJuego === 'gross' ? 'Gross' : modoJuego === 'neto' ? 'Neto' : 'Stableford'}
            </span>
            {isLive && <span style={{ fontSize: '12px', color: '#94a8c0' }}>{totalHoyos} hoyos</span>}
          </div>
        )}
        {players.length > 0 ? (
          <>
            <LeaderboardTable players={players} modoJuego={modoJuego} />
            {/* GWI panel — only when enough data */}
            {isLive && gwiInputs.length >= 2 && (
              <div style={{ marginTop: '24px' }}>
                <GWILeaderboard
                  jugadores={gwiInputs}
                  hoyosRestantes={totalHoyos - (gwiInputs.reduce((mx, g) => Math.max(mx, g.hoyosCompletados), 0))}
                  totalHoyos={totalHoyos}
                  modoJuego={modoJuego}
                />
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a8c0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
            <div style={{ fontSize: '18px', color: '#edeae4', marginBottom: '8px' }}>
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

      {/* Tournament stats */}
      {stats && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="gold-divider mb-8" />
          <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#edeae4', marginBottom: '20px', fontWeight: 600 }}>
            Estadísticas del torneo
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {/* Mejor tarjeta */}
            <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🏆</div>
              <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Mejor tarjeta</div>
              <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#edeae4', fontWeight: 700, marginBottom: '4px' }}>{stats.bestName}</div>
              <div style={{ fontSize: '14px', color: '#c4992a', fontWeight: 600 }}>{fmtNet(stats.bestNet - parTotal)}</div>
            </div>
            {/* Scoring average */}
            <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>📊</div>
              <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Promedio del campo</div>
              <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#c4992a', fontWeight: 700 }}>{fmtNet(stats.avgNet)}</div>
            </div>
            {/* Eagles */}
            <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🦅</div>
              <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Eagles</div>
              <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#c4992a', fontWeight: 700 }}>{stats.eagles}</div>
            </div>
            {/* Birdies */}
            <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🐦</div>
              <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Birdies</div>
              <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#c4992a', fontWeight: 700 }}>{stats.birdies}</div>
            </div>
            {/* Hardest hole */}
            {stats.hardestHole && (
              <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>⛳</div>
                <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Hoyo más difícil</div>
                <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#c4992a', fontWeight: 700 }}>Hoyo {stats.hardestHole.hole}</div>
                <div style={{ fontSize: '13px', color: '#94a8c0' }}>Avg {fmtNet(stats.hardestHole.avg)} vs par</div>
              </div>
            )}
            {/* Easiest hole */}
            {stats.easiestHole && (
              <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>💪</div>
                <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Hoyo más fácil</div>
                <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#c4992a', fontWeight: 700 }}>Hoyo {stats.easiestHole.hole}</div>
                <div style={{ fontSize: '13px', color: '#94a8c0' }}>Avg {fmtNet(stats.easiestHole.avg)} vs par</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Premium footer */}
      <footer className="bg-bg-deep">
        <div className="gold-divider" />
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-14">
          <div
            style={{
              background: '#0e1c2f',
              border: '1px solid rgba(196,153,42,0.2)',
              borderRadius: '16px',
              padding: '28px 24px',
            }}
          >
            {/* Brand */}
            <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
              GOLFERS+
            </div>
            <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#edeae4', fontWeight: 700, marginBottom: '20px' }}>
              El golf amateur en español
            </div>

            {/* CTA 1 — Gold */}
            <Link
              href="/register"
              style={{
                display: 'block',
                background: '#c4992a',
                borderRadius: '12px',
                padding: '16px 20px',
                textDecoration: 'none',
                marginBottom: '10px',
              }}
            >
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#070d18' }}>
                Registra tu ronda gratis →
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(7,13,24,0.65)', marginTop: '2px' }}>
                Calcula tu GWI™ · Sin descarga
              </div>
            </Link>

            {/* CTA 2 — Subtle */}
            <Link
              href="/register"
              style={{
                display: 'block',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '12px',
                padding: '16px 20px',
                textDecoration: 'none',
              }}
            >
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#edeae4' }}>
                Crea tu propio torneo →
              </div>
              <div style={{ fontSize: '13px', color: '#94a8c0', marginTop: '2px' }}>
                100% gratis · En 2 minutos
              </div>
            </Link>
          </div>
        </div>
      </footer>

      {tournament && <TournamentBottomSheet slug={tournament.slug} isLive={isLive} />}
    </div>
  )
}
