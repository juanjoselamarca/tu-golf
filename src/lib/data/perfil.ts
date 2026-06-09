import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularCPI, type ResultadoCPI } from '@/golf/stats/cpi'

export interface Profile {
  id: string
  name: string
  indice: number | null
  avatar_url: string | null
  indice_golfers: number | null
  indice_golfers_updated_at: string | null
  nivel: number | null
  nivel_updated_at: string | null
  nivel_expires_at: string | null
}

// Fuente ÚNICA de la lista de columnas del perfil. La importan también los hooks
// client-side que re-fetchean el profile (evita que dos copias se desincronicen).
export const PROFILE_COLS =
  'id, name, indice, avatar_url, indice_golfers, indice_golfers_updated_at, nivel, nivel_updated_at, nivel_expires_at'

export type { ResultadoCPI }

export async function fetchProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', userId).single()
  if (error || !data) return null
  return data as Profile
}

export async function countTournaments(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  return count ?? 0
}

// CPI calculado server-side: misma lógica que /api/cpi pero SIN round-trip HTTP
// ni re-auth. Lee las últimas 50 rondas y delega en calcularCPI (que convierte
// 9h→equiv-18h con holes_played). Retorna el ResultadoCPI canónico, o null si
// la query falla (la UI cae a "sin CPI" sin romper la página).
export async function fetchCpi(supabase: SupabaseClient, userId: string): Promise<ResultadoCPI | null> {
  const { data: rondas, error } = await supabase
    .from('historical_rounds')
    .select('played_at, total_gross, course_rating, slope_rating, holes_played')
    .eq('user_id', userId)
    .order('played_at', { ascending: false })
    .limit(50)

  if (error) return null

  const rondasCPI = (rondas ?? []).map((r) => ({
    played_at: r.played_at,
    total_gross: r.total_gross,
    course_rating: r.course_rating ?? null,
    slope_rating: r.slope_rating ?? null,
    holes_played: (r as { holes_played?: number | null }).holes_played ?? null,
  }))

  return calcularCPI(rondasCPI)
}
