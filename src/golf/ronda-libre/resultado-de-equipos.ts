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

/** Lo que el resultado necesita de cada fila del ranking de equipos. */
export interface FilaDelRankingDeEquipos {
  /** Vs par (gross o neto según el modo): el criterio con que `ordenarEquipos*` ordena. */
  diff: number
  /** Hoyos con score. Con 0 el equipo no compite y el ranking lo deja al final. */
  holesPlayed: number
}

/**
 * Los equipos que comparten el primer lugar, sobre el ranking YA ordenado por
 * `ordenarEquipos*` (vs par, countback en los empates, sin hoyos al final):
 * el líder y todos los que tengan su mismo `diff` y hayan anotado algo. Uno
 * solo si no hay empate; ninguno si nadie anotó (no hay resultado que mostrar).
 *
 * La imagen para compartir decidía el empate por `score` (golpes brutos) y la
 * pantalla por `diff`: con distinta cantidad de hoyos anotados, o en neto,
 * podían decir cosas distintas. Acá se decide una vez para los dos.
 */
export function equiposEnElPrimerLugar<T extends FilaDelRankingDeEquipos>(ranking: readonly T[]): T[] {
  const lider = ranking[0]
  if (!lider) return []
  if (lider.holesPlayed === 0) return []
  return ranking.filter(t => t.holesPlayed > 0 && t.diff === lider.diff)
}

/** Dos o más equipos comparten el primer lugar. */
export function hayEmpateDeEquipos(ranking: readonly FilaDelRankingDeEquipos[]): boolean {
  return equiposEnElPrimerLugar(ranking).length > 1
}

/** "Equipo 1" · "Equipo 1 y Equipo 2" · "Uno, Dos y Tres": el nombre del cuadro ganador y de la imagen. */
export function nombrarEquipos(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}
