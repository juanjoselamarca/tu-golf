/**
 * SQL contra un proyecto Supabase por la Management API (`POST /v1/projects/{ref}/database/query`).
 * No necesita la clave directa de Postgres: basta el access token (SUPABASE_ACCESS_TOKEN).
 *
 * Fuente única para los scripts nuevos que hablan con DOS proyectos (prod y la base de pruebas,
 * scripts/test-db/): por eso recibe el ref explícito en vez de derivarlo de NEXT_PUBLIC_SUPABASE_URL.
 *
 * Comportamiento verificado (08-oct-2026):
 *   - varias sentencias en un mismo `query` corren en UNA transacción implícita: si una falla, nada queda
 *     escrito (el rebuild del esquema de pruebas depende de esto);
 *   - devuelve las filas de la ÚLTIMA sentencia;
 *   - cada llamada abre una sesión nueva (un `set` no sobrevive a la llamada siguiente).
 */
const API = 'https://api.supabase.com/v1'

/** Errores que vale la pena reintentar: la API o la base respondieron "ahora no", no "esto está mal". */
const TRANSITORIO = new Set([408, 425, 429, 500, 502, 503, 504, 544])

export class ErrorSql extends Error {
  constructor(status, cuerpo) {
    super(`HTTP ${status}: ${cuerpo.slice(0, 800)}`)
    this.status = status
  }
}

/**
 * Corre `query` en el proyecto `ref`. Reintenta (con espera creciente) sólo errores transitorios y cortes de red.
 * → filas de la última sentencia (array).
 */
export async function sqlEn(ref, query, { token = process.env.SUPABASE_ACCESS_TOKEN, timeoutMs = 120_000, intentos = 3 } = {}) {
  if (!ref) throw new Error('sqlEn: falta el project ref')
  if (!token) throw new Error('sqlEn: falta SUPABASE_ACCESS_TOKEN')
  let ultimo
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(`${API}/projects/${ref}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
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
