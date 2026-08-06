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
 * Cuánto puede alejarse del par un Course Rating real. Los ratings USGA caen a
 * pocos golpes del par; más que esto no es una cancha difícil, es un dato en
 * otra escala o directamente roto.
 */
const BANDA_RATING_VS_PAR = 6

/**
 * Course Rating de UNA vuelta de 9 hoyos, en la MISMA escala que `parEnEscalaDe9`.
 *
 * El par NO alcanza como señal de escala, porque el catálogo tiene las dos
 * columnas escaladas por separado. Las 9 filas donde pasa hoy NO son canchas de
 * 9 hoyos: son los loops HIJOS de tres clubes de 27 (Rocas de Santo Domingo,
 * Brisas, Marbella), cada uno con `par_total = 36` junto a
 * `course_rating = 72`. Mirando sólo el par se concluye "ya es de 9" y el
 * rating queda sin partir → `(72 − 36)` = **+36 golpes** en cada course
 * handicap. Tampoco alcanza un umbral sobre la magnitud del rating: partir todo
 * lo que pase de 50 devuelve `(27.5 − 35)` en una cancha par 35 → handicaps
 * NEGATIVOS.
 *
 * OJO: quien consuma esos loops por el camino multi-recorrido (paso 0 de
 * `resolverCourseData`) tiene que llamar a esta función POR CADA hijo antes de
 * sumar los ratings. Sumarlos crudos reintroduce el mismo +36 (y +72 con dos
 * loops) sin pasar por acá.
 *
 * La rama "ya viene en 9" no la ejercita ninguna fila del catálogo hoy (0 de
 * 619): es el seguro para cuando entre una cancha de 9 hoyos bien cargada.
 *
 * La señal que sí sirve es la RELACIÓN entre los dos: un rating válido queda a
 * menos de `BANDA_RATING_VS_PAR` golpes de su par. Se prueba la hipótesis
 * "ya viene en 9" y después "viene en 18"; si ninguna cierra, el dato es
 * imposible (C.G. Río Blanco: par 35 con rating 55, que no es válido en
 * ninguna escala) y se devuelve el par para que el término `(CR − par)` se
 * anule. Un handicap sin el ajuste de rating queda levemente aproximado; uno
 * calculado sobre un rating imposible queda catastrófico.
 *
 * Si el tee publica `front_course_rating` usá ESE valor y no esta función: ya
 * es un CR de 9 hoyos medido, no una aproximación.
 */
export function courseRatingEnEscalaDe9(courseRating: number, parDeLaCancha: number): number {
  return resolverRatingEnEscalaDe9(courseRating, parDeLaCancha).courseRating
}

/**
 * En qué escala venía el rating, según cuál de las dos hipótesis cerró.
 *
 *  · `ya_en_9`    — el número ya era un rating de 9 hoyos. Se usa tal cual.
 *  · `era_de_18`  — venía en escala de 18 y se partió al medio. RECUPERADO: el
 *                   dato es bueno, sólo estaba mal escalado (los 9 loops de
 *                   Brisas / Marbella / Rocas: 72 contra par 36 → 36).
 *  · `imposible`  — no cierra en NINGUNA escala (C.G. Río Blanco: 55 contra par
 *                   35; +20 si fuera de 9, −15 si fuera de 18). No hay nada que
 *                   recuperar.
 */
export type EscalaDelRating = 'ya_en_9' | 'era_de_18' | 'imposible'

export interface RatingEnEscalaDe9 {
  /**
   * El valor que va a la fórmula. Cuando la escala es `imposible` es el PAR, a
   * propósito: así el término `(CR − par)` se anula y el handicap queda sin el
   * ajuste de rating en vez de catastróficamente inflado.
   */
  courseRating: number
  escala: EscalaDelRating
}

/**
 * `courseRatingEnEscalaDe9` + POR QUÉ dio ese número.
 *
 * Existe porque el valor solo no alcanza para dos consumidores con preguntas
 * distintas, y confundirlos dejó ciego al guardarrail:
 *
 *  · El MOTOR quiere un número usable. Le sirve el par cuando el dato es
 *    imposible: el término se anula y el jugador recibe su índice.
 *  · El GUARDARRAIL quiere saber si el dato MIENTE, para no dejar armar un
 *    torneo sobre él. Preguntándole al valor ya normalizado siempre ve delta 0
 *    en el caso imposible — justo el que tiene que bloquear. Tiene que mirar
 *    `escala === 'imposible'`, no el delta del número corregido.
 *
 * Un rating RECUPERADO (`era_de_18`) no es un dato que mienta: es el mismo
 * rating bien escalado, y el motor produce el handicap correcto con él. Esas
 * canchas no se bloquean.
 */
export function resolverRatingEnEscalaDe9(
  courseRating: number,
  parDeLaCancha: number,
): RatingEnEscalaDe9 {
  const par9 = parEnEscalaDe9(parDeLaCancha)
  if (Math.abs(courseRating - par9) <= BANDA_RATING_VS_PAR) {
    return { courseRating, escala: 'ya_en_9' }
  }
  const mitad = courseRating / 2
  if (Math.abs(mitad - par9) <= BANDA_RATING_VS_PAR) {
    return { courseRating: mitad, escala: 'era_de_18' }
  }
  return { courseRating: par9, escala: 'imposible' }
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
  // Sólo se repite si la ronda es un MÚLTIPLO exacto de la vuelta. Un catálogo
  // de 15 hoyos en una ronda de 18 no son "1.2 vueltas": es un catálogo
  // incompleto, y tratarlo como repetición inventaría los hoyos 16-18 copiando
  // los tres primeros — con un par plausible que nadie notaría.
  if (roundHoles % hoyosDeUnaVueltaDeLaCancha !== 0) return 1
  return roundHoles / hoyosDeUnaVueltaDeLaCancha
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
 * Los hoyos que la ronda puede llegar a jugar, con par y stroke index resueltos.
 *
 * FUENTE ÚNICA. Sustituye el idiom que estaba copiado en las pantallas de torneo
 * (`courseHoles.length > 0 ? courseHoles : buildFallbackCourseHoles(n)`).
 *
 * Tres casos, en este orden:
 *
 *  1. Catálogo vacío → cancha entera a par 4 con SI lineal. Es lo único honesto
 *     que se puede hacer sin datos, y es el comportamiento previo.
 *  2. Catálogo cuya vuelta cabe un número ENTERO de veces en la ronda (una
 *     cancha de 9 en 18, o en 27) → se REPITE la vuelta. Cada hoyo conserva su
 *     par real y recibe el stroke index de su vuelta.
 *  3. Cualquier otro caso → el catálogo tal cual, completando a par 4 sólo si
 *     tiene MENOS hoyos que la ronda.
 *
 * ⚠️ NO recorta a `roundHoles`. Los consumidores buscan por número de hoyo, y
 * una ronda de 9 hoyos puede empezar en el 10 (Back 9, `generarOrdenHoyos`):
 * devolver "los primeros 9" le daría par 4 y stroke index inventado a los nueve
 * hoyos que realmente se juegan. Quien necesita el par de los hoyos jugados usa
 * `parDeLosHoyosJugados`, que sí acota.
 *
 * Dedup por `numero` quedándose con la PRIMERA fila: mismo criterio que tenía
 * `parDeLosHoyosJugados`.
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
  //
  // Se exige que el catálogo NO traiga filas repetidas por número de hoyo. Una
  // cancha 27h puede venir como 27 filas numeradas 1..9 tres veces: ahí el
  // dedup deja 9 números y esto parecería "una cancha de 9", cuando en realidad
  // son tres recorridos distintos. Repetir el primero dos veces daría un par
  // plausible y equivocado — peor que el relleno a par 4, porque nadie lo nota.
  const catalogoLimpio = catalogo.length === base.length
  const vueltas = catalogoLimpio ? vueltasDeLaRonda(base.length, total) : 1
  if (vueltas > 1) {
    // El SI del catálogo se lleva a permutación 1..N antes de repartirlo entre
    // las vueltas. Hay canchas de 9 que publican el SI de la tarjeta de 18
    // (1,3,5…17); sin normalizar, la tarjeta de dos vueltas llegaría a SI 33.
    const rango = rangoDeStrokeIndex(base)
    const out: HoyoJugado[] = []
    for (let vuelta = 1; vuelta <= vueltas; vuelta++) {
      base.forEach((h, i) => {
        out.push({
          // El nº de hoyo de la RONDA (10..18 en la segunda vuelta), que es como
          // llegan los `hole_scores` y como los pinta la tarjeta.
          numero: (vuelta - 1) * base.length + i + 1,
          par: h.par ?? PAR_FALLBACK,
          stroke_index: strokeIndexDeVuelta(rango[i], vuelta, vueltas),
        })
      })
    }
    return out
  }

  // 3. El catálogo tal cual. Si tiene menos hoyos que la ronda, se completan a
  //    par 4 (comportamiento previo: un catálogo incompleto no se inventa).
  const out: HoyoJugado[] = base.map((h, i) => ({
    numero: h.numero,
    par: h.par ?? PAR_FALLBACK,
    stroke_index: h.stroke_index ?? i + 1,
  }))
  const ultimo = out.length > 0 ? out[out.length - 1].numero : 0
  for (let numero = ultimo + 1; out.length < total; numero++) {
    out.push({ numero, par: PAR_FALLBACK, stroke_index: numero })
  }
  return out
}

/**
 * El stroke index del catálogo llevado a permutación 1..N por rango.
 *
 * Mismo criterio de desempate que `normalizeStrokeIndexMap` (por número de
 * hoyo) para que el SI que se MUESTRA y el que reparte golpes no discrepen.
 * Un hoyo sin SI cargado se va al final.
 */
function rangoDeStrokeIndex(base: HoyoDeCatalogo[]): number[] {
  const orden = base.map((h, i) => ({ i, si: h.stroke_index ?? Number.POSITIVE_INFINITY }))
  orden.sort((a, b) => (a.si !== b.si ? a.si - b.si : a.i - b.i))
  const rango = new Array<number>(base.length)
  orden.forEach((o, puesto) => { rango[o.i] = puesto + 1 })
  return rango
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

/**
 * FUENTE ÚNICA del par de una ronda que da VARIAS VUELTAS a la misma cancha
 * (una de 9 jugada a 18). Lo usan los DOS motores de handicap.
 *
 * Sale del par propio de la cancha (`courses.par_total`) y no del `parTotal` que
 * manda el caller, por tres razones:
 *
 *  1. Los dos motores tienen que dar el MISMO número. Si cada uno se creyera el
 *     par que le pasan, el board y la tarjeta volverían a mostrar netos
 *     distintos para el mismo jugador — el modo de falla histórico del repo.
 *  2. El `parTotal` del caller a veces está en otra escala:
 *     `resolverHandicapDisplayDeRonda` pide a propósito el CourseData de 18
 *     hoyos pasándole el par de la ronda de 9 (35). Creerle daría `(69.6 − 35)`
 *     y el guardarrail tiraría un dato bueno.
 *  3. C.G. Río Blanco — la cancha que motiva todo esto — tiene CERO filas en
 *     `course_holes`, así que el par derivado del catálogo ni siquiera existe.
 *
 * `courses.par_total` está en el mismo escalón de autoridad que el rating que se
 * está escalando, y que coincida con la suma de `course_holes` lo vigila el
 * canario del catálogo.
 */
export function parDeVariasVueltas(parDeLaCancha: number | null | undefined, vueltas: number): number {
  // Con una sola vuelta el par de la ronda es el par de la cancha, sin tocar.
  // Sin esta guarda, pedirle el par de una cancha de 18 devolvería 36: sólo se
  // llega a `vueltas > 1` en canchas de 9, pero una función que miente cuando la
  // llaman "mal" es una trampa esperando a que alguien la pise.
  if (vueltas <= 1) return parDeLaCancha ?? 72
  return sumaDeVueltas(parDeLaCancha != null ? parEnEscalaDe9(parDeLaCancha) : 36, vueltas)
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
