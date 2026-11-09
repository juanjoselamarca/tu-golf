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

/**
 * Equipos que necesita una ronda por equipos: uno. Un equipo solo juega contra
 * el par de la cancha (el scramble de dos amigos un martes); con un rival hay
 * ganador. Antes eran dos obligatorios, así que elegir Scramble exigía 4
 * jugadores y un usuario que jugaba de a dos no podía crear la ronda (09-nov-2026).
 */
export const EQUIPOS_MINIMOS = 1

/** Equipos a partir de los cuales hay un ganador: uno contra otro. */
export const EQUIPOS_PARA_COMPETIR = 2

/**
 * Equipos que se pueden llegar a armar en una ronda libre.
 *
 * Con 4 jugadores como techo y 2 por equipo como mínimo, no entra un tercer
 * equipo: la única repartición válida con rival es 2+2. El asistente ofrecía
 * "+ Agregar equipo" hasta 4, y cualquier equipo extra dejaba la ronda sin
 * poder crearse porque la validación exige mínimo 2 jugadores en cada uno.
 */
export function maxEquipos(formato: FormatoJuego): number {
  const porEquipo = jugadoresPorEquipo(formato)
  if (!porEquipo) return EQUIPOS_PARA_COMPETIR
  return Math.max(EQUIPOS_PARA_COMPETIR, Math.floor(MAX_JUGADORES_POR_RONDA / porEquipo.min))
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
  const porEquipo = jugadoresPorEquipo(formato)
  if (porEquipo) return porEquipo.min * EQUIPOS_MINIMOS
  return 1
}

/**
 * Rivales que hay que crear de entrada al elegir el formato, porque sin ellos
 * la ronda no puede existir: el rival de Match Play, el compañero de un
 * formato por equipos.
 *
 * Stableford entra acá aunque el motor no lo exija: sus puntos se calculan
 * contra el handicap de cada jugador, y sólo el modo "yo anoto por todos" pide
 * los índices. Sin eso la ronda arranca sin handicaps y los puntos salen mal.
 */
export function rivalesIniciales(formato: FormatoJuego): number {
  const porElFormato = jugadoresMinimos(formato) - 1
  if (porElFormato > 0) return porElFormato
  return formato === 'stableford' ? 1 : 0
}

/**
 * True si este formato se anota desde un solo celular ("yo anoto por todos").
 * Todo formato que necesite más de un jugador desde el arranque lo obliga: el
 * modo "cada uno en su celular" crea la ronda con una sola tarjeta. El
 * asistente no lo pregunta: lo deriva de acá.
 */
export function exigeLlevarElScoreDelGrupo(formato: FormatoJuego): boolean {
  return rivalesIniciales(formato) > 0
}

/**
 * Jugadores por equipo que acepta el formato, acotado a lo que cabe en una
 * ronda libre. Un solo equipo puede ocupar la ronda entera (un scramble de 4
 * contra el par, que tiene su tabla oficial de handicap); con dos equipos el
 * techo de 4 jugadores los reparte solo en 2+2.
 */
export function jugadoresPorEquipo(formato: FormatoJuego): { min: number; max: number } | null {
  const meta = isTeamFormat(formato) ? FORMAT_META[formato]?.jugadoresPorEquipo : null
  if (!meta) return null
  return {
    min: meta.min,
    max: Math.min(meta.max, MAX_JUGADORES_POR_RONDA),
  }
}

/**
 * Se puede sumar un compañero a un equipo que ya tiene `tamañoDelEquipo`
 * jugadores, con `totalJugadores` en toda la ronda.
 */
export function puedeSumarCompanero(formato: FormatoJuego, tamañoDelEquipo: number, totalJugadores: number): boolean {
  const porEquipo = jugadoresPorEquipo(formato)
  if (!porEquipo) return false
  return tamañoDelEquipo < porEquipo.max && totalJugadores < MAX_JUGADORES_POR_RONDA
}

/**
 * Se puede abrir un equipo rival: todavía no se llegó al tope de equipos y en
 * la ronda caben sus `min` jugadores. Con un equipo de 3 en un scramble no
 * cabe un rival (3 + 2 > 4): hay que sacar a alguien o jugar contra el par.
 */
export function puedeSumarEquipo(formato: FormatoJuego, cantidadDeEquipos: number, totalJugadores: number): boolean {
  const porEquipo = jugadoresPorEquipo(formato)
  if (!porEquipo) return false
  return cantidadDeEquipos < maxEquipos(formato) && totalJugadores + porEquipo.min <= MAX_JUGADORES_POR_RONDA
}
