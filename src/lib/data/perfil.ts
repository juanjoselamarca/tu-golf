import type { SupabaseClient } from '@supabase/supabase-js'
import { OR_EXCLUDE_FEDEGOLF } from '@/lib/data/historical-rounds-filters'
import { calcularCPI, type ResultadoCPI } from '@/golf/stats/cpi'
import { captureError } from '@/lib/error-tracking'

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

/**
 * Estado de vinculación con FedeGolf. Lo resuelve el server component del perfil
 * (RSC) y lo pasa a la UI para pintar el estado correcto sin round-trip client.
 * `vinculado` refleja que existe una fila activa en fedegolf_credentials del
 * usuario. La UI cliente lo mantiene en sync tras vincular/desvincular.
 */
export interface FedegolfStatus {
  vinculado: boolean
  ultimoIndice: number | null
  ultimoSync: string | null
}

export async function fetchFedegolfStatus(supabase: SupabaseClient, userId: string): Promise<FedegolfStatus> {
  const { data, error } = await supabase
    .from('fedegolf_credentials')
    .select('ultimo_indice, ultimo_sync, activo')
    .eq('user_id', userId)
    .maybeSingle()

  // Fail-safe: si la query falla (DB/RLS), tratamos como "no vinculado" para no
  // romper el perfil, pero NO perdemos la señal — la reportamos.
  if (error) {
    captureError(error, { context: 'fetchFedegolfStatus', meta: { userId } })
    return { vinculado: false, ultimoIndice: null, ultimoSync: null }
  }
  if (!data || data.activo === false) {
    return { vinculado: false, ultimoIndice: null, ultimoSync: null }
  }
  return {
    vinculado: true,
    ultimoIndice: data.ultimo_indice ?? null,
    ultimoSync: data.ultimo_sync ?? null,
  }
}

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
    .or(OR_EXCLUDE_FEDEGOLF) // el CPI no cuenta las tarjetas FedeGolf (espejo score-only)
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
