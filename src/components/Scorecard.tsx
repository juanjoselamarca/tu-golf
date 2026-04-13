'use client'

/**
 * Scorecard v7 — Precision + detail pass.
 *
 * Fixes sobre v6:
 * - Dots de strokes: texto "·" gris pequeño como Garmin (no círculos dorados)
 * - Desktop: tabla 18h horizontal con columnas proporcionales y label column
 * - Desktop: max-width 900px, no se estira al infinito
 * - Separador visual claro entre header (HOLE/PAR) y datos (SCORE/NETO)
 * - Totals con vs-par debajo
 * - Verificado para 375px, 1024px, 1280px
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

function useIsWide(bp = 768): boolean {
  const [w, setW] = useState(false)
  useEffect(() => {
    const ck = () => setW(window.innerWidth >= bp)
    ck()
    window.addEventListener('resize', ck)
    return () => window.removeEventListener('resize', ck)
  }, [bp])
  return w
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function fmtOu(n: number): string {
  return n === 0 ? 'E' : n > 0 ? `+${n}` : String(n)
}

interface HS {
  hole: ScorecardHole; score: number | null; strokes: number
  neto: number | null; stabPts: number | null; diff: number
}

function buildStats(h: ScorecardHole[], sc: Record<string, number>, ch: number, tH: number, fmt: string): HS[] {
  return h.map(hole => {
    const raw = sc[String(hole.numero)]
    const score = typeof raw === 'number' && raw > 0 ? raw : null
    const strokes = strokesRecibidosEnHoyo(ch, hole.stroke_index, tH)
    const neto = score != null ? score - strokes : null
    const stabPts = score != null && fmt === 'stableford'
      ? puntosStablefordHoyo(score, hole.par, ch, hole.stroke_index, tH) : null
    return { hole, score, strokes, neto, stabPts, diff: score != null ? score - hole.par : 0 }
  })
}

interface Tot { g: number; n: number; p: number; s: number }

function sumT(st: HS[]): Tot {
  return st.reduce<Tot>((a, s) => ({
    g: a.g + (s.score ?? 0), n: a.n + (s.neto ?? 0),
    p: a.p + s.hole.par, s: a.s + (s.stabPts ?? 0),
  }), { g: 0, n: 0, p: 0, s: 0 })
}

function countRes(st: HS[]) {
  let e = 0, b = 0, p = 0, bo = 0, d = 0
  for (const s of st) {
    if (!s.score) continue
    if (s.diff <= -2) e++; else if (s.diff === -1) b++
    else if (s.diff === 0) p++; else if (s.diff === 1) bo++; else d++
  }
  return { e, b, p, bo, d }
}

// ═══════════════════════════════════════════════════════════
// TOKENS
// ═══════════════════════════════════════════════════════════

const K = {
  line: '#dfe2e6',
  bgH: '#f5f6f8',    // header rows (hole, par)
  bgS: '#ffffff',     // score rows
  bgTot: '#edf0f3',  // grand total column (desktop)
  tp: '#1a1a2e',      // text primary
  ts: '#7c8594',      // text secondary
  tm: '#9ca3af',      // text muted / dots
  gold: '#c4992a',
} as const

// ═══════════════════════════════════════════════════════════
// CELL HELPERS
// ═══════════════════════════════════════════════════════════

const C = (ch: React.ReactNode, extra?: React.CSSProperties): React.ReactNode => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, minWidth: 0, height: '100%', ...extra }}>
    {ch}
  </div>
)

// Total cell with left border + bg
const TC = (ch: React.ReactNode, bg: string = K.bgH): React.ReactNode => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, height: '100%', borderLeft: `1px solid ${K.line}`, background: bg }}>
    {ch}
  </div>
)

const S = (t: string, sz: number, c: string, w = 400, it = false) => (
  <span style={{ fontSize: sz, color: c, fontWeight: w, fontStyle: it ? 'italic' : 'normal' }}>{t}</span>
)

// Garmin-style dots: texto "·" gris pequeño, NO círculos rellenos
const Dots = (n: number) => n > 0
  ? <span style={{ fontSize: 10, color: K.tm, letterSpacing: 2 }}>{'·'.repeat(n)}</span>
  : null

// ═══════════════════════════════════════════════════════════
// GRID ROW
// ═══════════════════════════════════════════════════════════

function GR({ cols, cells, h, bg, bb = true, bt = false }: {
  cols: string; cells: React.ReactNode[]; h: number; bg: string; bb?: boolean; bt?: boolean
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: cols, background: bg, minHeight: h,
      borderBottom: bb ? `1px solid ${K.line}` : 'none',
      borderTop: bt ? `1px solid ${K.line}` : 'none',
    }}>
      {cells.map((c, i) => <div key={i} style={{ display: 'contents' }}>{c}</div>)}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MOBILE HALF
// ═══════════════════════════════════════════════════════════

const MHalf = memo(function MHalf({ label, st, tot, modo, fmt, ext }: {
  label: string; st: HS[]; tot: Tot; modo: string; fmt: string; ext: boolean
}) {
  const isN = modo === 'neto'
  const isSt = fmt === 'stableford'
  const g = `repeat(9, 1fr) 46px`

  const mkRow = (cells: React.ReactNode[], totalCell: React.ReactNode, h: number, bg: string, bb = true, bt = false) =>
    <GR cols={g} h={h} bg={bg} bb={bb} bt={bt} cells={[...cells.map((c, i) => C(c, { key: i } as React.CSSProperties)), TC(totalCell)]} />

  return (
    <>
      {/* HOLE */}
      {mkRow(st.map(s => S(String(s.hole.numero), 10, K.ts, 600)), S(label, 10, K.ts, 700), 24, K.bgH)}
      {/* PAR */}
      {mkRow(st.map(s => S(String(s.hole.par), 11, K.tm, 500)), S(String(tot.p), 11, K.tm, 600), 24, K.bgH)}
      {/* Extended */}
      {ext && mkRow(st.map(s => S(s.hole.yardaje ? String(s.hole.yardaje) : '', 9, K.tm)), S('', 0, 'transparent'), 20, K.bgH)}
      {ext && mkRow(st.map(s => S('SI' + s.hole.stroke_index, 8, K.tm)), S('', 0, 'transparent'), 20, K.bgH)}
      {/* SCORE */}
      <GR cols={g} h={36} bg={K.bgS} bb={!isN} cells={[
        ...st.map(s => C(<ScoreSymbol key={s.hole.numero} score={s.score} par={s.hole.par} size="sm" theme="light" />)),
        TC(<><span style={{ fontSize: 14, fontWeight: 700, color: K.tp, fontFamily: MONO }}>{tot.g > 0 ? tot.g : ''}</span></>),
      ]} />
      {/* DOTS */}
      {isN && <GR cols={g} h={14} bg={K.bgS} bb={false} cells={[...st.map(s => C(Dots(s.strokes))), TC(null)]} />}
      {/* NETO */}
      {isN && !isSt && <GR cols={g} h={24} bg={K.bgH} bt cells={[
        ...st.map(s => C(S(s.neto != null ? String(s.neto) : '', 11, K.ts, 500, true))),
        TC(S(tot.n > 0 ? String(tot.n) : '', 11, K.ts, 700, true)),
      ]} />}
      {/* STABLEFORD */}
      {isSt && <>
        <GR cols={g} h={24} bg={K.bgH} bt cells={[
          ...st.map(s => C(S(s.neto != null ? String(s.neto) : '', 11, K.ts, 500, true))),
          TC(S(tot.n > 0 ? String(tot.n) : '', 11, K.ts, 600, true)),
        ]} />
        <GR cols={g} h={26} bg={K.bgS} cells={[
          ...st.map(s => C(S(s.stabPts != null ? String(s.stabPts) : '', 12, K.gold, 700))),
          TC(S(tot.s > 0 ? String(tot.s) : '', 14, K.gold, 800)),
        ]} />
      </>}
    </>
  )
})

// ═══════════════════════════════════════════════════════════
// DESKTOP TABLE — 18 holes horizontal + label column
// ═══════════════════════════════════════════════════════════

const DTable = memo(function DTable({ f, b, ft, bt, gt, modo, fmt, ext }: {
  f: HS[]; b: HS[]; ft: Tot; bt: Tot; gt: Tot; modo: string; fmt: string; ext: boolean
}) {
  const isN = modo === 'neto'
  const isSt = fmt === 'stableford'

  // 22 columns: label + 9 holes + OUT + 9 holes + IN + TOT
  const g = `36px repeat(9, 1fr) 44px repeat(9, 1fr) 44px 48px`

  // Build a full row across all 22 columns
  function row(
    label: React.ReactNode,
    f9: React.ReactNode[], fTot: React.ReactNode,
    b9: React.ReactNode[], bTot: React.ReactNode,
    grand: React.ReactNode,
    h: number, bg: string, opts?: { bb?: boolean; bt?: boolean }
  ) {
    const cells = [
      C(label, { justifyContent: 'flex-start', paddingLeft: 4 } as React.CSSProperties),
      ...f9.map((c, i) => C(c, { key: i } as React.CSSProperties)),
      TC(fTot),
      ...b9.map((c, i) => C(c, { key: i } as React.CSSProperties)),
      TC(bTot),
      TC(grand, K.bgTot),
    ]
    return <GR cols={g} h={h} bg={bg} bb={opts?.bb ?? true} bt={opts?.bt ?? false} cells={cells} />
  }

  const lbl = (t: string) => S(t, 8, K.ts, 700)

  return (
    <>
      {/* HOLE */}
      {row(lbl('HOLE'),
        f.map(s => S(String(s.hole.numero), 11, K.ts, 600)), S('OUT', 10, K.ts, 700),
        b.map(s => S(String(s.hole.numero), 11, K.ts, 600)), S('IN', 10, K.ts, 700),
        S('TOT', 10, K.ts, 700),
        26, K.bgH)}

      {/* PAR */}
      {row(lbl('PAR'),
        f.map(s => S(String(s.hole.par), 12, K.tm, 500)), S(String(ft.p), 12, K.tm, 600),
        b.map(s => S(String(s.hole.par), 12, K.tm, 500)), S(String(bt.p), 12, K.tm, 600),
        S(String(gt.p), 12, K.tm, 700),
        26, K.bgH)}

      {/* Extended */}
      {ext && row(lbl('YDS'),
        f.map(s => S(s.hole.yardaje ? String(s.hole.yardaje) : '', 9, K.tm)), S('', 0, 'transparent'),
        b.map(s => S(s.hole.yardaje ? String(s.hole.yardaje) : '', 9, K.tm)), S('', 0, 'transparent'),
        S('', 0, 'transparent'), 22, K.bgH)}
      {ext && row(lbl('SI'),
        f.map(s => S(String(s.hole.stroke_index), 9, K.tm)), S('', 0, 'transparent'),
        b.map(s => S(String(s.hole.stroke_index), 9, K.tm)), S('', 0, 'transparent'),
        S('', 0, 'transparent'), 22, K.bgH)}

      {/* SCORE */}
      {row(lbl('GROSS'),
        f.map(s => <ScoreSymbol key={s.hole.numero} score={s.score} par={s.hole.par} size="sm" theme="light" />),
        S(ft.g > 0 ? String(ft.g) : '', 14, K.tp, 700),
        b.map(s => <ScoreSymbol key={s.hole.numero} score={s.score} par={s.hole.par} size="sm" theme="light" />),
        S(bt.g > 0 ? String(bt.g) : '', 14, K.tp, 700),
        S(gt.g > 0 ? String(gt.g) : '', 16, K.tp, 800),
        38, K.bgS, { bb: !isN })}

      {/* DOTS */}
      {isN && row(S('', 0, 'transparent'),
        f.map(s => Dots(s.strokes)), null,
        b.map(s => Dots(s.strokes)), null, null,
        14, K.bgS, { bb: false })}

      {/* NETO (stroke play) */}
      {isN && !isSt && row(lbl('NETO'),
        f.map(s => S(s.neto != null ? String(s.neto) : '', 12, K.ts, 500, true)),
        S(ft.n > 0 ? String(ft.n) : '', 12, K.ts, 700, true),
        b.map(s => S(s.neto != null ? String(s.neto) : '', 12, K.ts, 500, true)),
        S(bt.n > 0 ? String(bt.n) : '', 12, K.ts, 700, true),
        S(gt.n > 0 ? String(gt.n) : '', 13, K.ts, 800, true),
        26, K.bgH, { bt: true })}

      {/* STABLEFORD */}
      {isSt && <>
        {row(lbl('NETO'),
          f.map(s => S(s.neto != null ? String(s.neto) : '', 12, K.ts, 500, true)),
          S(ft.n > 0 ? String(ft.n) : '', 12, K.ts, 600, true),
          b.map(s => S(s.neto != null ? String(s.neto) : '', 12, K.ts, 500, true)),
          S(bt.n > 0 ? String(bt.n) : '', 12, K.ts, 600, true),
          S(gt.n > 0 ? String(gt.n) : '', 12, K.ts, 700, true),
          26, K.bgH, { bt: true })}
        {row(lbl('PTS'),
          f.map(s => S(s.stabPts != null ? String(s.stabPts) : '', 12, K.gold, 700)),
          S(ft.s > 0 ? String(ft.s) : '', 14, K.gold, 800),
          b.map(s => S(s.stabPts != null ? String(s.stabPts) : '', 12, K.gold, 700)),
          S(bt.s > 0 ? String(bt.s) : '', 14, K.gold, 800),
          S(gt.s > 0 ? String(gt.s) : '', 16, K.gold, 800),
          28, K.bgS)}
      </>}
    </>
  )
})

// ═══════════════════════════════════════════════════════════
// STATS SUMMARY
// ═══════════════════════════════════════════════════════════

function Stats({ st }: { st: HS[] }) {
  const c = countRes(st)
  const items: { l: string; n: number; c: string }[] = []
  if (c.e > 0) items.push({ l: 'Eagles', n: c.e, c: GARMIN_COLORS.eagle })
  if (c.b > 0) items.push({ l: 'Birdies', n: c.b, c: GARMIN_COLORS.birdie })
  items.push({ l: 'Pares', n: c.p, c: K.ts })
  if (c.bo > 0) items.push({ l: 'Bogeys', n: c.bo, c: GARMIN_COLORS.bogey })
  if (c.d > 0) items.push({ l: 'Doble+', n: c.d, c: GARMIN_COLORS.double })

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', padding: '8px 16px', borderTop: `1px solid ${K.line}`, background: K.bgH }}>
      {items.map(i => (
        <div key={i.l} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: i.c, fontFamily: MONO }}>{i.n}</span>
          <span style={{ fontSize: 10, color: K.ts }}>{i.l}</span>
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
  const wide = useIsWide(768)
  const tH = holes.length
  const isN = modo === 'neto'
  const isSt = formato === 'stableford'

  const all = buildStats(holes, scores, courseHandicap, tH, formato)
  const f9 = all.slice(0, 9)
  const b9 = all.slice(9, 18)
  const hasB = b9.length > 0

  const ft = sumT(f9)
  const bt = hasB ? sumT(b9) : null
  const gt: Tot = { g: ft.g + (bt?.g ?? 0), n: ft.n + (bt?.n ?? 0), p: ft.p + (bt?.p ?? 0), s: ft.s + (bt?.s ?? 0) }
  const played = all.filter(s => s.score != null).length

  return (
    <div style={{
      background: '#fff', borderRadius: 8,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
      overflow: 'hidden', fontFamily: SANS,
      maxWidth: wide ? 960 : '100%',
    }}>
      {/* HEADER */}
      {(playerName || played > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${K.line}` }}>
          {playerName && !avatarUrl && (
            <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: K.bgH, border: `1px solid ${K.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: K.ts }}>
              {playerName.charAt(0).toUpperCase()}
            </div>
          )}
          {avatarUrl && (
            <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `1px solid ${K.line}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {playerName && <div style={{ fontSize: 14, fontWeight: 600, color: K.tp, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerName}</div>}
            {isN && courseHandicap !== 0 && <div style={{ fontSize: 10, color: K.tm, marginTop: 1 }}>HCP {courseHandicap}</div>}
          </div>
          {played > 0 && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {isSt ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: K.gold, lineHeight: 1, fontFamily: MONO }}>{gt.s}</span>
                  <span style={{ fontSize: 10, color: K.gold, fontWeight: 600 }}>pts</span>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: K.tp, lineHeight: 1, fontFamily: MONO }}>{gt.g}</span>
                    <span style={{ fontSize: 12, color: K.ts, fontFamily: MONO }}>{fmtOu(gt.g - gt.p)}</span>
                  </div>
                  {isN && courseHandicap !== 0 && (
                    <div style={{ fontSize: 10, color: K.tm, marginTop: 2, fontFamily: MONO, textAlign: 'right' }}>
                      {gt.n} {fmtOu(gt.n - gt.p)} net
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TABLE */}
      <div style={{ overflowX: 'auto' }}>
        {wide && hasB && bt ? (
          <DTable f={f9} b={b9} ft={ft} bt={bt} gt={gt} modo={modo} fmt={formato} ext={showExtendedInfo} />
        ) : (
          <>
            <MHalf label="OUT" st={f9} tot={ft} modo={modo} fmt={formato} ext={showExtendedInfo} />
            {hasB && bt && <>
              <div style={{ height: 4, background: K.bgH, borderBottom: `1px solid ${K.line}` }} />
              <MHalf label="IN" st={b9} tot={bt} modo={modo} fmt={formato} ext={showExtendedInfo} />
            </>}
          </>
        )}
      </div>

      {/* STATS */}
      {played > 0 && <Stats st={all} />}
    </div>
  )
}
