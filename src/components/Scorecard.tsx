'use client'

/**
 * Scorecard v8
 *
 * Fixes:
 * - Dots: 4px gris oscuro (#7c8594) — visible pero no invasivo
 * - Desktop: línea vertical de cierre después de OUT (borderRight en la columna OUT)
 * - Desktop: jerarquía visual mejorada (score 14px bold, hole/par 11px light)
 * - Mobile: "SI" → "Hdcp" (Handicap del hoyo, terminología LatAm)
 * - Mobile: jerarquía visual — score row más alto, par/hole más compactos
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
  bgH: '#f5f6f8',
  bgS: '#ffffff',
  bgTot: '#edf0f3',
  tp: '#1a1a2e',
  ts: '#7c8594',
  tm: '#9ca3af',
  gold: '#c4992a',
  // Dots: gris oscuro, visible pero elegante
  dotColor: '#7c8594',
  dotSize: 4,
} as const

// ═══════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════

/** Dot indicator for strokes received — 4px circles in dark gray */
function StrokeDots({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{
          width: K.dotSize, height: K.dotSize, borderRadius: '50%',
          background: K.dotColor, display: 'inline-block',
        }} />
      ))}
    </span>
  )
}

/** Text span helper */
function TX({ t, sz, c, w = 400, it = false }: { t: string; sz: number; c: string; w?: number; it?: boolean }) {
  return <span style={{ fontSize: sz, color: c, fontWeight: w, fontStyle: it ? 'italic' : 'normal', fontFamily: MONO }}>{t}</span>
}

/** Cell wrapper */
function Cell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, height: '100%', fontFamily: MONO, ...style }}>
      {children}
    </div>
  )
}

/** Total cell — with left border and background */
function TotCell({ children, bg = K.bgH }: { children: React.ReactNode; bg?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: MONO, height: '100%', width: '100%',
      borderLeft: `1px solid ${K.line}`, background: bg,
    }}>
      {children}
    </div>
  )
}

/** Grid row */
function GR({ cols, children, h, bg, bb = true, bt = false }: {
  cols: string; children: React.ReactNode; h: number; bg: string; bb?: boolean; bt?: boolean
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: cols, background: bg, minHeight: h,
      borderBottom: bb ? `1px solid ${K.line}` : 'none',
      borderTop: bt ? `1px solid ${K.line}` : 'none',
    }}>
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MOBILE — Front 9 / Back 9 stacked
// ═══════════════════════════════════════════════════════════

const MobileHalf = memo(function MobileHalf({ label, st, tot, modo, fmt, ext }: {
  label: string; st: HS[]; tot: Tot; modo: string; fmt: string; ext: boolean
}) {
  const isN = modo === 'neto'
  const isSt = fmt === 'stableford'
  const cols = `repeat(9, 1fr) 46px`

  return (
    <>
      {/* HOLE — compact, secondary */}
      <GR cols={cols} h={22} bg={K.bgH}>
        {st.map(s => <Cell key={s.hole.numero}><TX t={String(s.hole.numero)} sz={9} c={K.tm} w={600} /></Cell>)}
        <TotCell><TX t={label} sz={9} c={K.ts} w={700} /></TotCell>
      </GR>

      {/* PAR — compact, secondary */}
      <GR cols={cols} h={22} bg={K.bgH}>
        {st.map(s => <Cell key={s.hole.numero}><TX t={String(s.hole.par)} sz={10} c={K.tm} w={500} /></Cell>)}
        <TotCell><TX t={String(tot.p)} sz={10} c={K.tm} w={600} /></TotCell>
      </GR>

      {/* Extended: yardaje */}
      {ext && (
        <GR cols={cols} h={20} bg={K.bgH}>
          {st.map(s => <Cell key={s.hole.numero}><TX t={s.hole.yardaje ? String(s.hole.yardaje) : ''} sz={8} c={K.tm} /></Cell>)}
          <TotCell><TX t="" sz={8} c={K.tm} /></TotCell>
        </GR>
      )}

      {/* Extended: Hdcp (handicap del hoyo = stroke index) */}
      {ext && (
        <GR cols={cols} h={20} bg={K.bgH}>
          {st.map(s => <Cell key={s.hole.numero}><TX t={String(s.hole.stroke_index)} sz={8} c={K.tm} /></Cell>)}
          <TotCell><TX t="Hdcp" sz={7} c={K.tm} w={600} /></TotCell>
        </GR>
      )}

      {/* ═══ SCORE — protagonista, más alto, separador arriba ═══ */}
      <GR cols={cols} h={38} bg={K.bgS} bb={!isN}>
        {st.map(s => <Cell key={s.hole.numero}><ScoreSymbol score={s.score} par={s.hole.par} size="sm" theme="light" /></Cell>)}
        <TotCell><TX t={tot.g > 0 ? String(tot.g) : ''} sz={15} c={K.tp} w={700} /></TotCell>
      </GR>

      {/* DOTS — stroke indicators */}
      {isN && (
        <GR cols={cols} h={16} bg={K.bgS} bb={false}>
          {st.map(s => <Cell key={s.hole.numero}><StrokeDots count={s.strokes} /></Cell>)}
          <TotCell><TX t="" sz={0} c="transparent" /></TotCell>
        </GR>
      )}

      {/* NETO */}
      {isN && !isSt && (
        <GR cols={cols} h={24} bg={K.bgH} bt>
          {st.map(s => <Cell key={s.hole.numero}><TX t={s.neto != null ? String(s.neto) : ''} sz={10} c={K.ts} w={500} it /></Cell>)}
          <TotCell><TX t={tot.n > 0 ? String(tot.n) : ''} sz={11} c={K.ts} w={700} it /></TotCell>
        </GR>
      )}

      {/* STABLEFORD: neto + pts */}
      {isSt && (
        <>
          <GR cols={cols} h={24} bg={K.bgH} bt>
            {st.map(s => <Cell key={s.hole.numero}><TX t={s.neto != null ? String(s.neto) : ''} sz={10} c={K.ts} w={500} it /></Cell>)}
            <TotCell><TX t={tot.n > 0 ? String(tot.n) : ''} sz={10} c={K.ts} w={600} it /></TotCell>
          </GR>
          <GR cols={cols} h={26} bg={K.bgS}>
            {st.map(s => <Cell key={s.hole.numero}><TX t={s.stabPts != null ? String(s.stabPts) : ''} sz={12} c={K.gold} w={700} /></Cell>)}
            <TotCell><TX t={tot.s > 0 ? String(tot.s) : ''} sz={14} c={K.gold} w={800} /></TotCell>
          </GR>
        </>
      )}
    </>
  )
})

// ═══════════════════════════════════════════════════════════
// DESKTOP — 18 holes horizontal with label column + OUT/IN separators
// ═══════════════════════════════════════════════════════════

const DesktopTable = memo(function DesktopTable({ f, b, ft, bt, gt, modo, fmt, ext }: {
  f: HS[]; b: HS[]; ft: Tot; bt: Tot; gt: Tot; modo: string; fmt: string; ext: boolean
}) {
  const isN = modo === 'neto'
  const isSt = fmt === 'stableford'

  // 22 columns: label(38px) + 9×1fr + OUT(46px) + 9×1fr + IN(46px) + TOT(50px)
  const cols = `38px repeat(9, 1fr) 46px repeat(9, 1fr) 46px 50px`

  // Render a full-width row. OUT and IN columns get borderLeft + borderRight for visual closure.
  function R({ lbl, f9, fTot, b9, bTot, grand, h, bg, bb = true, bt: borderT = false }: {
    lbl: React.ReactNode; f9: React.ReactNode[]; fTot: React.ReactNode
    b9: React.ReactNode[]; bTot: React.ReactNode; grand: React.ReactNode
    h: number; bg: string; bb?: boolean; bt?: boolean
  }) {
    return (
      <GR cols={cols} h={h} bg={bg} bb={bb} bt={borderT}>
        {/* Label */}
        <Cell style={{ justifyContent: 'flex-start', paddingLeft: 6 }}>{lbl}</Cell>
        {/* Front 9 */}
        {f9.map((c, i) => <Cell key={`f${i}`}>{c}</Cell>)}
        {/* OUT — with borderRight for closure */}
        <TotCell>{fTot}</TotCell>
        {/* Back 9 */}
        {b9.map((c, i) => <Cell key={`b${i}`}>{c}</Cell>)}
        {/* IN */}
        <TotCell>{bTot}</TotCell>
        {/* TOT — darker bg */}
        <TotCell bg={K.bgTot}>{grand}</TotCell>
      </GR>
    )
  }

  const L = (t: string) => <TX t={t} sz={8} c={K.ts} w={700} />

  return (
    <>
      {/* HOLE */}
      <R lbl={L('HOLE')} h={26} bg={K.bgH}
        f9={f.map(s => <TX key={s.hole.numero} t={String(s.hole.numero)} sz={11} c={K.ts} w={600} />)}
        fTot={<TX t="OUT" sz={10} c={K.ts} w={700} />}
        b9={b.map(s => <TX key={s.hole.numero} t={String(s.hole.numero)} sz={11} c={K.ts} w={600} />)}
        bTot={<TX t="IN" sz={10} c={K.ts} w={700} />}
        grand={<TX t="TOT" sz={10} c={K.ts} w={700} />}
      />

      {/* PAR */}
      <R lbl={L('PAR')} h={26} bg={K.bgH}
        f9={f.map(s => <TX key={s.hole.numero} t={String(s.hole.par)} sz={12} c={K.tm} w={500} />)}
        fTot={<TX t={String(ft.p)} sz={12} c={K.tm} w={600} />}
        b9={b.map(s => <TX key={s.hole.numero} t={String(s.hole.par)} sz={12} c={K.tm} w={500} />)}
        bTot={<TX t={String(bt.p)} sz={12} c={K.tm} w={600} />}
        grand={<TX t={String(gt.p)} sz={12} c={K.tm} w={700} />}
      />

      {/* Extended: yardaje */}
      {ext && (
        <R lbl={L('YDS')} h={22} bg={K.bgH}
          f9={f.map(s => <TX key={s.hole.numero} t={s.hole.yardaje ? String(s.hole.yardaje) : ''} sz={9} c={K.tm} />)}
          fTot={null} b9={b.map(s => <TX key={s.hole.numero} t={s.hole.yardaje ? String(s.hole.yardaje) : ''} sz={9} c={K.tm} />)}
          bTot={null} grand={null}
        />
      )}

      {/* Extended: Hdcp */}
      {ext && (
        <R lbl={L('HDCP')} h={22} bg={K.bgH}
          f9={f.map(s => <TX key={s.hole.numero} t={String(s.hole.stroke_index)} sz={9} c={K.tm} />)}
          fTot={null} b9={b.map(s => <TX key={s.hole.numero} t={String(s.hole.stroke_index)} sz={9} c={K.tm} />)}
          bTot={null} grand={null}
        />
      )}

      {/* ═══ SCORE ═══ */}
      <R lbl={L('GROSS')} h={40} bg={K.bgS} bb={!isN}
        f9={f.map(s => <ScoreSymbol key={s.hole.numero} score={s.score} par={s.hole.par} size="sm" theme="light" />)}
        fTot={<TX t={ft.g > 0 ? String(ft.g) : ''} sz={15} c={K.tp} w={700} />}
        b9={b.map(s => <ScoreSymbol key={s.hole.numero} score={s.score} par={s.hole.par} size="sm" theme="light" />)}
        bTot={<TX t={bt.g > 0 ? String(bt.g) : ''} sz={15} c={K.tp} w={700} />}
        grand={<TX t={gt.g > 0 ? String(gt.g) : ''} sz={16} c={K.tp} w={800} />}
      />

      {/* DOTS */}
      {isN && (
        <R lbl={<span />} h={16} bg={K.bgS} bb={false}
          f9={f.map(s => <StrokeDots key={s.hole.numero} count={s.strokes} />)}
          fTot={null} b9={b.map(s => <StrokeDots key={s.hole.numero} count={s.strokes} />)}
          bTot={null} grand={null}
        />
      )}

      {/* NETO (stroke play) */}
      {isN && !isSt && (
        <R lbl={L('NETO')} h={26} bg={K.bgH} bt
          f9={f.map(s => <TX key={s.hole.numero} t={s.neto != null ? String(s.neto) : ''} sz={12} c={K.ts} w={500} it />)}
          fTot={<TX t={ft.n > 0 ? String(ft.n) : ''} sz={12} c={K.ts} w={700} it />}
          b9={b.map(s => <TX key={s.hole.numero} t={s.neto != null ? String(s.neto) : ''} sz={12} c={K.ts} w={500} it />)}
          bTot={<TX t={bt.n > 0 ? String(bt.n) : ''} sz={12} c={K.ts} w={700} it />}
          grand={<TX t={gt.n > 0 ? String(gt.n) : ''} sz={13} c={K.ts} w={800} it />}
        />
      )}

      {/* STABLEFORD */}
      {isSt && (
        <>
          <R lbl={L('NETO')} h={26} bg={K.bgH} bt
            f9={f.map(s => <TX key={s.hole.numero} t={s.neto != null ? String(s.neto) : ''} sz={12} c={K.ts} w={500} it />)}
            fTot={<TX t={ft.n > 0 ? String(ft.n) : ''} sz={12} c={K.ts} w={600} it />}
            b9={b.map(s => <TX key={s.hole.numero} t={s.neto != null ? String(s.neto) : ''} sz={12} c={K.ts} w={500} it />)}
            bTot={<TX t={bt.n > 0 ? String(bt.n) : ''} sz={12} c={K.ts} w={600} it />}
            grand={<TX t={gt.n > 0 ? String(gt.n) : ''} sz={12} c={K.ts} w={700} it />}
          />
          <R lbl={L('PTS')} h={28} bg={K.bgS}
            f9={f.map(s => <TX key={s.hole.numero} t={s.stabPts != null ? String(s.stabPts) : ''} sz={13} c={K.gold} w={700} />)}
            fTot={<TX t={ft.s > 0 ? String(ft.s) : ''} sz={14} c={K.gold} w={800} />}
            b9={b.map(s => <TX key={s.hole.numero} t={s.stabPts != null ? String(s.stabPts) : ''} sz={13} c={K.gold} w={700} />)}
            bTot={<TX t={bt.s > 0 ? String(bt.s) : ''} sz={14} c={K.gold} w={800} />}
            grand={<TX t={gt.s > 0 ? String(gt.s) : ''} sz={16} c={K.gold} w={800} />}
          />
        </>
      )}
    </>
  )
})

// ═══════════════════════════════════════════════════════════
// STATS
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
  const f9 = all.slice(0, 9); const b9 = all.slice(9, 18); const hasB = b9.length > 0
  const ft = sumT(f9); const bt = hasB ? sumT(b9) : null
  const gt: Tot = { g: ft.g + (bt?.g ?? 0), n: ft.n + (bt?.n ?? 0), p: ft.p + (bt?.p ?? 0), s: ft.s + (bt?.s ?? 0) }
  const played = all.filter(s => s.score != null).length

  return (
    <div style={{
      background: '#fff', borderRadius: 8,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
      overflow: 'hidden', fontFamily: SANS, maxWidth: wide ? 960 : '100%',
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
          <DesktopTable f={f9} b={b9} ft={ft} bt={bt} gt={gt} modo={modo} fmt={formato} ext={showExtendedInfo} />
        ) : (
          <>
            <MobileHalf label="OUT" st={f9} tot={ft} modo={modo} fmt={formato} ext={showExtendedInfo} />
            {hasB && bt && <>
              <div style={{ height: 4, background: K.bgH, borderBottom: `1px solid ${K.line}` }} />
              <MobileHalf label="IN" st={b9} tot={bt} modo={modo} fmt={formato} ext={showExtendedInfo} />
            </>}
          </>
        )}
      </div>

      {/* STATS */}
      {played > 0 && <Stats st={all} />}
    </div>
  )
}
