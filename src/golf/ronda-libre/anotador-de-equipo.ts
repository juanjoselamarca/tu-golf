/**
 * Un celular por equipo (scramble rápido, plan docs/superpowers/plans/2026-11-23-scramble-rapido.md §2).
 *
 * FUENTE ÚNICA de quién anota qué equipo en una ronda de equipos: el scorer (qué equipos carga, si entra o elige
 * equipo) y el aviso a quienes siguen la ronda (quién puede dispararlo).
 *
 * Espejo de la base (migración 20261123100000_scramble_equipos_de_club):
 *  - `upsert_ronda_equipos_scores` deja escribir un equipo a `puede_anotar_ronda` (creador, marcador, jugadores) o
 *    al `anotador_user_id` de ESE equipo si es de club y la ronda no tiene `admin_mode` TRUE;
 *  - `reclamar_equipo_de_ronda` solo reclama en esas rondas.
 * El servidor no sabe qué equipos "tiene" cada celular: el creador podría escribir el equipo de otro celular. Que
 * nunca lo haga lo sostiene `equiposQueAnota`, aplicado UNA vez al cargar el scorer (todo lo que manda un delta
 * —par al pasar de hoyo, pendientes, hoyo inicial, copia local— parte de esa lista).
 */

import { isSharedBallFormat } from '@/golf/formats'
import { esEquipoDeClub, type HandicapOrigen } from './equipos-de-club'

/** Lo que estas reglas leen de la ronda. */
export interface RondaDeEquipos {
  formato_juego?: string | null
  admin_mode?: boolean | null
  creador_id?: string | null
  admin_user_id?: string | null
  ronda_libre_jugadores?: ReadonlyArray<{ user_id?: string | null }>
}

/** Lo que estas reglas leen de un equipo (`anotador_*` solo lo leen cuentas con sesión: anon no tiene el grant). */
export interface EquipoConAnotador {
  id: string
  handicap_origen?: HandicapOrigen | null
  anotador_user_id?: string | null
  anotador_nombre?: string | null
}

/**
 * ¿Cada equipo se anota en su celular? Bola compartida, sin `admin_mode` (SQL: `admin_mode IS NOT TRUE`) y algún
 * equipo de club. Toda ronda de equipos de antes tiene `admin_mode` TRUE: ninguna cae acá.
 */
export function unCelularPorEquipo(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode'>,
  equipos: ReadonlyArray<Pick<EquipoConAnotador, 'handicap_origen'>>,
): boolean {
  return isSharedBallFormat(ronda.formato_juego) && ronda.admin_mode !== true && equipos.some(esEquipoDeClub)
}

/**
 * Los equipos que anota ESTE celular. Ronda de un celular: todos (como siempre). Un celular por equipo: el que
 * reclamó y, si es el creador, además los que nadie reclamó (al liberar un equipo vuelve a él). Sin sesión: ninguno.
 */
export function equiposQueAnota<E extends EquipoConAnotador>(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode' | 'creador_id'>,
  equipos: readonly E[],
  userId: string | null | undefined,
): E[] {
  if (!unCelularPorEquipo(ronda, equipos)) return [...equipos]
  if (!userId) return []
  const esCreador = ronda.creador_id === userId
  return equipos.filter(e => e.anotador_user_id === userId || (e.anotador_user_id == null && esCreador))
}

/** Los equipos que anota OTRO celular (la franja «lo anota Pedro»). Complemento exacto de `equiposQueAnota`. */
export function equiposDeOtroCelular<E extends EquipoConAnotador>(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode' | 'creador_id'>,
  equipos: readonly E[],
  userId: string | null | undefined,
): E[] {
  const mios = new Set(equiposQueAnota(ronda, equipos, userId).map(e => e.id))
  return equipos.filter(e => !mios.has(e.id))
}

/** Nombre con que se muestra quién anota un equipo. Sin nombre (cuenta sin nombre o borrada): «otro celular». */
export function nombreDelAnotador(equipo: Pick<EquipoConAnotador, 'anotador_nombre'>): string {
  return equipo.anotador_nombre?.trim() || 'otro celular'
}

/**
 * ¿Este celular cierra la ronda y libera equipos? Un celular por equipo: solo el creador (la base rechaza Finalizar a
 * quien anota un equipo desde su celular). Ronda de un celular: sin cambio, cierra quien anota.
 */
export function cierraLaRonda(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode' | 'creador_id'>,
  equipos: ReadonlyArray<Pick<EquipoConAnotador, 'handicap_origen'>>,
  userId: string | null | undefined,
): boolean {
  if (!unCelularPorEquipo(ronda, equipos)) return true
  return !!userId && ronda.creador_id === userId
}

/** Nombre de quien creó la ronda (es jugador del equipo 1). `null` si no está entre los jugadores o no tiene nombre. */
export function nombreDelCreador(
  ronda: Pick<RondaDeEquipos, 'creador_id'> & { ronda_libre_jugadores?: ReadonlyArray<{ user_id?: string | null; nombre?: string | null }> },
): string | null {
  if (!ronda.creador_id) return null
  return ronda.ronda_libre_jugadores?.find(j => j.user_id === ronda.creador_id)?.nombre?.trim() || null
}

/** Qué hace el scorer de equipos con quien lo abre. */
export type EntradaAlScorerDeEquipos = 'anota' | 'elegir_equipo' | 'en_vivo'

/**
 * ¿Quién entra al scorer de una ronda de equipos? Mismo criterio que la base, para no mostrar una tarjeta que el
 * servidor va a rechazar:
 *  - un celular por equipo: el creador siempre (cierra la ronda y libera equipos); quien ya anota un equipo, a su
 *    equipo; cualquier otra cuenta, a elegir equipo (el reclamo decide si queda alguno);
 *  - un celular: `puede_anotar_ronda` (creador, marcador designado o jugador con cuenta). El resto va a la ronda
 *    en vivo. Antes, con `admin_mode`, cualquier cuenta con el link veía el scorer y solo la RPC la rechazaba.
 */
export function entradaAlScorerDeEquipos(
  ronda: RondaDeEquipos,
  equipos: readonly EquipoConAnotador[],
  userId: string | null | undefined,
): EntradaAlScorerDeEquipos {
  if (!userId) return 'en_vivo'
  if (unCelularPorEquipo(ronda, equipos)) {
    if (ronda.creador_id === userId) return 'anota'
    return equiposQueAnota(ronda, equipos, userId).length > 0 ? 'anota' : 'elegir_equipo'
  }
  const anota = ronda.creador_id === userId
    || ronda.admin_user_id === userId
    || (ronda.ronda_libre_jugadores ?? []).some(j => j.user_id === userId)
  return anota ? 'anota' : 'en_vivo'
}

/**
 * Cuentas que anotan un equipo desde su celular y por eso pueden escribirlo (la rama del anotador en
 * `upsert_ronda_equipos_scores`). Las usa el aviso a quienes siguen la ronda: guardar sin poder avisar dejaba la
 * tabla de los espectadores quieta. Vacío en cualquier ronda que no sea de un celular por equipo.
 */
export function anotadoresDeEquipos(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode'>,
  equipos: readonly EquipoConAnotador[],
): string[] {
  if (!unCelularPorEquipo(ronda, equipos)) return []
  return equipos.filter(e => esEquipoDeClub(e) && !!e.anotador_user_id).map(e => e.anotador_user_id as string)
}

/**
 * Equipo de otro celular al que le faltan hoyos: el primero que bloquea el cierre y el hoyo en que va (el primero
 * sin golpes, en el orden de la ronda). `null` = todos completos.
 */
export function equipoAjenoIncompleto<E extends EquipoConAnotador & { nombre: string; scores: Record<string, number> }>(
  ajenos: readonly E[],
  hoyos: readonly number[],
): { equipo: E; hoyo: number } | null {
  for (const e of ajenos) {
    const hoyo = hoyos.find(h => e.scores[String(h)] == null)
    if (hoyo != null) return { equipo: e, hoyo }
  }
  return null
}
