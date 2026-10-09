// Lectura de `profiles.indice` acotada a `id, indice` de los usuarios pedidos, con
// el cliente que se le pase. La usa `indices-de-perfil.ts` (server-only, cliente de
// servicio) y los scripts que ya tienen su propio cliente de servicio.

import type { SupabaseClient } from '@supabase/supabase-js'

/** `user_id` → `profiles.indice`. Los perfiles sin índice no aparecen. */
export type IndicesDePerfil = Map<string, number>

/** Firma inyectable: las capas de datos compartidas con el navegador reciben esto. */
export type LeerIndicesDePerfil = (userIds: readonly string[]) => Promise<IndicesDePerfil>

export async function leerIndicesDePerfilCon(
  cliente: Pick<SupabaseClient, 'from'>,
  userIds: readonly string[],
): Promise<IndicesDePerfil> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  const indices: IndicesDePerfil = new Map()
  if (ids.length === 0) return indices
  const { data, error } = await cliente.from('profiles').select('id, indice').in('id', ids)
  // Fallar CERRADO: con el error tragado, el jugador quedaría con índice 0 y el
  // neto se publicaría como gross — justo el bug que esta lectura existe para cerrar.
  if (error) throw new Error(`No se pudieron leer los índices de perfil: ${error.message}`)
  for (const p of (data ?? []) as Array<{ id: string; indice: number | null }>) {
    if (p.indice != null) indices.set(p.id, p.indice)
  }
  return indices
}
