// FUENTE ÚNICA de qué tarjetas de un torneo quedan FUERA DEL RANKING (#813).
//
// Decisión de Juanjo (17-nov-2026), como The Grint y los boards de federación:
// el jugador retirado (WD) o descalificado (DQ) sale del ranking y aparece al pie
// de la tabla, marcado WD/DQ y con sus golpes visibles. No recibe posición, ni
// lugar en el podio, ni probabilidad de ganar.
//
// Por qué hace falta: en el camino de ronda libre el board lee las TARJETAS
// (`ronda_libre_jugadores`), que no saben nada del estado de la inscripción. Con
// el torneo en juego el WD sigue en su grupo con su tarjeta (#810), así que el
// board lo rankeaba: alguien que se retiraba en el hoyo 12 yendo -2 quedaba
// arriba de gente que terminó los 18. El estado vive en `players.status` y el
// enlace inscripción↔tarjeta es `tournament_group_players.jugador_ronda_id`.

import type { CourseHole } from './types'
import { parOfPlayedHoles } from './board-rules'
import { jugadorFueraDelTorneo, type JUGADOR_FUERA_STATUSES } from '@/golf/tournament-status'

export type EstadoFueraDelRanking = (typeof JUGADOR_FUERA_STATUSES)[number]

/** Inscripción del torneo (`players`) con su estado. */
export interface InscritoConEstado {
  id: string
  user_id?: string | null
  status: string | null
  status_reason?: string | null
}

/** Grupo del torneo con el enlace de cada inscrito a su tarjeta. */
export interface GrupoConTarjetas {
  ronda_libre_id: string | null
  tournament_group_players: ReadonlyArray<{ player_id: string; jugador_ronda_id?: string | null }> | null
}

/** Lo mínimo de una tarjeta (`ronda_libre_jugadores`) que se necesita acá. */
export interface TarjetaDelTorneo {
  id: string
  ronda_id: string
  user_id: string | null
  nombre: string
  scores: Record<string, number> | null
}

/** Una fila del pie: fuera del ranking, con sus golpes (siempre brutos: públicos para cualquier visor). */
export interface FueraDelRanking {
  tarjetaId: string
  nombre: string
  status: EstadoFueraDelRanking
  reason: string | null
  /** Golpes brutos anotados. */
  grossTotal: number
  /** Hoyos con golpes anotados. */
  hoyos: number
  /** Golpes brutos contra el par de los hoyos jugados (0 sin hoyos). */
  vsPar: number
}

/**
 * Estado WD/DQ de cada tarjeta del torneo, por id de tarjeta. El enlace es
 * `jugador_ronda_id`; una fila de grupo sin enlace (tarjetas anteriores a él) se
 * resuelve por `user_id` dentro de la ronda de SU grupo, nunca de otro.
 */
export function estadoFueraPorTarjeta(
  grupos: ReadonlyArray<GrupoConTarjetas>,
  inscritos: ReadonlyArray<InscritoConEstado>,
  tarjetas: ReadonlyArray<Pick<TarjetaDelTorneo, 'id' | 'ronda_id' | 'user_id'>>,
): Map<string, InscritoConEstado & { status: EstadoFueraDelRanking }> {
  const fueraPorInscrito = new Map(
    inscritos
      .filter((p) => jugadorFueraDelTorneo(p.status))
      .map((p) => [p.id, p as InscritoConEstado & { status: EstadoFueraDelRanking }]),
  )
  const out = new Map<string, InscritoConEstado & { status: EstadoFueraDelRanking }>()
  if (fueraPorInscrito.size === 0) return out
  for (const g of grupos) {
    for (const gp of g.tournament_group_players ?? []) {
      const inscrito = fueraPorInscrito.get(gp.player_id)
      if (!inscrito) continue
      const tarjetaId = gp.jugador_ronda_id
        ?? (inscrito.user_id && g.ronda_libre_id
          ? tarjetas.find((t) => t.ronda_id === g.ronda_libre_id && t.user_id === inscrito.user_id)?.id
          : undefined)
      if (tarjetaId) out.set(tarjetaId, inscrito)
    }
  }
  return out
}

/** Golpes brutos, hoyos jugados y vs par de una tarjeta, en los hoyos 1..totalHoyos. */
export function brutoDeLaTarjeta(
  scores: Record<string, number> | null,
  courseHoles: CourseHole[],
  totalHoyos: number,
): { grossTotal: number; hoyos: number; vsPar: number } {
  let grossTotal = 0
  const jugados: number[] = []
  for (let h = 1; h <= totalHoyos; h++) {
    const g = scores?.[String(h)]
    if (g == null) continue
    grossTotal += g
    jugados.push(h)
  }
  const vsPar = jugados.length > 0 ? grossTotal - parOfPlayedHoles(courseHoles, jugados) : 0
  return { grossTotal, hoyos: jugados.length, vsPar }
}

/**
 * Separa las tarjetas del torneo en las que compiten (`enRanking`, lo que entra
 * al motor del board, al podio y al GWI) y las del pie (`fuera`). El pie va
 * ordenado: más hoyos jugados primero; a igualdad, WD antes que DQ y por nombre.
 */
export function separarFueraDelRanking<T extends TarjetaDelTorneo>(args: {
  tarjetas: T[]
  grupos: ReadonlyArray<GrupoConTarjetas>
  inscritos: ReadonlyArray<InscritoConEstado>
  courseHoles: CourseHole[]
  totalHoyos: number
}): { enRanking: T[]; fuera: FueraDelRanking[] } {
  const estados = estadoFueraPorTarjeta(args.grupos, args.inscritos, args.tarjetas)
  if (estados.size === 0) return { enRanking: args.tarjetas, fuera: [] }
  const enRanking: T[] = []
  const fuera: FueraDelRanking[] = []
  for (const t of args.tarjetas) {
    const inscrito = estados.get(t.id)
    if (!inscrito) {
      enRanking.push(t)
      continue
    }
    fuera.push({
      tarjetaId: t.id,
      nombre: t.nombre,
      status: inscrito.status,
      reason: inscrito.status_reason ?? null,
      ...brutoDeLaTarjeta(t.scores, args.courseHoles, args.totalHoyos),
    })
  }
  fuera.sort((a, b) =>
    b.hoyos - a.hoyos
    || (a.status === b.status ? 0 : a.status === 'withdrawn' ? -1 : 1)
    || a.nombre.localeCompare(b.nombre, 'es'))
  return { enRanking, fuera }
}
