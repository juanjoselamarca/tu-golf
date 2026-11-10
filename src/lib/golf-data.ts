// ─────────────────────────────────────────────────────────
// Shared golf data, types and helpers
// Used by leaderboard and public torneo pages
// ─────────────────────────────────────────────────────────

/** TPC Sawgrass par per hole – total par 72 */
export const PAR = [4, 5, 3, 4, 3, 4, 4, 3, 5, 4, 5, 4, 3, 5, 4, 5, 3, 4]
export const FRONT_PAR = 35
export const BACK_PAR  = 37

export const FLAG: Record<string, string> = {
  CL: '🇨🇱', AR: '🇦🇷', CO: '🇨🇴', PE: '🇵🇪', UY: '🇺🇾',
}

// ── Types ──────────────────────────────────────────────────
export type Status     = 'F' | 'live'
export type HoleResult = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double'
export type Category   = 'General' | 'Categoría A' | 'Categoría B'

/** Un `Player` tal como sale del motor: el handicap siempre está (nunca oculto).
 *  Lo oculta, si corresponde, la capa que arma la respuesta para el visor. */
export type PlayerConHandicap = Player & { hcp: number; hcpDisplay?: number }

export interface Player {
  pos:     number
  /** ID del jugador en su tabla de origen. Presente cuando el ranking viene
   *  del motor (`rankEntries`); ausente en los datos mock de abajo. */
  id?:     string
  name:    string
  country: string
  cat:     string
  /**
   * Course handicap de scoring. `null` = OCULTO a este visor: el board público no
   * le muestra a un espectador sin sesión el handicap de un jugador con cuenta,
   * porque de ahí se deduce su índice (decisión de producto 08-oct-2026). El
   * puntaje ya viene calculado con el handicap real; la UI no lo recalcula.
   * Ver `filaPublica` (src/lib/data/tournaments/vista-publica.ts).
   */
  hcp:     number | null
  /** Course handicap COMPLETO (18h) para la columna HCP. En 18h == hcp; en 9h
   *  es el completo (no la mitad). Opcional: si falta, la UI cae a `hcp`.
   *  `null` = oculto (mismo criterio que `hcp`). */
  hcpDisplay?: number | null
  today:   number
  total:   number
  holes:   number
  /** Golpes brutos acumulados. Lo emite el motor; la UI que muestre la columna
   *  BRUTO debe leer esto y no re-sumar `scores`. */
  grossTotal?: number
  /** Golpes netos acumulados (bruto − golpes recibidos, SI normalizado). */
  netTotal?: number
  /** Puntos stableford acumulados. */
  stablefordTotal?: number
  status:  Status
  /** 18 entries; null = hole not yet played */
  scores:  (number | null)[]
  /** `round_number` de la ronda de `scores` (multi-ronda: la última jugada).
   *  La UI elige los hoyos/par de ESA ronda para pintar la tarjeta. */
  latestRound?: number
  /**
   * Con quién empata este jugador según el criterio de golf del ranking: dos
   * filas con la misma clave están empatadas ("T2"), con claves distintas no.
   * La emite el motor (`rankEntries`): mismo score y, si el countback ya separó
   * a los empatados, distinto subgrupo. `null` = no compite todavía (0 hoyos):
   * sin posición. La UI la pasa a `etiquetasDePosicion` (src/golf/core/posiciones.ts).
   */
  claveEmpate: string | null
}

// ── Helpers ────────────────────────────────────────────────
export function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export function formatScore(n: number): string {
  if (n < 0) return `${n}`
  if (n > 0) return `+${n}`
  return 'E'
}

export function scoreColor(n: number): string {
  if (n <= -2) return '#c8a55a'
  if (n < 0) return '#16a34a'
  if (n > 0) return '#dc2626'
  return '#edeae4'
}

export function holeResult(score: number, par: number): HoleResult {
  const d = score - par
  if (d <= -2) return 'eagle'
  if (d === -1) return 'birdie'
  if (d ===  0) return 'par'
  if (d ===  1) return 'bogey'
  return 'double'
}

export const HOLE_STYLE: Record<HoleResult, { border: string; background: string }> = {
  eagle:  { border: '2px solid #c8a55a', background: 'rgba(200,165,90,0.16)'  },
  birdie: { border: '2px solid #16a34a', background: 'rgba(22,163,74,0.12)'  },
  par:    { border: '1px solid rgba(255,255,255,0.09)', background: 'transparent' },
  bogey:  { border: '2px solid #dc2626', background: 'rgba(220,38,38,0.08)'  },
  double: { border: '2px solid #7f1d1d', background: 'rgba(127,29,29,0.15)'  },
}
