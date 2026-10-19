import type { SupabaseClient } from '@supabase/supabase-js'
import { OR_EXCLUDE_FEDEGOLF } from '@/lib/data/historical-rounds-filters'
import { calcularCPI, type ResultadoCPI, type RondaCPI } from '@/golf/stats/cpi'
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
  /**
   * FedeGolf rechazó la clave guardada (activo=false: el usuario la cambió en
   * fedegolf.cl). El índice sigue al día (es público por RUT); las tarjetas no
   * hasta que reconecte. Se muestra como "no vinculado" con copy de reconexión.
   */
  requiereReconexion: boolean
  ultimoIndice: number | null
  ultimoSync: string | null
}

export const FEDEGOLF_SIN_VINCULO: FedegolfStatus = {
  vinculado: false, requiereReconexion: false, ultimoIndice: null, ultimoSync: null,
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
    return FEDEGOLF_SIN_VINCULO
  }
  if (!data) return FEDEGOLF_SIN_VINCULO
  if (data.activo === false) return { ...FEDEGOLF_SIN_VINCULO, requiereReconexion: true }
  return {
    vinculado: true,
    requiereReconexion: false,
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

/**
 * FUENTE ÚNICA de las rondas que lee el CPI. La usan /perfil (`fetchCpi`),
 * /api/cpi, /coach y el caché que escribe import-confirm, así que las cuatro
 * superficies muestran el mismo número. Las rondas que el índice no promedia
 * tampoco entran: las tarjetas FedeGolf (espejo score-only, `OR_EXCLUDE_FEDEGOLF`)
 * y las que el usuario excluyó (`excluded_from_handicap`). El diferencial es el
 * persistido (el del índice, con el tope WHS 3.1, #545). Últimas 50 por fecha
 * (el CPI usa hasta 20 con diferencial). `null` si la lectura falla.
 */
export async function fetchRondasCPI(supabase: SupabaseClient, userId: string): Promise<RondaCPI[] | null> {
  const { data, error } = await supabase
    .from('historical_rounds')
    .select('played_at, diferencial')
    .eq('user_id', userId)
    .or(OR_EXCLUDE_FEDEGOLF)
    .eq('excluded_from_handicap', false)
    .order('played_at', { ascending: false })
    .limit(50)
  if (error) return null
  return ((data ?? []) as Array<{ played_at: string; diferencial: number | null }>)
    .map(r => ({ played_at: r.played_at, diferencial: r.diferencial ?? null }))
}

// CPI calculado server-side: misma lógica que /api/cpi pero SIN round-trip HTTP
// ni re-auth. Retorna el ResultadoCPI canónico, o null si la query falla (la UI
// cae a "sin CPI" sin romper la página).
export async function fetchCpi(supabase: SupabaseClient, userId: string): Promise<ResultadoCPI | null> {
  const rondas = await fetchRondasCPI(supabase, userId)
  return rondas ? calcularCPI(rondas) : null
}
