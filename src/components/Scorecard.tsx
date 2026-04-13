'use client'

/**
 * Scorecard v6 — Responsive: mobile stacked, desktop full 18-hole horizontal.
 *
 * Mobile (< 640px): Front 9 y Back 9 apilados verticalmente (como v5)
 * Desktop (>= 640px): Tabla horizontal completa de 18 hoyos + OUT + IN + TOT
 *   como una scorecard impresa real de club de golf.
 *
 * Mejoras sobre v5:
 * - Dots de strokes en dorado (#c4992a) visibles, no gris invisible
 * - Desktop: 21 columnas (9 + OUT + 9 + IN + TOT) en una sola fila
 * - useMediaQuery para detectar breakpoint
 * - Resumen de stats al pie (birdies, pares, bogeys, dobles)
 */

import { memo, useState, useEffect } from 'react'
import ScoreSymbol, { GARMIN_COLORS } from './ScoreSymbol'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'

const MONO = '"DM Mono", ui-monospace, SFMono-Regular, monospace'
const SANS = '"DM Sans", system-ui, -apple-system, sans-serif'

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface ScorecardHole {
  numero: number
  par: number
  stroke_index: number
  yardaje?: number | null
}

export interface ScorecardProps {
  holes: ScorecardHole[]
  scores: Record<string, number>
  courseHandicap: number
  modo: 'gross' | 'neto'
  formato: 'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome'
  playerName?: string
  avatarUrl?: string
  showExtendedInfo?: boolean
}

// ═══════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════

function useIsDesktop(breakpoint = 640): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])
  return isDesktop
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function fmtOu(n: number): string {
  return n === 0 ? 'E' : n > 0 ? `+${n}` : String(n)
}

interface HoleStat {
  hole: ScorecardHole
  score: number | null
  strokes: number
  neto: number | null
  stablefordPts: number | null
  diff: number
}

function buildStats(
  holes: ScorecardHole[], scores: Record<string, number>,
  ch: number, totalH: number, fmt: ScorecardProps['formato']
): HoleStat[] {
  return holes.map(h => {
    const raw = scores[String(h.numero)]
    const score = typeof raw === 'number' && raw > 0 ? raw : null
    const strokes = strokesRecibidosEnHoyo(ch, h.stroke_index, totalH)
    const neto = score != null ? score - strokes : null
    const stablefordPts = score != null && fmt === 'stableford'
      ? puntosStablefordHoyo(score, h.par, ch, h.stroke_index, totalH) : null
    return { hole: h, score, strokes, neto, stablefordPts, diff: score != null ? score - h.par : 0 }
  })
}

interface Totals { gross: number; neto: number; par: number; stab: number }

function sumTotals(stats: HoleStat[]): Totals {
  return stats.reduce<Totals>((a, s) => ({
    gross: a.gross + (s.score ?? 0), neto: a.neto + (s.neto ?? 0),
    par: a.par + s.hole.par, stab: a.stab + (s.stablefordPts ?? 0),
  }), { gross: 0, neto: 0, par: 0, stab: 0 })
}

function countResults(stats: HoleStat[]): { eagles: number; birdies: number; pars: number; bogeys: number; doubles: number } {
  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0
  for (const s of stats) {
    if (s.score == null) continue
    if (s.diff <= -2) eagles++
    else if (s.diff === -1) birdies++
    else if (s.diff === 0) pars++
    else if (s.diff === 1) bogeys++
    else doubles++
  }
  return { eagles, birdies, pars, bogeys, doubles }
}

// ═══════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════

const T = {
  line: '#dfe2e6',
  bgInfo: '#f5f6f8',
  bgScore: '#ffffff',
  textPrimary: '#1a1a2e',
  textSecondary: '#7c8594',
  textMuted: '#a3aab6',
  gold: '#c4992a',
  dotColor: '#c4992a',     // dots de strokes VISIBLES en dorado
  dotSize: 7,              // px del dot
  rowH: 26,
  scoreRowH: 38,
  totalW: 48,
  lineW: 1,
  fontSm: 10,
  fontMd: 11,
  fontScore: 13,
  fontTotal: 14,
  fontHeader: 24,
} as const

// ═══════════════════════════════════════════════════════════
// STROKE DOTS — componente visible
// ═══════════════════════════════════════════════════════════

function StrokeDots({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{
          width: T.dotSize, height: T.dotSize, borderRadius: '50%',
          background: T.dotColor, display: 'inline-block',
        }} />
      ))}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════
// GENERIC ROW (used by both mobile and desktop)
// ═══════════════════════════════════════════════════════════

interface RowProps {
  gridCols: string
  cells: React.ReactNode[]
  bg: string
  height: number
  borderBottom?: boolean
  borderTop?: boolean
}

function Row({ gridCols, cells, bg, height, borderBottom = true, borderTop = false }: RowProps) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: gridCols,
      background: bg, minHeight: height,
      borderBottom: borderBottom ? `${T.lineW}px solid ${T.line}` : 'none',
      borderTop: borderTop ? `${T.lineW}px solid ${T.line}` : 'none',
    }}>
      {cells.map((c, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: MONO, minWidth: 0,
        }}>
          {c}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// TEXT HELPER
// ═══════════════════════════════════════════════════════════

function txt(s: string, size: number, color: string, weight = 400, italic = false): React.ReactNode {
  return <span style={{ fontSize: size, color, fontWeight: weight, fontStyle: italic ? 'italic' : 'normal' }}>{s}</span>
}

// Total cell wrapper (visually distinct)
function totTxt(s: string, size: number, color: string, weight = 400, italic = false): React.ReactNode {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: MONO, borderLeft: `${T.lineW}px solid ${T.line}`,
      background: T.bgInfo, height: '100%', width: '100%',
    }}>
      <span style={{ fontSize: size, color, fontWeight: weight, fontStyle: italic ? 'italic' : 'normal' }}>{s}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MOBILE HALF (front 9 or back 9 — stacked)
// ═══════════════════════════════════════════════════════════

interface HalfProps {
  label: 'OUT' | 'IN'
  stats: HoleStat[]
  totals: Totals
  modo: 'gross' | 'neto'
  formato: ScorecardProps['formato']
  extended: boolean
}

const MobileHalf = memo(function MobileHalf({ label, stats, totals, modo, formato, extended }: HalfProps) {
  const isNeto = modo === 'neto'
  const isStab = formato === 'stableford'
  const cols = `repeat(9, 1fr) ${T.totalW}px`

  const holeCells = [...stats.map(s => txt(String(s.hole.numero), T.fontSm, T.textSecondary, 600)), totTxt(label, T.fontSm, T.textSecondary, 700)]
  const parCells = [...stats.map(s => txt(String(s.hole.par), T.fontMd, T.textSecondary, 500)), totTxt(String(totals.par), T.fontMd, T.textSecondary, 600)]
  const scoreCells = [
    ...stats.map(s => <ScoreSymbol key={s.hole.numero} score={s.score} par={s.hole.par} size="sm" theme="light" />),
    totTxt(totals.gross > 0 ? String(totals.gross) : '', T.fontTotal, T.textPrimary, 700),
  ]
  const dotCells = [...stats.map(s => <StrokeDots key={s.hole.numero} count={s.strokes} />), totTxt('', 0, 'transparent')]
  const netoCells = [...stats.map(s => txt(s.neto != null ? String(s.neto) : '', T.fontMd, T.textSecondary, 500, true)),
    totTxt(totals.neto > 0 ? String(totals.neto) : '', T.fontMd, T.textSecondary, 700, true)]
  const stabCells = [...stats.map(s => txt(s.stablefordPts != null ? String(s.stablefordPts) : '', T.fontMd + 1, T.gold, 700)),
    totTxt(totals.stab > 0 ? String(totals.stab) : '', T.fontTotal, T.gold, 800)]

  return (
    <>
      <Row gridCols={cols} cells={holeCells} bg={T.bgInfo} height={T.rowH} />
      <Row gridCols={cols} cells={parCells} bg={T.bgInfo} height={T.rowH} />
      {extended && (
        <>
          <Row gridCols={cols} cells={[...stats.map(s => txt(s.hole.yardaje ? String(s.hole.yardaje) : '', 9, T.textMuted)), totTxt('', 0, 'transparent')]} bg={T.bgInfo} height={22} />
          <Row gridCols={cols} cells={[...stats.map(s => txt(String(s.hole.stroke_index), 9, T.textMuted)), totTxt('', 0, 'transparent')]} bg={T.bgInfo} height={22} />
        </>
      )}
      <Row gridCols={cols} cells={scoreCells} bg={T.bgScore} height={T.scoreRowH} />
      {isNeto && <Row gridCols={cols} cells={dotCells} bg={T.bgScore} height={20} borderBottom={false} />}
      {isNeto && !isStab && <Row gridCols={cols} cells={netoCells} bg={T.bgInfo} height={T.rowH} borderTop />}
      {isStab && (
        <>
          <Row gridCols={cols} cells={netoCells} bg={T.bgInfo} height={T.rowH} borderTop />
          <Row gridCols={cols} cells={stabCells} bg={T.bgScore} height={T.rowH + 2} />
        </>
      )}
    </>
  )
})

// ═══════════════════════════════════════════════════════════
// DESKTOP TABLE (full 18-hole horizontal)
// ═══════════════════════════════════════════════════════════

interface DesktopTableProps {
  f9: HoleStat[]; b9: HoleStat[]
  f9t: Totals; b9t: Totals; grandT: Totals
  modo: 'gross' | 'neto'
  formato: ScorecardProps['formato']
  extended: boolean
}

const DesktopTable = memo(function DesktopTable({ f9, b9, f9t, b9t, grandT, modo, formato, extended }: DesktopTableProps) {
  const isNeto = modo === 'neto'
  const isStab = formato === 'stableford'

  // 21 columns: 9 holes + OUT + 9 holes + IN + TOT
  const cols = `repeat(9, 1fr) ${T.totalW}px repeat(9, 1fr) ${T.totalW}px ${T.totalW + 4}px`

  function buildRow(
    f9Data: React.ReactNode[], f9Total: React.ReactNode,
    b9Data: React.ReactNode[], b9Total: React.ReactNode,
    grandTotal: React.ReactNode,
    bg: string, height: number, opts?: { borderBottom?: boolean; borderTop?: boolean }
  ) {
    const cells = [...f9Data, f9Total, ...b9Data, b9Total, grandTotal]
    return <Row gridCols={cols} cells={cells} bg={bg} height={height}
                borderBottom={opts?.borderBottom ?? true} borderTop={opts?.borderTop ?? false} />
  }

  const tt = (s: string, sz: number, c: string, w = 400, it = false) => totTxt(s, sz, c, w, it)

  return (
    <>
      {/* Hoyo */}
      {buildRow(
        f9.map(s => txt(String(s.hole.numero), T.fontSm, T.textSecondary, 600)),
        tt('OUT', T.fontSm, T.textSecondary, 700),
        b9.map(s => txt(String(s.hole.numero), T.fontSm, T.textSecondary, 600)),
        tt('IN', T.fontSm, T.textSecondary, 700),
        tt('TOT', T.fontSm, T.textSecondary, 700),
        T.bgInfo, T.rowH
      )}

      {/* Par */}
      {buildRow(
        f9.map(s => txt(String(s.hole.par), T.fontMd, T.textSecondary, 500)),
        tt(String(f9t.par), T.fontMd, T.textSecondary, 600),
        b9.map(s => txt(String(s.hole.par), T.fontMd, T.textSecondary, 500)),
        tt(String(b9t.par), T.fontMd, T.textSecondary, 600),
        tt(String(grandT.par), T.fontMd, T.textSecondary, 700),
        T.bgInfo, T.rowH
      )}

      {/* Extended: yardaje */}
      {extended && buildRow(
        f9.map(s => txt(s.hole.yardaje ? String(s.hole.yardaje) : '', 9, T.textMuted)),
        tt('', 0, 'transparent'),
        b9.map(s => txt(s.hole.yardaje ? String(s.hole.yardaje) : '', 9, T.textMuted)),
        tt('', 0, 'transparent'),
        tt('', 0, 'transparent'),
        T.bgInfo, 22
      )}

      {/* Extended: SI */}
      {extended && buildRow(
        f9.map(s => txt(String(s.hole.stroke_index), 9, T.textMuted)),
        tt('', 0, 'transparent'),
        b9.map(s => txt(String(s.hole.stroke_index), 9, T.textMuted)),
        tt('', 0, 'transparent'),
        tt('', 0, 'transparent'),
        T.bgInfo, 22
      )}

      {/* Score gross */}
      {buildRow(
        f9.map(s => <ScoreSymbol key={s.hole.numero} score={s.score} par={s.hole.par} size="sm" theme="light" />),
        tt(f9t.gross > 0 ? String(f9t.gross) : '', T.fontTotal, T.textPrimary, 700),
        b9.map(s => <ScoreSymbol key={s.hole.numero} score={s.score} par={s.hole.par} size="sm" theme="light" />),
        tt(b9t.gross > 0 ? String(b9t.gross) : '', T.fontTotal, T.textPrimary, 700),
        tt(grandT.gross > 0 ? String(grandT.gross) : '', T.fontTotal + 2, T.textPrimary, 800),
        T.bgScore, T.scoreRowH
      )}

      {/* Strokes dots */}
      {isNeto && buildRow(
        f9.map(s => <StrokeDots key={s.hole.numero} count={s.strokes} />),
        tt('', 0, 'transparent'),
        b9.map(s => <StrokeDots key={s.hole.numero} count={s.strokes} />),
        tt('', 0, 'transparent'),
        tt('', 0, 'transparent'),
        T.bgScore, 20, { borderBottom: false }
      )}

      {/* Neto (stroke play) */}
      {isNeto && !isStab && buildRow(
        f9.map(s => txt(s.neto != null ? String(s.neto) : '', T.fontMd, T.textSecondary, 500, true)),
        tt(f9t.neto > 0 ? String(f9t.neto) : '', T.fontMd, T.textSecondary, 700, true),
        b9.map(s => txt(s.neto != null ? String(s.neto) : '', T.fontMd, T.textSecondary, 500, true)),
        tt(b9t.neto > 0 ? String(b9t.neto) : '', T.fontMd, T.textSecondary, 700, true),
        tt(grandT.neto > 0 ? String(grandT.neto) : '', T.fontMd + 1, T.textSecondary, 800, true),
        T.bgInfo, T.rowH, { borderTop: true }
      )}

      {/* Stableford: neto + puntos */}
      {isStab && (
        <>
          {buildRow(
            f9.map(s => txt(s.neto != null ? String(s.neto) : '', T.fontMd, T.textSecondary, 500, true)),
            tt(f9t.neto > 0 ? String(f9t.neto) : '', T.fontMd, T.textSecondary, 600, true),
            b9.map(s => txt(s.neto != null ? String(s.neto) : '', T.fontMd, T.textSecondary, 500, true)),
            tt(b9t.neto > 0 ? String(b9t.neto) : '', T.fontMd, T.textSecondary, 600, true),
            tt(grandT.neto > 0 ? String(grandT.neto) : '', T.fontMd, T.textSecondary, 700, true),
            T.bgInfo, T.rowH, { borderTop: true }
          )}
          {buildRow(
            f9.map(s => txt(s.stablefordPts != null ? String(s.stablefordPts) : '', T.fontMd + 1, T.gold, 700)),
            tt(f9t.stab > 0 ? String(f9t.stab) : '', T.fontTotal, T.gold, 800),
            b9.map(s => txt(s.stablefordPts != null ? String(s.stablefordPts) : '', T.fontMd + 1, T.gold, 700)),
            tt(b9t.stab > 0 ? String(b9t.stab) : '', T.fontTotal, T.gold, 800),
            tt(grandT.stab > 0 ? String(grandT.stab) : '', T.fontTotal + 2, T.gold, 800),
            T.bgScore, T.rowH + 2
          )}
        </>
      )}
    </>
  )
})

// ═══════════════════════════════════════════════════════════
// STATS SUMMARY
// ═══════════════════════════════════════════════════════════

function StatsSummary({ stats }: { stats: HoleStat[] }) {
  const c = countResults(stats)
  const items: { label: string; count: number; color: string }[] = []
  if (c.eagles > 0) items.push({ label: 'Eagles', count: c.eagles, color: GARMIN_COLORS.eagle })
  if (c.birdies > 0) items.push({ label: 'Birdies', count: c.birdies, color: GARMIN_COLORS.birdie })
  items.push({ label: 'Pares', count: c.pars, color: T.textSecondary })
  if (c.bogeys > 0) items.push({ label: 'Bogeys', count: c.bogeys, color: GARMIN_COLORS.bogey })
  if (c.doubles > 0) items.push({ label: 'Doble+', count: c.doubles, color: GARMIN_COLORS.double })

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap',
      padding: '10px 16px', borderTop: `${T.lineW}px solid ${T.line}`,
      background: T.bgInfo,
    }}>
      {items.map(it => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: it.color, fontFamily: MONO }}>{it.count}</span>
          <span style={{ fontSize: 10, color: T.textSecondary, fontWeight: 500 }}>{it.label}</span>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

export default function Scorecard({
  holes, scores, courseHandicap, modo, formato,
  playerName, avatarUrl, showExtendedInfo = false,
}: ScorecardProps) {
  const isDesktop = useIsDesktop(640)
  const totalH = holes.length
  const isNeto = modo === 'neto'
  const isStab = formato === 'stableford'

  const all = buildStats(holes, scores, courseHandicap, totalH, formato)
  const f9 = all.slice(0, 9)
  const b9 = all.slice(9, 18)
  const hasBack = b9.length > 0

  const f9t = sumTotals(f9)
  const b9t = hasBack ? sumTotals(b9) : null

  const tG = f9t.gross + (b9t?.gross ?? 0)
  const tN = f9t.neto + (b9t?.neto ?? 0)
  const tP = f9t.par + (b9t?.par ?? 0)
  const tS = f9t.stab + (b9t?.stab ?? 0)
  const played = all.filter(s => s.score != null).length

  const grandT: Totals = { gross: tG, neto: tN, par: tP, stab: tS }

  return (
    <div style={{
      background: '#ffffff', borderRadius: 8,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
      overflow: 'hidden', fontFamily: SANS,
    }}>
      {/* ── HEADER ── */}
      {(playerName || played > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', borderBottom: `${T.lineW}px solid ${T.line}`,
        }}>
          {avatarUrl ? (
            <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `1px solid ${T.line}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : playerName ? (
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: T.bgInfo, border: `1px solid ${T.line}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 600, color: T.textSecondary,
            }}>
              {playerName.charAt(0).toUpperCase()}
            </div>
          ) : null}

          <div style={{ flex: 1, minWidth: 0 }}>
            {playerName && (
              <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {playerName}
              </div>
            )}
            {isNeto && courseHandicap !== 0 && (
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>HCP {courseHandicap}</div>
            )}
          </div>

          {played > 0 && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {isStab ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ fontSize: T.fontHeader, fontWeight: 700, color: T.gold, lineHeight: 1, fontFamily: MONO }}>{tS}</span>
                  <span style={{ fontSize: 10, color: T.gold, fontWeight: 600 }}>pts</span>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: T.fontHeader, fontWeight: 700, color: T.textPrimary, lineHeight: 1, fontFamily: MONO }}>{tG}</span>
                    <span style={{ fontSize: 12, color: T.textSecondary, fontFamily: MONO }}>{fmtOu(tG - tP)}</span>
                  </div>
                  {isNeto && courseHandicap !== 0 && (
                    <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2, fontFamily: MONO, textAlign: 'right' }}>
                      {tN} {fmtOu(tN - tP)} net
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TABLE ── */}
      <div style={{ overflowX: 'auto' }}>
        {isDesktop && hasBack && b9t ? (
          /* Desktop: tabla horizontal completa de 18 hoyos */
          <DesktopTable f9={f9} b9={b9} f9t={f9t} b9t={b9t} grandT={grandT}
                        modo={modo} formato={formato} extended={showExtendedInfo} />
        ) : (
          /* Mobile: front 9 y back 9 apilados */
          <>
            <MobileHalf label="OUT" stats={f9} totals={f9t}
                        modo={modo} formato={formato} extended={showExtendedInfo} />
            {hasBack && b9t && (
              <>
                <div style={{ height: 6, background: T.bgInfo, borderBottom: `${T.lineW}px solid ${T.line}` }} />
                <MobileHalf label="IN" stats={b9} totals={b9t}
                            modo={modo} formato={formato} extended={showExtendedInfo} />
              </>
            )}
          </>
        )}
      </div>

      {/* ── STATS SUMMARY ── */}
      {played > 0 && <StatsSummary stats={all} />}
    </div>
  )
}
