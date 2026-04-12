'use client'

/**
 * Scorecard — tarjeta de golf estilo Garmin Golf, versión premium Golfers+.
 *
 * v2 fixes:
 * - Bordes finos (1px) en ScoreSymbol
 * - Líneas separadoras entre filas hoyo/par/score/neto
 * - Neto visible en TODOS los hoyos (no solo donde hay palo)
 * - Stableford muestra strokes + neto + puntos desde neto
 * - Labels de fila a la izquierda (Hoyo, Par, Gross, Neto, Pts)
 * - Diseño refinado, premium, no infantil
 */

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
  holes: ScorecardHole[],
  scores: Record<string, number>,
  ch: number,
  totalH: number,
  fmt: ScorecardProps['formato']
): HoleStat[] {
  return holes.map(h => {
    const raw = scores[String(h.numero)]
    const score = typeof raw === 'number' && raw > 0 ? raw : null
    const strokes = strokesRecibidosEnHoyo(ch, h.stroke_index, totalH)
    const neto = score != null ? score - strokes : null
    const stablefordPts = score != null && fmt === 'stableford'
      ? puntosStablefordHoyo(score, h.par, ch, h.stroke_index, totalH)
      : null
    return { hole: h, score, strokes, neto, stablefordPts }
  })
}

interface Totals { gross: number; neto: number; par: number; stab: number }

function sumTotals(stats: HoleStat[]): Totals {
  return stats.reduce<Totals>((a, s) => ({
    gross: a.gross + (s.score ?? 0),
    neto: a.neto + (s.neto ?? 0),
    par: a.par + s.hole.par,
    stab: a.stab + (s.stablefordPts ?? 0),
  }), { gross: 0, neto: 0, par: 0, stab: 0 })
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════

const ROW: React.CSSProperties = { display: 'flex', alignItems: 'center' }
const SEP: React.CSSProperties = { height: 1, background: '#f0f0f0', margin: '3px 0' }

const cell = (): React.CSSProperties => ({
  flex: 1, minWidth: 0, textAlign: 'center' as const, fontFamily: MONO,
})

const totCell: React.CSSProperties = {
  flexShrink: 0, width: 42, textAlign: 'center' as const,
  borderLeft: '1px solid #e5e7eb', paddingLeft: 4, fontFamily: MONO,
}

// ═══════════════════════════════════════════════════════════
// HALF (front 9 or back 9)
// ═══════════════════════════════════════════════════════════

interface HalfProps {
  label: 'OUT' | 'IN'
  stats: HoleStat[]
  totals: Totals
  modo: 'gross' | 'neto'
  formato: ScorecardProps['formato']
  extended: boolean
}

function Half({ label, stats, totals, modo, formato, extended }: HalfProps) {
  const isNeto = modo === 'neto'
  const isStab = formato === 'stableford'

  return (
    <div style={{ marginBottom: 10 }}>
      {/* Hoyo */}
      <div style={ROW}>
        {stats.map(s => (
          <div key={s.hole.numero} style={{ ...cell(), fontSize: 10, color: GARMIN_COLORS.parText, fontWeight: 600 }}>{s.hole.numero}</div>
        ))}
        <div style={{ ...totCell, fontSize: 10, color: GARMIN_COLORS.parText, fontWeight: 700 }}>{label}</div>
      </div>

      <div style={SEP} />

      {/* Par */}
      <div style={ROW}>
        {stats.map(s => (
          <div key={s.hole.numero} style={{ ...cell(), fontSize: 11, color: GARMIN_COLORS.mutedDark, fontWeight: 500 }}>{s.hole.par}</div>
        ))}
        <div style={{ ...totCell, fontSize: 11, color: GARMIN_COLORS.mutedDark, fontWeight: 600 }}>{totals.par}</div>
      </div>

      {/* Extended: yardaje */}
      {extended && (
        <div style={ROW}>
          {stats.map(s => (
            <div key={s.hole.numero} style={{ ...cell(), fontSize: 9, color: GARMIN_COLORS.parText }}>{s.hole.yardaje ?? ''}</div>
          ))}
          <div style={totCell} />
        </div>
      )}

      {/* Extended: SI */}
      {extended && (
        <div style={ROW}>
          {stats.map(s => (
            <div key={s.hole.numero} style={{ ...cell(), fontSize: 9, color: GARMIN_COLORS.parText }}>{s.hole.stroke_index}</div>
          ))}
          <div style={totCell} />
        </div>
      )}

      <div style={SEP} />

      {/* Score gross con ícono Garmin */}
      <div style={{ ...ROW, minHeight: 28, marginTop: 2 }}>
        {stats.map(s => (
          <div key={s.hole.numero} style={{ ...cell(), display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <ScoreSymbol score={s.score} par={s.hole.par} size="sm" theme="light" />
          </div>
        ))}
        <div style={{ ...totCell, fontSize: 14, color: GARMIN_COLORS.neutral, fontWeight: 700 }}>
          {totals.gross > 0 ? totals.gross : ''}
        </div>
      </div>

      {/* Dots de strokes (neto o stableford) */}
      {isNeto && (
        <div style={ROW}>
          {stats.map(s => (
            <div key={s.hole.numero} style={{ ...cell(), fontSize: 8, color: GARMIN_COLORS.parText, height: 10, lineHeight: '10px' }}>
              {s.strokes > 0 ? '·'.repeat(s.strokes) : ''}
            </div>
          ))}
          <div style={totCell} />
        </div>
      )}

      {/* Neto en TODOS los hoyos (stroke play neto) */}
      {isNeto && !isStab && (
        <>
          <div style={SEP} />
          <div style={ROW}>
            {stats.map(s => (
              <div key={s.hole.numero} style={{ ...cell(), fontSize: 10, color: GARMIN_COLORS.mutedDark, fontWeight: 500 }}>
                {s.neto ?? ''}
              </div>
            ))}
            <div style={{ ...totCell, fontSize: 11, color: GARMIN_COLORS.mutedDark, fontWeight: 700 }}>
              {totals.neto > 0 ? totals.neto : ''}
            </div>
          </div>
        </>
      )}

      {/* Stableford: neto + puntos */}
      {isStab && (
        <>
          <div style={SEP} />
          <div style={ROW}>
            {stats.map(s => (
              <div key={s.hole.numero} style={{ ...cell(), fontSize: 10, color: GARMIN_COLORS.mutedDark, fontWeight: 500 }}>
                {s.neto ?? ''}
              </div>
            ))}
            <div style={{ ...totCell, fontSize: 11, color: GARMIN_COLORS.mutedDark, fontWeight: 600 }}>
              {totals.neto > 0 ? totals.neto : ''}
            </div>
          </div>
          <div style={SEP} />
          <div style={ROW}>
            {stats.map(s => (
              <div key={s.hole.numero} style={{ ...cell(), fontSize: 11, color: '#c4992a', fontWeight: 700 }}>
                {s.stablefordPts != null ? s.stablefordPts : ''}
              </div>
            ))}
            <div style={{ ...totCell, fontSize: 12, color: '#c4992a', fontWeight: 800 }}>
              {totals.stab > 0 ? totals.stab : ''}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// ROW LABELS
// ═══════════════════════════════════════════════════════════

function Labels({ modo, formato, extended }: { modo: string; formato: string; extended: boolean }) {
  const isNeto = modo === 'neto'
  const isStab = formato === 'stableford'
  const base: React.CSSProperties = {
    fontSize: 8, color: GARMIN_COLORS.parText, fontWeight: 600,
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
    fontFamily: SANS, display: 'flex', alignItems: 'center',
    whiteSpace: 'nowrap' as const,
  }
  const h14: React.CSSProperties = { ...base, height: 14 }
  const h28: React.CSSProperties = { ...base, height: 28, minHeight: 28 }
  const h10: React.CSSProperties = { ...base, height: 10 }
  const gap: React.CSSProperties = { height: 1, margin: '3px 0' }

  return (
    <div style={{ width: 30, flexShrink: 0, paddingRight: 2 }}>
      <div style={h14}>Hoyo</div>
      <div style={gap} />
      <div style={h14}>Par</div>
      {extended && <div style={h14}>Yds</div>}
      {extended && <div style={h14}>SI</div>}
      <div style={gap} />
      <div style={{ ...h28, marginTop: 2 }}>Gross</div>
      {isNeto && <div style={h10} />}
      {isNeto && !isStab && <><div style={gap} /><div style={h14}>Neto</div></>}
      {isStab && <><div style={gap} /><div style={h14}>Neto</div><div style={gap} /><div style={h14}>Pts</div></>}
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
      background: '#ffffff', borderRadius: 10,
      border: '1px solid #e5e7eb', overflow: 'hidden',
      fontFamily: SANS,
    }}>
      {/* HEADER */}
      {(playerName || played > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 14px 12px', borderBottom: '1px solid #f0f0f0',
        }}>
          {avatarUrl ? (
            <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid #e5e7eb' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : playerName ? (
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: '#f9fafb', border: '1px solid #e5e7eb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 600, color: GARMIN_COLORS.mutedDark,
            }}>
              {playerName.charAt(0).toUpperCase()}
            </div>
          ) : null}

          <div style={{ flex: 1, minWidth: 0 }}>
            {playerName && (
              <div style={{ fontSize: 14, fontWeight: 600, color: GARMIN_COLORS.neutral, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {playerName}
              </div>
            )}
            {isNeto && courseHandicap !== 0 && (
              <div style={{ fontSize: 10, color: GARMIN_COLORS.mutedDark, marginTop: 1 }}>HCP {courseHandicap}</div>
            )}
          </div>

          {played > 0 && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {isStab ? (
                <>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#c4992a', lineHeight: 1, fontFamily: MONO }}>{tS}</div>
                  <div style={{ fontSize: 9, color: '#c4992a', fontWeight: 600, marginTop: 2, letterSpacing: '0.1em' }}>PTS</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 24, fontWeight: 700, color: GARMIN_COLORS.neutral, lineHeight: 1, fontFamily: MONO }}>{tG}</div>
                  <div style={{ fontSize: 11, color: GARMIN_COLORS.mutedDark, marginTop: 2, fontFamily: MONO }}>{fmtOu(tG - tP)}</div>
                  {isNeto && courseHandicap !== 0 && (
                    <div style={{ fontSize: 10, color: GARMIN_COLORS.mutedDark, marginTop: 2, fontFamily: MONO }}>
                      {tN} {fmtOu(tN - tP)} net
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* TABLE */}
      <div style={{ padding: '10px 8px 12px', overflowX: 'auto' }}>
        <div style={{ display: 'flex' }}>
          <Labels modo={modo} formato={formato} extended={showExtendedInfo} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Half label="OUT" stats={f9} totals={f9t} modo={modo} formato={formato} extended={showExtendedInfo} />
          </div>
        </div>

        {hasBack && b9t && (
          <div style={{ display: 'flex', borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
            <Labels modo={modo} formato={formato} extended={showExtendedInfo} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Half label="IN" stats={b9} totals={b9t} modo={modo} formato={formato} extended={showExtendedInfo} />
            </div>
          </div>
        )}

        {hasBack && played > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 8,
            paddingTop: 8, borderTop: '1px solid #e5e7eb',
          }}>
            <span style={{ fontSize: 9, color: GARMIN_COLORS.parText, fontWeight: 700, letterSpacing: '0.1em' }}>TOTAL</span>
            {isStab ? (
              <span style={{ fontSize: 18, fontWeight: 700, color: '#c4992a', fontFamily: MONO }}>{tS} pts</span>
            ) : (
              <>
                <span style={{ fontSize: 18, fontWeight: 700, color: GARMIN_COLORS.neutral, fontFamily: MONO }}>{tG}</span>
                <span style={{ fontSize: 11, color: GARMIN_COLORS.mutedDark, fontFamily: MONO }}>{fmtOu(tG - tP)}</span>
                {isNeto && courseHandicap !== 0 && (
                  <span style={{ fontSize: 10, color: GARMIN_COLORS.mutedDark, fontFamily: MONO }}>· {tN} {fmtOu(tN - tP)} net</span>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
