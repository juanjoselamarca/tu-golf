'use client'

import { displayDesdeJugador, type MatchResult } from '@/golf/formats/match-play'
import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface ScorerHeaderProps {
  currentHole: number
  modoLabel: string
  courseName: string
  totalHoles: number
  holesPlayed: number
  /** Match play: estado del match desde el punto de vista del jugador activo. */
  isMatchPlay: boolean
  matchResult: MatchResult | null
  /** ¿El jugador activo es el jugador "A" (primero de la lista)? */
  activeIsPlayerA: boolean
  showStableford: boolean
  showNet: boolean
  totalStableford: number
  displayOverUnder: number
  /** HCP a mostrar (18h) con fallback al que puntúa. */
  hcpLabel: number
  onExit: () => void
  theme: ScorerTheme
}

/** Header 48px del scorer individual + barra de progreso de hoyos. */
export function ScorerHeader({
  currentHole, modoLabel, courseName, totalHoles, holesPlayed,
  isMatchPlay, matchResult, activeIsPlayerA,
  showStableford, showNet, totalStableford, displayOverUnder, hcpLabel,
  onExit, theme,
}: ScorerHeaderProps) {
  return (
    <>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', height: '48px', flexShrink: 0,
        borderBottom: `1px solid ${theme.border}`,
        background: theme.headerBg,
      }}>
        <button onClick={onExit} aria-label="Salir de la ronda" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: theme.textMuted, fontSize: '14px',
          padding: '8px', minWidth: '44px', minHeight: '44px',
          display: 'flex', alignItems: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}>←</button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace', fontSize: '13px', fontWeight: 600, color: 'var(--brand-on-bg)', letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}>HOYO {currentHole}</div>
            <span style={{
              fontSize: '9px', fontWeight: 600, letterSpacing: '0.05em',
              padding: '2px 8px', borderRadius: '10px',
              background: 'rgba(196,153,42,0.15)', color: 'var(--brand-on-bg)',
              border: '1px solid rgba(196,153,42,0.25)',
              textTransform: 'uppercase' as const,
            }}>
              {modoLabel}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: theme.textFaint }}>{courseName}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ textAlign: 'right' }}>
            {isMatchPlay && matchResult ? (
              <>
                <div style={{
                  fontSize: '16px', fontWeight: 700,
                  color: matchResult.state === 0 ? theme.textMuted : matchResult.state > 0
                    ? (activeIsPlayerA ? 'var(--status-live-fg)' : 'var(--double)')
                    : (activeIsPlayerA ? 'var(--double)' : 'var(--status-live-fg)'),
                }}>
                  {matchResult.holesPlayed > 0
                    ? displayDesdeJugador(matchResult.state, activeIsPlayerA ? 'a' : 'b')
                    : '—'}
                </div>
                <div style={{ fontSize: '8px', color: theme.textFaint, letterSpacing: '0.04em', fontFamily: 'DM Mono, monospace' }}>
                  MATCH PLAY · {matchResult.holesPlayed}/{totalHoles}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '16px', fontWeight: 700, color: showStableford ? 'var(--brand-on-bg)' : displayOverUnder < 0 ? '#93C5FD' : displayOverUnder === 0 ? theme.textMuted : '#FCD34D' }}>
                  {holesPlayed > 0 ? (showStableford ? `${totalStableford} pts` : displayOverUnder > 0 ? `+${displayOverUnder}` : displayOverUnder === 0 ? 'E' : displayOverUnder) : '—'}
                </div>
                <div style={{ fontSize: '8px', color: theme.textFaint, letterSpacing: '0.04em', fontFamily: 'DM Mono, monospace' }}>
                  {showNet && <span style={{ color: 'var(--brand-on-bg)', marginRight: '4px' }}>HCP {hcpLabel}</span>}
                  THRU {holesPlayed}/{totalHoles}
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      {/* Progress bar */}
      <div style={{ height: '3px', background: 'var(--border)', flexShrink: 0 }}>
        <div style={{ height: '3px', background: 'var(--brand)', width: `${(holesPlayed / totalHoles) * 100}%`, transition: 'width 0.3s ease' }} />
      </div>
    </>
  )
}
