import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { redirect } from 'next/navigation'
import EditTorneoForm from './EditTorneoForm'
import { loginUrl } from '@/lib/auth/login-url'

export interface CourseOption { id: string; nombre: string; ciudad: string | null }

interface TournamentData {
  id: string; name: string; slug: string; format: string; hole_count: number
  tees: string; use_handicap: boolean; date_start: string | null
  cover_image_url: string | null; courses: { id: string; nombre: string } | null
  has_scores?: boolean; status?: string
  /** Si no hay ninguna, los modos que resuelven por categoría no tienen de dónde sacar un tee. */
  hay_categoria_con_tee?: boolean
}

export default async function EditarTorneoPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect(loginUrl(`/organizador/${params.slug}/editar`))

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, slug, format, hole_count, tees, use_handicap, date_start, cover_image_url, organizer_id, status, courses(id, nombre)')
    .eq('slug', params.slug)
    .single()

  if (!tournament || tournament.organizer_id !== user.id) redirect('/dashboard')

  // `head: true` NO devuelve filas: el conteo viene en `count` y `data` es siempre null. Leerlo de
  // `data.length` hacía que `has_scores` fuera SIEMPRE false, y con eso moría el único candado que
  // impide cambiar de 9 a 18 hoyos con el torneo andando (el form escribe `hole_count` directo a la
  // tabla, sin route que lo valide del otro lado). Probado contra prod: data = null, count = 1.044.
  const { count: scoresCount } = await supabase
    .from('hole_scores')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournament.id)

  const has_scores = (scoresCount ?? 0) > 0

  // ¿Hay alguna categoría con tee? Es lo que de verdad decide el tee en los modos que no asignan a
  // mano: `resolvePlayerTee` encadena `players.tee_id` → `categories.default_tee_color` →
  // `tournaments.tees`, y en esos modos la última guarda el MODO, que no matchea ningún tee. Sin
  // categoría con tee el handicap termina saliendo del rating de la CANCHA, así que la pantalla no
  // puede decirle al organizador "el tee sale de la categoría de cada jugador".
  const { count: categoriasConTee } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournament.id)
    .not('default_tee_color', 'is', null)

  const hay_categoria_con_tee = (categoriasConTee ?? 0) > 0

  const { data: coursesRaw } = await supabase
    .from('courses')
    .select('id, nombre, ciudad')
    .order('nombre')

  const courses = (coursesRaw as CourseOption[]) || []

  return <EditTorneoForm tournament={{ ...tournament, has_scores, hay_categoria_con_tee } as unknown as TournamentData} courses={courses} />
}
