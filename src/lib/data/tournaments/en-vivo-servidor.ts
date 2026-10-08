// Armado del leaderboard en vivo de un torneo para las RUTAS (sin sesión de quien
// pregunta): cliente anónimo + service role acotado a `profiles(id, indice)`.
// Lo comparten la ruta pública cacheable (`/live`, gross en torneos neto) y la
// privada con sesión (`/neto`). Solo servidor.

import { createAnonClient } from '@/utils/supabase/anon'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { armarTorneoEnVivo, fetchTorneoEnVivoRow, type TorneoEnVivo } from './en-vivo'
import type { Client } from './leaderboard'

/** Slugs: minúsculas, dígitos y guiones (lo demás ni se consulta). */
export const SLUG_TORNEO_VALIDO = /^[a-z0-9][a-z0-9-]{0,119}$/

/**
 * `null` = el torneo no existe o no es público. Un error de la base se propaga.
 *
 * El índice del perfil (para el neto de los equipos) lo lee un service role que SÓLO
 * puede pedir `profiles`; de ahí salen sólo totales derivados, nunca el course
 * handicap ni el índice. Decisión de Juanjo (08-oct): en torneos neto el neto se
 * calcula con el índice real.
 * TODO(#509): usar la fuente única `src/lib/data/indices-de-perfil.ts` cuando #509 esté en main.
 */
export async function armarTorneoEnVivoParaRuta(slug: string, opciones: { soloGross: boolean }): Promise<TorneoEnVivo | null> {
  const anon = createAnonClient()
  const row = await fetchTorneoEnVivoRow(anon, slug)
  if (!row) return null
  const clienteIndices = {
    from: (tabla: string) => {
      if (tabla !== 'profiles') throw new Error(`clienteIndices sólo lee profiles (pidió ${tabla})`)
      return createAdminClient().from('profiles')
    },
  }
  return armarTorneoEnVivo(anon as unknown as Client, row, clienteIndices, opciones)
}
