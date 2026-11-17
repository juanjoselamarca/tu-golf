import type { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { badgeDelTorneo, contarInscritos } from '@/golf/tournament-status'
import { fetchTorneoParaMetadata } from '@/lib/data/tournaments/metadata'

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params
  const supabase = await createClient()
  const torneo = await fetchTorneoParaMetadata(supabase, params.slug)

  if (!torneo) {
    return {
      title: 'Torneo — Golfers+',
      description: 'Torneos de golf amateur con leaderboard en vivo en Golfers+.',
    }
  }

  const nJugadores = contarInscritos(torneo.players)
  const courseName = torneo.courses?.nombre ?? ''
  const fecha = torneo.date_start
    ? new Date(torneo.date_start + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  const statusLabel = badgeDelTorneo(torneo, new Date(), 'player', 'ficha').label

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
