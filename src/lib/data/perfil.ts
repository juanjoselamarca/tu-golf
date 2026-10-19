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
  /**
   * Desde cuándo FedeGolf responde "sin índice vigente" para el RUT (null = vigente).
   * El índice mostrado es entonces el último conocido: no se rotula "Oficial USGA".
   */
  sinIndiceDesde: string | null
}

export const FEDEGOLF_SIN_VINCULO: FedegolfStatus = {
  vinculado: false, requiereReconexion: false, ultimoIndice: null, ultimoSync: null, sinIndiceDesde: null,
}

export async function fetchFedegolfStatus(supabase: SupabaseClient, userId: string): Promise<FedegolfStatus> {
  const { data, error } = await supabase
    .from('fedegolf_credentials')
    .select('ultimo_indice, ultimo_sync, activo, sin_indice_desde')
    .eq('user_id', userId)
    .maybeSingle()

  // Fail-safe: si la query falla (DB/RLS), tratamos como "no vinculado" para no
  // romper el perfil, pero NO perdemos la señal — la reportamos.
  if (error) {
    captureError(error, { context: 'fetchFedegolfStatus', meta: { userId } })
    return FEDEGOLF_SIN_VINCULO
  }
  if (!data) return FEDEGOLF_SIN_VINCULO
  // Clave rechazada: la fila conserva lo último sabido (al reconectar, la UI parte
  // de los mismos valores que la base, ver estadoTrasVincular).
  const activo = data.activo !== false
  return {
    vinculado: activo,
    requiereReconexion: !activo,
    ultimoIndice: data.ultimo_indice ?? null,
    ultimoSync: data.ultimo_sync ?? null,
    sinIndiceDesde: data.sin_indice_desde ?? null,
  }
}

/** Lo que devuelve POST /api/fedegolf/vincular al vincular OK. */
export interface ResultadoVinculoFedegolf {
  indice: number | null
  /** FedeGolf no tiene índice vigente para el RUT. */
  sinIndice: boolean
  /** FedeGolf respondió la consulta del índice (si no, no hubo sincronización). */
  sincronizado: boolean
}

/**
 * Estado tras vincular, espejo de lo que dejó la base: sin índice nuevo se
 * conserva el último conocido, la marca de "sin índice vigente" mantiene su
 * desde, y la última sincronización solo avanza si FedeGolf respondió.
 */
export function estadoTrasVincular(s: FedegolfStatus, r: ResultadoVinculoFedegolf, ahora: string): FedegolfStatus {
  return {
    vinculado: true,
    requiereReconexion: false,
    ultimoIndice: r.indice ?? s.ultimoIndice,
    ultimoSync: r.sincronizado ? ahora : s.ultimoSync,
    sinIndiceDesde: r.sinIndice ? (s.sinIndiceDesde ?? ahora) : null,
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
