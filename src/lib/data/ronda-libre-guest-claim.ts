// src/lib/data/ronda-libre-guest-claim.ts
//
// Un invitado (is_guest = true, user_id = null) juega una ronda libre y después
// crea cuenta: sus tarjetas se le asignan por coincidencia de nombre para que
// aparezcan en "Mis rondas". Extraído de `app/auth/callback/route.ts`.
//
// Corre con el cliente ADMIN (service role). Antes usaba la sesión del usuario
// recién creado, que no es creador ni dueño de esas filas: el UPDATE pasaba
// únicamente por el hueco de las policies permisivas (cerrado el 29-sep-2026).

import type { SupabaseClient } from '@supabase/supabase-js'

function normalizar(nombre: string | null | undefined): string {
  return (nombre ?? '').trim().toLowerCase()
}

/**
 * Asigna `user_id` a las tarjetas de invitado cuyo nombre coincide con el
 * perfil del usuario. Devuelve cuántas filas reclamó. Nunca lanza: si algo
 * falla el login sigue funcionando (se reporta como 0).
 */
export async function reclamarTarjetasDeInvitado(admin: SupabaseClient, userId: string): Promise<number> {
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('name')
      .eq('id', userId)
      .single()

    const nombre = normalizar(profile?.name)
    if (!nombre) return 0

    const { data: guestRows } = await admin
      .from('ronda_libre_jugadores')
      .select('id, nombre, nombre_invitado')
      .eq('is_guest', true)
      .is('user_id', null)

    const ids = (guestRows ?? [])
      .filter(row => normalizar(row.nombre_invitado || row.nombre) === nombre)
      .map(row => row.id as string)
    if (ids.length === 0) return 0

    const { data: updated } = await admin
      .from('ronda_libre_jugadores')
      .update({ user_id: userId })
      .in('id', ids)
      .select('id')

    return updated?.length ?? 0
  } catch {
    return 0
  }
}
