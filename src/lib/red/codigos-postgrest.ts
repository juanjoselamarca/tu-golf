/**
 * FUENTE ÚNICA de cómo se lee el `code` de un error de PostgREST/Postgres para decidir si releer.
 *
 * - **Transitorio** (`esCodigoTransitorio`): la base está lenta, saturada o reiniciándose. Releer puede arreglarlo.
 *   Es el caso del 04-oct-2026: con la base cargada las lecturas volvían con `57014` (statement timeout) o
 *   `PGRST003` (no hubo conexión del pool a tiempo).
 * - **Fila inexistente** (`esFilaInexistente`): `.single()` sin fila. La única respuesta que confirma «no existe».
 * - El resto (`42501` permisos, `42703` columna, `PGRST1xx` petición mal armada, `22P02` dato inválido…) es
 *   permanente: releer repite la falla.
 *
 * Un error SIN `code` es de señal, no de la base: `postgrest-js` 2.116 lo devuelve así cuando el fetch se cae o se
 * aborta (`code: ''`, `status: 0`) y cuando el gateway contesta 502/520/522 con cuerpo HTML (`processResponse`:
 * `JSON.parse` falla → `error = { message: body }`, sin `code`, con el `status` HTTP). Ese caso lo cubre
 * `LecturaFallidaError.deSenal` (`codigo == null`), no esta lista. El 503 de PostgREST con la caché del esquema sin
 * cargar sí trae cuerpo JSON: `PGRST002`, en la lista.
 */

/** Códigos exactos transitorios. */
const CODIGOS_TRANSITORIOS: ReadonlySet<string> = new Set([
  '57014', // query_canceled: statement timeout (base saturada)
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available
  'PGRST000', // PostgREST no pudo conectarse a la base
  'PGRST001', // error interno de conexión con la base
  'PGRST002', // caché del esquema sin cargar (503, la base reiniciándose)
  'PGRST003', // no hubo conexión libre en el pool a tiempo
])

/** Clases de SQLSTATE transitorias (prefijo). */
const CLASES_TRANSITORIAS: readonly string[] = [
  '08', // connection_exception
  '53', // insufficient_resources (53300 too_many_connections, 53200 out_of_memory…)
  '57P', // operator_intervention (57P01 admin_shutdown, 57P02 crash_shutdown, 57P03 cannot_connect_now)
]

/** ¿El `code` dice que la base no pudo contestar AHORA (releer puede arreglarlo)? */
export function esCodigoTransitorio(codigo: string | null | undefined): boolean {
  if (!codigo) return false
  return CODIGOS_TRANSITORIOS.has(codigo) || CLASES_TRANSITORIAS.some(clase => codigo.startsWith(clase))
}

/** `.single()` sin fila: la única respuesta que confirma que lo pedido no existe. */
export const CODIGO_FILA_INEXISTENTE = 'PGRST116'

export function esFilaInexistente(codigo: string | null | undefined): boolean {
  return codigo === CODIGO_FILA_INEXISTENTE
}
