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
// club entero: el motor baja al siguiente eslabón y el canario de catálogo lo
// reporta igual.

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

export interface TeeParaAptitud {
  rating: number | null
  front_course_rating?: number | null
}

export interface CanchaParaAptitud {
  par_total: number | null
  course_rating: number | null
  tees?: TeeParaAptitud[] | null
}

export type MotivoNoApta = 'rating_incoherente'

export interface AptitudTorneo {
  apta: boolean
  motivo: MotivoNoApta | null
  /** Mensaje listo para mostrarle al organizador. Null si la cancha es apta. */
  mensaje: string | null
}

const APTA: AptitudTorneo = { apta: true, motivo: null, mensaje: null }

/**
 * Hoyos con los que hay que evaluar el rating.
 *
 * Una cancha de 9 hoyos reales (par ≤ 50) se juega a 9 aunque el organizador
 * haya dejado el selector en 18: su rating siempre está en escala de 9.
 * `esEscalaDe18Hoyos` es la fuente única de esa lectura del par.
 */
function hoyosEfectivos(parDeLaCancha: number | null, holeCount: number): 9 | 18 {
  if (parDeLaCancha != null && !esEscalaDe18Hoyos(parDeLaCancha)) return 9
  return holeCount <= 9 ? 9 : 18
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
 * ¿Se puede armar un torneo con handicap en esta cancha, jugando `holeCount`?
 */
export function evaluarAptitudTorneo(
  cancha: CanchaParaAptitud,
  holeCount: number,
): AptitudTorneo {
  const holes = hoyosEfectivos(cancha.par_total, holeCount)
  const par = cancha.par_total == null ? null : holes === 9 ? parEnEscalaDe9(cancha.par_total) : cancha.par_total

  const veredictos = ratingsQueUsariaElMotor(cancha, holes)
    .map((courseRating) => evaluarRating({ courseRating, par, holes }))
    .filter((v) => v.motivo !== 'sin_rating' && v.motivo !== 'sin_par')

  // Sin ningún rating comparable no hay nada que desmentir: la cancha degrada
  // de forma predecible (handicap = índice) y se deja pasar.
  if (veredictos.length === 0) return APTA
  if (veredictos.some((v) => v.esCreible)) return APTA

  return {
    apta: false,
    motivo: 'rating_incoherente',
    mensaje: holes === 9 ? MENSAJE_SIN_RATING_9H : MENSAJE_RATING_MAL_CARGADO,
  }
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
