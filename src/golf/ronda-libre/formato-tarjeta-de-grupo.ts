import { FORMAT_META, type FormatoJuego } from '@/golf/core/rules'

/**
 * Formato con el que se arma la tarjeta compartida de un grupo de torneo.
 * Es el del torneo, salvo match play en un grupo que no es exactamente un par
 * (dos matches por salida, o un jugador suelto): el scorer de match play solo
 * enfrenta a los dos primeros, así que ese grupo anota en una tarjeta stroke play plana.
 */
export function formatoDeLaTarjetaDelGrupo(formato: string, jugadoresDelGrupo: number): string {
  if (FORMAT_META[formato as FormatoJuego]?.requiereParejas && jugadoresDelGrupo !== 2) return 'stroke_play'
  return formato
}
