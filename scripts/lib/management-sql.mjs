/**
 * SQL contra un proyecto Supabase por la Management API (`POST /v1/projects/{ref}/database/query`).
 * No necesita la clave directa de Postgres: basta el access token (SUPABASE_ACCESS_TOKEN).
 *
 * Fuente canónica (08-oct-2026) para hablar con la Management API desde scripts. Recibe el ref explícito porque
 * scripts/test-db/ habla con DOS proyectos (prod y la base de pruebas). Duplicados pendientes de migrar a este
 * módulo: docs/REORDENAMIENTO_TRACKING.md.
 *
 * PROD SIEMPRE EN SOLO LECTURA: toda consulta cuyo ref sea prod (PROD_REF o el de NEXT_PUBLIC_SUPABASE_URL) va con
 * `read_only: true`, pida o no `soloLectura`. La API la ejecuta como `supabase_read_only_user` (bypassrls, sin
 * escritura; verificado 08-oct: lee auth.users, storage.buckets, pg_default_acl, pg_policies y todo `public`).
 * Para escribir en prod existe scripts/run-sql.mjs, con su protocolo; este módulo no lo hace.
 *
 * Comportamiento verificado (08-oct-2026):
 *   - varias sentencias en un mismo `query` corren en UNA transacción implícita: si una falla, nada queda
 *     escrito (el rebuild del esquema de pruebas depende de esto);
 *   - devuelve las filas de la ÚLTIMA sentencia;
 *   - cada llamada abre una sesión nueva (un `set` no sobrevive a la llamada siguiente).
 */
import { PROD_REF, projectRefDe } from './supabase-ref.mjs'

const API = 'https://api.supabase.com/v1'

/** Cuerpo máximo que acepta la API antes de responder 413 (medido: 2 MB pasa, ~10 MB no). Margen conservador. */
export const LIMITE_CUERPO_BYTES = 2_000_000

/** Errores que vale la pena reintentar: la API o la base respondieron "ahora no", no "esto está mal". */
const TRANSITORIO = new Set([408, 425, 429, 500, 502, 503, 504, 544])

export class ErrorSql extends Error {
  constructor(status, cuerpo) {
    super(`HTTP ${status}: ${cuerpo.slice(0, 800)}`)
    this.status = status
  }
}

/** ¿Este ref es producción? (constante canónica + el de NEXT_PUBLIC_SUPABASE_URL si apunta a otro lado). */
export function esProd(ref, env = process.env) {
  return ref === PROD_REF || (!!ref && ref === projectRefDe(env.NEXT_PUBLIC_SUPABASE_URL))
}

/** Cuerpo del request: read_only forzado para prod. Exportado para testear la regla sin red. */
export function cuerpoConsulta(ref, query, { soloLectura = false, env = process.env } = {}) {
  const readOnly = soloLectura || esProd(ref, env)
  return JSON.stringify(readOnly ? { query, read_only: true } : { query })
}

/**
 * Corre `query` en el proyecto `ref`. Reintenta (con espera creciente) sólo errores transitorios y cortes de red;
 * `intentos: 1` para escrituras que no deben correr dos veces en paralelo.
 * → filas de la última sentencia (array).
 */
export async function sqlEn(ref, query, { token = process.env.SUPABASE_ACCESS_TOKEN, timeoutMs = 120_000, intentos = 3, soloLectura = false, fetchImpl = fetch } = {}) {
  if (!ref) throw new Error('sqlEn: falta el project ref')
  if (!token) throw new Error('sqlEn: falta SUPABASE_ACCESS_TOKEN')
  const body = cuerpoConsulta(ref, query, { soloLectura })
  if (Buffer.byteLength(body) > LIMITE_CUERPO_BYTES) {
    throw new Error(`sqlEn: el cuerpo pesa ${(Buffer.byteLength(body) / 1024).toFixed(0)} KB y supera el límite de ${LIMITE_CUERPO_BYTES / 1024} KB (HTTP 413): partirlo`)
  }
  let ultimo
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetchImpl(`${API}/projects/${ref}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
      const t = await r.text()
      if (r.ok) return JSON.parse(t)
      ultimo = new ErrorSql(r.status, t)
      if (!TRANSITORIO.has(r.status)) throw ultimo
    } catch (e) {
      if (e instanceof ErrorSql && !TRANSITORIO.has(e.status)) throw e
      ultimo = e
    }
    if (i < intentos) await new Promise(res => setTimeout(res, 3_000 * i))
  }
  throw ultimo
}

/** GET de la Management API (metadatos del proyecto, llaves, etc.). */
export async function apiGet(ruta, { token = process.env.SUPABASE_ACCESS_TOKEN } = {}) {
  const r = await fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })
  const t = await r.text()
  if (!r.ok) throw new ErrorSql(r.status, t)
  return JSON.parse(t)
}

/** Literal SQL seguro para un string. */
export const lit = s => `'${String(s).replace(/'/g, "''")}'`
/** Identificador SQL citado. */
export const qi = s => `"${String(s).replace(/"/g, '""')}"`
