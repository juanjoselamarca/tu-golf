// src/app/organizador/nuevo/page.tsx
//
// Server component. Carga datos en paralelo (courses, drafts del usuario,
// torneos recientes del organizador) y los pasa al editor cliente.

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/organizador/nuevo')

  const [coursesRes, draftsRes, tournamentsRes] = await Promise.all([
    supabase.from('courses').select('id, nombre, ciudad').order('nombre'),
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
      courses={(coursesRes.data as CourseOption[]) || []}
      existingDrafts={drafts}
      recentTournaments={tournaments}
      initialDraftId={searchParams.draft}
    />
  )
}
