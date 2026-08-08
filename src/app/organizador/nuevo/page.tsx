// src/app/organizador/nuevo/page.tsx
//
// Server component. Carga datos en paralelo (courses, drafts del usuario,
// torneos recientes del organizador) y los pasa al editor cliente.

import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { redirect } from 'next/navigation'
import {
  aptitudDeCatalogo,
  fetchTeesParaAptitud,
  COLUMNAS_APTITUD_COURSES,
  type CourseRowParaAptitud,
} from '@/lib/data/course-aptitud'
import TournamentDraftEditor, {
  type CourseOption,
  type DraftSummary,
  type TournamentSummary,
} from './TournamentDraftEditor'

export const dynamic = 'force-dynamic'

interface NuevoTorneoPageProps {
  searchParams: { draft?: string }
}

export default async function NuevoTorneoPage({ searchParams }: NuevoTorneoPageProps) {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login?next=/organizador/nuevo')

  const [coursesRes, teesRes, draftsRes, tournamentsRes] = await Promise.all([
    // par_total + course_rating viajan en la MISMA consulta que ya se hacía:
    // el guardarrail no agrega un round-trip a la carga del wizard.
    supabase.from('courses').select(`id, nombre, ciudad, ${COLUMNAS_APTITUD_COURSES}`).order('nombre'),
    fetchTeesParaAptitud(supabase),
    supabase
      .from('tournament_drafts')
      .select('id, name, updated_at')
      .eq('owner_id', user.id)
      .eq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('tournaments')
      .select('id, name, slug, format, date_start')
      .eq('organizer_id', user.id)
      .order('date_start', { ascending: false })
      .limit(5),
  ])

  // tournament_drafts.name puede venir como columna generada (config->>name).
  // Normalizamos para que sea string siempre.
  const drafts: DraftSummary[] = (draftsRes.data ?? []).map((d) => ({
    id: d.id as string,
    name: (d.name as string | null) ?? '',
    updated_at: d.updated_at as string,
  }))

  // Aptitud de cada cancha precalculada en el servidor. Al cliente le viaja el
  // veredicto (2 booleanos + mensaje), no los ratings crudos de las ~477 filas
  // de course_tees: sólo necesita saber si puede elegirla y por qué no.
  const courseRows = (coursesRes.data ?? []) as unknown as Array<
    CourseRowParaAptitud & { nombre: string; ciudad: string | null }
  >
  const aptitudes = aptitudDeCatalogo(courseRows, teesRes)
  const courses: CourseOption[] = courseRows.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    ciudad: c.ciudad,
    aptitud: aptitudes.get(c.id),
  }))

  const tournaments: TournamentSummary[] = (tournamentsRes.data ?? []).map((t) => ({
    id: t.id as string,
    name: (t.name as string) ?? '',
    format: (t.format as string) ?? '',
    date_start: (t.date_start as string) ?? '',
    slug: (t.slug as string) ?? '',
  }))

  return (
    <TournamentDraftEditor
      userId={user.id}
      courses={courses}
      existingDrafts={drafts}
      recentTournaments={tournaments}
      initialDraftId={searchParams.draft}
    />
  )
}
