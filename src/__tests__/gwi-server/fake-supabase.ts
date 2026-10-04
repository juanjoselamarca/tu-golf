// Supabase falso para los tests de las rutas del GWI: cada `from(tabla)` resuelve
// con las filas dadas, sea cual sea la cadena de filtros. `.single()` devuelve la
// fila de la tabla; `.maybeSingle()` devuelve null (contexto de hándicap vacío).

type Resultado = { data: unknown; error: null }

export function fakeSupabase(tablas: Record<string, unknown>, userId: string | null) {
  const consultas: string[] = []
  /** Cada método encadenado, con su tabla: `historical_rounds.limit(60)`. */
  const llamadas: Array<{ tabla: string; metodo: string; args: unknown[] }> = []
  const builder = (tabla: string, res: Resultado): unknown => {
    const b: unknown = new Proxy({}, {
      get(_t, k) {
        if (k === 'then') return (ok: (r: Resultado) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, ko)
        if (k === 'single') return async () => res
        if (k === 'maybeSingle') return async () => ({ data: null, error: null })
        return (...args: unknown[]) => { llamadas.push({ tabla, metodo: String(k), args }); return b }
      },
    })
    return b
  }
  return {
    consultas,
    llamadas,
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    from(tabla: string) {
      consultas.push(tabla)
      return builder(tabla, { data: tablas[tabla] ?? null, error: null })
    },
  }
}

/** Valores "huella" de los inputs privados: si aparecen en el JSON, se filtraron. */
export const HUELLAS_PRIVADAS = {
  /** total_gross de las rondas del historial → historicalAvg = 87.3 - 72 = 15.3 */
  totalGross: 87.3,
  historicalAvg: '15.3',
  confianzaPatron: 0.917,
} as const

export const CLAVES_PRIVADAS = /historicalAvg|historicalRoundsCount|courseAvg|courseRoundsCount|patterns|back9Collapse|postBogeySpiral|"inputs"|"valor"|"confianza"|currentScore/
