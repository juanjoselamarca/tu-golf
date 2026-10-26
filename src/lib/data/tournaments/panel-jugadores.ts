// src/lib/data/tournaments/panel-jugadores.ts
//
// Carga inicial del panel de jugadores del organizador
// (/organizador/[slug]/jugadores): el torneo, sus inscritos y sus categorías.
// Antes estas consultas vivían en page.tsx.

import type { SupabaseClient } from '@supabase/supabase-js'
import { listInscritosDelPanel } from './players'

const TORNEO_DEL_PANEL_SELECT = '*, courses(id, nombre, ciudad, slope_rating, course_rating, par_total)'

/** Torneo por slug con su cancha, o null si no existe. */
export async function fetchTorneoDelPanel<T>(supabase: SupabaseClient, slug: string): Promise<T | null> {
  const { data } = await supabase.from('tournaments').select(TORNEO_DEL_PANEL_SELECT).eq('slug', slug).single()
  return (data as T | null) ?? null
}

/** Inscritos y categorías del torneo. Lanza si alguna consulta falla (no se muestra un panel vacío falso). */
export async function fetchInscritosYCategorias<P, C>(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<{ players: P[]; categories: C[] }> {
  const [players, { data: categories, error }] = await Promise.all([
    listInscritosDelPanel<P>(supabase, tournamentId),
    supabase.from('categories').select('id, name, handicap_min, handicap_max').eq('tournament_id', tournamentId),
  ])
  if (error) throw new Error(error.message)
  return { players, categories: (categories ?? []) as unknown as C[] }
}
