// src/golf/courses/aptitud-torneo.ts
//
// FUENTE ÚNICA de "¿esta cancha sirve para armar un torneo con handicap?".
//
// El guardarrail de `resolverCourseHandicap` evita el número absurdo: con un
// rating que miente, cada jugador recibe su índice y nada más. Eso salva la
// tarjeta, pero NO salva el torneo: si el club publica un rating y el motor lo
// ignora, todos juegan como si la cancha fuera neutra y los tees dejan de
// diferenciarse. En un torneo real eso es un resultado injusto.
//
// Por eso el organizador se entera ANTES de crear el torneo, no en el hoyo 7.
//
// Criterio: se bloquea SÓLO cuando hay rating cargado y TODOS los que el motor
// podría usar son incoherentes (ver `./rating-coherente`). Una cancha sin
// rating NO se bloquea — ese caso ya degrada solo y de forma predecible, y hay
// 51 canchas así en el catálogo. Un tee suelto con typo tampoco bloquea al
// club entero: el motor baja al siguiente eslabón. Pero eso último no pasa en
// silencio, sale como `advertencia`.
//
// ⚠️ Este módulo tiene que leer la escala IGUAL que el motor, o se bloquea algo
// que funcionaría / se deja pasar algo que falla. La regla del motor es
// `holeCount <= 9`, y es la que se usa acá.

import {
  esEscalaDe18Hoyos,
  parEnEscalaDe9,
  courseRatingEnEscalaDe9,
} from '@/golf/core/course-handicap'
import { evaluarRating } from './rating-coherente'

/**
 * Copy aprobado. Cubre el caso real: las 11 canchas afectadas SÍ tienen un
 * número cargado, pero es el de 18 hoyos — el de 9 no existe.
 */
export const MENSAJE_SIN_RATING_9H =
  'Esta cancha no tiene el rating oficial de 9 hoyos cargado. Contacta al club o elige otra.'

/** Mismo problema en una vuelta de 18: el rating cargado no es creíble. */
export const MENSAJE_RATING_MAL_CARGADO =
  'Esta cancha tiene el rating oficial mal cargado. Contacta al club o elige otra.'

/**
 * Una cancha de 9 hoyos jugada como 18 (dos vueltas) hoy no se puede puntuar
 * bien: el motor completa el par de los 9 hoyos que faltan a par 4 y lo compara
 * contra un Course Rating que es de 9 — la resta `(CR − par)` queda ~36 golpes
 * corrida. El resultado no explota (el guardarrail lo degrada al índice), pero
 * el torneo se juega sin diferenciación de tees y nadie se entera.
 */
export const MENSAJE_CANCHA_9H_EN_VUELTA_18 =
  'Esta cancha es de 9 hoyos: no se puede armar un torneo de 18 sobre ella. Elige 9 hoyos, o elige otra cancha.'

export interface TeeParaAptitud {
  rating: number | null
  front_course_rating?: number | null
}

export interface CanchaParaAptitud {
  par_total: number | null
  course_rating: number | null
  tees?: TeeParaAptitud[] | null
}

export type MotivoNoApta = 'rating_incoherente' | 'cancha_de_9_en_vuelta_de_18'

export interface AptitudTorneo {
  apta: boolean
  motivo: MotivoNoApta | null
  /** Mensaje listo para mostrarle al organizador. Null si la cancha es apta. */
  mensaje: string | null
  /**
   * La cancha pasa, pero alguna de las fuentes que el motor podría usar tiene
   * el rating roto (típicamente un tee suelto). No bloquea — avisa, para que el
   * club lo corrija antes de que a esos jugadores les toque el eslabón de abajo.
   */
  advertencia: string | null
}

const APTA: AptitudTorneo = { apta: true, motivo: null, mensaje: null, advertencia: null }

const ADVERTENCIA_TEE_ROTO =
  'Algún tee de esta cancha tiene el rating mal cargado. Los jugadores de ese tee van a puntuar con el rating general de la cancha.'

/**
 * ¿Este torneo necesita que la cancha tenga rating?
 *
 * Un torneo Gross no usa el Course Rating para nada: se juega a golpes brutos.
 * Bloquear una cancha ahí sería un falso bloqueo — y hay 9 torneos Gross en
 * producción sobre canchas que igual servirían.
 */
export function requiereRatingDeCancha(torneo: {
  modo?: string | null
  use_handicap?: boolean | null
}): boolean {
  return torneo.use_handicap === true || torneo.modo === 'neto'
}

/** ¿El par de esta cancha es el de una vuelta de 9 hoyos? */
function esCanchaDe9Hoyos(parDeLaCancha: number | null): boolean {
  return parDeLaCancha != null && !esEscalaDe18Hoyos(parDeLaCancha)
}

/**
 * Los ratings que el motor de handicap podría llegar a usar para esta cancha,
 * ya llevados a la escala de `holes`. Espeja la cadena de fallback de
 * `computePlayerCourseHcp` / `resolverCourseData`: primero los tees, después
 * el rating a nivel de cancha.
 */
function ratingsQueUsariaElMotor(
  cancha: CanchaParaAptitud,
  holes: 9 | 18,
): Array<number | null | undefined> {
  const par = cancha.par_total
  const enEscala = (rating: number | null | undefined): number | null | undefined => {
    if (rating == null) return rating
    return holes === 9 && par != null ? courseRatingEnEscalaDe9(rating, par) : rating
  }

  const deTees = (cancha.tees ?? []).map((t) =>
    holes === 9 ? (t.front_course_rating ?? enEscala(t.rating)) : t.rating,
  )
  return [...deTees, enEscala(cancha.course_rating)]
}

/**
 * Veredicto a partir de los ratings candidatos, ya en la escala de `holes`.
 * Compartido por la cancha simple y por la combinación de recorridos.
 */
function veredictoDeRatings(
  candidatos: Array<number | null | undefined>,
  par: number | null,
  holes: 9 | 18,
): AptitudTorneo {
  const veredictos = candidatos
    .map((courseRating) => evaluarRating({ courseRating, par, holes }))
    .filter((v) => v.motivo !== 'sin_rating' && v.motivo !== 'sin_par')

  // Sin ningún rating comparable no hay nada que desmentir: la cancha degrada
  // de forma predecible (handicap = índice) y se deja pasar.
  if (veredictos.length === 0) return APTA

  if (veredictos.some((v) => v.esCreible)) {
    const rotos = veredictos.filter((v) => v.esIncoherente).length
    return rotos === 0 ? APTA : { ...APTA, advertencia: ADVERTENCIA_TEE_ROTO }
  }

  return {
    apta: false,
    motivo: 'rating_incoherente',
    mensaje: holes === 9 ? MENSAJE_SIN_RATING_9H : MENSAJE_RATING_MAL_CARGADO,
    advertencia: null,
  }
}

/**
 * ¿Se puede armar un torneo con handicap en esta cancha, jugando `holeCount`?
 */
export function evaluarAptitudTorneo(
  cancha: CanchaParaAptitud,
  holeCount: number,
): AptitudTorneo {
  if (esCanchaDe9Hoyos(cancha.par_total) && holeCount > 9) {
    return {
      apta: false,
      motivo: 'cancha_de_9_en_vuelta_de_18',
      mensaje: MENSAJE_CANCHA_9H_EN_VUELTA_18,
      advertencia: null,
    }
  }

  // Misma lectura de escala que el motor (`holeCount <= 9`), a propósito.
  const holes: 9 | 18 = holeCount <= 9 ? 9 : 18
  const par =
    cancha.par_total == null ? null : holes === 9 ? parEnEscalaDe9(cancha.par_total) : cancha.par_total

  return veredictoDeRatings(ratingsQueUsariaElMotor(cancha, holes), par, holes)
}

/**
 * Aptitud de una cancha multi-recorrido (Brisas 27h, Marbella, Rocas), donde el
 * jugador elige N loops y el motor COMBINA los recorridos hijos.
 *
 * Existe porque el selector de canchas sólo ofrece la cancha PADRE y los loops
 * viajan aparte. Juzgar al padre no sirve: en producción el padre tiene el
 * rating sano (72.6 sobre par 72) y sus 9 hijos lo tienen roto (72 sobre par
 * 36). Mirar sólo al padre dejaba pasar exactamente las 9 canchas que motivaron
 * este guardarrail.
 *
 * Espeja `resolverCourseData` paso 0: suma los Course Rating y los pares de los
 * hijos, y trata la vuelta como de 9 hoyos sólo cuando hay UN loop.
 */
export function evaluarAptitudRecorridos(loops: CanchaParaAptitud[]): AptitudTorneo {
  if (loops.length === 0) return APTA

  const holes: 9 | 18 = loops.length === 1 ? 9 : 18
  const conRating = loops.filter((l) => l.course_rating != null)
  // Si algún loop no tiene rating, el motor ni siquiera entra por esta rama
  // (`allHaveRatings`): cae al lookup por tee y de ahí al camino seguro.
  if (conRating.length !== loops.length) return APTA

  const parSum = loops.reduce((s, l) => s + (l.par_total ?? 36), 0)
  const crSum = loops.reduce((s, l) => s + (l.course_rating ?? 0), 0)

  return veredictoDeRatings([crSum], parSum, holes)
}

export interface AptitudPorHoyos {
  9: AptitudTorneo
  18: AptitudTorneo
}

/**
 * Aptitud precalculada para las dos duraciones que ofrece el wizard, para que
 * el cliente no tenga que recibir los tees crudos de las 193 canchas sólo para
 * pintar un aviso.
 */
export function aptitudPorHoyos(cancha: CanchaParaAptitud): AptitudPorHoyos {
  return {
    9: evaluarAptitudTorneo(cancha, 9),
    18: evaluarAptitudTorneo(cancha, 18),
  }
}
