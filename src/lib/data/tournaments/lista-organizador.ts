// Datos de "Mis Torneos" (/organizador). Antes vivían inline en la página.
import type { SupabaseClient } from '@supabase/supabase-js'
import { contarInscritos } from '@/golf/tournament-status'

export interface TorneoDelOrganizador {
  id: string
  name: string
  slug: string
  format: string
  status: string
  date_start: string | null
  date_end: string | null
  hole_count: number
  /** Inscritos aprobados (`contarInscritos`), el mismo número que el panel y el cupo. */
  player_count: number
}

export interface BorradorDelOrganizador {
  id: string
  name: string | null
  updated_at: string | null
}

export async function fetchTorneosDelOrganizador(
  supabase: SupabaseClient,
  organizerId: string,
): Promise<TorneoDelOrganizador[]> {
  // Los inscritos van EMBEBIDOS por torneo (como `loadCompetenciaData`): una consulta plana a `players` con
  // `.in(ids)` la corta el tope de filas de PostgREST y el conteo saldría bajo sin aviso.
  const { data: rawTournaments } = await supabase
    .from('tournaments')
    .select('id, name, slug, format, status, date_start, date_end, hole_count, players(status)')
    .eq('organizer_id', organizerId)
    .order('date_start', { ascending: false })

  const rows = rawTournaments ?? []
  return rows.map((t) => ({
    id: t.id as string,
    name: (t.name as string) ?? 'Sin nombre',
    slug: (t.slug as string) ?? '',
    format: (t.format as string) ?? 'stroke_play',
    status: (t.status as string | null) ?? 'draft',
    date_start: t.date_start as string | null,
    date_end: (t.date_end as string | null) ?? null,
    hole_count: (t.hole_count as number) ?? 18,
    player_count: contarInscritos(t.players as { status: string | null }[] | null),
  }))
}

export async function fetchBorradoresDelOrganizador(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<BorradorDelOrganizador[]> {
  const { data } = await supabase
    .from('tournament_drafts')
    .select('id, name, updated_at')
    .eq('owner_id', ownerId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(10)
  return (data ?? []) as BorradorDelOrganizador[]
}
