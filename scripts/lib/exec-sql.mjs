import { conReintentos, ErrorSql } from './management-sql.mjs'

/**
 * Consulta de SOLO LECTURA contra prod vía la función `exec_sql` (PostgREST + service key), sin el token de la
 * Management API. Fuente única para scripts; los canarios usan su par en TS, src/__tests__/helpers/prod-sql.ts.
 *
 * `exec_sql` corre la consulta en una transacción read-only (migración 20261013220000): cualquier escritura o DDL
 * falla en Postgres. Una sola sentencia SELECT/WITH (se envuelve en un subselect) y tope de 8 s por el
 * statement_timeout del rol authenticator de PostgREST. Los cambios van como migración (workflow migraciones-prod).
 * Solo lee, así que reintenta los errores transitorios igual que sqlEn.
 * → las filas (array). Lanza con el error de Postgres si la consulta falla.
 */
export async function execSql(query, { env = process.env, timeoutMs = 120_000, intentos = 3, fetchImpl = fetch } = {}) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('execSql: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (.env.local)')
  const data = await conReintentos(async () => {
    const r = await fetchImpl(new URL('/rest/v1/rpc/exec_sql', url), {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const t = await r.text()
    if (!r.ok) throw new ErrorSql(r.status, t)
    return JSON.parse(t)
  }, intentos)
  if (!Array.isArray(data)) throw new Error(data?.error ?? JSON.stringify(data).slice(0, 800))
  return data
}
