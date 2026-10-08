// ─── Índice WHS de perfiles para pantallas PÚBLICAS (solo servidor) ──────────
//
// FUENTE ÚNICA de "el índice de estos jugadores con cuenta que no lo fijaron en
// su tarjeta". La única policy SELECT de `profiles` es `TO authenticated`: con el
// cliente del request, un visor ANÓNIMO recibe 0 filas SIN error, el jugador
// queda con índice 0 y un torneo/ronda neta se publica como gross (P0 de la
// revisión del #509). Por eso va con el cliente de servicio, acotado a
// `id, indice` de los usuarios pedidos: el índice sólo entra al cálculo del
// course handicap, nunca a la respuesta.
//
// Server-only: importa el cliente de servicio. Las capas de datos que también
// viajan al navegador lo reciben inyectado (ver `fetchRondaLibreJugadoresConCourseHcp`).

import { createAdminClient } from '@/lib/supabaseAdmin'

/** `user_id` → `profiles.indice`. Los perfiles sin índice no aparecen. */
export type IndicesDePerfil = Map<string, number>

/** Firma inyectable: las capas de datos compartidas con el navegador reciben esto. */
export type LeerIndicesDePerfil = (userIds: readonly string[]) => Promise<IndicesDePerfil>

export const indicesDePerfil: LeerIndicesDePerfil = async (userIds) => {
  if (typeof window !== 'undefined') {
    throw new Error('indicesDePerfil es sólo de servidor (usa el cliente de servicio)')
  }
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  const indices: IndicesDePerfil = new Map()
  if (ids.length === 0) return indices
  const { data, error } = await createAdminClient().from('profiles').select('id, indice').in('id', ids)
  // Fallar CERRADO: con el error tragado, el jugador quedaría con índice 0 y el
  // neto se publicaría como gross — justo el bug que esta función existe para cerrar.
  if (error) throw new Error(`No se pudieron leer los índices de perfil: ${error.message}`)
  for (const p of (data ?? []) as Array<{ id: string; indice: number | null }>) {
    if (p.indice != null) indices.set(p.id, p.indice)
  }
  return indices
}
