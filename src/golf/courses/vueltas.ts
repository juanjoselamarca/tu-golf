// src/golf/courses/vueltas.ts
//
// FUENTE ÚNICA de "¿cuántas vueltas a la cancha se juegan, y qué hoyos son?".
//
// Por qué existe
// --------------
// Una cancha de 9 hoyos jugada a 18 se recorre DOS VECES. Es lo normal en Chile
// (Río Blanco, los loops de Brisas / Marbella / Rocas) y hasta el 1-ago-2026 el
// motor no lo sabía: pedía 18 hoyos a un catálogo de 9, no encontraba los hoyos
// 10-18 y los completaba a par 4 con stroke index inventado. Consecuencias:
//
//   · El par de la ronda salía 36 + 9×4 = 72 en vez de 35 + 35 = 70.
//   · Ese 72 entraba a la fórmula WHS contra un Course Rating de 9 hoyos, así
//     que `(CR − par)` quedaba ~36 golpes corrido → el guardarrail de rating lo
//     detectaba como dato incoherente y degradaba al índice. La cancha quedaba
//     inutilizable para torneos de 18 aunque su dato estuviera PERFECTO.
//   · Los hoyos 10-18 se puntuaban contra par 4 y con SI 10..18 lineal: birdies
//     y bogeys mal contados, golpes de handicap repartidos en el hoyo equivocado.
//
// La solución NO es bloquear: es modelar la segunda vuelta. Los hoyos 10-18 SON
// los hoyos 1-9 otra vez, con su par y su dificultad reales.
//
// Los tres conceptos viven acá y en ningún otro lado:
//   1. ¿En qué escala está publicado este dato?  → `esEscalaDe18Hoyos` y amigas
//   2. ¿Cuántas vueltas da esta ronda?           → `vueltasDeLaRonda`
//   3. ¿Qué hoyos se juegan exactamente?         → `hoyosDeLaVuelta`

/**
 * Par asumido para un hoyo que el catálogo de la cancha no tiene.
 *
 * Fuente única del fallback de par: lo consumen `hoyosDeLaVuelta` (cancha sin
 * catálogo, o catálogo incompleto) y `parOfPlayedHoles` del board. Tienen que
 * coincidir: si difirieran, una cancha sin catálogo y una a la que le falta UN
 * hoyo puntuarían con criterios distintos.
 *
 * Decisión (29-jul-2026): NO se reusa `STANDARD_PARS` de `golf/coach/hole-pars`
 * aunque responda una pregunta parecida. Ese array es un layout par-72 concreto
 * y su propio doc avisa que miente en canchas par 70/71 — que son varias de las
 * nuestras (Los Leones, Sport Francés, Prince of Wales) —, además de no cubrir
 * los hoyos >18 de las canchas multi-recorrido. Acá hace falta un valor neutro
 * por hoyo, no un layout. Los dos conceptos se parecen y no son el mismo.
 */
export const PAR_FALLBACK = 4

/**
 * ¿El par y el Course Rating de esta cancha vienen en escala de 18 hoyos?
 *
 * FUENTE ÚNICA de la decisión de escala. El par es la señal confiable: es un
 * entero duro (35-36 en una cancha de 9, 70-72 en una de 18) y nunca ambiguo.
 * El Course Rating es un float que puede venir sucio del catálogo, así que NO
 * decide — obedece.
 *
 * Existe porque esta pregunta estaba contestada en tres lugares con tres
 * criterios distintos: `resolveNineHolePar` guardaba el par con `≤50`, los dos
 * caminos de `resolverCourseData` partían el CR SIN guarda, y el coach partía
 * el par SIN guarda. Con criterios que no coinciden, el par y el CR terminan en
 * escalas distintas dentro de la MISMA fórmula — que es exactamente el bug de
 * los course handicaps negativos, sólo que por el otro lado.
 */
export function esEscalaDe18Hoyos(par: number): boolean {
  return par > 50
}

/**
 * Par de UNA vuelta de 9 hoyos, desde el par de la cancha.
 *
 * Un par ≤50 ya es de 9 hoyos y se respeta tal cual (C.G. Río Blanco: par 35).
 * Uno mayor es de 18 y se parte al medio.
 */
export function parEnEscalaDe9(par: number): number {
  return esEscalaDe18Hoyos(par) ? Math.round(par / 2) : par
}

/**
 * Course Rating de UNA vuelta de 9 hoyos, en la MISMA escala que `parEnEscalaDe9`.
 *
 * ⚠️ Toma el par de la cancha como señal de escala, no su propia magnitud. Un
 * umbral propio sobre el CR (`rating > 50 ? /2 : rating`) parece razonable y es
 * falso: C.G. Río Blanco tiene par 35 (9 hoyos) con rating 55, así que un
 * umbral sobre el rating lo partiría a 27.5 contra un par de 35 y devolvería
 * `(27.5 − 35)` → course handicap NEGATIVO para un jugador de índice 12.
 *
 * Si el tee publica `front_course_rating` usá ESE valor y no esta función: ya
 * es un CR de 9 hoyos medido, no una aproximación.
 */
export function courseRatingEnEscalaDe9(courseRating: number, parDeLaCancha: number): number {
  return esEscalaDe18Hoyos(parDeLaCancha) ? courseRating / 2 : courseRating
}

/**
 * Cuántos hoyos tiene UNA vuelta a esta cancha, leído desde su par.
 *
 * Adaptador: convierte la señal de escala (el par) en la entrada que necesita
 * `vueltasDeLaRonda`. La DECISIÓN de cuántas vueltas se dan vive allá, una sola
 * vez; acá sólo se obtiene el dato de entrada desde la evidencia disponible.
 */
export function hoyosDeUnaVuelta(parDeLaCancha: number | null | undefined): 9 | 18 {
  if (parDeLaCancha == null || !Number.isFinite(parDeLaCancha)) return 18
  return esEscalaDe18Hoyos(parDeLaCancha) ? 18 : 9
}

/**
 * ¿Cuántas veces se recorre la cancha en una ronda de `roundHoles` hoyos?
 *
 * LA decisión. Todo el resto del motor (par de la ronda, Course Rating, hoyos
 * de la tarjeta, guardarrail de aptitud) la consulta acá y nadie la re-deriva.
 *
 *   · Cancha de 18, ronda de 18 → 1 vuelta.
 *   · Cancha de 18, ronda de 9  → 1 vuelta (media cancha, no media vuelta: el
 *     motor ya tiene `parEnEscalaDe9` para eso).
 *   · Cancha de 9,  ronda de 9  → 1 vuelta.
 *   · Cancha de 9,  ronda de 18 → 2 vueltas. El caso que este módulo existe
 *     para modelar.
 */
export function vueltasDeLaRonda(hoyosDeUnaVueltaDeLaCancha: number, roundHoles: number): number {
  if (!Number.isFinite(hoyosDeUnaVueltaDeLaCancha) || hoyosDeUnaVueltaDeLaCancha <= 0) return 1
  if (!Number.isFinite(roundHoles) || roundHoles <= hoyosDeUnaVueltaDeLaCancha) return 1
  return Math.ceil(roundHoles / hoyosDeUnaVueltaDeLaCancha)
}

/** Atajo con nombre: ¿esta ronda repite la cancha? Lo usan los guardarrailes. */
export function esRondaDeVariasVueltas(
  parDeLaCancha: number | null | undefined,
  roundHoles: number,
): boolean {
  return vueltasDeLaRonda(hoyosDeUnaVuelta(parDeLaCancha), roundHoles) > 1
}

/** Un hoyo tal como lo trae `course_holes` (par y SI pueden faltar). */
export interface HoyoDeCatalogo {
  numero: number
  par?: number | null
  stroke_index?: number | null
}

/** Un hoyo de la vuelta que se juega: siempre con par y stroke index resueltos. */
export interface HoyoJugado {
  numero: number
  par: number
  stroke_index: number
}

/**
 * Stroke index de un hoyo en una ronda de varias vueltas.
 *
 * Regla WHS/USGA de asignación de golpes: los golpes se reparten lo más parejo
 * posible a lo largo de la ronda. Cuando una cancha de 9 se juega dos veces, la
 * primera vuelta se queda con los índices IMPARES y la segunda con los PARES,
 * conservando el orden de dificultad que publicó el club:
 *
 *   SI 9h  1  2  3  4  5  6  7  8  9
 *   1ª vta 1  3  5  7  9 11 13 15 17
 *   2ª vta 2  4  6  8 10 12 14 16 18
 *
 * Es la misma tarjeta de 18 que imprime un club de 9 hoyos, y el resultado es
 * una permutación exacta de 1..(9×vueltas) — así `normalizedStrokeIndexByHole`
 * no tiene nada que corregir y `sum(strokesRecibidosEnHoyo)` reparte el course
 * handicap COMPLETO, sin perder ni inventar golpes.
 *
 * Alternativa descartada: repetir el SI 1..9 tal cual en las dos vueltas. El
 * reparto de golpes sobreviviría (`normalizeStrokeIndexMap` desempata por número
 * de hoyo y termina llegando a esta misma tabla), pero por accidente: dependería
 * de un criterio de desempate que nadie escribió pensando en esto. Y el SI que se
 * MUESTRA en la tarjeta quedaría con nueve valores repetidos, que no es lo que
 * dice la tarjeta del club. La regla se declara acá, no se deduce allá.
 *
 * @param vuelta 1-indexed (1 = primera vuelta).
 */
export function strokeIndexDeVuelta(strokeIndexDeLaCancha: number, vuelta: number, vueltas: number): number {
  return (strokeIndexDeLaCancha - 1) * vueltas + vuelta
}

/**
 * Los hoyos que EFECTIVAMENTE se juegan en una ronda de `roundHoles`.
 *
 * FUENTE ÚNICA. Sustituye el idiom que estaba copiado en las cuatro pantallas
 * de torneo (`courseHoles.length > 0 ? courseHoles : buildFallbackCourseHoles(n)`)
 * y el `hole?.par ?? 4` suelto del scorer.
 *
 * Tres casos, en este orden:
 *
 *  1. Catálogo vacío → cancha entera a par 4 con SI lineal. Es lo único
 *     honesto que se puede hacer sin datos, y es el comportamiento previo.
 *  2. Catálogo de 9 hoyos con ronda de 18 (o 27) → se REPITE la vuelta. Cada
 *     hoyo conserva su par real y recibe el stroke index de su vuelta.
 *  3. Cualquier otro caso → los `roundHoles` primeros hoyos del catálogo,
 *     completando a par 4 los que falten (catálogo incompleto).
 *
 * Dedup por `numero` quedándose con la PRIMERA fila: mismo criterio que tenía
 * `parDeLosHoyosJugados`. Las canchas multi-recorrido pueden traer filas
 * repetidas por recorrido y sumarlas todas inflaría el par.
 */
export function hoyosDeLaVuelta(catalogo: HoyoDeCatalogo[], roundHoles: number): HoyoJugado[] {
  const total = Math.max(0, Math.trunc(roundHoles) || 0)
  if (total === 0) return []

  const porNumero = new Map<number, HoyoDeCatalogo>()
  for (const h of catalogo) {
    if (h == null || !Number.isFinite(h.numero)) continue
    if (!porNumero.has(h.numero)) porNumero.set(h.numero, h)
  }
  const base = Array.from(porNumero.values()).sort((a, b) => a.numero - b.numero)

  // 1. Sin catálogo: cancha neutra.
  if (base.length === 0) {
    return Array.from({ length: total }, (_, i) => ({
      numero: i + 1,
      par: PAR_FALLBACK,
      stroke_index: i + 1,
    }))
  }

  // 2. La cancha se recorre más de una vez.
  const vueltas = vueltasDeLaRonda(base.length, total)
  if (vueltas > 1) {
    const out: HoyoJugado[] = []
    for (let vuelta = 1; vuelta <= vueltas; vuelta++) {
      base.forEach((h, i) => {
        out.push({
          // El nº de hoyo de la RONDA (10..18 en la segunda vuelta), que es como
          // llegan los `hole_scores` y como los pinta la tarjeta.
          numero: (vuelta - 1) * base.length + i + 1,
          par: h.par ?? PAR_FALLBACK,
          // SI del catálogo si lo hay; si no, la posición del hoyo en la vuelta.
          stroke_index: strokeIndexDeVuelta(h.stroke_index ?? i + 1, vuelta, vueltas),
        })
      })
    }
    return out.slice(0, total)
  }

  // 3. Una sola vuelta: los hoyos del catálogo, completando los que falten.
  const out: HoyoJugado[] = base.slice(0, total).map((h, i) => ({
    numero: h.numero,
    par: h.par ?? PAR_FALLBACK,
    stroke_index: h.stroke_index ?? i + 1,
  }))
  for (let numero = out.length + 1; numero <= total; numero++) {
    out.push({ numero, par: PAR_FALLBACK, stroke_index: numero })
  }
  return out
}

/**
 * Un valor ADITIVO por vuelta (Course Rating, par), llevado a la ronda completa.
 *
 * Dar dos vueltas a una cancha de par 35 y CR 34.8 es una ronda de par 70 y CR
 * 69.6. Fuente única de esa multiplicación, para que el par y el rating nunca
 * queden en escalas distintas dentro de la misma fórmula.
 *
 * ⚠️ El slope NO pasa por acá: es un cociente adimensional (dificultad relativa
 * bogey/scratch) y vale igual para 9, 18 o 27 hoyos. Multiplicarlo daría un
 * course handicap del doble.
 */
export function sumaDeVueltas(valorDeUnaVuelta: number, vueltas: number): number {
  return valorDeUnaVuelta * vueltas
}

/** Course Rating y par de una cancha, escalados a las vueltas que se juegan. */
export interface RatingDeLaRonda {
  courseRating: number
  par: number
}

/** El Course Rating y el par de N vueltas a la misma cancha. Ver `sumaDeVueltas`. */
export function ratingDeVueltas(
  courseRatingDeUnaVuelta: number,
  parDeUnaVuelta: number,
  vueltas: number,
): RatingDeLaRonda {
  return {
    courseRating: sumaDeVueltas(courseRatingDeUnaVuelta, vueltas),
    par: sumaDeVueltas(parDeUnaVuelta, vueltas),
  }
}
