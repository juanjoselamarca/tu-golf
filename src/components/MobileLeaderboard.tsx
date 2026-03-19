'use client'

import { useState } from 'react'
import { GWISparkline } from './GWISparkline'
import type { SimPlayer } from '@/hooks/useDemoSimulation'

const DEMO_PARS = [4, 5, 3, 4, 3, 4, 4, 3, 5, 4, 5, 4, 3, 5, 4, 5, 3, 4]

function formatTot(vspar: number): string {
  if (vspar === 0) return 'E'
  if (vspar > 0) return `+${vspar}`
  return `${vspar}`
}

function scoreColor(vspar: number): string {
  if (vspar < 0) return '#16a34a'
  if (vspar === 0) return '#374151'
  return '#dc2626'
}

function gwiColor(gwi: number): string {
  if (gwi >= 80) return '#16a34a'
  if (gwi >= 60) return '#b45309'
  return '#dc2626'
}

function holeCellColors(score: number | null, par: number) {
  if (score === null) return { bg: '#f3f4f6', color: '#d1d5db' }
  const d = score - par
  if (d <= -2) return { bg: '#fef3c7', color: '#92400e' }       // eagle — amber
  if (d === -1) return { bg: '#dcfce7', color: '#166534' }      // birdie — green
  if (d === 0) return { bg: '#f9fafb', color: '#374151' }       // par — neutral
  if (d === 1) return { bg: '#fef2f2', color: '#991b1b' }       // bogey — light red
  return { bg: '#fee2e2', color: '#991b1b' }                     // double+ — red
}

interface Props {
  players: SimPlayer[]
  getScoreVsPar: (scores: (number | null)[]) => number
  category: string
}

export function MobileLeaderboard({ players, getScoreVsPar, category }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const filtered = category === 'General' ? players
    : category === 'Scratch' ? players.filter(p => p.categoria === 'A')
    : category === 'Senior Scratch' ? players.filter(p => p.categoria === 'B')
    : category === 'Categoría A' ? players.filter(p => p.categoria === 'B')
    : players

  const leaderScore = filtered.length > 0 ? getScoreVsPar(filtered[0].scores) : 0

  return (
    <div style={{
      background: '#ffffff', borderRadius: '16px',
      border: '1px solid #e5e7eb',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Table header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '32px 1fr 60px 48px',
        padding: '10px 12px', alignItems: 'center',
        background: '#f3f4f6', borderBottom: '1px solid #e5e7eb',
      }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>POS</span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>JUGADOR</span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>SCORE</span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>GWI</span>
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
          No hay jugadores en esta categoría.
        </div>
      )}

      {filtered.map((player, idx) => {
        const pos = idx + 1
        const vspar = getScoreVsPar(player.scores)
        const isExpanded = expandedId === player.id
        const isLeader = pos === 1
        const thru = player.status === 'finished' ? 'F' : String(player.holesCompleted)
        const gapToLeader = vspar - leaderScore

        return (
          <div key={player.id}>
            {/* Row */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : player.id)}
              className={player.justScored ? 'flash-card' : player.positionDelta > 0 ? 'position-up' : player.positionDelta < 0 ? 'position-down' : ''}
              style={{
                display: 'grid', gridTemplateColumns: '32px 1fr 60px 48px',
                padding: '10px 12px', alignItems: 'center',
                borderBottom: '1px solid #f3f4f6',
                background: isLeader ? 'rgba(196,153,42,0.04)' : idx % 2 === 1 ? '#fafafa' : '#ffffff',
                borderLeft: isLeader ? '3px solid #c4992a' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'background 0.3s, transform 0.3s',
              }}
            >
              {/* Position */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                <span style={{
                  fontSize: '14px', fontWeight: 700,
                  fontFamily: 'var(--font-dm-mono), monospace',
                  color: isLeader ? '#c4992a' : '#6b7280',
                }}>
                  {pos}
                </span>
                {player.positionDelta !== 0 && (
                  <span style={{
                    fontSize: '8px', fontWeight: 600,
                    color: player.positionDelta > 0 ? '#16a34a' : '#dc2626',
                    fontFamily: 'var(--font-dm-mono), monospace',
                  }}>
                    {player.positionDelta > 0 ? `\u25B2${player.positionDelta}` : `\u25BC${Math.abs(player.positionDelta)}`}
                  </span>
                )}
              </div>

              {/* Player info */}
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: '14px', fontWeight: 600, color: '#111827',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                  <span style={{ flexShrink: 0 }}>{player.pais}</span>
                  <span>{player.name.split(' ')[0][0]}. {player.name.split(' ').slice(1).join(' ')}</span>
                </div>
                <div style={{
                  fontSize: '11px', color: '#9ca3af',
                  fontFamily: 'var(--font-dm-mono), monospace',
                  display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px',
                }}>
                  <span>Thru {thru}</span>
                  {player.status === 'playing' && (
                    <span style={{
                      width: '5px', height: '5px', borderRadius: '50%',
                      background: '#16a34a', display: 'inline-block',
                      animation: 'livePulse 2s infinite',
                    }} />
                  )}
                  {!isLeader && gapToLeader > 0 && (
                    <span style={{ color: '#d1d5db' }}>+{gapToLeader}</span>
                  )}
                </div>
              </div>

              {/* Score — protagonist */}
              <div style={{ textAlign: 'right' }}>
                <div className={player.justScored ? 'score-bounce' : ''} style={{
                  fontSize: '22px', fontWeight: 700,
                  fontFamily: 'var(--font-dm-mono), monospace',
                  color: scoreColor(vspar),
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}>
                  {formatTot(vspar)}
                </div>
                {player.grossTotal > 0 && (
                  <div style={{
                    fontSize: '10px', color: '#d1d5db',
                    fontFamily: 'var(--font-dm-mono), monospace',
                  }}>
                    {player.grossTotal}
                  </div>
                )}
              </div>

              {/* GWI */}
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: '13px', fontWeight: 700,
                  fontFamily: 'var(--font-dm-mono), monospace',
                  color: gwiColor(player.gwi),
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {player.gwi.toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Expanded scorecard — light theme */}
            {isExpanded && (
              <div style={{
                background: '#f9fafb', padding: '14px',
                borderBottom: '1px solid #e5e7eb',
              }}>
                {/* GWI sparkline row */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: '14px', padding: '10px 12px',
                  background: '#ffffff', borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '9px', color: '#9ca3af', fontWeight: 600,
                      fontFamily: 'var(--font-dm-mono), monospace',
                      letterSpacing: '0.08em',
                    }}>GWI\u2122</span>
                    <span style={{
                      fontSize: '20px', fontWeight: 700,
                      fontFamily: 'var(--font-dm-mono), monospace',
                      color: gwiColor(player.gwi),
                    }}>
                      {player.gwi.toFixed(1)}%
                    </span>
                  </div>
                  <GWISparkline series={player.gwiSeries} delta={player.gwiDelta} width={48} height={20} lightTheme={true} />
                </div>

                {/* Front 9 */}
                <div style={{
                  fontSize: '10px', color: '#9ca3af', fontWeight: 600,
                  fontFamily: 'var(--font-dm-mono), monospace',
                  marginBottom: '6px', letterSpacing: '0.05em',
                }}>
                  FRONT 9
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '2px',
                  marginBottom: '10px',
                }}>
                  {player.scores.slice(0, 9).map((s, i) => {
                    const { bg, color } = holeCellColors(s, DEMO_PARS[i])
                    return (
                      <div key={i} style={{
                        textAlign: 'center', padding: '4px 1px', borderRadius: '6px',
                        background: bg,
                      }}>
                        <div style={{ fontSize: '8px', color: '#9ca3af', lineHeight: 1 }}>{i + 1}</div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color, lineHeight: 1.3 }}>
                          {s ?? '\u2014'}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Back 9 */}
                <div style={{
                  fontSize: '10px', color: '#9ca3af', fontWeight: 600,
                  fontFamily: 'var(--font-dm-mono), monospace',
                  marginBottom: '6px', letterSpacing: '0.05em',
                }}>
                  BACK 9
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '2px',
                }}>
                  {player.scores.slice(9).map((s, i) => {
                    const { bg, color } = holeCellColors(s, DEMO_PARS[i + 9])
                    return (
                      <div key={i} style={{
                        textAlign: 'center', padding: '4px 1px', borderRadius: '6px',
                        background: bg,
                      }}>
                        <div style={{ fontSize: '8px', color: '#9ca3af', lineHeight: 1 }}>{i + 10}</div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color, lineHeight: 1.3 }}>
                          {s ?? '\u2014'}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Progress bar */}
                <div style={{ display: 'flex', gap: '2px', marginTop: '10px' }}>
                  {Array.from({ length: 18 }, (_, i) => (
                    <div key={i} style={{
                      flex: 1, height: '3px', borderRadius: '2px',
                      background: i < player.holesCompleted ? '#c4992a'
                        : i === player.holesCompleted && player.status === 'playing' ? 'rgba(196,153,42,0.3)'
                        : '#e5e7eb',
                    }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
