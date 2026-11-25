/**
 * Juegos con plata en juego de la ronda libre: la Timba (`personalizado`) y el Skins. Fuente única de lo que los dos
 * comparten en el scorer:
 *   - se anotan en UN celular, el de quien anota la ronda (scorer de grupo); el individual nunca se usa (no conoce la X,
 *     las marcas ni los retiros, y rellenaría con par al finalizar);
 *   - su neto es propio (golpes desde el más bajo, del motor de cada juego): el scorer no muestra HCP, neto ni golpes
 *     recibidos genéricos (los del hándicap absoluto), que serían otros números.
 */
import { esFormatoPersonalizado } from './personalizado/config'
import { esFormatoSkins } from './skins/clave'

export function esJuegoConPlata(formato: string | null | undefined): boolean {
  return esFormatoPersonalizado(formato) || esFormatoSkins(formato)
}
