// Armado del leaderboard en vivo de un torneo para las RUTAS: cliente anónimo
// (tablas públicas) + la lectura canónica de índices de #509 (`indicesDePerfil`,
// servicio, acotada a `id, indice`). Lo comparten la ruta pública cacheable
// (`/live`, visor sin sesión) y la privada (`/neto`, visor con sesión). Solo servidor.
import 'server-only'

import { createAnonClient } from '@/utils/supabase/anon'
import { indicesDePerfil } from '@/lib/data/indices-de-perfil'
import { nombresDePerfil } from '@/lib/data/nombres-de-perfil'
import { armarTorneoEnVivo, fetchTorneoEnVivoRow, type TorneoEnVivo } from './en-vivo'
import type { Client } from './leaderboard'

/**
 * Slugs: minúsculas, dígitos y guiones, de 1 a 120 (lo demás ni se consulta: #, ?, %,
 * /, mayúsculas). Admite guion inicial: `genTournamentSlug` los generaba así hasta el
 * 24-nov-2026 («🏆 Copa» → `-copa-<ts>`) y esos torneos tienen que seguir abriendo.
 * Mismo alfabeto que el generador: lo ata slug-torneo.test.ts.
 */
export const SLUG_TORNEO_VALIDO = /^[a-z0-9-]{1,120}$/

/**
 * `null` = el torneo no existe o no es público. Un error de la base se propaga.
 * Qué ve el visor lo decide la regla canónica (`vistaPublica`, vista-publica.ts):
 * sin sesión, en el camino de ronda libre no viaja nada neto (y en un torneo neto,
 * sólo bruto); el índice del perfil sólo entra al cálculo, nunca a la respuesta.
 */
export async function armarTorneoEnVivoParaRuta(slug: string, opciones: { visorConSesion: boolean }): Promise<TorneoEnVivo | null> {
  const anon = createAnonClient()
  const row = await fetchTorneoEnVivoRow(anon, slug)
  if (!row) return null
  return armarTorneoEnVivo(anon as unknown as Client, row, { visorConSesion: opciones.visorConSesion, leerIndices: indicesDePerfil, leerNombres: nombresDePerfil })
}
