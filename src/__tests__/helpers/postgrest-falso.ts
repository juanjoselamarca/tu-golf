/**
 * Cliente de Supabase falso para probar lecturas que separan «no pude leer» de «no hay dato»: por tabla, una cola de
 * respuestas `{ data, error }` como las devuelve `postgrest-js` (la última se repite). Cuenta lecturas por tabla.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type RespuestaFalsa = { data: unknown; error: { message: string; code: string } | null }

export const ok = (data: unknown): RespuestaFalsa => ({ data, error: null })
/** Así devuelve `postgrest-js` 2.116 un fetch caído: no lanza, `code` vacío y `status` 0. */
export const SIN_RED: RespuestaFalsa = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }
/** La base saturada (04-oct-2026): statement timeout, con `code`. */
export const BASE_LENTA: RespuestaFalsa = {
  data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' },
}
export const SIN_PERMISO: RespuestaFalsa = {
  data: null, error: { message: 'permission denied for table courses', code: '42501' },
}

function consulta(r: RespuestaFalsa) {
  const q: Record<string, unknown> = {
    select: () => q, eq: () => q, in: () => q, ilike: () => q, order: () => q, limit: () => q,
    maybeSingle: () => Promise.resolve(r),
    then: (f: (v: RespuestaFalsa) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(r).then(f, rej),
  }
  return q
}

export type ClienteFalso = SupabaseClient & { lecturas: Record<string, number> }

export function clienteFalso(tablas: Record<string, RespuestaFalsa[]>): ClienteFalso {
  const lecturas: Record<string, number> = {}
  return {
    lecturas,
    from(tabla: string) {
      const cola = tablas[tabla] ?? [ok(null)]
      const n = lecturas[tabla] ?? 0
      lecturas[tabla] = n + 1
      return consulta(cola[Math.min(n, cola.length - 1)])
    },
  } as unknown as ClienteFalso
}
