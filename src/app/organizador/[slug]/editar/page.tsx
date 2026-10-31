import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { redirect } from 'next/navigation'
import EditTorneoForm from './EditTorneoForm'
import { loginUrl } from '@/lib/auth/login-url'
import { captureError } from '@/lib/error-tracking'

export interface CourseOption { id: string; nombre: string; ciudad: string | null }

interface TournamentData {
  id: string; name: string; slug: string; format: string; hole_count: number
  tees: string; use_handicap: boolean; date_start: string | null
  cover_image_url: string | null; courses: { id: string; nombre: string } | null
  has_scores?: boolean; status?: string
  /** El torneo ya se está jugando: cambiar el tee movería el hándicap con que se puntúa. */
  tee_bloqueado?: boolean
  /** Categorías con `default_tee_color`; null = no se pudo leer. */
  categorias_con_tee?: number | null
  /** Categorías del torneo, con tee o sin él: el motor resuelve por la de CADA jugador. */
  categorias_total?: number
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

  // ¿Hay scores? Es el único candado que impide cambiar de 9 a 18 hoyos o el formato con el torneo
  // andando: el form escribe esas columnas directo a la tabla, sin route que valide del otro lado.
  //
  // Dos cosas que lo tenían muerto: `head: true` NO devuelve filas (el conteo viene en `count`, y
  // `data` es siempre null), y `hole_scores` NO tiene `tournament_id` — sus columnas son
  // `round_id, hole_number, par, gross_score, …`, el torneo lo tiene `rounds`. Filtrar por una
  // columna que no existe le hace devolver error a PostgREST y `count` null, así que `has_scores`
  // daba SIEMPRE false. Por eso se cuenta con el embed `rounds!inner`: probado contra prod, 72 filas
  // en `gate-scorer-18h-mixto`, el mismo torneo donde el filtro por `tournament_id` devolvía null.
  const scores = await supabase
    .from('hole_scores')
    .select('id, rounds!inner(tournament_id)', { count: 'exact', head: true })
    .eq('rounds.tournament_id', tournament.id)

  // Un candado que falla ABIERTO es justo lo que acaba de pasar acá, así que si la consulta no
  // responde se asume que hay scores: peor es dejar cambiar los hoyos de un torneo en juego.
  if (scores.error) await captureError(scores.error, { context: 'organizador.editar.scores', meta: { slug: params.slug } })
  const has_scores = scores.error != null || (scores.count ?? 0) > 0

  // ¿Ya hay una tarjeta compartida? `startTournament` le copia `tournaments.tees` a
  // `rondas_libres.tees` al crearla, así que desde ese momento el scorer tiene su propia copia del
  // tee: cambiarlo acá haría que el board y la tarjeta calculen dos hándicaps distintos (issue
  // #698). Mientras eso no se cierre, el tee queda bloqueado desde la primera tarjeta compartida.
  const compartidas = await supabase
    .from('tournament_groups')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournament.id)
    .not('ronda_libre_id', 'is', null)

  if (compartidas.error) await captureError(compartidas.error, { context: 'organizador.editar.grupos', meta: { slug: params.slug } })
  const tee_bloqueado = has_scores || compartidas.error != null || (compartidas.count ?? 0) > 0

  // Las categorías y cuántas traen tee. Es lo que de verdad decide el tee en los modos que no
  // asignan a mano: `resolvePlayerTee` encadena `players.tee_id` → `categories.default_tee_color` →
  // `tournaments.tees`, y en esos modos la última guarda el MODO, que no matchea ningún tee. Se
  // cuentan las DOS cosas porque el motor resuelve por la categoría de CADA jugador: con una
  // categoría con tee y dos sin él, los jugadores de esas dos caen igual al rating de la cancha, y
  // contar solo "¿hay alguna?" les prometía la categoría a todos. Son un puñado de filas por
  // torneo, así que se traen y se cuentan acá en vez de pagar dos conteos.
  const cats = await supabase
    .from('categories')
    .select('default_tee_color')
    .eq('tournament_id', tournament.id)

  if (cats.error) await captureError(cats.error, { context: 'organizador.editar.categorias', meta: { slug: params.slug } })
  // null (y no 0) cuando la consulta falla: "no tiene categorías con tee" sin haberlas podido leer
  // es la misma mentira que prometer la categoría sin mirarla.
  const categorias_con_tee = cats.error ? null : (cats.data ?? []).filter(c => c.default_tee_color != null).length
  const categorias_total = cats.data?.length ?? 0

  const { data: coursesRaw } = await supabase
    .from('courses')
    .select('id, nombre, ciudad')
    .order('nombre')

  const courses = (coursesRaw as CourseOption[]) || []

  return (
    <EditTorneoForm
      tournament={{ ...tournament, has_scores, tee_bloqueado, categorias_con_tee, categorias_total } as unknown as TournamentData}
      courses={courses}
    />
  )
}
