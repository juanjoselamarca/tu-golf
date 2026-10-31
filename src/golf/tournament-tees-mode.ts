// src/golf/tournament-tees-mode.ts
//
// `tournaments.tees` NO siempre guarda un nombre de tee.
//
// - Los torneos que crea el wizard guardan ahí el MODO de asignación
//   ('per_player' | 'manual' | 'mixed', ver `deriveTees` en
//   `src/lib/data/tournaments/createTournament.ts`). El tee de cada jugador
//   vive en `players.tee_id`, no en esta columna.
// - Los torneos viejos guardan un color ('blanco', 'azul', 'negras').
//
// Al 30-oct-2026 en prod: 18 torneos con un modo (los recientes, mayo-oct) y
// 27 con un color (los viejos, marzo-sep). O sea: el modo es el caso normal
// de todo lo que se crea hoy.
//
// Quien lea esa columna tiene que distinguir los dos casos ANTES de tratarla
// como un tee. Si no, ofrece "Per_player" como si fuera un color de tee y, al
// elegir un color, pisa el modo del torneo sin avisar.

/** Todo lo que puede aparecer en `tournaments.tees` SIN ser un nombre de tee. */
export const TEES_MODE_KEYS = ['per_player', 'per_category', 'manual', 'mixed'] as const

export type TeesModeKey = (typeof TEES_MODE_KEYS)[number]

/**
 * Los modos que escribe el wizard hoy. `per_category` queda fuera porque
 * `deriveTees` lo manda a 'mixed'; se sigue reconociendo al leer por los
 * torneos históricos.
 */
export type TeesMode = Exclude<TeesModeKey, 'per_category'>

const MODOS = new Set<string>(TEES_MODE_KEYS)

// Van con tipo LITERAL (`as const satisfies`), no `TeesModeKey`: `satisfies` comprueba
// que cada una sea un modo de verdad, y el tipo literal deja que `teesFromAssignmentMode`
// las devuelva como `TeesMode` (que excluye 'per_category'). Tipadas como `TeesModeKey`
// el compilador las trataría como "cualquiera de los cuatro" y no encajarían.
/** El único modo en que el organizador elige el tee de cada jugador a mano. */
export const MODO_TEES_MANUAL = 'manual' as const satisfies TeesModeKey
/** Los otros dos modos que escribe el wizard, para que quien ESCRIBE la columna no use literales. */
export const MODO_TEES_POR_JUGADOR = 'per_player' as const satisfies TeesModeKey
export const MODO_TEES_MIXTO = 'mixed' as const satisfies TeesModeKey

/** ¿El valor de `tournaments.tees` es un modo de asignación y no un tee? */
export function esModoDeTees(tees: string | null | undefined): boolean {
  return typeof tees === 'string' && MODOS.has(tees.trim().toLowerCase())
}

/** Etiqueta en español del modo, para mostrársela al organizador. */
export const ETIQUETA_MODO_DE_TEES: Record<TeesModeKey, string> = {
  per_player: 'por jugador',
  per_category: 'por categoría',
  manual: 'asignación manual',
  mixed: 'mixtos',
}

/**
 * De dónde sale el tee de cada jugador en cada modo, en prosa. Es lo que el
 * organizador necesita saber cuando el torneo no tiene un tee global: sin esto
 * la pantalla decía "cada jugador tiene el suyo" y lo mandaba a asignarlos,
 * aunque en tres de los cuatro modos no haya nada que asignar.
 *
 * Dice lo que el MOTOR hace, no lo que el modo promete. `resolvePlayerTee`
 * (`src/golf/courses/resolve-player-tee.ts`) no conoce el modo: siempre encadena
 * `players.tee_id` → `categories.default_tee_color` → `tournaments.tees`. Y
 * `players.tee_id` lo escribe SOLO el panel del organizador, que únicamente se
 * renderiza en 'manual'. O sea que hoy los otros tres modos resuelven todos por
 * categoría, por distinto que suene su nombre. 'per_player' no tiene todavía
 * ninguna pantalla donde el jugador elija su tee (el wizard igual lo ofrece
 * como "Cada jugador elige su tee según handicap/género"): es el hueco de
 * producto del issue abierto, y hasta que se cierre esta prosa no puede
 * prometerlo.
 *
 * Estas frases valen cuando la cadena resuelve el tee de TODOS los jugadores. Si
 * a alguno le falta, se queda sin eslabón y a ese el hándicap le sale del rating
 * de la cancha: ese caso lo resuelve `origenDelTeeDelTorneo`, que es la función
 * por la que hay que pasar siempre. Leer este mapa directo promete la categoría
 * sin mirar si el jugador tiene una.
 */
export const ORIGEN_DEL_TEE_POR_MODO: Record<TeesModeKey, string> = {
  per_player: 'el tee sale de la categoría de cada jugador',
  per_category: 'el tee sale de la categoría de cada jugador',
  manual: 'el tee de cada jugador se asigna en el panel de jugadores',
  mixed: 'el tee sale de la categoría de cada jugador',
}

/**
 * ¿El organizador asigna los tees A MANO en este torneo?
 *
 * SOLO 'manual'. Es el único modo que abre el asignador por jugador
 * (`TeesAssignmentSection`). En los otros tres ('per_player', 'mixed',
 * 'per_category') el tee lo resuelve `resolvePlayerTee` por la categoría del
 * jugador — nunca por `profiles`, que ese archivo deja afuera a propósito — y si
 * el torneo no tiene categoría con tee, por nada: el hándicap termina saliendo
 * del rating de la cancha. En los tres el panel no muestra ningún control de
 * tees, así que ofrecer "asignarlos en el panel" era mandar al organizador a una
 * pantalla donde no existe lo que le prometimos.
 *
 * El panel de jugadores decide con esta misma función, pero en un OR: también
 * mira `rounds[].tee_assignment_mode` por si alguna ronda trajera el modo
 * (`JugadoresPanel.tsx`). Hoy ninguna lo trae — `tournament_rounds` no guarda
 * esa columna (`src/lib/data/tournaments/rounds.ts`) — así que las dos
 * condiciones coinciden. Si algún día las rondas guardaran un modo por ronda,
 * un torneo con la ronda 1 automática y la 2 manual haría divergir esta prosa
 * del panel: ahí el origen del tee pasa a ser por ronda y esto deja de alcanzar.
 */
export function esModoDeTeesAsignadoAMano(tees: string | null | undefined): boolean {
  return typeof tees === 'string' && tees.trim().toLowerCase() === MODO_TEES_MANUAL
}

/**
 * Lo que pasa cuando el modo resuelve por categoría y NINGUNA categoría del torneo tiene tee (o no
 * hay categorías): la cadena de `resolvePlayerTee` se queda sin eslabón (el último,
 * `tournaments.tees`, guarda el MODO, que no matchea ningún nombre de tee), devuelve `source:'none'` y
 * `compute-player-course-hcp` cae al rating de la CANCHA. Medido en prod el 30-oct-2026: 9 torneos
 * en un modo por categoría están así, y de esos los 6 "en curso" son fixtures `gate-scorer-*` de
 * los gates del propio proyecto; los de usuarios son 2 borradores y 1 abierto, todos con 0 scores.
 * Decirles "el tee sale de la categoría de cada jugador" es prometerles una categoría que no
 * existe, así que se les dice lo que de verdad está pasando.
 */
export const ORIGEN_DEL_TEE_SIN_CATEGORIAS =
  'este torneo no tiene categorías con tee, así que el hándicap sale del rating general de la cancha'

/**
 * No se pudo leer cuántas categorías tienen tee (la consulta falló). No se afirma nada: prometer la
 * categoría sin haberla mirado es el bug que este módulo cierra, y decir "no tiene categorías con
 * tee" sin saberlo es la misma mentira al revés.
 */
export const ORIGEN_DEL_TEE_INDETERMINADO =
  'no pudimos leer las categorías de este torneo, así que no podemos confirmar de dónde sale el tee de cada jugador'

/**
 * Lo que hace falta para saber de dónde sale el tee de cada jugador de este torneo.
 *
 * La unidad es el JUGADOR y no la categoría, porque `resolvePlayerTee` resuelve jugador por
 * jugador: `players.tee_id` -> la `default_tee_color` de SU categoría -> `tournaments.tees`. Contar
 * categorías con tee se veía parecido y mentía dos veces:
 *
 * - `players.category_id` es NULLABLE y el camino está vivo (`enrollPlayer` acepta `categoryId`
 *   null y la route lo declara `.nullable().optional()`). Un torneo con todas sus categorías con
 *   tee y un inscrito SIN categoría tenía "conTee === total", así que la pantalla le prometía la
 *   categoría a ese jugador y le escondía la única salida que existe.
 * - Una categoría sin tee y sin ningún inscrito no le quita el tee a nadie: avisarla como si
 *   hubiera jugadores afectados es un falso positivo.
 *
 * Igual se cuentan las categorías, porque responden otra pregunta que el organizador necesita: qué
 * le va a pasar a quien se inscriba DESPUÉS. Un borrador sin jugadores todavía y sin ninguna
 * categoría con tee está roto para todos los que lleguen, y ahí el conteo de jugadores no dice nada.
 */
export interface TeeDeCadaJugador {
  /**
   * Jugadores del torneo (los que no están retirados ni descalificados) sin tee que la cadena
   * pueda resolver: sin `tee_id` propio y sin categoría con tee, categoría nula incluida.
   * `null` = no se pudo contar.
   */
  jugadoresSinTee: number | null
  /** Jugadores del torneo que cuentan, con tee o sin él. */
  jugadoresTotal: number
  /** Categorías con `default_tee_color`, o `null` si no se pudo contar. */
  categoriasConTee: number | null
  /** Categorías del torneo, con tee o sin él. */
  categoriasTotal: number
}

/**
 * Jugadores YA inscritos a los que la cadena no les resuelve el tee. Es el daño concreto y actual,
 * así que se dice con el número: el organizador puede ir a mirar quiénes son.
 */
export function origenDelTeeConJugadoresSinTee(sinTee: number): string {
  const cuantos = sinTee === 1 ? '1 jugador inscrito no tiene' : `${sinTee} jugadores inscritos no tienen`
  const saca = sinTee === 1 ? 'saca' : 'sacan'
  return `el tee sale de la categoría de cada jugador, pero ${cuantos} tee: ${saca} el hándicap del rating general de la cancha`
}

/**
 * Todos los inscritos de hoy resuelven, pero quedan categorías sin tee: el hueco es para quien se
 * inscriba ahí mañana. Se avisa en futuro a propósito — decirle que hay jugadores sacando el
 * hándicap del rating de la cancha cuando no hay ninguno es el falso positivo que esto evita.
 */
export function origenDelTeeConCategoriasParciales(sinTee: number, total: number): string {
  const verbo = sinTee === 1 ? 'no tiene' : 'no tienen'
  return `el tee sale de la categoría de cada jugador, pero ${sinTee} de las ${total} categorías ${verbo} tee: quien se inscriba ahí sacará el hándicap del rating general de la cancha`
}

/**
 * ¿Hay algún jugador —de hoy o de mañana— al que la cadena no le resuelva el tee? Es la condición
 * para ofrecerle al organizador un tee para todo el torneo: ese tee es el ÚLTIMO eslabón de
 * `resolvePlayerTee`, así que rescata a los que no tienen y no les toca el suyo a los que ya lo
 * tienen. Con algún dato sin leer devuelve false: no se ofrece el arreglo de un problema que no se
 * pudo confirmar, y la prosa dice que no se pudo leer.
 */
export function hayJugadorSinTeeResoluble({
  jugadoresSinTee,
  categoriasConTee,
  categoriasTotal,
}: TeeDeCadaJugador): boolean {
  if (jugadoresSinTee == null || categoriasConTee == null) return false
  return jugadoresSinTee > 0 || categoriasConTee === 0 || categoriasConTee < categoriasTotal
}

/**
 * La prosa del modo, o null si lo guardado es un nombre de tee y no un modo.
 *
 * El dato de los jugadores es OBLIGATORIO a propósito: sin él no se puede afirmar de dónde sale el
 * tee, y la gracia de este módulo es que la pantalla no prometa lo que el motor no hace. Un
 * parámetro con default habría dejado a cualquier caller nuevo prometiendo la categoría sin haberla
 * mirado — que es exactamente cómo nació el bug que esto cierra.
 *
 * El orden de los casos es por cuán concreto es el daño: primero los jugadores que HOY no tienen
 * tee, después el hueco que le espera a quien se inscriba.
 */
export function origenDelTeeDelTorneo(
  tees: string | null | undefined,
  jugadores: TeeDeCadaJugador,
): string | null {
  if (!esModoDeTees(tees)) return null
  const modo = (tees as string).trim().toLowerCase() as TeesModeKey
  // 'manual' no depende de categorías: el tee lo escribe el panel del organizador en `players.tee_id`.
  if (modo === MODO_TEES_MANUAL) return ORIGEN_DEL_TEE_POR_MODO[modo]
  const { jugadoresSinTee, categoriasConTee, categoriasTotal } = jugadores
  if (jugadoresSinTee == null || categoriasConTee == null) return ORIGEN_DEL_TEE_INDETERMINADO
  if (jugadoresSinTee > 0) return origenDelTeeConJugadoresSinTee(jugadoresSinTee)
  if (categoriasConTee === 0) return ORIGEN_DEL_TEE_SIN_CATEGORIAS
  if (categoriasConTee < categoriasTotal) {
    return origenDelTeeConCategoriasParciales(categoriasTotal - categoriasConTee, categoriasTotal)
  }
  return ORIGEN_DEL_TEE_POR_MODO[modo]
}

/**
 * Etiqueta del valor crudo de `tournaments.tees`: el modo traducido, o el
 * valor con mayúscula inicial si es un nombre de tee.
 */
export function etiquetaDeTeesDelTorneo(tees: string): string {
  const k = tees.trim().toLowerCase()
  return ETIQUETA_MODO_DE_TEES[k as TeesModeKey] ?? tees.charAt(0).toUpperCase() + tees.slice(1)
}
