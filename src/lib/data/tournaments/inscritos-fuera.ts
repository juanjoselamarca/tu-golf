// src/lib/data/tournaments/inscritos-fuera.ts
//
// Lectura del estado WD/DQ de las TARJETAS de un torneo (#813). La regla es
// `estadoFueraPorTarjeta` (src/golf/leaderboard/fuera-del-ranking.ts); acá sólo
// se lee lo mínimo (`id, user_id, status, status_reason`) y se reporta lo que no
// se pudo resolver. La usan el board individual (`fuera-del-ranking.ts`) y los
// equipos (`teamLeaderboard.ts`). No importa `leaderboard.ts`: teamLeaderboard
// ya es importado por él y el ciclo quedaría cerrado.

import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'
import { JUGADOR_FUERA_STATUSES } from '@/golf/tournament-status'
import {
  estadoFueraPorTarjeta,
  type EstadosFuera,
  type GrupoConTarjetas,
  type InscritoConEstado,
  type TarjetaDelTorneo,
} from '@/golf/leaderboard/fuera-del-ranking'

const SIN_FUERA: EstadosFuera = { porTarjeta: new Map(), sinResolver: [] }

/**
 * Estado WD/DQ por tarjeta. Si la lectura falla NO tumba el board: se reporta y
 * se devuelve "nadie fuera" (el board sale sin pie, como antes de #813). Los
 * WD/DQ cuya tarjeta no se pudo ubicar se reportan: seguirían rankeados.
 */
export async function leerEstadosFuera(
  supabase: Pick<SupabaseClient, 'from'>,
  tournamentId: string,
  grupos: ReadonlyArray<GrupoConTarjetas>,
  tarjetas: ReadonlyArray<TarjetaDelTorneo>,
): Promise<EstadosFuera> {
  if (tarjetas.length === 0) return SIN_FUERA
  let inscritos: InscritoConEstado[]
  try {
    const { data, error } = await supabase
      .from('players')
      .select('id, user_id, status, status_reason')
      .eq('tournament_id', tournamentId)
      .in('status', [...JUGADOR_FUERA_STATUSES])
    if (error) throw error
    inscritos = (data as InscritoConEstado[] | null) ?? []
  } catch (e) {
    void captureError(e, { context: 'inscritos-fuera.leerEstadosFuera', meta: { tournamentId } })
    return SIN_FUERA
  }
  const estados = estadoFueraPorTarjeta(grupos, inscritos, tarjetas)
  if (estados.sinResolver.length > 0) {
    void captureError(new Error('WD/DQ sin tarjeta ubicable: seguiría rankeado'), {
      context: 'inscritos-fuera.sinResolver',
      meta: { tournamentId, inscritos: estados.sinResolver.map((p) => p.id) },
    })
  }
  return estados
}
