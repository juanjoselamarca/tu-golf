// src/lib/data/tournaments/fuera-del-ranking.ts
//
// Lecturas del pie de la tabla: los inscritos retirados (WD) o descalificados
// (DQ), que no compiten por posición (#813). La regla vive en
// `src/golf/leaderboard/fuera-del-ranking.ts`; acá sólo se lee y se proyecta.
//
// Lo usan /torneo/[slug] y /en-vivo (y sus rutas cacheables): un solo lugar
// que decide qué tarjeta entra al ranking.

import type { DBRondaLibreJugador, DBTournamentGroupRow, DBWithdrawnPlayer, WithdrawnEntry } from '@/app/torneo/[slug]/types'
import type { CourseHole } from '@/golf/leaderboard/types'
import type { LeerNombresDePerfil } from '@/lib/data/nombres-de-perfil-lectura'
import { JUGADOR_FUERA_STATUSES, jugadorFueraDelTorneo } from '@/golf/tournament-status'
import { separarFueraDelRanking, type GrupoConTarjetas } from '@/golf/leaderboard/fuera-del-ranking'
import { captureError } from '@/lib/error-tracking'
import { nombresFaltantes, type Client } from './leaderboard'

type InscritoFuera = DBWithdrawnPlayer & { id: string }

/**
 * Inscritos WD/DQ del torneo. El filtro se repite en código: si la consulta
 * trajera de más (o un doble de test ignora el `.in`), un aprobado nunca termina
 * en el pie. Un error de la base se PROPAGA: con la tabla viva, "no pude saber
 * quién se retiró" no es "nadie se retiró" (el WD quedaría rankeado).
 */
async function fetchInscritosFuera(supabase: Client, tournamentId: string): Promise<InscritoFuera[]> {
  const { data, error } = await supabase
    .from('players')
    .select('id, user_id, status, status_reason, player_name, profiles(name)')
    .eq('tournament_id', tournamentId)
    .in('status', [...JUGADOR_FUERA_STATUSES])
  if (error) throw error
  return ((data as unknown as InscritoFuera[] | null) ?? []).filter((p) => jugadorFueraDelTorneo(p.status))
}

/**
 * Pie de la tabla del camino LEGACY: el nombre sale de la inscripción (no hay
 * tarjeta). Sin golpes: el legacy no los separa del board todavía. Si la
 * lectura falla se reporta y el pie queda vacío: el board legacy ya excluye a
 * los WD/DQ por su cuenta (`fetchLegacyPlayers`), así que no se rankea a nadie
 * de más; sólo se pierde el pie (antes, igual: el error se ignoraba).
 */
export async function fetchWithdrawnPlayers(
  supabase: Client,
  tournamentId: string,
  leerNombres: LeerNombresDePerfil,
): Promise<WithdrawnEntry[]> {
  let raw: InscritoFuera[]
  try {
    raw = await fetchInscritosFuera(supabase, tournamentId)
  } catch (e) {
    void captureError(e, { context: 'fuera-del-ranking.fetchWithdrawnPlayers', meta: { tournamentId } })
    return []
  }
  // Sin esto, un WD con cuenta desaparecía del footer para el visor anónimo: su
  // nombre quedaba en null y la fila se filtraba en silencio.
  const nombres = await nombresFaltantes(raw, leerNombres)
  const out: WithdrawnEntry[] = []
  for (const p of raw) {
    const displayName = p.profiles?.name ?? (p.user_id ? nombres.get(p.user_id) : null) ?? p.player_name
    if (displayName) out.push({ name: displayName, status: p.status, reason: p.status_reason })
  }
  return out
}

/**
 * Camino de RONDA LIBRE: separa las tarjetas que compiten de las del pie. Lo que
 * devuelve `enRanking` es lo ÚNICO que entra al motor del board (ranking, podio,
 * resultados del cierre y GWI). El pie lleva el nombre de la tarjeta (el mismo
 * que mostraba el board) y sus golpes brutos.
 */
export async function separarTarjetasFueraDelRanking(
  supabase: Client,
  args: {
    tournamentId: string
    grupos: ReadonlyArray<GrupoConTarjetas> | ReadonlyArray<DBTournamentGroupRow>
    tarjetas: DBRondaLibreJugador[]
    courseHoles: CourseHole[]
    totalHoyos: number
  },
): Promise<{ enRanking: DBRondaLibreJugador[]; fuera: WithdrawnEntry[] }> {
  if (args.tarjetas.length === 0) return { enRanking: args.tarjetas, fuera: [] }
  const inscritos = await fetchInscritosFuera(supabase, args.tournamentId)
  const { enRanking, fuera } = separarFueraDelRanking({
    tarjetas: args.tarjetas,
    grupos: args.grupos as ReadonlyArray<GrupoConTarjetas>,
    inscritos,
    courseHoles: args.courseHoles,
    totalHoyos: args.totalHoyos,
  })
  return {
    enRanking,
    fuera: fuera.map((f) => ({
      name: f.nombre,
      status: f.status,
      reason: f.reason,
      bruto: { grossTotal: f.grossTotal, hoyos: f.hoyos, vsPar: f.vsPar },
    })),
  }
}
