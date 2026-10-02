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
 * ¿Esta tarjeta entra al historial de quien está finalizando? Sólo si es SUYA.
 * FUENTE ÚNICA para los dos finalizadores (individual y grupo).
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
