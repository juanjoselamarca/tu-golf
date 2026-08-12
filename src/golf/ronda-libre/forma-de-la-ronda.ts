/**
 * FUENTE ÚNICA de la forma de una ronda libre: cuántos hoyos se juegan y en
 * cuál se empieza.
 *
 * Tres caminos que antes vivían inline en el asistente de creación y en su
 * resumen de confirmación, con la posibilidad real de contestar distinto:
 *
 *  1. Multi-recorrido (canchas 27/36h): los hoyos los define la SUMA de los
 *     recorridos elegidos, no el botón 18/9 — ese botón ni siquiera se muestra.
 *  2. Media ronda en cancha simple: 9 hoyos, y el front/back decide si se
 *     arranca en el 1 o en el 10.
 *  3. Ronda completa: 18 hoyos, y sólo una partida shotgun mueve el hoyo de
 *     inicio.
 *
 * El hoyo de inicio es dato de scoring, no cosmética: `hoyosDeLaVuelta` lo usa
 * para saber QUÉ hoyos entran en la tarjeta. Un back-9 que arranque en el 1
 * puntúa contra el par equivocado.
 */

import type { CourseLoop } from '@/lib/data/ronda-libre-nueva'

/** Mitad de la cancha que se juega cuando la ronda es de 9 hoyos. */
export type MitadDeCancha = 'front' | 'back'

export interface EleccionDeRonda {
  /** Recorridos que ofrece la cancha. Menos de 2 ⇒ cancha simple. */
  loops: CourseLoop[]
  /** Recorridos elegidos por el usuario (sólo aplica a multi-recorrido). */
  loopsElegidos: string[]
  /** Botón 18 / 9 hoyos. Sólo se muestra en cancha simple. */
  hoyosElegidos: 9 | 18
  /** Front 9 o Back 9. Sólo aplica cuando `hoyosElegidos` es 9. */
  mitad: MitadDeCancha
  /** Partida shotgun: cada grupo arranca en un hoyo distinto. */
  shotgun: boolean
  /** Hoyo elegido para el shotgun. Se ignora si `shotgun` es false. */
  hoyoShotgun: number
}

export interface FormaDeLaRonda {
  holes: number
  hoyoInicio: number
  esMultiRecorrido: boolean
}

/** Hoyo en el que arranca el back 9. */
export const PRIMER_HOYO_DEL_BACK_9 = 10

/** Hoyos que aporta un recorrido cuando la fila no dice cuántos tiene. */
const HOYOS_POR_RECORRIDO_FALLBACK = 9

/**
 * Una cancha ofrece elegir recorrido sólo si publica dos o más. Fuente única
 * del predicado: la UI lo usa para decidir qué selector mostrar y el submit lo
 * usa para decidir de dónde salen los hoyos. Con dos lecturas distintas, una
 * cancha de 27 podía mostrar el selector de 18/9 y guardar la suma de loops.
 */
export function esMultiRecorrido(loops: CourseLoop[]): boolean {
  return loops.length >= 2
}

/** Resuelve hoyos y hoyo de inicio a partir de lo que el usuario eligió. */
export function formaDeLaRonda(eleccion: EleccionDeRonda): FormaDeLaRonda {
  const multi = esMultiRecorrido(eleccion.loops)

  if (multi) {
    const holes = eleccion.loopsElegidos.length > 0
      ? eleccion.loopsElegidos.reduce(
          (suma, nombre) =>
            suma + (eleccion.loops.find(l => l.recorrido === nombre)?.holes ?? HOYOS_POR_RECORRIDO_FALLBACK),
          0,
        )
      : eleccion.hoyosElegidos
    return { holes, hoyoInicio: hoyoDeShotgun(eleccion), esMultiRecorrido: true }
  }

  if (eleccion.hoyosElegidos === 9) {
    // El shotgun no aplica en media ronda: el front/back YA define el arranque.
    // La UI lo apaga al elegir 9; acá se garantiza aunque llegue en true.
    return {
      holes: 9,
      hoyoInicio: eleccion.mitad === 'back' ? PRIMER_HOYO_DEL_BACK_9 : 1,
      esMultiRecorrido: false,
    }
  }

  return { holes: 18, hoyoInicio: hoyoDeShotgun(eleccion), esMultiRecorrido: false }
}

function hoyoDeShotgun(eleccion: EleccionDeRonda): number {
  return eleccion.shotgun ? eleccion.hoyoShotgun : 1
}
