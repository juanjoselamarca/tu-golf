// Lectura de `profiles.name` acotada a `id, name` de los usuarios pedidos, con el
// cliente que se le pase. La usa `nombres-de-perfil.ts` (server-only, cliente de
// servicio). Gemela de `indices-de-perfil-lectura.ts`: mismo problema, misma forma.

import type { SupabaseClient } from '@supabase/supabase-js'

/** `user_id` → `profiles.name`. Los perfiles sin nombre no aparecen. */
export type NombresDePerfil = Map<string, string>

/** Firma inyectable: las capas de datos compartidas con el navegador reciben esto. */
export type LeerNombresDePerfil = (userIds: readonly string[]) => Promise<NombresDePerfil>

export async function leerNombresDePerfilCon(
  cliente: Pick<SupabaseClient, 'from'>,
  userIds: readonly string[],
): Promise<NombresDePerfil> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  const nombres: NombresDePerfil = new Map()
  if (ids.length === 0) return nombres
  const { data, error } = await cliente.from('profiles').select('id, name').in('id', ids)
  // Fallar CERRADO: con el error tragado, el board volvería a publicar "Jugador"
  // en cada fila — justo el dead-end que esta lectura existe para cerrar.
  if (error) throw new Error(`No se pudieron leer los nombres de perfil: ${error.message}`)
  for (const p of (data ?? []) as Array<{ id: string; name: string | null }>) {
    const nombre = p.name?.trim()
    if (nombre) nombres.set(p.id, nombre)
  }
  return nombres
}

/** Lector que no consulta nada: para los gemelos de navegador cuyo visor SIEMPRE
 *  tiene sesión (el embed `profiles(name)` ya trae el nombre). */
export const sinLecturaDeNombres: LeerNombresDePerfil = async () => new Map()
