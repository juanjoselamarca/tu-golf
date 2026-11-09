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
