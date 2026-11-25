/**
 * Juegos con plata en juego de la ronda libre: la Timba (`personalizado`) y el Skins. Fuente única de lo que los dos
 * comparten en el scorer:
 *   - se anotan en UN celular, el de quien anota la ronda (scorer de grupo); el individual nunca se usa (no conoce la X,
 *     las marcas ni los retiros, y rellenaría con par al finalizar);
 *   - su neto es propio (golpes desde el más bajo, del motor de cada juego): el scorer no muestra HCP, neto ni golpes
 *     recibidos genéricos (los del hándicap absoluto), que serían otros números;
 *   - su resultado es propio (puntos o skins, de `GET /juego`): ningún ranking de golpes, ganador, imagen o texto para
 *     compartir, aviso de líder, GWI ni lista de En vivo lo trata como stroke play (darían un ganador falso).
 */
import { esFormatoPersonalizado } from './personalizado/config'
import { esFormatoSkins } from './skins/clave'

export function esJuegoConPlata(formato: string | null | undefined): boolean {
  return esFormatoPersonalizado(formato) || esFormatoSkins(formato)
}
