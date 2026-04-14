'use client'

/**
 * Scorecard v11 — 9 mejoras finales pre-producción.
 *
 * 1. Contexto de ronda en header (club, fecha, formato)
 * 2. Front 9 vs Back 9 comparison en stats
 * 3. ScoreSymbol md en desktop (28px vs 22px mobile)
 * 4. Separador Front/Back más intencional en mobile
 * 5. Label "PTS" visible en stableford mobile (columna total)
 * 6. Stats expandido en desktop (una línea con front/back + conteos)
 * 7. Hole numbers mobile 10px (era 9px)
 * 8. Hover desktop 8% (era 4%)
 * 9. Props para contexto de ronda (courseName, date, formatLabel)
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
  /** Contexto de ronda — mejora #1 */
  courseName?: string
  date?: string
  formatLabel?: string
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
  lineBold: '#c8cdd3',
  bgH: '#f5f6f8',
  bgS: '#ffffff',
  bgTot: '#edf0f3',
  tp: '#1a1a2e',
  ts: '#5a6370',
  tm: '#7c8594',
  gold: '#c4992a',
  dotColor: '#5a6370',
  dotSize: 4,
  hoverBg: 'rgba(196,153,42,0.08)', // mejora #8: hover 8%
} as const

// ═══════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════

function StrokeDots({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{ width: K.dotSize, height: K.dotSize, borderRadius: '50%', background: K.dotColor, display: 'inline-block' }} />
      ))}
    </span>
  )
}

function TX({ t, sz, c, w = 400, it = false }: { t: string; sz: number; c: string; w?: number; it?: boolean }) {
  return <span style={{ fontSize: sz, color: c, fontWeight: w, fontStyle: it ? 'italic' : 'normal', fontFamily: MONO }}>{t}</span>
}

function Cell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, height: '100%', fontFamily: MONO, ...style }}>{children}</div>
}

function TotCellVsPar({ gross, par, bg = K.bgH }: { gross: number; par: number; bg?: string }) {
  const ou = gross - par
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, height: '100%', borderLeft: `1px solid ${K.line}`, background: bg }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: K.tp }}>{gross > 0 ? gross : ''}</span>
      {gross > 0 && <span style={{ fontSize: 9, color: K.ts, marginTop: -1 }}>{fmtOu(ou)}</span>}
    </div>
  )
}

function TotCell({ children, bg = K.bgH, borderW = 1 }: { children: React.ReactNode; bg?: string; borderW?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, height: '100%', width: '100%', borderLeft: `${borderW}px solid ${borderW > 1 ? K.lineBold : K.line}`, background: bg }}>
      {children}
    </div>
  )
}

function GR({ cols, children, h, bg, bb = true, bt = false, bbColor = K.line, bbW = 1 }: {
  cols: string; children: React.ReactNode; h: number; bg: string
  bb?: boolean; bt?: boolean; bbColor?: string; bbW?: number
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: cols, background: bg, minHeight: h,
      borderBottom: bb ? `${bbW}px solid ${bbColor}` : 'none',
      borderTop: bt ? `1px solid ${K.line}` : 'none',
    }}>
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MOBILE HALF
// ═══════════════════════════════════════════════════════════

const MobileHalf = memo(function MobileHalf({ label, st, tot, modo, fmt, ext }: {
  label: string; st: HS[]; tot: Tot; modo: string; fmt: string; ext: boolean
}) {
  const isN = modo === 'neto'
  const isSt = fmt === 'stableford'
  const cols = `repeat(9, 1fr) 46px`

  return (
    <>
      {/* HOLE — mejora #7: 10px */}
      <GR cols={cols} h={22} bg={K.bgH}>
        {st.map(s => <Cell key={s.hole.numero}><TX t={String(s.hole.numero)} sz={10} c={K.tm} w={600} /></Cell>)}
        <TotCell><TX t={label} sz={10} c={K.ts} w={700} /></TotCell>
      </GR>

      {/* PAR — separador grueso debajo */}
      <GR cols={cols} h={22} bg={K.bgH} bbColor={K.lineBold} bbW={2}>
        {st.map(s => <Cell key={s.hole.numero}><TX t={String(s.hole.par)} sz={10} c={K.tm} w={500} /></Cell>)}
        <TotCell><TX t={String(tot.p)} sz={10} c={K.tm} w={600} /></TotCell>
      </GR>

      {/* Extended: yardaje con total */}
      {ext && (() => {
        const ydsT = st.reduce((a, s) => a + (s.hole.yardaje ?? 0), 0)
        return (
          <GR cols={cols} h={20} bg={K.bgH}>
            {st.map(s => <Cell key={s.hole.numero}><TX t={s.hole.yardaje ? String(s.hole.yardaje) : ''} sz={9} c={K.tm} /></Cell>)}
            <TotCell><TX t={ydsT > 0 ? String(ydsT) : ''} sz={9} c={K.tm} w={600} /></TotCell>
          </GR>
        )
      })()}

      {/* Extended: Hdcp — mejora #6 mobile: label "Hdcp" en total */}
      {ext && (
        <GR cols={cols} h={20} bg={K.bgH} bbColor={K.lineBold} bbW={2}>
          {st.map(s => <Cell key={s.hole.numero}><TX t={String(s.hole.stroke_index)} sz={9} c={K.tm} /></Cell>)}
          <TotCell><TX t="Hdcp" sz={7} c={K.ts} w={600} /></TotCell>
        </GR>
      )}

      {/* SCORE — sin border bottom (el separador front/back o stats lo marca) */}
      <GR cols={cols} h={38} bg={K.bgS} bb={false}>
        {st.map(s => <Cell key={s.hole.numero}><ScoreSymbol score={s.score} par={s.hole.par} size="sm" theme="light" /></Cell>)}
        <TotCellVsPar gross={tot.g} par={tot.p} />
      </GR>

      {/* DOTS */}
      {isN && (
        <GR cols={cols} h={16} bg={K.bgS} bb={false}>
          {st.map(s => <Cell key={s.hole.numero}><StrokeDots count={s.strokes} /></Cell>)}
          <TotCell><TX t="" sz={0} c="transparent" /></TotCell>
        </GR>
      )}

      {/* NETO */}
      {isN && !isSt && (
        <GR cols={cols} h={24} bg={K.bgS}>
          {st.map(s => <Cell key={s.hole.numero}><TX t={s.neto != null ? String(s.neto) : ''} sz={10} c={K.ts} w={500} it /></Cell>)}
          <TotCell bg={K.bgS}><TX t={tot.n > 0 ? String(tot.n) : ''} sz={11} c={K.ts} w={700} it /></TotCell>
        </GR>
      )}

      {/* STABLEFORD — mejora #5: label "PTS" en total cell */}
      {isSt && (
        <>
          <GR cols={cols} h={24} bg={K.bgS} bb={false}>
            {st.map(s => <Cell key={s.hole.numero}><TX t={s.neto != null ? String(s.neto) : ''} sz={10} c={K.ts} w={500} it /></Cell>)}
            <TotCell bg={K.bgS}><TX t={tot.n > 0 ? String(tot.n) : ''} sz={10} c={K.ts} w={600} it /></TotCell>
          </GR>
          <GR cols={cols} h={28} bg={K.bgS}>
            {st.map(s => <Cell key={s.hole.numero}><TX t={s.stabPts != null ? String(s.stabPts) : ''} sz={12} c={K.gold} w={700} /></Cell>)}
            <TotCell bg={K.bgS}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <TX t={tot.s > 0 ? String(tot.s) : ''} sz={14} c={K.gold} w={800} />
                {tot.s > 0 && <span style={{ fontSize: 7, color: K.gold, fontWeight: 600, fontFamily: SANS, letterSpacing: '0.08em' }}>PTS</span>}
              </div>
            </TotCell>
          </GR>
        </>
      )}
    </>
  )
})

// ═══════════════════════════════════════════════════════════
// DESKTOP TABLE — mejoras #3 (md icons), #8 (hover 8%)
// ═══════════════════════════════════════════════════════════

const DesktopTable = memo(function DesktopTable({ f, b, ft, bt, gt, modo, fmt, ext }: {
  f: HS[]; b: HS[]; ft: Tot; bt: Tot; gt: Tot; modo: string; fmt: string; ext: boolean
}) {
  const isN = modo === 'neto'
  const isSt = fmt === 'stableford'
  const [hoverCol, setHoverCol] = useState<number | null>(null)

  const cols = `38px repeat(9, 1fr) 46px repeat(9, 1fr) 46px 50px`

  function R({ lbl, fCells, fTot, bCells, bTot, grand, h, bg, bb = true, bbt = false, bbColor = K.line, bbW = 1 }: {
    lbl: React.ReactNode; fCells: React.ReactNode[]; fTot: React.ReactNode
    bCells: React.ReactNode[]; bTot: React.ReactNode; grand: React.ReactNode
    h: number; bg: string; bb?: boolean; bbt?: boolean; bbColor?: string; bbW?: number
  }) {
    return (
      <GR cols={cols} h={h} bg={bg} bb={bb} bt={bbt} bbColor={bbColor} bbW={bbW}>
        <Cell style={{ justifyContent: 'flex-start', paddingLeft: 6 }}>{lbl}</Cell>
        {fCells.map((c, i) => (
          <Cell key={`f${i}`} style={{ background: hoverCol === i ? K.hoverBg : 'transparent', transition: 'background 0.1s' }}>
            <div onMouseEnter={() => setHoverCol(i)} onMouseLeave={() => setHoverCol(null)}
                 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>{c}</div>
          </Cell>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, height: '100%', borderLeft: `1px solid ${K.line}`, borderRight: `1px solid ${K.line}`, background: K.bgH }}>
          {fTot}
        </div>
        {bCells.map((c, i) => (
          <Cell key={`b${i}`} style={{ background: hoverCol === i + 9 ? K.hoverBg : 'transparent', transition: 'background 0.1s' }}>
            <div onMouseEnter={() => setHoverCol(i + 9)} onMouseLeave={() => setHoverCol(null)}
                 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>{c}</div>
          </Cell>
        ))}
        <TotCell>{bTot}</TotCell>
        <TotCell bg={K.bgTot} borderW={2}>{grand}</TotCell>
      </GR>
    )
  }

  const L = (t: string) => <span style={{ fontSize: 8, color: K.ts, fontWeight: 700, letterSpacing: '0.1em', fontFamily: SANS }}>{t}</span>

  return (
    <>
      <R lbl={L('HOLE')} h={26} bg={K.bgH}
        fCells={f.map(s => <TX key={s.hole.numero} t={String(s.hole.numero)} sz={11} c={K.ts} w={600} />)}
        fTot={<TX t="OUT" sz={10} c={K.ts} w={700} />}
        bCells={b.map(s => <TX key={s.hole.numero} t={String(s.hole.numero)} sz={11} c={K.ts} w={600} />)}
        bTot={<TX t="IN" sz={10} c={K.ts} w={700} />}
        grand={<TX t="TOT" sz={10} c={K.ts} w={700} />}
      />

      <R lbl={L('PAR')} h={26} bg={K.bgH} bbColor={K.lineBold} bbW={2}
        fCells={f.map(s => <TX key={s.hole.numero} t={String(s.hole.par)} sz={12} c={K.tm} w={500} />)}
        fTot={<TX t={String(ft.p)} sz={12} c={K.tm} w={600} />}
        bCells={b.map(s => <TX key={s.hole.numero} t={String(s.hole.par)} sz={12} c={K.tm} w={500} />)}
        bTot={<TX t={String(bt.p)} sz={12} c={K.tm} w={600} />}
        grand={<TX t={String(gt.p)} sz={12} c={K.tm} w={700} />}
      />

      {ext && (() => {
        const fY = f.reduce((a, s) => a + (s.hole.yardaje ?? 0), 0)
        const bY = b.reduce((a, s) => a + (s.hole.yardaje ?? 0), 0)
        return (
          <R lbl={L('YDS')} h={22} bg={K.bgH}
            fCells={f.map(s => <TX key={s.hole.numero} t={s.hole.yardaje ? String(s.hole.yardaje) : ''} sz={9} c={K.tm} />)}
            fTot={fY > 0 ? <TX t={String(fY)} sz={9} c={K.tm} w={600} /> : null}
            bCells={b.map(s => <TX key={s.hole.numero} t={s.hole.yardaje ? String(s.hole.yardaje) : ''} sz={9} c={K.tm} />)}
            bTot={bY > 0 ? <TX t={String(bY)} sz={9} c={K.tm} w={600} /> : null}
            grand={fY + bY > 0 ? <TX t={String(fY + bY)} sz={9} c={K.ts} w={700} /> : null}
          />
        )
      })()}

      {ext && (
        <R lbl={L('HDCP')} h={22} bg={K.bgH} bbColor={K.lineBold} bbW={2}
          fCells={f.map(s => <TX key={s.hole.numero} t={String(s.hole.stroke_index)} sz={9} c={K.tm} />)}
          fTot={null} bCells={b.map(s => <TX key={s.hole.numero} t={String(s.hole.stroke_index)} sz={9} c={K.tm} />)}
          bTot={null} grand={null}
        />
      )}

      {/* SCORE — mejora #3: md icons en desktop (28px) */}
      <R lbl={L('GROSS')} h={44} bg={K.bgS} bb={!isN}
        fCells={f.map(s => <ScoreSymbol key={s.hole.numero} score={s.score} par={s.hole.par} size="md" theme="light" />)}
        fTot={<TX t={ft.g > 0 ? String(ft.g) : ''} sz={15} c={K.tp} w={700} />}
        bCells={b.map(s => <ScoreSymbol key={s.hole.numero} score={s.score} par={s.hole.par} size="md" theme="light" />)}
        bTot={<TX t={bt.g > 0 ? String(bt.g) : ''} sz={15} c={K.tp} w={700} />}
        grand={<TX t={gt.g > 0 ? String(gt.g) : ''} sz={16} c={K.tp} w={800} />}
      />

      {isN && (
        <R lbl={<span />} h={16} bg={K.bgS} bb={false}
          fCells={f.map(s => <StrokeDots key={s.hole.numero} count={s.strokes} />)}
          fTot={null} bCells={b.map(s => <StrokeDots key={s.hole.numero} count={s.strokes} />)}
          bTot={null} grand={null}
        />
      )}

      {isN && !isSt && (
        <R lbl={L('NETO')} h={26} bg={K.bgS} bbt
          fCells={f.map(s => <TX key={s.hole.numero} t={s.neto != null ? String(s.neto) : ''} sz={12} c={K.ts} w={500} it />)}
          fTot={<TX t={ft.n > 0 ? String(ft.n) : ''} sz={12} c={K.ts} w={700} it />}
          bCells={b.map(s => <TX key={s.hole.numero} t={s.neto != null ? String(s.neto) : ''} sz={12} c={K.ts} w={500} it />)}
          bTot={<TX t={bt.n > 0 ? String(bt.n) : ''} sz={12} c={K.ts} w={700} it />}
          grand={<TX t={gt.n > 0 ? String(gt.n) : ''} sz={13} c={K.ts} w={800} it />}
        />
      )}

      {isSt && (
        <>
          <R lbl={L('NETO')} h={26} bg={K.bgS} bbt bb={false}
            fCells={f.map(s => <TX key={s.hole.numero} t={s.neto != null ? String(s.neto) : ''} sz={12} c={K.ts} w={500} it />)}
            fTot={<TX t={ft.n > 0 ? String(ft.n) : ''} sz={12} c={K.ts} w={600} it />}
            bCells={b.map(s => <TX key={s.hole.numero} t={s.neto != null ? String(s.neto) : ''} sz={12} c={K.ts} w={500} it />)}
            bTot={<TX t={bt.n > 0 ? String(bt.n) : ''} sz={12} c={K.ts} w={600} it />}
            grand={<TX t={gt.n > 0 ? String(gt.n) : ''} sz={12} c={K.ts} w={700} it />}
          />
          <R lbl={L('PTS')} h={28} bg={K.bgS}
            fCells={f.map(s => <TX key={s.hole.numero} t={s.stabPts != null ? String(s.stabPts) : ''} sz={13} c={K.gold} w={700} />)}
            fTot={<TX t={ft.s > 0 ? String(ft.s) : ''} sz={14} c={K.gold} w={800} />}
            bCells={b.map(s => <TX key={s.hole.numero} t={s.stabPts != null ? String(s.stabPts) : ''} sz={13} c={K.gold} w={700} />)}
            bTot={<TX t={bt.s > 0 ? String(bt.s) : ''} sz={14} c={K.gold} w={800} />}
            grand={<TX t={gt.s > 0 ? String(gt.s) : ''} sz={16} c={K.gold} w={800} />}
          />
        </>
      )}
    </>
  )
})

// ═══════════════════════════════════════════════════════════
// STATS — mejora #2 y #6: front/back comparison + expandido desktop
// ═══════════════════════════════════════════════════════════

function Stats({ st, ft, bt, wide }: { st: HS[]; ft: Tot; bt: Tot | null; wide: boolean }) {
  const c = countRes(st)
  const items: { l: string; n: number; c: string }[] = []
  if (c.e > 0) items.push({ l: 'Eagles', n: c.e, c: GARMIN_COLORS.eagle })
  if (c.b > 0) items.push({ l: 'Birdies', n: c.b, c: GARMIN_COLORS.birdie })
  items.push({ l: 'Pares', n: c.p, c: K.ts })
  if (c.bo > 0) items.push({ l: 'Bogeys', n: c.bo, c: GARMIN_COLORS.bogey })
  if (c.d > 0) items.push({ l: 'Doble+', n: c.d, c: GARMIN_COLORS.double })

  // Mejora #2: front vs back comparison
  const hasBoth = bt != null && ft.g > 0 && bt.g > 0
  const fOu = ft.g - ft.p
  const bOu = bt ? bt.g - bt.p : 0
  const diff = hasBoth ? bOu - fOu : 0

  return (
    <div style={{ borderTop: `1px solid ${K.line}`, background: K.bgH, padding: wide ? '10px 20px' : '8px 14px' }}>
      {/* Score counts */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: wide ? 16 : 12, flexWrap: 'wrap' }}>
        {items.map(i => (
          <div key={i.l} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: wide ? 13 : 12, fontWeight: 700, color: i.c, fontFamily: MONO }}>{i.n}</span>
            <span style={{ fontSize: wide ? 11 : 10, color: K.ts }}>{i.l}</span>
          </div>
        ))}
      </div>

      {/* Front vs Back — mejora #2 */}
      {hasBoth && (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: wide ? 20 : 12,
          marginTop: 6, paddingTop: 6, borderTop: `1px solid ${K.line}`,
          fontSize: wide ? 11 : 10, color: K.ts, fontFamily: MONO,
        }}>
          <span>Front: {ft.g} ({fmtOu(fOu)})</span>
          <span>Back: {bt!.g} ({fmtOu(bOu)})</span>
          {diff !== 0 && (
            <span style={{ color: diff < 0 ? GARMIN_COLORS.birdie : GARMIN_COLORS.double, fontWeight: 600 }}>
              {diff < 0 ? `↑ Mejoró ${Math.abs(diff)}` : `↓ Subió ${diff}`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

export default function Scorecard({
  holes, scores, courseHandicap, modo, formato,
  playerName, avatarUrl, showExtendedInfo = false,
  courseName, date, formatLabel,
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
      {/* HEADER — mejora #1: contexto de ronda */}
      {(playerName || played > 0 || courseName) && (
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${K.line}` }}>
          {/* Contexto: club, fecha, formato */}
          {(courseName || date || formatLabel) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: playerName ? 10 : 0 }}>
              <div>
                {courseName && <div style={{ fontSize: 13, fontWeight: 600, color: K.tp }}>{courseName}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  {date && <span style={{ fontSize: 10, color: K.tm }}>{date}</span>}
                  {formatLabel && <span style={{ fontSize: 10, color: K.gold, fontWeight: 600 }}>{formatLabel}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Player + score */}
          {(playerName || played > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                      <span style={{ fontSize: wide ? 28 : 24, fontWeight: 700, color: K.gold, lineHeight: 1, fontFamily: MONO }}>{gt.s}</span>
                      <span style={{ fontSize: 10, color: K.gold, fontWeight: 600 }}>pts</span>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: wide ? 28 : 24, fontWeight: 700, color: K.tp, lineHeight: 1, fontFamily: MONO }}>{gt.g}</span>
                        <span style={{ fontSize: wide ? 14 : 12, color: K.ts, fontWeight: 500, fontFamily: MONO }}>{fmtOu(gt.g - gt.p)}</span>
                      </div>
                      {isN && courseHandicap !== 0 && (
                        <div style={{ fontSize: wide ? 11 : 10, color: K.tm, marginTop: 3, fontFamily: MONO, textAlign: 'right' }}>{gt.n} {fmtOu(gt.n - gt.p)} net</div>
                      )}
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
              {/* Separador Front/Back — solo espacio, sin líneas extra */}
              <div style={{ height: 6, background: K.bgH }} />
              <MobileHalf label="IN" st={b9} tot={bt} modo={modo} fmt={formato} ext={showExtendedInfo} />
            </>}
          </>
        )}
      </div>

      {/* STATS — mejora #2 y #6 */}
      {played > 0 && <Stats st={all} ft={ft} bt={bt} wide={wide} />}
    </div>
  )
}
