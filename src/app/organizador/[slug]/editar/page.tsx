import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { redirect } from 'next/navigation'
import EditTorneoForm from './EditTorneoForm'
import { loginUrl } from '@/lib/auth/login-url'
import { captureError } from '@/lib/error-tracking'
import { candadosDeConfiguracion } from '@/golf/tournament-config-locks'
import { leerSenalesDeTorneoEnJuego, leerTeeDeCadaJugador } from '@/lib/data/tournaments/tournament-config'
import type { CandadosDeConfiguracion } from '@/golf/tournament-config-locks'
import type { TeeDeCadaJugador } from '@/golf/tournament-tees-mode'

export interface CourseOption { id: string; nombre: string; ciudad: string | null }

interface TournamentData {
  id: string; name: string; slug: string; format: string; hole_count: number
  tees: string; use_handicap: boolean; date_start: string | null
  cover_image_url: string | null; courses: { id: string; nombre: string } | null
  status?: string
  /** Qué se puede seguir cambiando. Los tres predicados viven en `tournament-config-locks.ts`. */
  candados: CandadosDeConfiguracion
  /** De dónde sale el tee de cada jugador: lo que la pantalla necesita para no prometer de más. */
  tee_de_cada_jugador: TeeDeCadaJugador
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

  // Qué de la configuración se puede seguir cambiando. Los conteos y los predicados viven en
  // `tournament-config.ts` y `tournament-config-locks.ts`, no acá, porque el guardado los vuelve a
  // leer con los MISMOS criterios: cuando el predicado estaba escrito en la pantalla y en el
  // UPDATE, el candado de 9↔18 hoyos se quedó muerto sin que nada avisara.
  const senales = await leerSenalesDeTorneoEnJuego(supabase, tournament.id, tournament.status ?? null)
  for (const e of senales.errores) {
    await captureError(e, { context: 'organizador.editar.senales', meta: { slug: params.slug } })
  }
  const candados = candadosDeConfiguracion(senales.valor)

  // De dónde sale el tee de cada jugador. Es lo que de verdad decide el tee en los modos que no lo
  // asignan a mano, y se cuenta por JUGADOR y no por categoría: `players.category_id` es nullable,
  // así que un inscrito sin categoría no tiene de dónde sacarlo aunque todas las categorías del
  // torneo tengan tee.
  const teeDeCadaJugador = await leerTeeDeCadaJugador(supabase, tournament.id)
  for (const e of teeDeCadaJugador.errores) {
    await captureError(e, { context: 'organizador.editar.tee-por-jugador', meta: { slug: params.slug } })
  }

  const { data: coursesRaw } = await supabase
    .from('courses')
    .select('id, nombre, ciudad')
    .order('nombre')

  const courses = (coursesRaw as CourseOption[]) || []

  return (
    <EditTorneoForm
      tournament={{ ...tournament, candados, tee_de_cada_jugador: teeDeCadaJugador.valor } as unknown as TournamentData}
      courses={courses}
    />
  )
}
