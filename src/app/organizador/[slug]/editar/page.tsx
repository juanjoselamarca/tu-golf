import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { redirect } from 'next/navigation'
import EditTorneoForm from './EditTorneoForm'

export interface CourseOption { id: string; nombre: string; ciudad: string | null }

interface TournamentData {
  id: string; name: string; slug: string; format: string; hole_count: number
  tees: string; use_handicap: boolean; date_start: string | null
  cover_image_url: string | null; courses: { id: string; nombre: string } | null
  has_scores?: boolean
}

export default async function EditarTorneoPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login')

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, slug, format, hole_count, tees, use_handicap, date_start, cover_image_url, organizer_id, courses(id, nombre)')
    .eq('slug', params.slug)
    .single()

  if (!tournament || tournament.organizer_id !== user.id) redirect('/dashboard')

  // Check if any scores exist (hole_scores from any round in this tournament)
  const { data: scoresData } = await supabase
    .from('hole_scores')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournament.id)

  const has_scores = (scoresData && scoresData.length > 0) ? true : false

  const { data: coursesRaw } = await supabase
    .from('courses')
    .select('id, nombre, ciudad')
    .order('nombre')

  const courses = (coursesRaw as CourseOption[]) || []

  return <EditTorneoForm tournament={{ ...tournament, has_scores } as unknown as TournamentData} courses={courses} />
}
