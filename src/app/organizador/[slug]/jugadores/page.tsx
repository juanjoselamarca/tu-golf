import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { redirect } from 'next/navigation'
import JugadoresPanel from './JugadoresPanel'
import type { Category, Player, Tournament } from './types'
import { loginUrl } from '@/lib/auth/login-url'
import { fetchInscritosYCategorias, fetchTorneoDelPanel } from '@/lib/data/tournaments/panel-jugadores'

export default async function JugadoresPage(
  props: {
    params: Promise<{ slug: string }>
  }
) {
  const params = await props.params
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect(loginUrl(`/organizador/${params.slug}/jugadores`))

  const tournament = await fetchTorneoDelPanel<Tournament & { organizer_id: string; codigo?: string | null }>(
    supabase,
    params.slug,
  )
  if (!tournament || tournament.organizer_id !== user.id) redirect('/dashboard')

  const { players, categories } = await fetchInscritosYCategorias<Player, Category>(supabase, tournament.id)

  return (
    <JugadoresPanel
      tournament={tournament}
      initialPlayers={players}
      categories={categories}
    />
  )
}
