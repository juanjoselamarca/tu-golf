/**
 * src/golf/ronda-libre/permisos.ts
 *
 * Quién puede hacer qué en una ronda libre, para que la UI no ofrezca lo que
 * el servidor va a rechazar.
 *
 * ESPEJO en SQL: `descartar_ronda_libre` (migración 20260929b) rechaza con
 * P0003 si la ronda es demo, si no hay sesión o si quien llama no es
 * `creador_id`. Si cambia allá, cambia acá.
 */

export function puedeDescartarRonda(
  ronda: { creador_id?: string | null; es_demo?: boolean | null } | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!ronda || !userId) return false
  if (ronda.es_demo) return false
  return ronda.creador_id === userId
}
