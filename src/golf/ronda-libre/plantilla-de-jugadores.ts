/**
 * FUENTE ÚNICA de cuánta gente admite y exige cada formato en una ronda libre.
 *
 * El asistente contestaba esto de tres formas distintas en la misma pantalla:
 * el botón "+ Agregar jugador" se mostraba mientras hubiera menos de 7 rivales
 * en un formato por equipos, la función que agregaba cortaba en 3, y los chips
 * de "jugadores recientes" cortaban en 3 también. En Best Ball el botón
 * aparecía a partir del cuarto jugador y no hacía nada al tocarlo.
 *
 * El techo real no era ninguno de los tres: lo pone el contrato de la API
 * (`jugadores: z.array(...).min(1).max(4)`), que rechaza cualquier ronda de más
 * de 4. Acá vive ese número una sola vez.
 */

import { FORMAT_META, type FormatoJuego } from '@/golf/core/rules'
import { isTeamFormat } from '@/golf/formats'

/**
 * Jugadores que admite una ronda libre, creador incluido.
 *
 * Espeja `POST /api/ronda-libre/create`, que valida `max(4)`. Si algún día sube,
 * sube en los dos lados — un techo más alto acá sólo produce rondas que el
 * servidor rechaza con un 400 después de que el usuario cargó todo.
 */
export const MAX_JUGADORES_POR_RONDA = 4

/** Equipos que arma la app por defecto en un formato por equipos. */
export const EQUIPOS_MINIMOS = 2

/**
 * Equipos que se pueden llegar a armar en una ronda libre.
 *
 * Con 4 jugadores como techo y 2 por equipo como mínimo, no entra un tercer
 * equipo: la única repartición válida es 2+2. El asistente ofrecía "+ Agregar
 * equipo" hasta 4, y cualquier equipo extra dejaba la ronda sin poder crearse
 * porque la validación exige mínimo 2 jugadores en cada uno.
 */
export function maxEquipos(formato: FormatoJuego): number {
  const porEquipo = jugadoresPorEquipo(formato)
  if (!porEquipo) return EQUIPOS_MINIMOS
  return Math.max(EQUIPOS_MINIMOS, Math.floor(MAX_JUGADORES_POR_RONDA / porEquipo.min))
}

/** Rivales que el creador puede agregar además de sí mismo. */
export function maxRivales(formato: FormatoJuego): number {
  // Match Play es 1 vs 1: un solo rival, ni uno más.
  if (FORMAT_META[formato]?.requiereParejas) return 1
  return MAX_JUGADORES_POR_RONDA - 1
}

/** Jugadores que el formato necesita como mínimo para ser jugable. */
export function jugadoresMinimos(formato: FormatoJuego): number {
  if (FORMAT_META[formato]?.requiereParejas) return 2
  const porEquipo = FORMAT_META[formato]?.jugadoresPorEquipo
  if (isTeamFormat(formato) && porEquipo) return porEquipo.min * EQUIPOS_MINIMOS
  return 1
}

/**
 * Rivales que hay que crear de entrada al elegir el formato, porque sin ellos
 * la ronda no puede existir.
 *
 * Stableford entra acá aunque el motor no lo exija: sus puntos se calculan
 * contra el handicap de cada jugador, y sólo el modo "yo llevo el score" pide
 * los índices. Sin eso la ronda arranca sin handicaps y los puntos salen mal.
 */
export function rivalesIniciales(formato: FormatoJuego): number {
  const porElFormato = jugadoresMinimos(formato) - 1
  if (porElFormato > 0) return porElFormato
  return formato === 'stableford' ? 1 : 0
}

/**
 * True si elegir este formato obliga al modo "yo llevo el score del grupo".
 * Todo formato que necesite más de un jugador desde el arranque lo obliga: el
 * modo "cada uno marca" crea la ronda con una sola tarjeta.
 */
export function exigeLlevarElScoreDelGrupo(formato: FormatoJuego): boolean {
  return rivalesIniciales(formato) > 0
}

/**
 * Jugadores por equipo que acepta el formato, acotado a lo que cabe en una
 * ronda libre. Best Ball admite equipos de 4 en torneos, pero acá dos equipos
 * de 4 serían 8 jugadores y la ronda tope en 4.
 */
export function jugadoresPorEquipo(formato: FormatoJuego): { min: number; max: number } | null {
  const meta = FORMAT_META[formato]?.jugadoresPorEquipo
  if (!meta) return null
  return {
    min: meta.min,
    max: Math.min(meta.max, Math.floor(MAX_JUGADORES_POR_RONDA / EQUIPOS_MINIMOS)),
  }
}
