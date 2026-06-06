import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { redirect } from 'next/navigation'
import JugadoresPanel from './JugadoresPanel'
import type { Player } from './JugadoresPanel'

export default async function JugadoresPage({
  params,
}: {
  params: { slug: string }
}) {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login')

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*, courses(id, nombre, ciudad, slope_rating, course_rating, par_total)')
    .eq('slug', params.slug)
    .single()

  if (!tournament || tournament.organizer_id !== user.id) redirect('/dashboard')

  const [
    { data: players },
    { data: categories },
  ] = await Promise.all([
    supabase
      .from('players')
      .select(
        'id, user_id, handicap_at_registration, status, profiles(name, indice), categories(name)'
      )
      .eq('tournament_id', tournament.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('categories')
      .select('id, name, handicap_min, handicap_max')
      .eq('tournament_id', tournament.id),
  ])

  return (
    <JugadoresPanel
      tournament={tournament}
      initialPlayers={(players as unknown as Player[]) || []}
      categories={categories || []}
    />
  )
}
