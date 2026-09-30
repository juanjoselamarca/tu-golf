// src/lib/data/ronda-libre-guest-claim.ts
//
// Un invitado (is_guest = true, user_id = null) juega una ronda libre y después
// crea cuenta: sus tarjetas se le asignan por coincidencia de nombre para que
// aparezcan en "Mis rondas". Extraído de `app/auth/callback/route.ts`.
//
// Corre con el cliente ADMIN (service role). Antes usaba la sesión del usuario
// recién creado, que no es creador ni dueño de esas filas: el UPDATE pasaba
// únicamente por el hueco de las policies permisivas (cerrado el 29-sep-2026).
//
// Solo rondas FINALIZADAS: una tarjeta en curso con user_id pasa a exigir la
// sesión de ese usuario para anotar, y el invitado que está jugando quedaría
// bloqueado a mitad de ronda si otra persona con su nombre crea cuenta.

import type { SupabaseClient } from '@supabase/supabase-js'

function normalizar(nombre: string | null | undefined): string {
  return (nombre ?? '').trim().toLowerCase()
}

/** Patrón ILIKE que matchea el nombre literal (con espacios alrededor). */
function patronLiteral(nombre: string): string {
  return `%${nombre.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

interface FilaInvitado {
  id: string
  nombre: string | null
  nombre_invitado: string | null
}

/**
 * Asigna `user_id` a las tarjetas de invitado (de rondas finalizadas) cuyo
 * nombre coincide con el perfil del usuario. Devuelve cuántas filas reclamó.
 * Nunca lanza: si algo falla el login sigue funcionando (se reporta como 0).
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

    // El filtro por nombre va al servidor (ILIKE) para no traer la tabla
    // entera: PostgREST corta en 1.000 filas sin avisar. La igualdad exacta
    // se decide abajo en JS.
    const patron = patronLiteral(nombre)
    const candidatas = async (columna: 'nombre' | 'nombre_invitado') => {
      const { data } = await admin
        .from('ronda_libre_jugadores')
        .select('id, nombre, nombre_invitado, rondas_libres!inner(estado)')
        .eq('is_guest', true)
        .is('user_id', null)
        .eq('rondas_libres.estado', 'finalizada')
        .ilike(columna, patron)
      return (data ?? []) as unknown as FilaInvitado[]
    }
    const filas = [...(await candidatas('nombre_invitado')), ...(await candidatas('nombre'))]

    const ids = [...new Set(
      filas
        .filter(row => normalizar(row.nombre_invitado || row.nombre) === nombre)
        .map(row => row.id),
    )]
    if (ids.length === 0) return 0

    const { data: updated } = await admin
      .from('ronda_libre_jugadores')
      .update({ user_id: userId })
      .in('id', ids)
      .is('user_id', null)
      .select('id')

    return updated?.length ?? 0
  } catch {
    return 0
  }
}
