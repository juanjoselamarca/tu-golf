// Leaderboard individual (stroke/stableford) + scorecard expandible. Verbatim del monolito.
// Se oculta (display:none) en match play, igual que en el original.
import Scorecard from '@/components/Scorecard'
import type { ScorecardProps } from '@/components/Scorecard'
import { formatOverUnder } from '@/constants/golf'
import { scoreFgVar } from '@/lib/score-tokens'
import { formatThru, THRU_LABEL } from '@/golf/leaderboard/thru'
import type { RondaLibre } from '@/types/ronda'
import type { LeaderboardEntry } from '@/lib/ronda/leaderboard'
import { formatPuntosStableford } from '@/golf/leaderboard/formato-score'

export interface IndividualLeaderboardProps {
  ronda: RondaLibre
  leaderboard: LeaderboardEntry[]
  isNetoMode: boolean
  /** Visor sin sesión (regla `vistaPublica`): ni HCP ni el neto de apoyo. */
  sinNeto?: boolean
  hasCourse: boolean
  parMap: Record<number, number>
  siMap: Record<number, number>
  /** Course handicap de SCORING (9h) — usado para los strokes del scorecard expandible. */
  courseHcpMap: Record<string, number>
  /** Course handicap COMPLETO (18h) — el que se muestra en la columna HCP. */
  displayHcpMap: Record<string, number>
  /** Jugadores sin índice declarado o legible para este visor (#511): la columna HCP
   *  muestra "—", nunca un 0 inventado (su 0 de scoring no es un handicap real). */
  sinIndice?: readonly string[]
  fechaDisplay: string
  expanded: string | null
  onToggleExpand: (id: string) => void
}

export function IndividualLeaderboard({
  ronda, leaderboard, isNetoMode, sinNeto = false, hasCourse, parMap, siMap, courseHcpMap, displayHcpMap, sinIndice = [], fechaDisplay, expanded, onToggleExpand,
}: IndividualLeaderboardProps) {
  // Colores de resultado theme-aware: la tabla va sobre --bg-surface (navy en oscuro), donde la
  // variante clara de Garmin quedaba bajo AA (bogey #92700e = 3.71:1).
  const resultScoreColor = (vsPar: number, played: number) => {
    if (played === 0) return 'var(--text-3)'
    return scoreFgVar(vsPar)
  }

  // Simetría Gross/Neto: mostrar columna HCP + el número secundario (el modo NO
  // oficial) siempre que haya cancha, no sea stableford, y los hándicaps hagan
  // diferir gross de neto. Así una ronda gross con hándicaps muestra el Neto de
  // apoyo (igual que una neto muestra el Gross), y una gross casual sin hándicaps
  // queda limpia (solo Gross). El número PRIMARIO sigue siendo el modo oficial.
  const showSecondary =
    !sinNeto &&
    hasCourse &&
    ronda.formato_juego !== 'stableford' &&
    leaderboard.some(j => j.vsParGross !== j.vsParNeto)
  const secondaryLabel = isNetoMode ? 'Gross' : 'Neto'
  const sinIndiceSet = new Set(sinIndice)

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px',
      display: ronda.formato_juego === 'match_play' ? 'none' : 'block',
    }}>
      {/* Table header — incluye columna HCP cuando modo = neto */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: showSecondary
          ? '28px 1fr 40px 64px 52px'
          : '32px 1fr 72px 60px',
        padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', gap: '4px',
      }}>
        <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase' }}>#</span>
        <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Jugador</span>
        {showSecondary && (
          <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'center' }}>HCP</span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'center' }}>
          {ronda.formato_juego === 'stableford' ? 'PTS' : hasCourse ? (isNetoMode ? 'Neto' : 'Gross') : 'Score'}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'right' }}>{THRU_LABEL}</span>
      </div>

      {leaderboard.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: '14px' }}>
          Aún no hay jugadores en esta ronda
        </div>
      )}

      {leaderboard.map((j, idx) => {
        const isExpanded = expanded === j.id
        const isStableford = ronda.formato_juego === 'stableford'
        const scoreColor = isStableford
          ? (j.holesPlayed === 0 ? 'var(--text-3)' : 'var(--brand-on-bg)')
          : resultScoreColor(j.vsPar, j.holesPlayed)
        const vsParStr = isStableford
          ? (j.holesPlayed > 0 ? formatPuntosStableford(j.stablefordPts, { conUnidad: true }) : '—')
          : (j.holesPlayed > 0 ? formatOverUnder(j.vsPar) : '—')
        const holeNums = Array.from({ length: ronda.holes }, (_, i) => i + 1)

        return (
          <div key={j.id} style={{ borderBottom: '1px solid var(--border)' }}>
            {/* Row */}
            <button
              onClick={() => onToggleExpand(j.id)}
              aria-label={isExpanded ? `Colapsar scorecard de ${j.nombre}` : `Expandir scorecard de ${j.nombre}`}
              style={{
                width: '100%', background: 'var(--bg-surface)', border: 'none', cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: showSecondary
                  ? '28px 1fr 40px 64px 52px'
                  : '32px 1fr 72px 60px',
                padding: '13px 16px', alignItems: 'center', textAlign: 'left', gap: '4px',
              }}
            >
              <span style={{ fontSize: '14px', color: 'var(--text-3)', fontWeight: 600, fontFamily: '"DM Mono", monospace' }}>{idx + 1}</span>
              <span style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {j.nombre}
                {j.holesPlayed > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 400, marginLeft: '6px' }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                )}
              </span>
              {showSecondary && (
                <span style={{ fontSize: '13px', color: 'var(--brand-on-bg)', fontWeight: 700, textAlign: 'center', fontFamily: '"DM Mono", monospace' }}>
                  {/* HCP COMPLETO (18h): una ronda de 9h muestra el handicap entero,
                      no la mitad. El scoring sigue usando courseHcpMap (9h). Fallback
                      al índice redondeado (NO j.courseHcp, que es la mitad en 9h). */}
                  {sinIndiceSet.has(j.id)
                    ? <span title="Sin índice" style={{ color: 'var(--text-3)', fontWeight: 400 }}><span aria-hidden="true">—</span><span className="sr-only">Sin índice</span></span>
                    : (displayHcpMap[j.id] ?? Math.round(j.handicap ?? 0))}
                </span>
              )}
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '17px', fontWeight: 700, color: scoreColor, fontFamily: '"DM Mono", monospace' }}>
                  {vsParStr}
                </span>
                {showSecondary && j.holesPlayed > 0 && j.vsParGross !== j.vsParNeto && (
                  <div style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: '"DM Mono", monospace' }}>
                    {secondaryLabel} {formatOverUnder(isNetoMode ? j.vsParGross : j.vsParNeto)}
                  </div>
                )}
              </div>
              <span style={{
                fontSize: '13px', color: 'var(--text-3)', textAlign: 'right',
                fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums',
              }}>
                {formatThru(j.holesPlayed, ronda.holes)}
              </span>
            </button>

            {/* Expandable scorecard — Componente Scorecard premium */}
            {isExpanded && j.holesPlayed > 0 && (
              <Scorecard
                holes={holeNums.map(h => ({
                  numero: h,
                  par: parMap[h] ?? 4,
                  stroke_index: siMap[h] ?? h,
                }))}
                scores={j.scores}
                courseHandicap={courseHcpMap[j.id] ?? Math.round(j.handicap ?? 0)}
                displayHandicap={displayHcpMap[j.id] ?? Math.round(j.handicap ?? 0)}
                modo={ronda.modo_juego as 'gross' | 'neto'}
                formato={ronda.formato_juego as ScorecardProps['formato']}
                playerName={j.nombre}
                courseName={ronda.course_name}
                date={fechaDisplay}
                formatLabel={(() => {
                  if (ronda.formato_juego === 'stableford') return 'Stableford'
                  const modoSuffix = ronda.modo_juego === 'neto' ? 'Neto' : 'Gross'
                  if (ronda.formato_juego === 'match_play') return `Match Play ${modoSuffix}`
                  return `Stroke Play ${modoSuffix}`
                })()}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
