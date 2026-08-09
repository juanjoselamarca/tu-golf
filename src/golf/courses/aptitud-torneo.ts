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
// Criterio: el motor NO elige entre los ratings disponibles. Ata a cada jugador
// a SU tee (`resolvePlayerTee`) y sólo tiene un escalón debajo: el rating a
// nivel de cancha. Así que la pregunta no es "¿alguno sirve?" sino "¿la cadena
// que va a caminar ESTE jugador termina en un rating creíble?".
//
// - Cancha sin ningún rating: NO se bloquea. Degrada predecible y parejo (todos
//   reciben su índice), y hay 51 canchas así en el catálogo.
// - Tee roto CON rating de cancha sano: NO se bloquea. Esos jugadores caen al
//   rating general y siguen puntuando con WHS; se pierde precisión de tee, así
//   que sale como `advertencia`.
// - Tee roto SIN rating de cancha sano debajo: SÍ se bloquea. Esos jugadores
//   caen al índice mientras los del tee sano puntúan con WHS — dos handicaps
//   distintos en el mismo torneo neto, en silencio.
// - Rating de cancha que MIENTE: SÍ se bloquea, tenga o no un tee sano arriba.
//   No se puede garantizar que un jugador llegue a un tee (`resolvePlayerTee`
//   exige match EXACTO de nombre), así que ese eslabón es el que muchos
//   jugadores van a caminar de verdad.
//
// ⚠️ El eslabón "rating de cancha" sólo cuenta si tiene `slope_rating`: los dos
// motores lo exigen junto al `course_rating`. Sin slope, ese escalón no existe.
//
// ⚠️ Este módulo tiene que leer la escala IGUAL que el motor, o se bloquea algo
// que funcionaría / se deja pasar algo que falla. La escala es la de UNA vuelta
// a la cancha (`@/golf/courses/vueltas`): `holeCount <= 9` en una cancha de 18,
// y siempre 9 en una cancha de 9 — aunque el torneo sea de 18, porque ahí el
// motor da dos vueltas y multiplica rating y par por igual.

import { esEscalaDe18Hoyos, hoyosDeUnaVuelta, parEnEscalaDe9, resolverRatingEnEscalaDe9 } from './vueltas'
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
 * Falta el par hoyo por hoyo y no hay recorrido que elegir para conseguirlo:
 * el club nunca cargó el scorecard. Hoy son 6 canchas (Iquique D/V, Barquito
 * Chañaral D/V, Río Blanco D/V), ninguna con rondas.
 */
export const MENSAJE_SIN_PAR_POR_HOYO =
  'Esta cancha no tiene el par hoyo por hoyo cargado. Contacta al club o elige otra.'

/**
 * El par SÍ existe, pero cuelga de los recorridos y todavía no se eligieron.
 * El jugador puede resolverlo solo, así que el mensaje pide la acción en vez de
 * mandarlo a hablar con el club.
 */
export const MENSAJE_FALTA_ELEGIR_RECORRIDOS =
  'Elige qué recorridos vas a jugar: esta cancha tiene varios y el par cambia según cuáles juegues.'

/**
 * Mismo problema desde la creación de un TORNEO, donde no se pueden elegir
 * recorridos (`tournaments` no tiene la columna). La salida es otra: el
 * catálogo ya trae la combinación armada como cancha propia, con sus 18 hoyos
 * cargados (ej. «C.G. Las Brisas De Santo Domingo - Norte - Sur»).
 */
export const MENSAJE_ELEGIR_COMBINACION_ARMADA =
  'Este club tiene varios recorridos. Elige la combinación que vas a jugar (por ejemplo «Norte - Sur») en vez del club, para que el par de cada hoyo sea el correcto.'

export interface TeeParaAptitud {
  rating: number | null
  front_course_rating?: number | null
}

export interface CanchaParaAptitud {
  par_total: number | null
  course_rating: number | null
  /** Sólo lo usa la combinación de recorridos, para espejar `allHaveRatings`. */
  slope_rating?: number | null
  tees?: TeeParaAptitud[] | null
}

/**
 * Hasta el 1-ago-2026 existía además `cancha_de_9_en_vuelta_de_18`: una cancha
 * de 9 hoyos no podía usarse para un torneo de 18. No era una regla de golf —
 * era una limitación del motor, que rellenaba los hoyos 10-18 a par 4 en vez de
 * repetir la vuelta. Con `@/golf/courses/vueltas` la segunda vuelta se modela
 * de verdad (par, stroke index, Course Rating y slope correctos), así que una
 * cancha de 9 SANA sirve para 18 hoyos y sólo queda el bloqueo por dato roto.
 */
export type MotivoNoApta = 'rating_incoherente' | 'sin_par_por_hoyo'

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

// Congelado: se devuelve por referencia desde varios caminos y una mutación
// accidental contaminaría todos los veredictos a la vez.
const APTA: AptitudTorneo = Object.freeze({
  apta: true,
  motivo: null,
  mensaje: null,
  advertencia: null,
})

export const ADVERTENCIA_TEE_ROTO =
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

/**
 * ¿Este veredicto frena una RONDA LIBRE?
 *
 * Se mantiene como función con nombre (y no como `!veredicto.apta` inline)
 * porque torneo y ronda libre NO tienen por qué frenar por lo mismo: un torneo
 * reparte premios y una ronda entre amigos no. Si mañana hay un motivo que sólo
 * aplica a torneos, se agrega acá y ninguna ruta se entera.
 *
 * Hoy frenan los dos motivos, pero por razones distintas:
 * - `rating_incoherente` sólo importa cuando se juega NETO (el rating no entra
 *   en el gross), así que la ruta lo pregunta dentro de ese camino.
 * - `sin_par_por_hoyo` importa SIEMPRE. Sin el par de cada hoyo el scorer no
 *   puede pintar birdie ni bogey, el vs-par no existe y el coach razona sobre
 *   una ronda sin referencia. Una ronda gross también lo necesita.
 *
 * Vive acá y no inline en la ruta porque es una decisión de producto sobre el
 * dominio, no un detalle de una ruta: si mañana hay un segundo camino de
 * creación de ronda libre, tiene que contestar lo mismo.
 */
export function bloqueaRondaLibre(
  veredicto: AptitudTorneo | null | undefined,
): veredicto is AptitudTorneo {
  return veredicto?.motivo === 'rating_incoherente' || veredicto?.motivo === 'sin_par_por_hoyo'
}

/**
 * ¿Este bloqueo se levanta jugando en modo Gross?
 *
 * Sí para el rating: en gross no entra en ningún cálculo, así que la ronda se
 * puede jugar igual y el aviso ofrece esa salida. No para el par por hoyo: sin
 * él no hay vs-par ni birdie en el scorer, y eso no depende del modo. Ofrecer
 * "jugala en gross" ahí sería mandar al jugador a una ronda igual de rota.
 */
export function seArreglaJugandoGross(veredicto: AptitudTorneo): boolean {
  return veredicto.motivo === 'rating_incoherente'
}

/**
 * Lo que la resolución REAL de hoyos devolvió para esta ronda.
 *
 * `hoyosResueltos` NO se deriva de mirar el catálogo por separado: sale de
 * llamar a la misma función que usa el scorer en runtime
 * (`fetchHoyosDeLaRonda`). Es la única forma de que el gate no pueda contestar
 * distinto que el motor — el modo de falla que hizo falta corregir acá mismo:
 * una primera versión de este gate contaba "recorridos hijos con hoyos" y daba
 * APTA a rondas que el scorer resolvía en 0 hoyos, porque el scorer buscaba en
 * el club padre y los hoyos estaban en los hijos.
 */
export interface ParPorHoyoDisponible {
  /** Cuántos hoyos devolvió la resolución real. 0 = el scorer no tiene par. */
  hoyosResueltos: number
  /** Cuántos recorridos eligió el jugador (`rondas_libres.recorridos`). */
  loopsElegidos: number
  /** Cuántos recorridos hijos ofrece la cancha para elegir. */
  recorridosDisponibles: number
  /**
   * ¿El camino que llamó puede ofrecerle al usuario elegir recorridos?
   *
   * La ronda libre sí (el wizard los pide). El torneo NO: `tournaments` no
   * tiene columna `recorridos`, así que decirle al organizador "elegí tus
   * recorridos" sería mandarlo a una afordancia que no existe. Ahí la salida es
   * elegir la combinación que el catálogo ya ofrece armada.
   */
  puedeElegirRecorridos: boolean
  /**
   * ¿La cancha existe en `courses`?
   *
   * Un `course_id` que no está en la tabla NO es asunto de este guardarrail: lo
   * caza la foreign key al insertar. Bloquearlo acá con "no tiene el par hoyo
   * por hoyo cargado" sería un mensaje que miente sobre lo que pasó.
   */
  existe: boolean
}

/**
 * ¿Se puede saber el par de cada hoyo de esta ronda?
 *
 * El guardarrail de rating contesta si el HANDICAP va a salir bien. Éste
 * contesta algo anterior: si el motor tiene contra qué comparar cada golpe. Sin
 * `course_holes` no hay par por hoyo ni stroke index, así que no hay vs-par, no
 * hay birdie/bogey en el scorer y el coach analiza una ronda sin referencia.
 *
 * El agujero que cierra es real y está en producción: 4 rondas libres
 * finalizadas (marzo-abril 2026, 12 jugadores) apuntan al club PADRE de un
 * complejo de 27 hoyos con `recorridos` en null. El padre no tiene hoyos
 * propios —eso es correcto por diseño, los tiene cada hijo— pero sin loops
 * elegidos no hay forma de saber cuáles se jugaron. Nadie las validó porque el
 * único gate que existía miraba el rating y sólo corría en modo neto.
 *
 * No se adivina qué recorridos jugó el jugador: se le pide que los elija.
 */
export function evaluarParPorHoyo(d: ParPorHoyoDisponible): AptitudTorneo {
  // Cancha que no está en el catálogo: la FK se ocupa. Espeja a
  // `evaluarCanchaDeRondaLibre`, que para ese caso devuelve null.
  if (!d.existe) return APTA

  // La resolución real devolvió hoyos: el scorer tiene con qué puntuar.
  if (d.hoyosResueltos > 0) return APTA

  const noApta = (mensaje: string): AptitudTorneo => ({
    apta: false,
    motivo: 'sin_par_por_hoyo',
    mensaje,
    advertencia: null,
  })

  // No hay par por hoyo. El mensaje depende de si el usuario tiene una salida
  // desde donde está parado.
  const hayRecorridos = d.recorridosDisponibles > 0

  // Ya eligió recorridos y aun así no salieron hoyos: los recorridos elegidos
  // no tienen su scorecard cargado. Pedirle que "elija recorridos" otra vez
  // sería mandarlo a repetir lo que ya hizo.
  if (d.loopsElegidos > 0) return noApta(MENSAJE_SIN_PAR_POR_HOYO)

  // La cancha ofrece recorridos y el camino permite elegirlos: ésa es la acción.
  if (hayRecorridos && d.puedeElegirRecorridos) return noApta(MENSAJE_FALTA_ELEGIR_RECORRIDOS)

  // La cancha ofrece recorridos pero el camino NO permite elegirlos (torneo):
  // la salida es la combinación que el catálogo ya tiene armada.
  if (hayRecorridos) return noApta(MENSAJE_ELEGIR_COMBINACION_ARMADA)

  // No hay recorridos que elegir: falta el dato y no hay nada que hacer desde
  // la app.
  return noApta(MENSAJE_SIN_PAR_POR_HOYO)
}

/**
 * Junta veredictos independientes en uno solo: gana el primero que bloquea, y
 * si ninguno bloquea se conserva la primera advertencia.
 *
 * Existe para que las rutas no elijan a mano entre "¿el rating miente?" y
 * "¿hay par por hoyo?" — que es justo el tipo de decisión que termina escrita
 * de dos formas distintas en dos rutas. El orden en que se pasan define la
 * prioridad del mensaje, y el caller lo decide una sola vez.
 */
export function combinarVeredictos(
  ...veredictos: Array<AptitudTorneo | null | undefined>
): AptitudTorneo {
  const presentes = veredictos.filter((v): v is AptitudTorneo => v != null)
  const bloquea = presentes.find((v) => !v.apta)
  if (bloquea) return bloquea
  const conAviso = presentes.find((v) => v.advertencia)
  return conAviso ?? APTA
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
): CandidatosDelMotor {
  const par = cancha.par_total
  const enEscala = (rating: number | null | undefined): number | null | undefined => {
    if (rating == null) return rating
    if (holes !== 9 || par == null) return rating
    const { courseRating, escala } = resolverRatingEnEscalaDe9(rating, par)
    // Un rating IMPOSIBLE se juzga CRUDO. Normalizarlo devuelve el par (así el
    // término `(CR − par)` se anula en la fórmula, que es lo correcto para el
    // motor), pero eso le deja delta 0 y el gate vería SANO justo el dato que
    // tiene que bloquear — C.G. Río Blanco, 55 contra par 35.
    //
    // Uno RECUPERADO (`era_de_18`) sí se juzga normalizado: no es un dato que
    // mienta, es el mismo rating bien escalado, y con él el motor produce el
    // handicap correcto. Bloquear esas canchas sería un falso positivo.
    return escala === 'imposible' ? rating : courseRating
  }

  // El eslabón terminal está VIVO sólo si el motor lo puede usar, y los dos
  // motores exigen `course_rating && slope_rating` juntos. Con el slope en
  // null ese escalón no existe y el jugador cae directo al camino seguro.
  // `undefined` = el caller no pidió la columna; se asume presente (el SELECT
  // canónico `COLUMNAS_APTITUD_COURSES` sí la pide).
  const terminalVivo = cancha.slope_rating !== null

  return {
    tees: (cancha.tees ?? []).map((t) =>
      holes === 9 ? (t.front_course_rating ?? enEscala(t.rating)) : t.rating,
    ),
    terminal: terminalVivo ? enEscala(cancha.course_rating) : null,
  }
}

/**
 * Los ratings candidatos SEPARADOS por eslabón, porque el motor no elige entre
 * ellos: a cada jugador lo ata a SU tee (`resolvePlayerTee`) y sólo tiene un
 * escalón debajo, el rating a nivel de cancha.
 */
interface CandidatosDelMotor {
  /** Un rating por tee. Cada uno lo usan sólo los jugadores de ESE tee. */
  tees: Array<number | null | undefined>
  /** El último eslabón: `courses.course_rating`. Lo comparten todos. */
  terminal: number | null | undefined
}

/**
 * Veredicto a partir de los ratings candidatos, ya en la escala de `holes`.
 * Compartido por la cancha simple y por la combinación de recorridos.
 */
function veredictoDeRatings(
  candidatos: CandidatosDelMotor,
  par: number | null,
  holes: number,
): AptitudTorneo {
  const evaluar = (courseRating: number | null | undefined) =>
    evaluarRating({ courseRating, par, holes })

  const tees = candidatos.tees
    .map(evaluar)
    .filter((v) => v.motivo !== 'sin_rating' && v.motivo !== 'sin_par')
  const terminal = evaluar(candidatos.terminal)
  const teesRotos = tees.filter((v) => v.esIncoherente).length

  const noApta: AptitudTorneo = {
    apta: false,
    motivo: 'rating_incoherente',
    mensaje: holes === 9 ? MENSAJE_SIN_RATING_9H : MENSAJE_RATING_MAL_CARGADO,
    advertencia: null,
  }

  // Sin ningún rating comparable no hay nada que desmentir: la cancha degrada
  // de forma predecible (todos reciben su índice) y se deja pasar.
  if (tees.length === 0 && !terminal.esCreible && !terminal.esIncoherente) return APTA

  // El eslabón terminal MIENTE. Bloquea siempre, tenga o no un tee sano arriba,
  // porque no se puede garantizar que un jugador llegue a un tee: `resolvePlayerTee`
  // devuelve null si el tee del torneo no matchea EXACTO el nombre en `course_tees`,
  // y hoy en producción 15 de 27 torneos con cancha están en esa situación (y los
  // 95 jugadores tienen `tee_id` nulo). Ahí el terminal es el único eslabón que
  // corre. Si además algunos sí resuelven tee, conviven dos handicaps distintos
  // en el mismo torneo neto. Medido contra el catálogo: esta regla no bloquea
  // NINGUNA cancha activa hoy — el rating de cancha que miente siempre viene
  // acompañado de tees que también mienten.
  if (terminal.esIncoherente) return noApta

  // Con el último eslabón sano, un tee roto no deja a nadie sin cancha: esos
  // jugadores caen al rating general y siguen puntuando con WHS. Pierden
  // precisión de tee, así que se avisa, pero no se bloquea el club entero.
  if (terminal.esCreible) {
    return teesRotos === 0 ? APTA : { ...APTA, advertencia: ADVERTENCIA_TEE_ROTO }
  }

  // Queda el caso "no hay rating de cancha" (o su slope está en null) con algún
  // tee roto. Los jugadores de ESE tee caen al camino seguro. Si algún otro tee
  // es creíble conviven dos handicaps; si ninguno lo es, todos quedan planos
  // sobre una cancha cuyo club SÍ publicó números. Las dos cosas se bloquean.
  return teesRotos > 0 ? noApta : APTA
}

/**
 * ¿Se puede armar un torneo con handicap en esta cancha, jugando `holeCount`?
 *
 * La cancha se juzga sobre UNA vuelta, que es la escala en la que el club
 * publica sus números. Si la ronda da dos vueltas (cancha de 9 en un torneo de
 * 18), el motor suma el Course Rating y el par de las dos: el delta `(CR − par)`
 * se duplica y la tolerancia también (±5 a 9 hoyos, ±10 a 18), así que el
 * veredicto es idéntico. Juzgar la vuelta y no la ronda evita el falso bloqueo
 * que tenía este gate hasta el 1-ago-2026, cuando una cancha de 9 SANA quedaba
 * fuera de cualquier torneo de 18.
 */
export function evaluarAptitudTorneo(
  cancha: CanchaParaAptitud,
  holeCount: number,
): AptitudTorneo {
  // Misma lectura de escala que el motor: los hoyos de UNA vuelta, topeados por
  // los que se juegan (media cancha de 18 = 9).
  const holes: 9 | 18 = holeCount <= 9 || esCanchaDe9Hoyos(cancha.par_total) ? 9 : 18
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
 *
 * No recibe los hoyos de la RONDA a propósito: si el jugador da dos vueltas al
 * mismo loop, el motor multiplica el Course Rating y el par por igual, así que
 * el delta y la tolerancia se duplican los dos y el veredicto no cambia. Lo que
 * se juzga es la escala en la que el club publicó el dato: la de los loops.
 */
export function evaluarAptitudRecorridos(loops: CanchaParaAptitud[]): AptitudTorneo {
  if (loops.length === 0) return APTA

  const holes: 9 | 18 = loops.length === 1 ? 9 : 18
  const mensaje = holes === 9 ? MENSAJE_SIN_RATING_9H : MENSAJE_RATING_MAL_CARGADO

  // 1. Cada recorrido contra su PROPIO par, a 9 hoyos. Cubre las dos ramas del
  //    motor de una sola vez: la que suma los `course_rating` de los hijos y la
  //    que se cae al lookup por tee sobre esos mismos hijos
  //    (`resolverCourseData` paso 0). Sin esto, un loop sin `course_rating`
  //    pero con el tee roto pasaba: exactamente el mismo agujero que el gate
  //    tenía con la cancha padre, un nivel más abajo.
  for (const loop of loops) {
    const v = evaluarAptitudTorneo(loop, 9)
    if (!v.apta) return { apta: false, motivo: 'rating_incoherente', mensaje, advertencia: null }
  }

  // 2. La suma que arma el motor cuando TODOS los hijos tienen rating y slope
  //    (`children.every(c => c.course_rating && c.slope_rating)` — misma
  //    truthiness, a propósito: un rating 0 manda al motor a la rama de tees).
  //    El error de escala se propaga a la suma y hay que verlo ahí también.
  if (!loops.every((l) => l.course_rating && l.slope_rating)) return APTA

  const parSum = loops.reduce((s, l) => s + (l.par_total ?? 36), 0)
  // Cada loop se normaliza contra SU par antes de sumar, exactamente como el
  // paso 0 de `resolverCourseData`. Sumarlos crudos era mirar un número que el
  // motor no calcula: daba 216 contra par 108 y bloqueaba los tres clubes de 27
  // por un error de escala que el motor ya sabe deshacer.
  //
  // Un loop IMPOSIBLE entra CRUDO, misma razón que en `ratingsQueUsariaElMotor`:
  // normalizado devuelve el par y la suma cerraría perfecto contra `parSum`,
  // tapando justo el dato que hay que bloquear. No alcanza con confiar en el
  // paso 1 — un loop sin `par_total` sale de ahí como "sin par", sin veredicto.
  const crSum = loops.reduce((s, l) => {
    if (l.course_rating == null) return s
    const { courseRating, escala } = resolverRatingEnEscalaDe9(l.course_rating, l.par_total ?? 36)
    return s + (escala === 'imposible' ? l.course_rating : courseRating)
  }, 0)

  // Los hoyos que cubre la SELECCIÓN, no un 18 fijo. `toleranciaRating` escala
  // por encima de 18 (27 hoyos → ±15) y el motor la usa así: validar la suma de
  // tres loops contra la tolerancia de 18 es MÁS estricto que el motor y
  // bloquearía un club de 27 entero por deltas legítimos que el motor acepta.
  // Tres loops con el máximo real medido (−3.9, Marbella) suman −11.7: pasan la
  // de 27 y no la de 18.
  //
  // Se derivan del par de cada loop y no de un `× 9` fijo, EXACTAMENTE como el
  // motor (`hoyosDeLosLoops` en el paso 0). Hoy los 9 hijos del catálogo son de
  // 9 hoyos y los dos cálculos coinciden; con un hijo de 18 divergirían, y el
  // gate volvería a leer la escala distinto que el motor.
  const hoyosDeLaSeleccion = loops.reduce((s, l) => s + hoyosDeUnaVuelta(l.par_total ?? 36), 0)

  // ⚠️ El motor prefiere el par de la RONDA (`parTotal ?? parSum`), derivado de
  // `course_holes`. Acá sólo tenemos `courses.par_total`. Coinciden mientras
  // las dos tablas estén sincronizadas; si se desincronizan, el canario del
  // catálogo es el que lo tiene que gritar.
  return veredictoDeRatings({ tees: [], terminal: crSum }, parSum, hoyosDeLaSeleccion)
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
