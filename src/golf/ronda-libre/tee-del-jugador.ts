/**
 * src/golf/ronda-libre/tee-del-jugador.ts
 *
 * FUENTE ÚNICA de "¿desde qué tee juega este jugador?" en una ronda libre:
 * el tee propio si lo eligió, si no el de la ronda, si no azul; siempre en
 * minúsculas (así se busca en `course_tees` y se guarda en `tee_color`).
 *
 * Existe porque la expresión `(j.tees || ronda.tees || 'azul').toLowerCase()`
 * estaba copiada en los dos scorers, la vista en vivo y el board; el
 * finalizador individual además guardaba el tee sin normalizar.
 */

export const TEE_POR_DEFECTO = 'azul'

export function teeDelJugador(
  jugador: { tees?: string | null } | null | undefined,
  ronda: { tees?: string | null } | null | undefined,
): string {
  return (jugador?.tees || ronda?.tees || TEE_POR_DEFECTO).toLowerCase()
}
