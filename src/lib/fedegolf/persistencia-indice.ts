/**
 * Persistencia del sync de índice en Supabase — la comparten la ruta
 * /api/fedegolf/sync-indice (cliente con la sesión del usuario, RLS de dueño) y
 * el cron /api/cron/fedegolf-indices (service role). Mismo SQL, distinto cliente.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CredencialesFedegolf, DepsSyncIndice } from './sincronizar-indice'

type Reportar = (err: unknown, paso: string) => void

export function persistenciaIndice(
  supabase: SupabaseClient,
  userId: string,
  reportar: Reportar,
): Pick<DepsSyncIndice, 'leerCredenciales' | 'guardarSync' | 'registrarIndice'> {
  return {
    leerCredenciales: async () => {
      const { data, error } = await supabase
        .from('fedegolf_credentials')
        .select('rut_encrypted, activo, ultimo_sync, ultimo_indice')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const fila = data as CredencialesFedegolf
      // numeric de Postgres: se normaliza a number para que el compare-and-set y
      // esCambioDeIndice no vean "8.3" !== 8.3 como un cambio.
      return { ...fila, ultimo_indice: fila.ultimo_indice === null ? null : Number(fila.ultimo_indice) }
    },
    guardarSync: async (indice, anterior) => {
      let cas = supabase
        .from('fedegolf_credentials')
        .update({ ultimo_sync: new Date().toISOString(), ultimo_indice: indice })
        .eq('user_id', userId)
      cas = anterior === null ? cas.is('ultimo_indice', null) : cas.eq('ultimo_indice', anterior)
      const { data, error } = await cas.select('user_id')
      if (error) {
        reportar(error, 'update_credenciales')
        return false
      }
      if (!data?.length) return false

      const { error: profileError } = await supabase.from('profiles').update({ indice }).eq('id', userId)
      if (profileError) reportar(profileError, 'update_perfil')
      return true
    },
    registrarIndice: async (indice) => {
      const { error } = await supabase
        .from('indice_historial')
        .insert({ user_id: userId, indice, fuente: 'fedegolf_sync' })
      if (error) reportar(error, 'insert_historial')
    },
  }
}

/** Ventana en que un cambio de índice todavía se le avisa al usuario al abrir la app. */
export const AVISO_CAMBIO_INDICE_MS = 7 * 24 * 60 * 60 * 1000

export interface CambioIndice {
  indice: number
  anterior: number
  /** ISO de la fila de historial: identifica el cambio (el cliente recuerda cuál ya mostró). */
  fecha: string
}

interface FilaHistorial {
  indice: number
  fecha: string
}

/**
 * Último cambio de índice reciente, a partir de las dos filas más nuevas de
 * historial `fedegolf_sync` (orden fecha DESC). Puro. null si no hay dos filas
 * (la primera vinculación no es un "cambio"), si son iguales o si es viejo.
 */
export function ultimoCambioReciente(filas: FilaHistorial[], ahora: number): CambioIndice | null {
  const [nuevo, previo] = filas
  if (!nuevo || !previo) return null
  if (ahora - new Date(nuevo.fecha).getTime() > AVISO_CAMBIO_INDICE_MS) return null
  const indice = Number(nuevo.indice)
  const anterior = Number(previo.indice)
  if (indice === anterior) return null
  return { indice, anterior, fecha: nuevo.fecha }
}

export async function leerUltimoCambio(
  supabase: SupabaseClient,
  userId: string,
  ahora: number,
): Promise<CambioIndice | null> {
  const { data, error } = await supabase
    .from('indice_historial')
    .select('indice, fecha')
    .eq('user_id', userId)
    .eq('fuente', 'fedegolf_sync')
    .order('fecha', { ascending: false })
    .limit(2)
  if (error) throw error
  return ultimoCambioReciente((data ?? []) as FilaHistorial[], ahora)
}
