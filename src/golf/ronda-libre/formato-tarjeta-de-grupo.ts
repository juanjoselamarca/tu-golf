import { FORMAT_META, type FormatoJuego } from '@/golf/core/rules'

/** Jugadores de un grupo de match play: un match es exactamente un par. */
export const JUGADORES_POR_MATCH = 2

/**
 * Formato con el que se arma la tarjeta compartida de un grupo de torneo.
 * Es el del torneo, salvo match play en un grupo que no es exactamente un par
 * (dos matches por salida, o un jugador suelto): el scorer de match play solo
 * enfrenta a los dos primeros, así que ese grupo anota en una tarjeta stroke play plana.
 */
export function formatoDeLaTarjetaDelGrupo(formato: string, jugadoresDelGrupo: number): string {
  if (FORMAT_META[formato as FormatoJuego]?.requiereParejas && jugadoresDelGrupo !== JUGADORES_POR_MATCH) return 'stroke_play'
  return formato
}
