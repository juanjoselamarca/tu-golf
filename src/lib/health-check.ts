/**
 * Chequeo de salud de la base para `/api/health`.
 *
 * Incidente 02-oct-2026: la base (plan free, instancia Nano de ~0,5 GB) se congeló 4 h. El banner de
 * estado del layout raíz llamaba a `/api/health` cada 60 s POR PESTAÑA, y cada llamada hacía un
 * `count exact` sobre profiles: ~1/3 del tiempo de servidor del día. Por eso:
 * - El resultado se reutiliza `HEALTH_TTL_MS` por instancia (N pestañas → ≤ 1 consulta por minuto).
 * - Una sola consulta en vuelo: si la base está colgada (no caída: colgada, como el 02-oct), las
 *   llamadas concurrentes esperan esa misma consulta en vez de abrir una cada una.
 * - La consulta tiene tope de `HEALTH_QUERY_TIMEOUT_MS`: vencido, cuenta como caída y se cachea.
 */
export const HEALTH_TTL_MS = 60_000
export const HEALTH_QUERY_TIMEOUT_MS = 5_000

export type ResultadoSalud = { ok: boolean; ms: number; cached: boolean }

let cache: { at: number; ok: boolean; ms: number } | null = null
let enVuelo: Promise<ResultadoSalud> | null = null

export async function saludDeLaBase(
  consultar: () => Promise<boolean>,
  ahora: () => number = Date.now,
): Promise<ResultadoSalud> {
  const t = ahora()
  if (cache && t - cache.at < HEALTH_TTL_MS) return { ok: cache.ok, ms: cache.ms, cached: true }
  if (enVuelo) return enVuelo.then(r => ({ ...r, cached: true }))
  enVuelo = (async () => {
    let ok = false
    try { ok = await consultar() } catch { ok = false }
    const ms = ahora() - t
    cache = { at: t, ok, ms }
    return { ok, ms, cached: false }
  })().finally(() => { enVuelo = null })
  return enVuelo
}

/** Solo para tests. */
export function _resetSaludCache() {
  cache = null
  enVuelo = null
}
