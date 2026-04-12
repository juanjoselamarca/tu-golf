'use client'

/**
 * Scorecard v3 — Elegancia, modernidad, best UI performance.
 *
 * Cambios v3:
 * - Filas con background alternado (hoyo/par en gris sutil, score en blanco)
 * - Fila de score más alta (34px) con padding — protagonismo visual
 * - Columna total con fondo sutil y borde izquierdo visible
 * - Separadores más visibles (#e0e2e6)
 * - Labels eliminados (Garmin no los usa y se lee mejor sin ellos)
 * - Score cells con más padding/aire
 * - Container con shadow suave, sin borde visible
 * - Neto con tipografía diferenciada (gris más claro, italic sutil)
 * - React.memo en Half para performance
 */

import { memo } from 'react'
import ScoreSymbol, { GARMIN_COLORS } from './ScoreSymbol'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'

const MONO = '"DM Mono", ui-monospace, monospace'
const SANS = '"DM Sans", system-ui, sans-serif'

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
    return { hole: h, score, strokes, neto, stablefordPts }
  })
}

interface Totals { gross: number; neto: number; par: number; stab: number }

function sumTotals(stats: HoleStat[]): Totals {
  return stats.reduce<Totals>((a, s) => ({
    gross: a.gross + (s.score ?? 0), neto: a.neto + (s.neto ?? 0),
    par: a.par + s.hole.par, stab: a.stab + (s.stablefordPts ?? 0),
  }), { gross: 0, neto: 0, par: 0, stab: 0 })
}

// ═══════════════════════════════════════════════════════════
// PALETTE
// ═══════════════════════════════════════════════════════════

const C = {
  bg: '#f8f9fa',       // background sutil para filas secundarias
  bgWhite: '#ffffff',  // background para filas protagonistas (score)
  sep: '#e0e2e6',      // separadores visibles
  sepLight: '#eef0f2', // separadores entre sub-filas
  totBg: '#f4f5f7',    // fondo columna total
  totBorder: '#d8dade', // borde izquierdo columna total
  holeNum: '#8b95a3',  // número de hoyo
  parNum: '#9ca3af',   // par
  scoreNum: '#1a1a2e', // score (protagonista)
  netoNum: '#a0a8b4',  // neto (secundario)
  gold: '#c4992a',     // Golfers+ gold
} as const

// ═══════════════════════════════════════════════════════════
// HALF (front 9 or back 9) — memoized
// ═══════════════════════════════════════════════════════════

interface HalfProps {
  label: 'OUT' | 'IN'
  stats: HoleStat[]
  totals: Totals
  modo: 'gross' | 'neto'
  formato: ScorecardProps['formato']
  extended: boolean
}

const Half = memo(function Half({ label, stats, totals, modo, formato, extended }: HalfProps) {
  const isNeto = modo === 'neto'
  const isStab = formato === 'stableford'

  const cell: React.CSSProperties = { flex: 1, minWidth: 0, textAlign: 'center', fontFamily: MONO }
  const tot: React.CSSProperties = {
    flexShrink: 0, width: 46, textAlign: 'center', fontFamily: MONO,
    borderLeft: `1px solid ${C.totBorder}`, background: C.totBg,
  }
  const row = (bg: string, h?: number): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', background: bg,
    minHeight: h ?? 20, padding: '0 2px',
  })
  const sep = (color: string = C.sep): React.CSSProperties => ({
    height: 1, background: color, width: '100%',
  })

  return (
    <div>
      {/* ── Hoyo numbers ── */}
      <div style={row(C.bg)}>
        {stats.map(s => (
          <div key={s.hole.numero} style={{ ...cell, fontSize: 10, color: C.holeNum, fontWeight: 600, padding: '5px 0' }}>
            {s.hole.numero}
          </div>
        ))}
        <div style={{ ...tot, fontSize: 10, color: C.holeNum, fontWeight: 700, padding: '5px 0' }}>{label}</div>
      </div>

      <div style={sep()} />

      {/* ── Par ── */}
      <div style={row(C.bg)}>
        {stats.map(s => (
          <div key={s.hole.numero} style={{ ...cell, fontSize: 11, color: C.parNum, fontWeight: 500, padding: '4px 0' }}>
            {s.hole.par}
          </div>
        ))}
        <div style={{ ...tot, fontSize: 11, color: C.parNum, fontWeight: 600, padding: '4px 0' }}>{totals.par}</div>
      </div>

      {/* ── Extended: yardaje ── */}
      {extended && (
        <div style={row(C.bg)}>
          {stats.map(s => (
            <div key={s.hole.numero} style={{ ...cell, fontSize: 9, color: C.holeNum, padding: '2px 0' }}>
              {s.hole.yardaje ?? ''}
            </div>
          ))}
          <div style={tot} />
        </div>
      )}

      {/* ── Extended: SI ── */}
      {extended && (
        <div style={row(C.bg)}>
          {stats.map(s => (
            <div key={s.hole.numero} style={{ ...cell, fontSize: 9, color: C.holeNum, padding: '2px 0' }}>
              {s.hole.stroke_index}
            </div>
          ))}
          <div style={tot} />
        </div>
      )}

      <div style={sep()} />

      {/* ── SCORE GROSS — protagonista ── */}
      <div style={row(C.bgWhite, 34)}>
        {stats.map(s => (
          <div key={s.hole.numero} style={{ ...cell, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4px 0' }}>
            <ScoreSymbol score={s.score} par={s.hole.par} size="sm" theme="light" />
          </div>
        ))}
        <div style={{ ...tot, fontSize: 15, color: C.scoreNum, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {totals.gross > 0 ? totals.gross : ''}
        </div>
      </div>

      {/* ── Dots de strokes (neto) ── */}
      {isNeto && (
        <div style={row(C.bgWhite)}>
          {stats.map(s => (
            <div key={s.hole.numero} style={{ ...cell, fontSize: 9, color: C.holeNum, height: 12, lineHeight: '12px' }}>
              {s.strokes > 0 ? '·'.repeat(s.strokes) : ''}
            </div>
          ))}
          <div style={tot} />
        </div>
      )}

      <div style={sep()} />

      {/* ── Neto en TODOS los hoyos (stroke play neto) ── */}
      {isNeto && !isStab && (
        <div style={row(C.bg)}>
          {stats.map(s => (
            <div key={s.hole.numero} style={{ ...cell, fontSize: 10, color: C.netoNum, fontWeight: 500, fontStyle: 'italic', padding: '4px 0' }}>
              {s.neto ?? ''}
            </div>
          ))}
          <div style={{ ...tot, fontSize: 11, color: C.netoNum, fontWeight: 700, fontStyle: 'italic', padding: '4px 0' }}>
            {totals.neto > 0 ? totals.neto : ''}
          </div>
        </div>
      )}

      {/* ── Stableford: neto + puntos ── */}
      {isStab && (
        <>
          <div style={row(C.bg)}>
            {stats.map(s => (
              <div key={s.hole.numero} style={{ ...cell, fontSize: 10, color: C.netoNum, fontWeight: 500, fontStyle: 'italic', padding: '3px 0' }}>
                {s.neto ?? ''}
              </div>
            ))}
            <div style={{ ...tot, fontSize: 11, color: C.netoNum, fontWeight: 600, fontStyle: 'italic', padding: '3px 0' }}>
              {totals.neto > 0 ? totals.neto : ''}
            </div>
          </div>
          <div style={sep(C.sepLight)} />
          <div style={row(C.bgWhite)}>
            {stats.map(s => (
              <div key={s.hole.numero} style={{ ...cell, fontSize: 11, color: C.gold, fontWeight: 700, padding: '4px 0' }}>
                {s.stablefordPts != null ? s.stablefordPts : ''}
              </div>
            ))}
            <div style={{ ...tot, fontSize: 13, color: C.gold, fontWeight: 800, padding: '4px 0' }}>
              {totals.stab > 0 ? totals.stab : ''}
            </div>
          </div>
        </>
      )}
    </div>
  )
})

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

export default function Scorecard({
  holes, scores, courseHandicap, modo, formato,
  playerName, avatarUrl, showExtendedInfo = false,
}: ScorecardProps) {
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

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 8,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
      overflow: 'hidden',
      fontFamily: SANS,
    }}>
      {/* ── HEADER ── */}
      {(playerName || played > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px',
          borderBottom: `1px solid ${C.sep}`,
        }}>
          {avatarUrl ? (
            <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `1px solid ${C.sep}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : playerName ? (
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: C.bg, border: `1px solid ${C.sep}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600, color: C.holeNum,
            }}>
              {playerName.charAt(0).toUpperCase()}
            </div>
          ) : null}

          <div style={{ flex: 1, minWidth: 0 }}>
            {playerName && (
              <div style={{ fontSize: 13, fontWeight: 600, color: C.scoreNum, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {playerName}
              </div>
            )}
            {isNeto && courseHandicap !== 0 && (
              <div style={{ fontSize: 10, color: C.netoNum, marginTop: 1 }}>HCP {courseHandicap}</div>
            )}
          </div>

          {played > 0 && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {isStab ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: C.gold, lineHeight: 1, fontFamily: MONO }}>{tS}</span>
                  <span style={{ fontSize: 10, color: C.gold, fontWeight: 600 }}>pts</span>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: C.scoreNum, lineHeight: 1, fontFamily: MONO }}>{tG}</span>
                    <span style={{ fontSize: 12, color: C.netoNum, fontFamily: MONO }}>{fmtOu(tG - tP)}</span>
                  </div>
                  {isNeto && courseHandicap !== 0 && (
                    <div style={{ fontSize: 10, color: C.netoNum, marginTop: 2, fontFamily: MONO, textAlign: 'right' }}>
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
        <Half label="OUT" stats={f9} totals={f9t} modo={modo} formato={formato} extended={showExtendedInfo} />

        {hasBack && b9t && (
          <>
            <div style={{ height: 2, background: C.sep }} />
            <Half label="IN" stats={b9} totals={b9t} modo={modo} formato={formato} extended={showExtendedInfo} />
          </>
        )}

        {/* ── TOTAL ── */}
        {hasBack && played > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 8,
            padding: '10px 14px',
            borderTop: `2px solid ${C.sep}`,
            background: C.bg,
          }}>
            <span style={{ fontSize: 9, color: C.holeNum, fontWeight: 700, letterSpacing: '0.12em' }}>TOTAL</span>
            {isStab ? (
              <span style={{ fontSize: 20, fontWeight: 700, color: C.gold, fontFamily: MONO }}>{tS} <span style={{ fontSize: 11 }}>pts</span></span>
            ) : (
              <>
                <span style={{ fontSize: 20, fontWeight: 700, color: C.scoreNum, fontFamily: MONO }}>{tG}</span>
                <span style={{ fontSize: 12, color: C.netoNum, fontFamily: MONO }}>{fmtOu(tG - tP)}</span>
                {isNeto && courseHandicap !== 0 && (
                  <span style={{ fontSize: 10, color: C.netoNum, fontFamily: MONO }}>· {tN} {fmtOu(tN - tP)} net</span>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
