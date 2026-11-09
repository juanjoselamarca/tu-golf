import { EQUIPOS_PARA_COMPETIR } from './plantilla-de-jugadores'

export type EtiquetaDelResultadoDeEquipos = 'Contra el par' | 'Empate' | 'Equipo ganador'

/**
 * FUENTE ÚNICA de cómo se titula el resultado de una ronda por equipos.
 *
 * Desde el 09-nov-2026 (R4794T) un equipo solo es una ronda válida: juega
 * contra el par y no le gana a nadie. El cuadro ganador y la imagen que se
 * comparte por WhatsApp decían "Equipo ganador" cada uno por su cuenta; acá se
 * decide una vez para los dos.
 */
export function etiquetaDelResultadoDeEquipos(cantidadDeEquipos: number, empate: boolean): EtiquetaDelResultadoDeEquipos {
  if (cantidadDeEquipos < EQUIPOS_PARA_COMPETIR) return 'Contra el par'
  return empate ? 'Empate' : 'Equipo ganador'
}

/** Un solo equipo en la ronda: no hay rival a quien ganarle. */
export function juegaContraElPar(cantidadDeEquipos: number): boolean {
  return cantidadDeEquipos < EQUIPOS_PARA_COMPETIR
}

/**
 * Empate entre equipos, sobre el ranking YA ordenado: los dos primeros con el
 * mismo `diff` (vs par, el criterio con que se ordena). La imagen para
 * compartir lo decidía por `score` y la pantalla por `diff`: en neto, con
 * distinta cantidad de hoyos anotados, podían decir cosas distintas.
 */
export function hayEmpateDeEquipos(ranking: readonly { diff: number }[]): boolean {
  return ranking.length > 1 && ranking[1].diff === ranking[0].diff
}

/** Los equipos que comparten el primer lugar (uno solo si no hay empate). */
export function equiposEnElPrimerLugar<T extends { diff: number }>(ranking: readonly T[]): T[] {
  return ranking.length === 0 ? [] : ranking.filter(t => t.diff === ranking[0].diff)
}
