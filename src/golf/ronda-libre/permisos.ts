/**
 * src/golf/ronda-libre/permisos.ts
 *
 * Quién puede hacer qué en una ronda libre, para que la UI no ofrezca lo que
 * el servidor va a rechazar.
 *
 * ESPEJO PARCIAL de `descartar_ronda_libre` (migración 20260929b), que rechaza
 * con P0003 si la ronda es demo, si no hay sesión o si quien llama no es
 * `creador_id` (esas tres reglas se replican acá; si cambian allá, cambian acá).
 * El RPC además rechaza rondas ligadas a un torneo y rondas con datos asociados:
 * eso NO se replica (requiere consultar otras tablas), así que al creador se le
 * puede ofrecer "Descartar" y el servidor responder con un mensaje claro.
 */

export function puedeDescartarRonda(
  ronda: { creador_id?: string | null; es_demo?: boolean | null } | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!ronda || !userId) return false
  if (ronda.es_demo) return false
  return ronda.creador_id === userId
}

/**
 * ¿Este usuario lleva el score del grupo (scorer de grupo en modo admin)? FUENTE ÚNICA de las redirecciones entre
 * `/score`, `/score-grupo` y la ronda en vivo, y de la barra del admin. Si cada pantalla usara su versión (antes
 * `/score` miraba `admin_user_id ?? creador_id` y `/score-grupo` exigía `admin_mode`) una ronda sin modo admin
 * rebotaba entre las dos. En una Timba, quien no anota va a la ronda en vivo.
 */
export function anotaLaRonda(
  ronda: { admin_mode?: boolean | null; admin_user_id?: string | null } | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!ronda || !userId) return false
  return !!ronda.admin_mode && ronda.admin_user_id === userId
}

/**
 * ¿Esta tarjeta es de quien la mira/finaliza? FUENTE ÚNICA de "es mi tarjeta":
 * - los dos finalizadores (individual y grupo): entra al historial sólo si es SUYA;
 * - la máscara por visor del GWI (`filasDelVisorGWI` en `@/golf/stats/gwi`), que
 *   la usa también con los inscritos de un torneo (`players.user_id`).
 *
 * - Tarjeta de otra cuenta: no sin su confirmación (decisión de producto 01-oct-2026);
 *   esa persona la guarda desde la ronda terminada con "Guardar en mi historial".
 *   Además la RLS own_rounds rechazaría el insert (42501) en cada intento.
 * - Tarjeta de un invitado sin cuenta: no es de nadie con historial; antes el
 *   individual la guardaba en el historial de QUIEN ANOTABA y movía su índice.
 */
export function esMiTarjeta<T extends { user_id?: string | null }>(
  jugador: T | null | undefined,
  authUserId: string | null | undefined,
): jugador is T & { user_id: string } {
  return !!authUserId && !!jugador?.user_id && jugador.user_id === authUserId
}

/**
 * Lo que los predicados de índice necesitan de una fila de `ronda_libre_jugadores`.
 * `handicap_de_inscripcion` es OBLIGATORIO en el tipo (aunque admita null): así tsc
 * obliga a cada consumidor a seleccionar la columna. Un select que la omita haría que
 * una fila de torneo pareciera de ronda libre y su hándicap viajara a un visor sin
 * sesión. Nunca castear para saltarse esto.
 */
export interface FilaIndice {
  user_id?: string | null
  handicap?: number | null
  /** `true` = el `handicap` de la fila lo gobierna la inscripción del torneo (`filaDeHandicapDeTorneo`). */
  handicap_de_inscripcion: boolean | null
}

/**
 * FUENTE — ¿el índice de este jugador se lee de su PERFIL y no de la tarjeta?
 * Jugador con cuenta, sin `handicap` en la tarjeta y cuya fila NO la gobierna la
 * inscripción de un torneo. Una fila de torneo sin hándicap inscrito (WHS sin índice)
 * no cae al perfil: juega con índice 0, como en el board del torneo (que lo puntúa con
 * `handicap_at_registration ?? 0`). La tarjeta lo MUESTRA "S/Ind"; el board individual
 * del torneo todavía muestra "0" en la columna de índice
 * (`torneo/[slug]/en-vivo/formats/IndividualLeaderboard.tsx`) y, en la de hándicap de
 * juego, el CH de un índice 0, que según rating/slope/par puede ser "2" o "-1"
 * (pendiente: issue #804, llevar la señal de sin índice al board).
 * Decide de dónde se lee el índice (`profiles.indice`, que un anónimo no puede leer
 * por RLS: el board lo lee con el cliente de servicio, `indicesDePerfil`).
 * Lo que se le MUESTRA a un visor sin sesión es otra pregunta: `handicapOcultoSinSesion`.
 */
export function indiceVieneDelPerfil(jugador: FilaIndice): boolean {
  return !!jugador.user_id && jugador.handicap == null && !jugador.handicap_de_inscripcion
}

/**
 * PRIVACIDAD — ¿el hándicap de este jugador se le OCULTA a un visor sin sesión?
 * Jugador con cuenta cuyo número sale de su perfil o de su inscripción en un torneo
 * (que es su índice de FedeGolf/perfil): de cualquiera de los dos se deduce el índice
 * (decisión de producto 08-oct-2026). Un invitado sin cuenta, y el creador de una ronda
 * libre que tipeó su propio índice en la tarjeta (`user_id` + `handicap`, marca en
 * false), se siguen mostrando.
 */
export function handicapOcultoSinSesion(jugador: FilaIndice): boolean {
  return !!jugador.user_id && (jugador.handicap == null || !!jugador.handicap_de_inscripcion)
}

/**
 * El neto de la ronda NO se puede calcular en este teléfono (#511): ronda neto, sin
 * sesión y con algún jugador cuyo hándicap no viaja a un visor sin sesión
 * (`handicapOcultoSinSesion`): o vive en su perfil (`profiles` sólo es legible con
 * sesión) o lo gobierna la inscripción del torneo (la respuesta pública lo anula,
 * `datosRondaLibrePublicos`). Sin él ese jugador quedaría con índice 0 y su neto (o el
 * match) se puntuaría como gross. En ese caso el scorer muestra la clasificación bruta
 * (`vistaPublica`) y pide iniciar sesión para ver el neto.
 */
export function netoNoDisponibleSinSesion(
  ronda: { modo_juego?: string | null; ronda_libre_jugadores: ReadonlyArray<FilaIndice> },
  conSesion: boolean,
): boolean {
  return !conSesion && ronda.modo_juego === 'neto' && ronda.ronda_libre_jugadores.some(handicapOcultoSinSesion)
}
