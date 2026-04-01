import type { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'

interface TournamentRow {
  name: string
  format: string
  status: string
  date_start: string | null
  courses: { nombre: string } | null
  tournament_players: { id: string }[]
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const supabase = await createClient()
  const { data: torneo } = await supabase
    .from('tournaments')
    .select('name, format, status, date_start, courses(nombre), tournament_players(id)')
    .eq('slug', params.slug)
    .single<TournamentRow>()

  if (!torneo) {
    return {
      title: 'Torneo — Golfers+',
      description: 'Torneos de golf amateur con leaderboard en vivo en Golfers+.',
    }
  }

  const nJugadores = torneo.tournament_players?.length ?? 0
  const courseName = torneo.courses?.nombre ?? ''
  const fecha = torneo.date_start
    ? new Date(torneo.date_start + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  const statusLabel = torneo.status === 'finished' ? 'Finalizado' : torneo.status === 'active' ? 'En vivo' : 'Inscripciones abiertas'

  const parts = [courseName, fecha].filter(Boolean).join(' · ')
  const title = `${torneo.name} — Golfers+`
  const description = [
    statusLabel,
    nJugadores > 0 ? `${nJugadores} jugador${nJugadores !== 1 ? 'es' : ''}` : null,
    parts,
  ].filter(Boolean).join('. ') + '.'

  return {
    title,
    description,
    openGraph: {
      title: `${torneo.name} — Golfers+`,
      description,
      siteName: 'Golfers+',
      locale: 'es_CL',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: `${torneo.name} — Golfers+`,
      description,
    },
  }
}

export default function TorneoSlugLayout({ children }: { children: React.ReactNode }) {
  return children
}
