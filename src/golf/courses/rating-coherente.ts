// src/golf/courses/rating-coherente.ts
//
// FUENTE ÚNICA de la pregunta "¿este Course Rating es creíble para este par?".
//
// Por qué existe
// --------------
// El Course Rating es el score esperado de un scratch. Por definición vive
// PEGADO al par: nunca se aleja más de unos pocos golpes. Cuando se aleja 20 o
// 36, no es una cancha difícil — es un dato en la escala equivocada.
//
// El catálogo real tiene exactamente ese problema en las 11 canchas de 9 hoyos:
// la validación de la base exige rating ∈ [50,85] (rango de 18 hoyos) y RECHAZA
// el rating real de 9 hoyos (~35), así que quien cargó los datos puso el número
// de 18 hoyos (o uno imposible) para que la fila entrara. Resultado en prod:
//   · C.G. Río Blanco       → par 35, rating 55  → delta +20
//   · Brisas / Marbella / Rocas (9 recorridos) → par 36, rating 72 → delta +36
// Con esos números la fórmula WHS (`CH = idx × slope/113 + (CR − par)`) suma
// +20 o +36 golpes de la nada. La fórmula está bien; el dato miente.
//
// Los PR #289 y #290 arreglaron la FÓRMULA. Este módulo arregla la ROBUSTEZ:
// da el predicado con nombre que el motor consulta ANTES de creerle a un rating.
//
// Cómo se eligieron las tolerancias (medidas contra el catálogo real, jul-2026)
// ----------------------------------------------------------------------------
// No son a ojo. Se midió |rating − par| sobre las 477 filas de `course_tees` y
// las 193 de `courses`:
//   · 18 hoyos → el delta legítimo más extremo del catálogo es 7.6
//     (C.G. La Serena tee dorado: par 72, rating 64.4 — un tee adelantado
//     normal). Los ratings de damas empujan para el otro lado (+6.9 en
//     C.C. Bellavista). Con ±5 se marcarían 21 tees SANOS como rotos, y un
//     falso bloqueo de un torneo real viola CERO FALLOS igual que un handicap
//     absurdo. Tolerancia ±10: deja pasar todo lo legítimo con margen y
//     igual atrapa cualquier error de escala (un rating de 9h sobre par 18h
//     da delta ≈ 36, y un swap CR↔slope da ≈ 35).
//   · 9 hoyos → sobre los 378 ratings front/back cargados, el delta legítimo
//     más extremo es 3.9. Los únicos que pasan de 4 son los 4 de
//     C.G. Rinconada de Chillán, cuyo front (29.3) + back (29.4) = 58.7 NO
//     cuadra con su propio rating total (72.8): dato demostrablemente roto.
//     Con ±3 se marcarían 18 tees sanos (Olivos, Los Leones, Prince of Wales…).
//     Tolerancia ±5: atrapa los 11 casos reales (delta 20 y 36) con 4× de
//     margen y no toca ningún dato sano.
//
// MÁXIMO REAL MEDIDO — barrido del catálogo del 1-ago-2026
// --------------------------------------------------------
// Sobre las 186 canchas activas y sus 477 tees, mirando SÓLO los ratings que hoy
// entran en tolerancia (o sea, el catálogo válido; la deuda conocida queda fuera
// por definición), el |CR − par| más grande que existe es:
//
//   · 18 hoyos → 7.6   C.G. La Serena (VARONES), tee dorado: par 72, CR 64.4
//   ·  9 hoyos → 3.9   Club de Golf Marbella, tee dorado_andes pro_pacifico
//                      norte, back_course_rating 32.1 contra par 36
//
// O sea: la tolerancia de 18h tiene 2.4 golpes de aire sobre el peor caso real,
// y la de 9h tiene 1.1. El dato roto más benigno del catálogo está en delta 20
// (Río Blanco) — 2.6× por encima del techo de 9h. Hay margen para las dos cosas:
// no marcar sano lo que es sano, y no dejar pasar lo que miente.
//
// Si mañana el catálogo suma canchas con deltas legítimos mayores, se sube la
// tolerancia ACÁ y en ningún otro lado.

/** Tolerancia |rating − par| para una vuelta de 9 hoyos. Ver cabecera. */
export const TOLERANCIA_RATING_9H = 5

/** Tolerancia |rating − par| para una vuelta de 18 hoyos. Ver cabecera. */
export const TOLERANCIA_RATING_18H = 10

export type MotivoRatingNoCreible =
  /** No hay rating cargado. El motor degrada solo; no es un dato que mienta. */
  | 'sin_rating'
  /** No hay par contra el cual comparar. Tampoco es un dato que mienta. */
  | 'sin_par'
  /** Hay rating Y par, y están demasiado lejos: el dato MIENTE. */
  | 'delta_fuera_de_rango'

export interface RatingCoherencia {
  /** Hay rating, hay par, y el delta entra en tolerancia. */
  esCreible: boolean
  /**
   * Hay rating cargado pero es incoherente con el par. Es el caso peligroso:
   * un dato ausente degrada solo, uno que miente produce números absurdos.
   */
  esIncoherente: boolean
  motivo: MotivoRatingNoCreible | null
  /** `rating − par`. Null si falta alguno de los dos. */
  delta: number | null
  /** Tolerancia aplicada, para poder explicarle al usuario por qué falló. */
  tolerancia: number
}

/**
 * Tolerancia según los hoyos que se juegan. El rating y el par tienen que
 * venir en la MISMA escala que `holes` (ver `parEnEscalaDe9` /
 * `courseRatingEnEscalaDe9` en `@/golf/core/course-handicap`).
 *
 * Más de 18 hoyos (Brisas 27h combina 3 recorridos) escala proporcional.
 */
export function toleranciaRating(holes: number): number {
  if (holes <= 9) return TOLERANCIA_RATING_9H
  if (holes <= 18) return TOLERANCIA_RATING_18H
  return Math.ceil(TOLERANCIA_RATING_18H * (holes / 18))
}

export interface RatingParaEvaluar {
  courseRating: number | null | undefined
  par: number | null | undefined
  /** Hoyos de la vuelta que describen ESE rating y ESE par (9, 18, 27…). */
  holes: number
}

/**
 * ¿Le puedo creer a este rating? Fuente única del criterio.
 *
 * Devuelve el detalle completo para que los callers puedan distinguir
 * "no hay dato" (degradar en silencio) de "el dato miente" (avisar y frenar).
 */
export function evaluarRating({ courseRating, par, holes }: RatingParaEvaluar): RatingCoherencia {
  const tolerancia = toleranciaRating(holes)
  const noCreible = (motivo: MotivoRatingNoCreible): RatingCoherencia => ({
    esCreible: false,
    esIncoherente: motivo === 'delta_fuera_de_rango',
    motivo,
    delta: null,
    tolerancia,
  })

  if (courseRating == null || !Number.isFinite(courseRating)) return noCreible('sin_rating')
  if (par == null || !Number.isFinite(par) || par <= 0) return noCreible('sin_par')

  const delta = courseRating - par
  if (Math.abs(delta) > tolerancia) {
    return {
      esCreible: false,
      esIncoherente: true,
      motivo: 'delta_fuera_de_rango',
      delta,
      tolerancia,
    }
  }
  return { esCreible: true, esIncoherente: false, motivo: null, delta, tolerancia }
}

/** Atajo booleano: ¿el motor puede usar este rating en la fórmula WHS? */
export function ratingEsCreible(input: RatingParaEvaluar): boolean {
  return evaluarRating(input).esCreible
}

/**
 * Atajo booleano: ¿hay un rating cargado que MIENTE? Distinto de
 * `!ratingEsCreible`, que también es true cuando simplemente no hay dato.
 */
export function ratingEsIncoherente(input: RatingParaEvaluar): boolean {
  return evaluarRating(input).esIncoherente
}
