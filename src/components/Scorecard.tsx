'use client'

/**
 * Scorecard — tarjeta de golf estilo Garmin Golf para post-ronda.
 *
 * Layout por defecto (Garmin-style):
 *   ┌───────────────────────────────────────────┐
 *   │ [avatar] Juan José Lamarca     88   +16   │
 *   │          HCP 11                 77 NET    │
 *   │                                            │
 *   │  1   2   3   4   5   6   7   8   9  OUT  │  ← números de hoyo (gris)
 *   │  4   4   3   4   4   3   4   5   5   36  │  ← par (gris)
 *   │ [6] [5]  3   4  [6]  3   4  [7] [8]  46  │  ← scores con íconos Garmin
 *   │  ·   ·       ·   ·       ·   ·   ·        │  ← dots de strokes
 *   │  ───────────────────────────────────────  │
 *   │  10  11  12  13  14  15  16  17  18  IN  │
 *   │  4   5   4   4   3   4   3   3   4   36  │
 *   │  4  (4) [6]  5   4  [4] [5] [4] [6]  42  │
 *   │  ·   ·   ·   ·       ·   ·   ·   ·        │
 *   │                                            │
 *   │                              TOTAL  88    │
 *   │                                     +16   │
 *   └───────────────────────────────────────────┘
 *
 * En modo neto, muestra el neto en pequeño debajo del gross.
 * En stableford, reemplaza gross por puntos (sin vs par).
 * Match play usa otro componente (tabla hoyo-a-hoyo estilo Ryder Cup).
 */

import ScoreSymbol, { GARMIN_COLORS } from './ScoreSymbol'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'

const MONO = '"DM Mono", ui-monospace, monospace'

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
  /** Datos de los hoyos (9 o 18). Deben venir ordenados por numero. */
  holes: ScorecardHole[]
  /** Scores del jugador por numero de hoyo (string key "1","2"...). */
  scores: Record<string, number>
  /** Course handicap entero del jugador (para strokes y neto). 0 si gross. */
  courseHandicap: number
  /** Modo de scoring — afecta si se muestran strokes/neto. */
  modo: 'gross' | 'neto'
  /** Formato — afecta qué se muestra como score primario (puntos en stableford). */
  formato: 'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome'
  /** Nombre del jugador (para header). Opcional. */
  playerName?: string
  /** URL avatar (opcional). */
  avatarUrl?: string
  /** Mostrar fila extra con yardaje + SI debajo del par. */
  showExtendedInfo?: boolean
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function formatOverUnder(n: number): string {
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : String(n)
}

interface HoleStats {
  hole: ScorecardHole
  score: number | null
  strokes: number
  neto: number | null
  stablefordPts: number | null
  vsParGross: number
  vsParNeto: number
}

function buildHoleStats(
  holes: ScorecardHole[],
  scores: Record<string, number>,
  courseHandicap: number,
  totalHoles: number,
  formato: ScorecardProps['formato']
): HoleStats[] {
  return holes.map(hole => {
    const raw = scores[String(hole.numero)]
    const score = typeof raw === 'number' && raw > 0 ? raw : null
    const strokes = strokesRecibidosEnHoyo(courseHandicap, hole.stroke_index, totalHoles)
    const neto = score != null ? score - strokes : null
    const stablefordPts = score != null && formato === 'stableford'
      ? puntosStablefordHoyo(score, hole.par, courseHandicap, hole.stroke_index, totalHoles)
      : null
    return {
      hole,
      score,
      strokes,
      neto,
      stablefordPts,
      vsParGross: score != null ? score - hole.par : 0,
      vsParNeto: neto != null ? neto - hole.par : 0,
    }
  })
}

interface HalfTotals {
  gross: number
  neto: number
  par: number
  stableford: number
}

function sumHalf(stats: HoleStats[]): HalfTotals {
  return stats.reduce<HalfTotals>(
    (acc, s) => ({
      gross: acc.gross + (s.score ?? 0),
      neto: acc.neto + (s.neto ?? 0),
      par: acc.par + s.hole.par,
      stableford: acc.stableford + (s.stablefordPts ?? 0),
    }),
    { gross: 0, neto: 0, par: 0, stableford: 0 }
  )
}

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTES
// ═══════════════════════════════════════════════════════════

interface HalfRowProps {
  label: 'OUT' | 'IN'
  stats: HoleStats[]
  totals: HalfTotals
  modo: 'gross' | 'neto'
  formato: ScorecardProps['formato']
  showExtendedInfo: boolean
}

function HalfRow({ label, stats, totals, modo, formato, showExtendedInfo }: HalfRowProps) {
  const isNeto = modo === 'neto'
  const isStableford = formato === 'stableford'

  const cellBase: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    fontFamily: MONO,
  }

  const totalCellStyle: React.CSSProperties = {
    flexShrink: 0,
    width: 44,
    textAlign: 'center',
    borderLeft: `1px solid ${GARMIN_COLORS.empty}`,
    paddingLeft: 6,
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Fila 1: número de hoyo + label OUT/IN */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {stats.map(s => (
          <div key={`num-${s.hole.numero}`} style={{ ...cellBase, fontSize: 11, color: GARMIN_COLORS.mutedDark, fontWeight: 500 }}>
            {s.hole.numero}
          </div>
        ))}
        <div style={{ ...totalCellStyle, fontSize: 11, color: GARMIN_COLORS.mutedDark, fontWeight: 700, letterSpacing: '0.06em' }}>
          {label}
        </div>
      </div>

      {/* Fila 2: PAR */}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
        {stats.map(s => (
          <div key={`par-${s.hole.numero}`} style={{ ...cellBase, fontSize: 13, color: GARMIN_COLORS.mutedDark, fontWeight: 500 }}>
            {s.hole.par}
          </div>
        ))}
        <div style={{ ...totalCellStyle, fontSize: 13, color: GARMIN_COLORS.mutedDark, fontWeight: 500 }}>
          {totals.par}
        </div>
      </div>

      {/* Fila 3 (opcional): yardaje */}
      {showExtendedInfo && (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 1 }}>
          {stats.map(s => (
            <div key={`yds-${s.hole.numero}`} style={{ ...cellBase, fontSize: 9, color: GARMIN_COLORS.mutedDark, opacity: 0.7 }}>
              {s.hole.yardaje ?? '—'}
            </div>
          ))}
          <div style={{ ...totalCellStyle }} />
        </div>
      )}

      {/* Fila 4 (opcional): stroke index */}
      {showExtendedInfo && (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 1 }}>
          {stats.map(s => (
            <div key={`si-${s.hole.numero}`} style={{ ...cellBase, fontSize: 9, color: GARMIN_COLORS.mutedDark, opacity: 0.7 }}>
              SI{s.hole.stroke_index}
            </div>
          ))}
          <div style={{ ...totalCellStyle }} />
        </div>
      )}

      {/* Fila 5: SCORE con ícono Garmin */}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
        {stats.map(s => (
          <div key={`score-${s.hole.numero}`} style={{ ...cellBase, display: 'flex', justifyContent: 'center' }}>
            <ScoreSymbol score={s.score} par={s.hole.par} size="sm" theme="light" />
          </div>
        ))}
        <div style={{ ...totalCellStyle, fontSize: 15, color: GARMIN_COLORS.neutral, fontWeight: 700 }}>
          {totals.gross > 0 ? totals.gross : '—'}
        </div>
      </div>

      {/* Fila 6: puntos de strokes recibidos (solo neto, no stableford) */}
      {isNeto && !isStableford && (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
          {stats.map(s => (
            <div key={`strokes-${s.hole.numero}`} style={{ ...cellBase, fontSize: 10, color: GARMIN_COLORS.mutedDark, height: 10, lineHeight: 1 }}>
              {s.strokes > 0 ? '·'.repeat(s.strokes) : ''}
            </div>
          ))}
          <div style={{ ...totalCellStyle }} />
        </div>
      )}

      {/* Fila 7: neto en gris pequeño (solo en modo neto, no stableford) */}
      {isNeto && !isStableford && (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 1 }}>
          {stats.map(s => (
            <div key={`net-${s.hole.numero}`} style={{ ...cellBase, fontSize: 10, color: GARMIN_COLORS.mutedDark, opacity: s.strokes > 0 ? 1 : 0 }}>
              {s.strokes > 0 && s.neto != null ? s.neto : ''}
            </div>
          ))}
          <div style={{ ...totalCellStyle, fontSize: 11, color: GARMIN_COLORS.mutedDark, fontWeight: 600 }}>
            {totals.neto > 0 ? totals.neto : ''}
          </div>
        </div>
      )}

      {/* Fila 8: puntos stableford (solo en stableford) */}
      {isStableford && (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
          {stats.map(s => (
            <div key={`pts-${s.hole.numero}`} style={{ ...cellBase, fontSize: 10, color: '#c4992a', fontWeight: 700 }}>
              {s.stablefordPts != null ? `${s.stablefordPts}pt` : ''}
            </div>
          ))}
          <div style={{ ...totalCellStyle, fontSize: 12, color: '#c4992a', fontWeight: 800 }}>
            {totals.stableford > 0 ? `${totals.stableford}` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════

export default function Scorecard({
  holes,
  scores,
  courseHandicap,
  modo,
  formato,
  playerName,
  avatarUrl,
  showExtendedInfo = false,
}: ScorecardProps) {
  const totalHoles = holes.length
  const isNeto = modo === 'neto'
  const isStableford = formato === 'stableford'

  // Stats por hoyo
  const allStats = buildHoleStats(holes, scores, courseHandicap, totalHoles, formato)
  const front9 = allStats.slice(0, 9)
  const back9 = allStats.slice(9, 18)
  const hasBack = back9.length > 0

  const front9Totals = sumHalf(front9)
  const back9Totals = hasBack ? sumHalf(back9) : null

  const totalGross = front9Totals.gross + (back9Totals?.gross ?? 0)
  const totalNeto = front9Totals.neto + (back9Totals?.neto ?? 0)
  const totalPar = front9Totals.par + (back9Totals?.par ?? 0)
  const totalStableford = front9Totals.stableford + (back9Totals?.stableford ?? 0)

  const vsParGross = totalGross - totalPar
  const vsParNeto = totalNeto - totalPar

  const holesPlayed = allStats.filter(s => s.score != null).length
  const hasAnyScore = holesPlayed > 0

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 16,
      border: '1px solid #e5e7eb',
      padding: '20px 16px 16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      fontFamily: '"DM Sans", sans-serif',
    }}>
      {/* HEADER: avatar + nombre + score grande */}
      {(playerName || hasAnyScore) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #f3f4f6' }}>
          {avatarUrl ? (
            <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid #e5e7eb' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt={playerName ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <div style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(196,153,42,0.08)',
              border: '1px solid rgba(196,153,42,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>🏌️</div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            {playerName && (
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {playerName}
              </div>
            )}
            {isNeto && courseHandicap !== 0 && (
              <div style={{ fontSize: 11, color: GARMIN_COLORS.mutedDark, marginTop: 2 }}>
                HCP {courseHandicap}
              </div>
            )}
          </div>

          {/* Score grande */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {hasAnyScore && (
              <>
                {isStableford ? (
                  <>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#c4992a', lineHeight: 1, fontFamily: MONO }}>
                      {totalStableford}
                    </div>
                    <div style={{ fontSize: 11, color: '#c4992a', marginTop: 2, letterSpacing: '0.08em', fontWeight: 700 }}>
                      PTS
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#111827', lineHeight: 1, fontFamily: MONO }}>
                      {totalGross}
                    </div>
                    <div style={{ fontSize: 13, color: GARMIN_COLORS.mutedDark, marginTop: 2, fontFamily: MONO }}>
                      {formatOverUnder(vsParGross)}
                    </div>
                    {isNeto && courseHandicap !== 0 && (
                      <div style={{ fontSize: 11, color: GARMIN_COLORS.mutedDark, marginTop: 4, fontFamily: MONO }}>
                        {totalNeto} <span style={{ opacity: 0.6 }}>{formatOverUnder(vsParNeto)}</span> NET
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* TABLA HOYO POR HOYO */}
      <HalfRow
        label="OUT"
        stats={front9}
        totals={front9Totals}
        modo={modo}
        formato={formato}
        showExtendedInfo={showExtendedInfo}
      />

      {hasBack && back9Totals && (
        <HalfRow
          label="IN"
          stats={back9}
          totals={back9Totals}
          modo={modo}
          formato={formato}
          showExtendedInfo={showExtendedInfo}
        />
      )}

      {/* TOTAL FINAL (solo si 18 hoyos) */}
      {hasBack && hasAnyScore && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline',
          gap: 10, marginTop: 6, paddingTop: 10,
          borderTop: `1px solid ${GARMIN_COLORS.empty}`,
        }}>
          <span style={{ fontSize: 10, color: GARMIN_COLORS.mutedDark, letterSpacing: '0.08em', fontWeight: 700 }}>
            TOTAL
          </span>
          {isStableford ? (
            <span style={{ fontSize: 22, fontWeight: 800, color: '#c4992a', fontFamily: MONO }}>
              {totalStableford} <span style={{ fontSize: 12, fontWeight: 700 }}>PTS</span>
            </span>
          ) : (
            <>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#111827', fontFamily: MONO }}>
                {totalGross}
              </span>
              <span style={{ fontSize: 13, color: GARMIN_COLORS.mutedDark, fontFamily: MONO }}>
                {formatOverUnder(vsParGross)}
              </span>
              {isNeto && courseHandicap !== 0 && (
                <span style={{ fontSize: 12, color: GARMIN_COLORS.mutedDark, fontFamily: MONO, marginLeft: 6 }}>
                  {totalNeto} {formatOverUnder(vsParNeto)} NET
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
