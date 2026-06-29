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

export interface Player {
  pos:     number
  name:    string
  country: string
  cat:     string
  hcp:     number
  /** Course handicap COMPLETO (18h) para la columna HCP. En 18h == hcp; en 9h
   *  es el completo (no la mitad). Opcional: si falta, la UI cae a `hcp`. */
  hcpDisplay?: number
  today:   number
  total:   number
  holes:   number
  status:  Status
  /** 18 entries; null = hole not yet played */
  scores:  (number | null)[]
}

// ── Mock data (verified scores) ────────────────────────────
export const PLAYERS: Player[] = [
  {
    pos: 1, name: 'Carlos Méndez',   country: 'CL', cat: 'Cat. A', hcp: 2, today: -8, total: -8,
    holes: 18, status: 'F',
    scores: [3,5,3,3,2,4,3,3,5, 4,4,4,3,4,3,5,2,4],   // 31+33=64 (-8)
  },
  {
    pos: 2, name: 'Roberto Silva',   country: 'AR', cat: 'Cat. A', hcp: 4, today: -5, total: -5,
    holes: 18, status: 'F',
    scores: [3,5,3,4,2,4,4,3,5, 4,4,4,3,4,4,4,3,4],   // 33+34=67 (-5)
  },
  {
    pos: 3, name: 'Andrés Torres',   country: 'CO', cat: 'Cat. A', hcp: 1, today: -3, total: -3,
    holes: 18, status: 'F',
    scores: [3,5,3,4,3,4,4,3,5, 4,5,4,2,5,4,4,3,4],   // 34+35=69 (-3)
  },
  {
    pos: 4, name: 'Felipe García',   country: 'CL', cat: 'Cat. B', hcp: 6, today: -2, total: -2,
    holes: 18, status: 'F',
    scores: [4,5,3,3,3,4,4,3,5, 4,5,4,3,5,3,4,3,5],   // 34+36=70 (-2)
  },
  {
    pos: 5, name: 'Miguel Ríos',     country: 'PE', cat: 'Cat. A', hcp: 3, today: -1, total: -1,
    holes: 14, status: 'live',
    scores: [4,5,3,3,3,4,4,3,5, 4,5,4,3,5, null,null,null,null],
  },
  {
    pos: 6, name: 'Sebastián López', country: 'UY', cat: 'Cat. B', hcp: 5, today:  0, total:  0,
    holes: 12, status: 'live',
    scores: [4,5,3,4,3,4,4,3,5, 4,5,4, null,null,null,null,null,null],
  },
  {
    pos: 7, name: 'Diego Vargas',    country: 'CL', cat: 'Cat. B', hcp: 7, today:  2, total:  2,
    holes: 18, status: 'F',
    scores: [5,5,3,4,3,4,4,4,5, 4,5,4,3,5,4,5,3,4],   // 37+37=74 (+2)
  },
  {
    pos: 8, name: 'Martín Pérez',    country: 'AR', cat: 'Cat. B', hcp: 8, today:  4, total:  4,
    holes: 16, status: 'live',
    scores: [4,5,3,4,3,4,5,3,5, 4,6,4,3,6,4,6, null,null],
  },
  {
    pos: 9, name: 'Alejandro Cruz',  country: 'CO', cat: 'Cat. A', hcp: 9, today:  6, total:  6,
    holes: 18, status: 'F',
    scores: [4,6,3,5,3,5,4,3,6, 4,5,4,3,5,4,5,4,5],   // 39+39=78 (+6)
  },
  {
    pos: 10, name: 'Patricio Vega',  country: 'CL', cat: 'Cat. B', hcp: 10, today: 8, total:  8,
    holes: 18, status: 'F',
    scores: [5,6,4,5,3,4,4,4,5, 4,5,4,3,5,4,5,4,6],   // 40+40=80 (+8)
  },
]

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
