/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import LeaderboardTable from '@/components/LeaderboardTable'
import { PLAYERS, PAR } from '@/lib/golf-data'
import type { Player } from '@/lib/golf-data'
import { createClient } from '@/utils/supabase/server'

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
  date_start: string | null
  status: string
  courses: { nombre: string; ciudad: string; par_total: number } | null
}

export default async function TorneoPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient()

  // Try to fetch real tournament
  const { data: rawTournament } = await supabase
    .from('tournaments')
    .select('id, name, slug, format, hole_count, date_start, status, courses(nombre, ciudad, par_total)')
    .eq('slug', params.slug)
    .single()

  const tournament = rawTournament as unknown as DBTournament | null

  // Fetch real players if tournament found
  let players: Player[] = []
  let tournamentName    = 'TPC Sawgrass Amateur 2025'
  let parTotal          = 72
  let dateDisplay       = '12 Mar 2025'
  let isLive            = false

  if (tournament) {
    tournamentName = tournament.name
    parTotal       = tournament.courses?.par_total ?? 72
    isLive         = tournament.status === 'active' || tournament.status === 'in_progress'

    if (tournament.date_start) {
      dateDisplay = new Date(tournament.date_start).toLocaleDateString('es-CL', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    }

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
          status:  round.status === 'completed' || round.status === 'official' ? 'F' : 'live',
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
    } else {
      // No players yet — show empty state via empty array
      players = []
    }
  } else {
    // Demo fallback
    players       = PLAYERS
    parTotal      = 72
    isLive        = true
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
            <span className="font-display font-bold text-lg text-ivory group-hover:text-ivory/80 transition-colors">Tu</span>
            <span className="font-display font-bold text-lg text-gold group-hover:text-gold-light transition-colors"> Golf</span>
          </Link>
        </div>

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
        </div>
      </div>

      <div className="gold-divider" />

      {/* Leaderboard */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-7">
        {players.length > 0 ? (
          <LeaderboardTable players={players} />
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#7a8fa8' }}>
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

      {/* Viral footer */}
      <footer className="bg-bg-deep">
        <div className="gold-divider" />
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-14 text-center">
          <div className="flex items-center justify-center gap-0.5 mb-5">
            <span className="font-display font-bold text-2xl text-ivory">Tu</span>
            <span className="font-display font-bold text-2xl text-gold"> Golf</span>
          </div>
          <p className="font-sans text-ivory/70 text-base mb-7">Seguí este torneo con Tu Golf</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-sans font-bold text-base px-10 py-4 transition-all duration-200 hover:brightness-110"
            style={{ background: '#c4992a', color: '#070d18', borderRadius: '4px' }}
          >
            Crear mi torneo gratis →
          </Link>
          <p className="font-sans text-gray-soft text-sm mt-5">
            100% gratis &nbsp;·&nbsp; Sin descargas &nbsp;·&nbsp; En vivo
          </p>
        </div>
      </footer>
    </div>
  )
}
