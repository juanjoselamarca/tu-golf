import type { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()

  const { data: round } = await supabase
    .from('historical_rounds')
    .select('total_gross, course_name, holes_played, user_id')
    .eq('id', id)
    .single()

  if (!round) {
    return { title: 'Tarjeta de golf — Golfers+' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', round.user_id)
    .single()

  const playerName = profile?.name ?? 'Jugador'
  const parEstimado = (round.holes_played ?? 18) <= 9 ? 36 : 72
  const diff = (round.total_gross ?? 0) - parEstimado
  const vsParStr = diff === 0 ? 'Par' : diff > 0 ? `+${diff}` : String(diff)

  return {
    title: `${playerName} jugó ${round.total_gross} (${vsParStr}) en ${round.course_name} — Golfers+`,
    description: `${round.holes_played ?? 18} hoyos en ${round.course_name}. Mira la tarjeta completa en Golfers+.`,
    openGraph: {
      title: `${playerName} jugó ${round.total_gross} (${vsParStr}) en ${round.course_name}`,
      description: `${round.holes_played ?? 18} hoyos · ${round.course_name} · Golfers+`,
      type: 'website',
      siteName: 'Golfers+',
    },
  }
}

export default function TarjetaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
