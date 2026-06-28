// src/golf/coach/hole-pars.ts
// Resolución de pares por hoyo de una ronda. Fuente de verdad para el vs-par que
// el coach usa al identificar patrones (auditoría 2026-06-27, H-05/H-06).
//
// PRINCIPIO: el `par_per_hole` de la ronda viene del scorecard que el jugador
// importó (Garmin) = lo que REALMENTE jugó. El catálogo (`course_holes`) es una
// fuente aparte y hoy está sucio (canchas Damas/Varones duplicadas y mal
// etiquetadas). Para el vs-par del jugador, su propia tarjeta manda. Por eso
// preferimos `par_per_hole` y caemos al catálogo solo por los hoyos que falten.

/** Normaliza `par_per_hole` (array [n,…] con índice 0 = hoyo 1, u objeto
 *  {"1":n,…}) a un Record<numeroDeHoyo, par>. Ignora valores no-numéricos o <=0. */
export function normalizeParPerHole(p: unknown): Record<number, number> {
  const out: Record<number, number> = {}
  if (Array.isArray(p)) {
    p.forEach((v, i) => {
      if (typeof v === 'number' && v > 0) out[i + 1] = v
    })
  } else if (p && typeof p === 'object') {
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      const n = Number(k)
      if (Number.isInteger(n) && n > 0 && typeof v === 'number' && v > 0) out[n] = v
    }
  }
  return out
}

/** Pares por hoyo de una ronda, combinando ambas fuentes con prioridad a la ronda.
 *  Devuelve null si no hay pares por ninguna fuente. */
export function resolveRoundPars(
  parPerHole: unknown,
  catalogPars: Record<number, number> | null,
): Record<number, number> | null {
  const own = normalizeParPerHole(parPerHole)
  const hasOwn = Object.keys(own).length > 0
  const hasCatalog = !!catalogPars && Object.keys(catalogPars).length > 0
  if (!hasOwn && !hasCatalog) return null
  // El catálogo rellena los huecos; el par_per_hole de la ronda pisa al catálogo.
  return { ...(catalogPars ?? {}), ...own }
}
