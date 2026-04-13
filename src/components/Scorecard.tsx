'use client'

/**
 * Scorecard v5 — Precision instrument design.
 *
 * Principios:
 * 1. CSS Grid real con columnas fijas — pixel-perfect alignment
 * 2. UN solo estilo de línea en TODA la tabla (1px #dfe2e6)
 * 3. Row heights estandarizadas: 26px info, 38px score
 * 4. Todo DM Mono en la tabla — alineación vertical perfecta
 * 5. Dos niveles: score = primario (14px, bold), resto = secundario (11px, normal)
 * 6. Simetría absoluta: front 9 y back 9 son espejos visuales
 *
 * Basado en: PGA Tour Haskell design system, Garmin Golf,
 * Masters.com leaderboard, best practices de scorecards físicas.
 */

import { memo } from 'react'
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
// DESIGN TOKENS — un solo lugar, cero variación
// ═══════════════════════════════════════════════════════════

const T = {
  // Colores
  line: '#dfe2e6',          // UN solo color de línea en toda la tabla
  bgHeader: '#f5f6f8',     // fondo de filas info (hoyo, par, neto)
  bgScore: '#ffffff',       // fondo de fila score (protagonista)
  textPrimary: '#1a1a2e',  // scores
  textSecondary: '#7c8594', // hoyo, par, neto
  textMuted: '#a3aab6',    // dots, placeholders
  gold: '#c4992a',          // Golfers+ stableford

  // Dimensiones
  rowH: 26,                 // altura fila secundaria
  scoreRowH: 38,            // altura fila score (protagonista)
  totalW: 48,               // ancho columna total
  lineW: 1,                 // grosor de TODAS las líneas

  // Tipografía
  fontSm: 10,               // hoyo numbers, dots
  fontMd: 11,               // par, neto, stableford pts
  fontScore: 13,            // gross scores (protagonista en tabla)
  fontTotal: 14,            // totales OUT/IN
  fontHeader: 24,           // score grande en header
} as const

// Grid: 9 columnas de hoyo + 1 columna total
const GRID_COLS = `repeat(9, 1fr) ${T.totalW}px`

// ═══════════════════════════════════════════════════════════
// TABLE ROW — componente base para cada fila de la tabla
// ═══════════════════════════════════════════════════════════

interface RowProps {
  cells: React.ReactNode[]
  total: React.ReactNode
  bg: string
  height: number
  borderBottom?: boolean
  borderTop?: boolean
}

function Row({ cells, total, bg, height, borderBottom = true, borderTop = false }: RowProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: GRID_COLS,
      background: bg,
      minHeight: height,
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
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: MONO,
        borderLeft: `${T.lineW}px solid ${T.line}`,
        background: T.bgHeader,
      }}>
        {total}
      </div>
    </div>
  )
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

const Half = memo(function Half({ label, stats, totals, modo, formato, extended }: HalfProps) {
  const isNeto = modo === 'neto'
  const isStab = formato === 'stableford'

  const txt = (s: string, size: number, color: string, weight = 400, italic = false): React.ReactNode => (
    <span style={{ fontSize: size, color, fontWeight: weight, fontStyle: italic ? 'italic' : 'normal' }}>{s}</span>
  )

  return (
    <>
      {/* Hoyo */}
      <Row
        bg={T.bgHeader}
        height={T.rowH}
        cells={stats.map(s => txt(String(s.hole.numero), T.fontSm, T.textSecondary, 600))}
        total={txt(label, T.fontSm, T.textSecondary, 700)}
      />

      {/* Par */}
      <Row
        bg={T.bgHeader}
        height={T.rowH}
        cells={stats.map(s => txt(String(s.hole.par), T.fontMd, T.textSecondary, 500))}
        total={txt(String(totals.par), T.fontMd, T.textSecondary, 600)}
      />

      {/* Yardaje (extended) */}
      {extended && (
        <Row
          bg={T.bgHeader}
          height={22}
          cells={stats.map(s => txt(s.hole.yardaje ? String(s.hole.yardaje) : '', 9, T.textMuted))}
          total={txt('', 9, T.textMuted)}
        />
      )}

      {/* SI (extended) */}
      {extended && (
        <Row
          bg={T.bgHeader}
          height={22}
          cells={stats.map(s => txt(String(s.hole.stroke_index), 9, T.textMuted))}
          total={txt('', 9, T.textMuted)}
        />
      )}

      {/* ══ SCORE GROSS — protagonista ══ */}
      <Row
        bg={T.bgScore}
        height={T.scoreRowH}
        cells={stats.map(s => (
          <ScoreSymbol key={s.hole.numero} score={s.score} par={s.hole.par} size="sm" theme="light" />
        ))}
        total={txt(
          totals.gross > 0 ? String(totals.gross) : '',
          T.fontTotal, T.textPrimary, 700
        )}
      />

      {/* Strokes dots (neto modes) */}
      {isNeto && (
        <Row
          bg={T.bgScore}
          height={16}
          borderBottom={false}
          cells={stats.map(s => txt(
            s.strokes > 0 ? '·'.repeat(s.strokes) : '',
            9, T.textMuted
          ))}
          total={txt('', 9, T.textMuted)}
        />
      )}

      {/* Neto TODOS los hoyos (stroke play neto) */}
      {isNeto && !isStab && (
        <Row
          bg={T.bgHeader}
          height={T.rowH}
          borderTop={true}
          cells={stats.map(s => txt(
            s.neto != null ? String(s.neto) : '',
            T.fontMd, T.textSecondary, 500, true
          ))}
          total={txt(
            totals.neto > 0 ? String(totals.neto) : '',
            T.fontMd, T.textSecondary, 700, true
          )}
        />
      )}

      {/* Stableford: neto + puntos */}
      {isStab && (
        <>
          <Row
            bg={T.bgHeader}
            height={T.rowH}
            borderTop={true}
            cells={stats.map(s => txt(
              s.neto != null ? String(s.neto) : '',
              T.fontMd, T.textSecondary, 500, true
            ))}
            total={txt(
              totals.neto > 0 ? String(totals.neto) : '',
              T.fontMd, T.textSecondary, 600, true
            )}
          />
          <Row
            bg={T.bgScore}
            height={T.rowH + 2}
            cells={stats.map(s => txt(
              s.stablefordPts != null ? String(s.stablefordPts) : '',
              T.fontMd + 1, T.gold, 700
            ))}
            total={txt(
              totals.stab > 0 ? String(totals.stab) : '',
              T.fontTotal, T.gold, 800
            )}
          />
        </>
      )}
    </>
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
      boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
      overflow: 'hidden',
      fontFamily: SANS,
    }}>
      {/* ── HEADER ── */}
      {(playerName || played > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px',
          borderBottom: `${T.lineW}px solid ${T.line}`,
        }}>
          {avatarUrl ? (
            <div style={{
              width: 36, height: 36, borderRadius: '50%', overflow: 'hidden',
              flexShrink: 0, border: `1px solid ${T.line}`,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : playerName ? (
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: T.bgHeader, border: `1px solid ${T.line}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 600, color: T.textSecondary,
            }}>
              {playerName.charAt(0).toUpperCase()}
            </div>
          ) : null}

          <div style={{ flex: 1, minWidth: 0 }}>
            {playerName && (
              <div style={{
                fontSize: 14, fontWeight: 600, color: T.textPrimary,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {playerName}
              </div>
            )}
            {isNeto && courseHandicap !== 0 && (
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
                HCP {courseHandicap}
              </div>
            )}
          </div>

          {played > 0 && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {isStab ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ fontSize: T.fontHeader, fontWeight: 700, color: T.gold, lineHeight: 1, fontFamily: MONO }}>
                    {tS}
                  </span>
                  <span style={{ fontSize: 10, color: T.gold, fontWeight: 600 }}>pts</span>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: T.fontHeader, fontWeight: 700, color: T.textPrimary, lineHeight: 1, fontFamily: MONO }}>
                      {tG}
                    </span>
                    <span style={{ fontSize: 12, color: T.textSecondary, fontFamily: MONO }}>
                      {fmtOu(tG - tP)}
                    </span>
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
        <Half label="OUT" stats={f9} totals={f9t}
              modo={modo} formato={formato} extended={showExtendedInfo} />

        {hasBack && b9t && (
          <>
            {/* Separador Front/Back — mismo estilo que todas las líneas */}
            <div style={{ height: 6, background: T.bgHeader, borderBottom: `${T.lineW}px solid ${T.line}` }} />
            <Half label="IN" stats={b9} totals={b9t}
                  modo={modo} formato={formato} extended={showExtendedInfo} />
          </>
        )}
      </div>

      {/* ── TOTAL FINAL ── */}
      {hasBack && played > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 8,
          padding: '10px 16px',
          background: T.bgHeader,
          borderTop: `${T.lineW}px solid ${T.line}`,
        }}>
          <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, letterSpacing: '0.12em', fontFamily: SANS }}>
            TOTAL
          </span>
          {isStab ? (
            <span style={{ fontSize: 20, fontWeight: 700, color: T.gold, fontFamily: MONO }}>
              {tS} <span style={{ fontSize: 11, fontWeight: 600 }}>pts</span>
            </span>
          ) : (
            <>
              <span style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary, fontFamily: MONO }}>{tG}</span>
              <span style={{ fontSize: 12, color: T.textSecondary, fontFamily: MONO }}>{fmtOu(tG - tP)}</span>
              {isNeto && courseHandicap !== 0 && (
                <span style={{ fontSize: 10, color: T.textMuted, fontFamily: MONO }}>
                  · {tN} {fmtOu(tN - tP)} net
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
