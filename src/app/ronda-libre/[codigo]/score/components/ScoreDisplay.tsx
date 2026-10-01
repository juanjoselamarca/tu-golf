'use client'

import { getChipStyle, getChipLabel } from '@/lib/ronda/helpers'
import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface ScoreDisplayProps {
  score: number | undefined
  par: number
  scoreAnimating: boolean
  saveCheckVisible: boolean
  /** Puntos de golpe recibido junto al número (neto/stableford, no stroke play neto). */
  showStrokeDots: boolean
  strokesOnHole: number
  showNet: boolean
  showStableford: boolean
  isStrokePlayNeto: boolean
  currentNetDiff: number | null
  currentStablefordPts: number | null
  showStrokeIndexWarning: boolean
  isAboveDoubleBogey: boolean
  theme: ScorerTheme
}

/** Número grande del hoyo actual con chip, indicador neto/stableford y avisos. */
export function ScoreDisplay({
  score, par, scoreAnimating, saveCheckVisible, showStrokeDots, strokesOnHole,
  showNet, showStableford, isStrokePlayNeto, currentNetDiff, currentStablefordPts,
  showStrokeIndexWarning, isAboveDoubleBogey, theme,
}: ScoreDisplayProps) {
  return (
    <>
      {/* Score number */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
          <div
            className={scoreAnimating ? 'score-animating' : ''}
            style={{
              fontSize: 'clamp(72px, 20vw, 96px)', fontWeight: 700, fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace',
              lineHeight: 1, color: score != null ? theme.scoreText : theme.scoreDimmed, letterSpacing: '-3px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >{score ?? par}</div>
          {showStrokeDots && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              alignSelf: 'flex-start', marginTop: '12px',
            }}>
              {Array.from({ length: strokesOnHole }, (_, i) => (
                <span key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--brand-on-bg)' }} />
              ))}
            </span>
          )}
        </div>

        {/* Save check toast */}
        {saveCheckVisible && (
          <div style={{
            position: 'absolute', top: '-8px', right: '-24px',
            fontSize: '20px', color: 'var(--status-live-fg)', fontWeight: 700,
            animation: 'fadeInOut 1s ease forwards',
          }}>{'✓'}</div>
        )}
      </div>

      {/* Chip */}
      {score != null && (
        <div style={{
          marginTop: '8px', padding: '4px 16px', borderRadius: '20px',
          fontSize: '13px', fontWeight: 500, letterSpacing: '0.01em',
          ...getChipStyle(score, par, true),
        }}>{getChipLabel(score, par)}</div>
      )}

      {/* Net / Stableford indicator — oculto en stroke play neto (sin golpes por hoyo) */}
      {score != null && (showNet || showStableford) && !isStrokePlayNeto && (
        <div style={{ marginTop: '6px', fontSize: '12px', color: theme.textMuted, fontFamily: '"DM Mono", monospace' }}>
          {showNet && currentNetDiff != null && (
            <span>Neto: {currentNetDiff > 0 ? `+${currentNetDiff}` : currentNetDiff === 0 ? 'E' : currentNetDiff}</span>
          )}
          {showStableford && currentStablefordPts != null && (
            <span>{currentStablefordPts} {currentStablefordPts === 1 ? 'punto' : 'puntos'}</span>
          )}
          {strokesOnHole > 0 && <span style={{ color: theme.textFaint }}> ({strokesOnHole} golpe{strokesOnHole > 1 ? 's' : ''})</span>}
        </div>
      )}

      {/* Stroke index warning */}
      {showStrokeIndexWarning && (
        <div style={{
          marginTop: '4px', fontSize: '11px', color: 'var(--bogey)',
          letterSpacing: '0.02em',
        }}>
          Neto aproximado — cancha sin stroke index
        </div>
      )}

      {/* Double bogey warning */}
      {isAboveDoubleBogey && (
        <div style={{
          marginTop: '4px', fontSize: '11px', color: theme.textFaint,
          letterSpacing: '0.02em',
        }}>
          Por encima de doble bogey
        </div>
      )}
    </>
  )
}
