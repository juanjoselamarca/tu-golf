/**
 * ¿El error de `rpc()` es "esa función no existe"? PostgREST responde `PGRST202` (no la encuentra
 * en su caché de esquema); Postgres directo, `42883` (undefined_function). Entre el deploy y la
 * aprobación de la migración en `migraciones-prod` el código corre sin la función: eso no es una caída,
 * y cada llamador decide su camino de respaldo. Fuente única (antes había una copia por módulo).
 */
export function esFuncionInexistente(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'PGRST202' || code === '42883'
}
