// src/lib/data/tournaments/fuera-del-ranking.ts
//
// El pie de la tabla: retirados (WD) y descalificados (DQ), que no compiten por
// posición (#813). La regla vive en `src/golf/leaderboard/fuera-del-ranking.ts`;
// acá se lee y se proyecta. Lo usan /torneo/[slug], /en-vivo (y sus rutas
// cacheables) y /tv: un solo lugar decide qué tarjeta entra al ranking.

import type { DBRondaLibreJugador, WithdrawnEntry } from '@/app/torneo/[slug]/types'
import type { TournamentLeaderboardContext } from '@/golf/leaderboard/types'
import type { LeerNombresDePerfil } from '@/lib/data/nombres-de-perfil-lectura'
import type { FoursomeTeamResult } from '@/golf/formats'
import { JUGADOR_FUERA_STATUSES, jugadorFueraDelTorneo } from '@/golf/tournament-status'
import {
  ordenDelPie,
  separarFueraDelRanking,
  type EstadoFueraDelRanking,
  type GrupoConTarjetas,
  type InscritoFuera,
} from '@/golf/leaderboard/fuera-del-ranking'
import { captureError } from '@/lib/error-tracking'
import { boardPublicoRondaLibre, type VistaPublica } from './vista-publica'
import { leerEstadosFuera } from './inscritos-fuera'
import { nombresFaltantes, type Client } from './leaderboard'

interface InscritoFueraConNombre {
  user_id: string | null
  status: string | null
  status_reason: string | null
  player_name: string | null
  profiles: { name: string } | null
}

/**
 * Pie de la tabla del camino LEGACY (y de /tv): el nombre sale de la inscripción
 * (no hay tarjeta) y el pie va sin score. Si la lectura falla se reporta y el pie
 * queda vacío: el board legacy ya excluye a los WD/DQ por su cuenta
 * (`fetchLegacyPlayers`), así que no se rankea a nadie de más.
 */
export async function fetchWithdrawnPlayers(
  supabase: Client,
  tournamentId: string,
  leerNombres: LeerNombresDePerfil,
): Promise<WithdrawnEntry[]> {
  let raw: InscritoFueraConNombre[]
  try {
    const { data, error } = await supabase
      .from('players')
      .select('user_id, status, status_reason, player_name, profiles(name)')
      .eq('tournament_id', tournamentId)
      .in('status', [...JUGADOR_FUERA_STATUSES])
    if (error) throw error
    raw = ((data as unknown as InscritoFueraConNombre[] | null) ?? []).filter((p) => jugadorFueraDelTorneo(p.status))
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
    if (displayName) out.push({ name: displayName, status: p.status as EstadoFueraDelRanking, reason: p.status_reason })
  }
  return out
}

/**
 * Camino de RONDA LIBRE: separa las tarjetas que compiten de las del pie. Lo que
 * devuelve `enRanking` es lo ÚNICO que entra al motor del board (ranking, podio,
 * resultados del cierre y GWI). Si el estado no se pudo leer, nadie sale (y quedó
 * reportado): la tabla no se cae. `porTarjeta` se reusa para los equipos: el
 * estado se lee UNA vez por armado del board.
 */
export async function separarTarjetasFueraDelRanking(
  supabase: Client,
  args: { tournamentId: string; grupos: ReadonlyArray<GrupoConTarjetas>; tarjetas: DBRondaLibreJugador[] },
): Promise<{
  enRanking: DBRondaLibreJugador[]
  fuera: Array<{ tarjeta: DBRondaLibreJugador; inscrito: InscritoFuera }>
  porTarjeta: ReadonlyMap<string, InscritoFuera>
}> {
  const { porTarjeta } = await leerEstadosFuera(supabase, args.tournamentId, args.grupos, args.tarjetas)
  return { ...separarFueraDelRanking(args.tarjetas, porTarjeta), porTarjeta }
}

/**
 * Las filas del pie, con el score que muestra la tabla para ESTE visor: el MISMO
 * motor y la misma vista pública (`boardPublicoRondaLibre`), así que en
 * Stableford va en puntos, en la vista bruta en golpes brutos y lo que el visor
 * no puede ver no viaja. `grupoDeTarjeta`: para los filtros de /en-vivo.
 */
export function pieDeTarjetas(
  fuera: ReadonlyArray<{ tarjeta: DBRondaLibreJugador; inscrito: InscritoFuera }>,
  ctx: TournamentLeaderboardContext,
  vista: VistaPublica,
  grupoDeTarjeta?: (t: DBRondaLibreJugador) => string | null,
): WithdrawnEntry[] {
  if (fuera.length === 0) return []
  const filas = new Map(boardPublicoRondaLibre(fuera.map((f) => f.tarjeta), ctx, vista).players.map((p) => [p.id, p]))
  const esPuntos = vista.formato === 'stableford'
  return fuera
    .map(({ tarjeta, inscrito }): WithdrawnEntry => {
      const p = filas.get(tarjeta.id)
      return {
        id: tarjeta.id,
        name: tarjeta.nombre,
        status: inscrito.status,
        reason: inscrito.status_reason ?? null,
        ...(grupoDeTarjeta ? { group_id: grupoDeTarjeta(tarjeta) } : {}),
        ...(p && p.holes > 0
          ? { score: { valor: p.total, esPuntos, grossTotal: p.grossTotal ?? null, hoyos: p.holes } }
          : {}),
      }
    })
    .sort((a, b) => ordenDelPie({ ...a, hoyos: a.score?.hoyos ?? 0 }, { ...b, hoyos: b.score?.hoyos ?? 0 }))
}

/**
 * Foursome: los equipos con un miembro WD/DQ salen del ranking y van al pie
 * (Regla 22, decisión de Juanjo 17-nov). Se arman con el MISMO resultado del
 * motor que la tabla, así que el score del pie es el que tenía el equipo.
 */
export function separarEquiposFuera<T extends Pick<FoursomeTeamResult, 'teamId' | 'teamNombre' | 'overUnderGross' | 'overUnderNeto' | 'totalGross' | 'holesPlayed'>>(
  ordenados: T[],
  estadoPorEquipo: Readonly<Record<string, EstadoFueraDelRanking>>,
  modo: 'gross' | 'neto',
): { enRanking: T[]; fuera: WithdrawnEntry[] } {
  const enRanking: T[] = []
  const fuera: WithdrawnEntry[] = []
  for (const t of ordenados) {
    const status = estadoPorEquipo[t.teamId]
    if (!status) { enRanking.push(t); continue }
    fuera.push({
      id: t.teamId,
      name: t.teamNombre,
      status,
      reason: null,
      ...(t.holesPlayed > 0
        ? { score: { valor: modo === 'neto' ? t.overUnderNeto : t.overUnderGross, esPuntos: false, grossTotal: t.totalGross, hoyos: t.holesPlayed } }
        : {}),
    })
  }
  fuera.sort((a, b) => ordenDelPie({ ...a, hoyos: a.score?.hoyos ?? 0 }, { ...b, hoyos: b.score?.hoyos ?? 0 }))
  return { enRanking, fuera }
}
