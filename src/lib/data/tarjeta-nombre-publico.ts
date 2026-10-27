// ─── Nombre del dueño de una tarjeta pública ────────────────────────────────
// `profiles` sólo se lee con sesión (policy "Profiles solo autenticados", 22-sep):
// el que abre el link de una tarjeta compartida sin cuenta — y el bot de WhatsApp
// que arma el preview — veían "Jugador" en vez del nombre de quien la compartió.
//
// Esta es la única puerta para ese nombre sin sesión: corre en el servidor con el
// cliente admin y sólo responde si la ronda es pública (lo mismo que deja ver la
// policy `public_rounds`). Devuelve el nombre y nada más del perfil. Mismo
// patrón que `indices-de-perfil.ts` (#511).
import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'

/**
 * `{ nombre: null }` = ronda inexistente, privada o sin nombre (respuesta firme).
 * `{ error: true }` = no se pudo preguntar (se reporta): quien cachea no debe guardarlo.
 */
export type NombrePublico = { nombre: string | null } | { error: true }

export async function leerNombreDelDueñoDeTarjetaPublica(admin: SupabaseClient, roundId: string): Promise<NombrePublico> {
  try {
    const { data: ronda, error } = await admin
      .from('historical_rounds')
      .select('user_id')
      .eq('id', roundId)
      .eq('privacy', 'public')
      .maybeSingle()
    if (error) {
      // 22P02 = el id no es uuid: no hay ronda, no es una falla.
      if (error.code === '22P02') return { nombre: null }
      void captureError(error, { context: 'tarjeta-nombre-publico.ronda', meta: { roundId } })
      return { error: true }
    }
    const userId = (ronda as { user_id: string | null } | null)?.user_id
    if (!userId) return { nombre: null }

    const { data: perfil, error: errPerfil } = await admin
      .from('profiles')
      .select('name')
      .eq('id', userId)
      .maybeSingle()
    if (errPerfil) {
      void captureError(errPerfil, { context: 'tarjeta-nombre-publico.perfil', meta: { roundId } })
      return { error: true }
    }
    const nombre = (perfil as { name: string | null } | null)?.name?.trim()
    return { nombre: nombre || null }
  } catch (err) {
    void captureError(err, { context: 'tarjeta-nombre-publico', meta: { roundId } })
    return { error: true }
  }
}

/** El nombre o `null` (error incluido): para quien no cachea, como el preview OG. */
export async function nombreDelDueñoDeTarjetaPublica(admin: SupabaseClient, roundId: string): Promise<string | null> {
  const r = await leerNombreDelDueñoDeTarjetaPublica(admin, roundId)
  return 'error' in r ? null : r.nombre
}
