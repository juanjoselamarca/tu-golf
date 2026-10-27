// ─── ¿Existen estas cuentas? (solo servidor) ────────────────────────────────
//
// Para validar ids de perfil que manda el cliente (p. ej. la cuenta que el
// creador eligió para un rival, `ronda_libre_jugadores.perfil_sugerido_id`)
// antes de grabarlos: un id inexistente rompería la FK en el INSERT.
//
// Va con el cliente de servicio: en un route handler el rol `authenticated` no
// puede hacer SELECT de `profiles` (permission denied, #266). Acotado a `id` de
// los ids pedidos; nada de esto viaja en la respuesta.
import 'server-only'

import { createAdminClient } from '@/lib/supabaseAdmin'

/** Los ids de `ids` que son un perfil real. Lanza si la base no responde. */
export async function perfilesQueExisten(ids: readonly string[]): Promise<Set<string>> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return new Set()
  const { data, error } = await createAdminClient().from('profiles').select('id').in('id', unicos)
  if (error) throw error
  return new Set((data ?? []).map(p => p.id as string))
}
