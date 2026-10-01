'use client'

import { getScoreResult, getScoreColor, SCORE_STYLES } from '@/golf/core/colors'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import { formatVsPar } from '@/golf/share/vs-par'
import type { TotalesDeTarjeta } from '@/golf/ronda-libre/progreso-de-ronda'
import type { FormatoJuego, HoleData, Jugador, ModoJuego } from '@/types/ronda'
import type { ScorerTheme } from '@/components/ronda/scorer-theme'
import { chipLabelCorto } from './chip-label'

interface PlayerScoreCardProps {
  jugador: Jugador
  playerScores: Record<number, number> | undefined
  currentHole: number
  par: number
  holeData: HoleData
  totals: TotalesDeTarjeta
  played: number
  /** HCP que puntúa, el que se muestra (18h) y el de los puntos de golpe. */
  hcp: number
  displayHcp: number | undefined
  dotHcp: number
  siAllocByHole: Record<number, number>
  ordenHoyos: readonly number[]
  holeDataMap: Record<number, HoleData>
  totalHoles: number
  modoJuego: ModoJuego
  formatoJuego: FormatoJuego
  showNetStableford: boolean
  /** A1 anti-toque: hay un cambio esperando el segundo tap en este jugador/hoyo. */
  pending: boolean
  onChange: (delta: number) => void
  theme: ScorerTheme
}

/** Tarjeta de UN jugador en el scorer de grupo (stroke play / stableford / match play). */
export function PlayerScoreCard({
  jugador: j, playerScores, currentHole, par, holeData, totals, played, hcp, displayHcp, dotHcp,
  siAllocByHole, ordenHoyos, holeDataMap, totalHoles, modoJuego, formatoJuego, showNetStableford, pending, onChange, theme,
}: PlayerScoreCardProps) {
  const playerScore = playerScores?.[currentHole]
  const displayScore = playerScore ?? par
  const diff = playerScore != null ? playerScore - par : 0
  const { gross, vsPar, out, inn } = totals
  const scoreResult = playerScore != null ? getScoreResult(playerScore, par) : null
  const chipStyle = scoreResult ? SCORE_STYLES[scoreResult] : null
  const siAllocThisHole = siAllocByHole[currentHole] ?? holeData.stroke_index
  const strokesThisHole = strokesRecibidosEnHoyo(dotHcp, siAllocThisHole, totalHoles)
  const netScoreThisHole = playerScore != null ? playerScore - strokesThisHole : null
  const stablefordPts = playerScore != null ? puntosStablefordHoyo(playerScore, par, hcp, siAllocThisHole, totalHoles) : null

  // Running net/stableford totals
  let runningStableford = 0
  let runningNetVsPar = 0
  if (showNetStableford) {
    for (const h of ordenHoyos) {
      const s = playerScores?.[h]
      if (s != null) {
        const hd = holeDataMap[h]
        if (hd) {
          const si = siAllocByHole[h] ?? hd.stroke_index
          runningStableford += puntosStablefordHoyo(s, hd.par, hcp, si, totalHoles)
          runningNetVsPar += (s - strokesRecibidosEnHoyo(hcp, si, totalHoles)) - hd.par
        }
      }
    }
  }

  return (
    <div style={{
      background: theme.card,
      borderRadius: '14px',
      border: `1px solid ${theme.border}`,
      padding: '12px 14px',
    }}>
      {/* Player name + running total */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>{j.nombre}</div>
          {showNetStableford && played > 0 && (
            <div style={{ fontSize: '10px', color: theme.textFaint, marginTop: '1px' }}>
              HCP {displayHcp ?? hcp}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', flexDirection: 'column', gap: '2px' }}>
          {played > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: theme.textFaint, fontFamily: '"DM Mono", monospace' }}>
                  {out > 0 ? `${out}` : ''}{out > 0 && inn > 0 ? '+' : ''}{inn > 0 ? `${inn}` : ''}={gross}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: getScoreColor(vsPar) }}>
                  {formatVsPar(vsPar)}
                </span>
              </div>
              {showNetStableford && (
                <span style={{ fontSize: '10px', color: formatoJuego === 'stableford' ? 'var(--brand-on-bg)' : '#60A5FA' }}>
                  {formatoJuego === 'stableford' ? `${runningStableford} pts` : `Net: ${runningNetVsPar >= 0 ? '+' : ''}${runningNetVsPar}`}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* A1 anti-toque: aviso cuando hay pending confirm para este jugador/hoyo */}
      {pending && (
        <div style={{
          textAlign: 'center', marginBottom: '8px',
          fontSize: '11px', fontWeight: 600, color: 'var(--brand-on-bg)',
          background: 'rgba(196,153,42,0.12)',
          border: '1px solid rgba(196,153,42,0.35)',
          borderRadius: '8px', padding: '6px 10px',
          animation: 'livePulse 1.2s ease-in-out infinite',
        }}>
          Toca otra vez para cambiar el score
        </div>
      )}

      {/* Score + controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        {/* Minus button */}
        <button
          onClick={() => onChange(-1)}
          disabled={playerScore != null && playerScore <= 1}
          style={{
            width: '52px', height: '52px', borderRadius: '14px',
            fontSize: '24px', fontWeight: 300,
            background: pending ? 'rgba(196,153,42,0.2)' : 'var(--bg)',
            color: '#374151',
            border: pending ? '1px solid rgba(196,153,42,0.55)' : '1px solid #e2e8f0',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation', userSelect: 'none',
            opacity: playerScore != null && playerScore <= 1 ? 0.3 : 1,
            transition: 'background 0.2s, border 0.2s',
          }}
        >
          {'−'}
        </button>

        {/* Score display */}
        <div style={{ textAlign: 'center', minWidth: '80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <div style={{
              fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace',
              fontSize: '42px', fontWeight: 700, lineHeight: 1,
              color: playerScore != null ? '#1a1a2e' : '#d1d5db',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {displayScore}
            </div>
            {modoJuego !== 'gross' && strokesThisHole > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px',
                alignSelf: 'flex-start', marginTop: '6px',
              }}>
                {Array.from({ length: strokesThisHole }, (_, i) => (
                  <span key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c4992a' }} />
                ))}
              </span>
            )}
          </div>
          {/* Chip */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
            {playerScore != null && chipStyle && (
              <div style={{
                padding: '2px 10px', borderRadius: '12px',
                fontSize: '10px', fontWeight: 500,
                background: chipStyle.bg, color: chipStyle.textColor,
                border: `${chipStyle.borderWidth} solid ${chipStyle.border}`,
                display: 'inline-block',
              }}>
                {chipLabelCorto(diff)}
              </div>
            )}
            {showNetStableford && playerScore != null && (
              <div style={{
                padding: '2px 8px', borderRadius: '10px',
                fontSize: '9px', fontWeight: 600,
                background: formatoJuego === 'stableford' ? 'rgba(196,153,42,0.15)' : 'rgba(96,165,250,0.15)',
                color: formatoJuego === 'stableford' ? 'var(--brand-on-bg)' : '#60A5FA',
                border: `1px solid ${formatoJuego === 'stableford' ? 'rgba(196,153,42,0.3)' : 'rgba(96,165,250,0.3)'}`,
                display: 'inline-block',
              }}>
                {formatoJuego === 'stableford'
                  ? `${stablefordPts} pts`
                  : `Net: ${netScoreThisHole != null ? netScoreThisHole - par >= 0 ? '+' + (netScoreThisHole - par) : String(netScoreThisHole - par) : '—'}`}
              </div>
            )}
          </div>
        </div>

        {/* Plus button */}
        <button
          onClick={() => onChange(1)}
          disabled={playerScore != null && playerScore >= 15}
          style={{
            width: '52px', height: '52px', borderRadius: '14px',
            fontSize: '24px', fontWeight: 600,
            background: pending ? '#d4a843' : theme.gold,
            color: '#ffffff',
            border: pending ? '2px solid rgba(255,255,255,0.6)' : 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation', userSelect: 'none',
            opacity: playerScore != null && playerScore >= 15 ? 0.3 : 1,
            transition: 'background 0.2s, border 0.2s',
          }}
        >
          +
        </button>
      </div>
    </div>
  )
}
