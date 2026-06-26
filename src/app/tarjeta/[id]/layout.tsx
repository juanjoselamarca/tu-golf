import type { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { getVsPar } from '@/lib/mi-golf/par'
import { inferHoles } from '@/golf/core/holes'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()

  const { data: round } = await supabase
    .from('historical_rounds')
    .select('total_gross, course_name, holes_played, user_id, par_per_hole, scores')
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
  // Conteo de hoyos: holes_played es null en ~68% de las rondas históricas → se
  // infiere desde scores.length (resolver canónico inferHoles), igual que las
  // rutas /api/gwi. Sin esto, una ronda de 9 con holes_played null sumaría el
  // par de los 18 hoyos del campo y daría un vs-par disparatado.
  const holes = inferHoles({ holes_played: round.holes_played, scores: round.scores })
  // vs-par con el par REAL de la cancha (par_per_hole de esta ronda); cae al
  // estimado 36/72 solo si la ronda no tiene par_per_hole válido. Una sola ronda
  // → traer par_per_hole + scores no pesa (a diferencia del dashboard slim).
  const diff = getVsPar(round.total_gross, holes, round.par_per_hole) ?? 0
  const vsParStr = diff === 0 ? 'Par' : diff > 0 ? `+${diff}` : String(diff)

  return {
    title: `${playerName} jugó ${round.total_gross} (${vsParStr}) en ${round.course_name} — Golfers+`,
    description: `${holes ?? round.holes_played ?? 18} hoyos en ${round.course_name}. Mira la tarjeta completa en Golfers+.`,
    openGraph: {
      title: `${playerName} jugó ${round.total_gross} (${vsParStr}) en ${round.course_name}`,
      description: `${holes ?? round.holes_played ?? 18} hoyos · ${round.course_name} · Golfers+`,
      type: 'website',
      siteName: 'Golfers+',
    },
  }
}

export default function TarjetaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
