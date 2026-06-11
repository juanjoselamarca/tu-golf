/**
 * ¿Un torneo está realmente EN VIVO ahora?
 *
 * `status === 'in_progress'/'active'` NO alcanza: un torneo futuro (date_start
 * mañana) o uno olvidado en in_progress hace meses NO está en vivo. Visto en el
 * test de personas (11-jun-2026): un torneo fechado 30-oct-2026 mostraba "EN VIVO".
 *
 * Criterio — FAIL-OPEN para nunca esconder un evento real:
 *  - Debe estar in_progress/active.
 *  - Futuro: si date_start > hoy → no en vivo (no empezó).
 *  - Terminó hace rato: si hoy supera el fin (date_end ?? date_start) por más de
 *    GRACE_DIAS → no en vivo. La gracia es amplia: no esconde un torneo multi-día
 *    real (mientras hoy ≤ date_end sigue vivo) ni uno que el organizador olvidó
 *    cerrar el mismo día.
 *  - Sin date_start (dato viejo/raro): se respeta el status (no se esconde).
 */
export const GRACE_DIAS_TORNEO = 2

export function torneoEnVivo(
  status: string | null | undefined,
  dateStart: string | null | undefined,
  dateEnd: string | null | undefined,
  hoy: Date,
): boolean {
  const enProgreso = status === 'active' || status === 'in_progress'
  if (!enProgreso) return false
  if (!dateStart) return true // sin fecha → respetar status, no esconder un real

  const hoyYmd = ymd(hoy)
  const startYmd = dateStart.slice(0, 10)
  if (startYmd > hoyYmd) return false // futuro: todavía no empezó

  const finYmd = (dateEnd ?? dateStart).slice(0, 10)
  if (diffDias(finYmd, hoyYmd) > GRACE_DIAS_TORNEO) return false // terminó hace rato

  return true
}

/** Fecha local del usuario en YYYY-MM-DD (el badge se ve en hora local). */
function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Días enteros desde `desde` hasta `hasta` (ambos YYYY-MM-DD). Positivo si hasta > desde. */
function diffDias(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hasta}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}
