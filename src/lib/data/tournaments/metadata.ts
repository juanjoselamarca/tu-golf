import type { SupabaseClient } from '@supabase/supabase-js'

/** Lo que necesita el preview del link compartido (`/torneo/[slug]` → metadata). */
export interface TorneoParaMetadata {
  name: string
  format: string
  status: string
  date_start: string | null
  date_end: string | null
  courses: { nombre: string } | null
  /** La tabla es `players`. NO existe `tournament_players` — pedirla devolvía
   *  PGRST200 y tumbaba TODO el metadata al fallback genérico (bug 20-jul).
   *  `status` para contar solo inscritos aprobados (`contarInscritos`). */
  players: { status: string | null }[]
}

export async function fetchTorneoParaMetadata(
  supabase: SupabaseClient,
  slug: string,
): Promise<TorneoParaMetadata | null> {
  const { data } = await supabase
    .from('tournaments')
    .select('name, format, status, date_start, date_end, courses(nombre), players(status)')
    .eq('slug', slug)
    .single<TorneoParaMetadata>()
  return data ?? null
}
