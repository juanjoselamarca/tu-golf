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
 * ¿El índice de este jugador sale de su PERFIL y no de la tarjeta? FUENTE ÚNICA:
 * jugador con cuenta que no fijó `handicap` en su tarjeta (así las inserta
 * `/api/torneos/[slug]/start`). De esto dependen dos cosas:
 * - de dónde se lee el índice (`profiles.indice`, que un anónimo no puede leer
 *   por RLS: el board lo lee con el cliente de servicio, `indicesDePerfil`);
 * - si su handicap se le MUESTRA a un visor sin sesión (no: de ahí se deduce el
 *   índice; decisión de producto 08-oct-2026). Un invitado tipea su índice en la
 *   tarjeta y ése sí se muestra.
 */
export function indiceVieneDelPerfil(
  jugador: { user_id?: string | null; handicap?: number | null },
): boolean {
  return !!jugador.user_id && jugador.handicap == null
}
