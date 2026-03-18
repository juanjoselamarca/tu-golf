'use client'

import { useState } from 'react'
import { GWISparkline } from './GWISparkline'
import type { SimPlayer } from '@/hooks/useDemoSimulation'

const DEMO_PARS = [4, 5, 3, 4, 3, 4, 4, 3, 5, 4, 5, 4, 3, 5, 4, 5, 3, 4]

function holeCellStyle(score: number | null, par: number) {
  if (score === null) return { bg: 'transparent', color: 'rgba(255,255,255,0.2)' }
  const d = score - par
  if (d <= -2) return { bg: 'rgba(201,168,76,0.2)', color: '#c9a84c' }
  if (d === -1) return { bg: 'rgba(0,230,118,0.15)', color: '#00e676' }
  if (d === 0) return { bg: 'transparent', color: 'rgba(255,255,255,0.7)' }
  if (d === 1) return { bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }
  return { bg: 'rgba(255,23,68,0.15)', color: '#ff1744' }
}

function formatTot(vspar: number): string {
  if (vspar === 0) return 'E'
  if (vspar > 0) return `+${vspar}`
  return `${vspar}`
}

function totColor(vspar: number): string {
  if (vspar < 0) return '#c9a84c'
  if (vspar === 0) return 'rgba(255,255,255,0.6)'
  return '#ff1744'
}

function gwiColor(gwi: number): string {
  if (gwi > 80) return '#00e676'
  if (gwi >= 60) return '#c9a84c'
  return '#ff5252'
}

function gwiDeltaColor(delta: number): string {
  if (delta > 0) return '#00e676'
  if (delta < 0) return '#ff1744'
  return 'rgba(255,255,255,0.5)'
}

interface Props {
  players: SimPlayer[]
  getScoreVsPar: (scores: (number | null)[]) => number
  category: string
}

export function MobileLeaderboard({ players, getScoreVsPar, category }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Players are already filtered by the parent, but keep backward compat
  const filtered = category === 'General' ? players
    : category === 'Categoría A' ? players.filter(p => p.categoria === 'A')
    : category === 'Categoría B' ? players.filter(p => p.categoria === 'B')
    : players

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {filtered.map((player, idx) => {
        const pos = idx + 1
        const vspar = getScoreVsPar(player.scores)
        const isExpanded = expandedId === player.id
        const thru = player.status === 'finished' ? 'F' : String(player.holesCompleted)

        return (
          <div key={player.id}>
            {/* Card */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : player.id)}
              className={player.justScored ? 'flash-card' : ''}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderLeft: pos === 1 ? '3px solid #c9a84c' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px',
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'border-color 0.3s',
              }}
            >
              {/* Row 1: Position + Player */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{
                  width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                  background: pos === 1 ? '#c9a84c' : pos === 2 ? 'rgba(192,192,192,0.3)' : pos === 3 ? 'rgba(205,127,50,0.3)' : 'rgba(255,255,255,0.08)',
                  color: pos <= 2 ? '#070d18' : 'rgba(255,255,255,0.7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 700,
                }}>
                  {pos}
                </div>
                {player.positionDelta !== 0 && (
                  <span style={{
                    fontSize: 9,
                    color: player.positionDelta > 0 ? '#00e676' : '#ff1744',
                    fontFamily: 'var(--font-dm-mono), monospace',
                    marginLeft: '-6px',
                  }}>
                    {player.positionDelta > 0 ? `\u25B2${player.positionDelta}` : `\u25BC${Math.abs(player.positionDelta)}`}
                  </span>
                )}
                <div
                  style={{
                    width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, #1a4fd6, #c4992a)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: '11px', fontWeight: 700,
                  }}
                >
                  {player.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#edeae4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {player.pais} {player.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>
                    <span style={{
                      display: 'inline-block', padding: '1px 4px', borderRadius: 3,
                      background: player.categoria === 'A' ? 'rgba(0,230,118,0.12)' : 'rgba(196,153,42,0.12)',
                      color: player.categoria === 'A' ? '#00e676' : '#c9a84c',
                      fontSize: 9, fontWeight: 600, fontFamily: 'var(--font-dm-mono), monospace',
                    }}>
                      CAT {player.categoria}
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 2: TOT + THRU + R1 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div className={player.justScored ? 'score-bounce' : ''} style={{
                    fontFamily: 'var(--font-dm-mono), monospace', fontSize: '26px', fontWeight: 700,
                    color: totColor(vspar), fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatTot(vspar)}
                  </div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-dm-mono), monospace' }}>TOT</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    {player.status === 'playing' && (
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00e676', animation: 'livePulse 2s infinite' }} />
                    )}
                    <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '16px', fontWeight: 600, color: player.status === 'finished' ? '#94a8c0' : '#c9a84c' }}>
                      {thru}
                    </span>
                  </div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-dm-mono), monospace' }}>THRU</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '16px', color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
                    {player.grossTotal > 0 ? player.grossTotal : '\u2014'}
                  </div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-dm-mono), monospace' }}>R1</div>
                </div>
              </div>

              {/* Row 3: GWI */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <GWISparkline series={player.gwiSeries} delta={player.gwiDelta} width={40} height={14} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}>GWI\u2122</span>
                  <span style={{
                    fontFamily: 'var(--font-dm-mono), monospace', fontSize: '16px', fontWeight: 600,
                    color: gwiColor(player.gwi), fontVariantNumeric: 'tabular-nums',
                  }}>
                    {player.gwi.toFixed(1)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '9px', color: gwiDeltaColor(player.gwiDelta) }}>
                    {player.gwiDelta > 0 ? '\u25B2' : player.gwiDelta < 0 ? '\u25BC' : '\u2014'}
                  </span>
                </div>
              </div>
            </div>

            {/* Expanded scorecard */}
            {isExpanded && (
              <div style={{
                background: 'rgba(10,21,37,0.95)', borderRadius: '0 0 12px 12px',
                padding: '12px', marginTop: '-6px',
                border: '1px solid rgba(255,255,255,0.06)', borderTop: 'none',
              }}>
                {/* Front 9 */}
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', fontFamily: 'var(--font-dm-mono), monospace' }}>
                  FRONT 9 \u2014 PAR 35
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '3px', marginBottom: '10px' }}>
                  {player.scores.slice(0, 9).map((s, i) => {
                    const style = holeCellStyle(s, DEMO_PARS[i])
                    return (
                      <div key={i} style={{ textAlign: 'center', padding: '4px 2px', borderRadius: '4px', background: style.bg }}>
                        <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.45)' }}>H{i + 1}</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: style.color }}>{s ?? '\u2014'}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Back 9 */}
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', fontFamily: 'var(--font-dm-mono), monospace' }}>
                  BACK 9 \u2014 PAR 37
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '3px', marginBottom: '10px' }}>
                  {player.scores.slice(9).map((s, i) => {
                    const style = holeCellStyle(s, DEMO_PARS[i + 9])
                    return (
                      <div key={i} style={{ textAlign: 'center', padding: '4px 2px', borderRadius: '4px', background: style.bg }}>
                        <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.45)' }}>H{i + 10}</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: style.color }}>{s ?? '\u2014'}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Progress bar */}
                <div style={{ display: 'flex', gap: '2px', marginBottom: '8px' }}>
                  {Array.from({ length: 18 }, (_, i) => (
                    <div key={i} style={{
                      flex: 1, height: '4px', borderRadius: '2px',
                      background: i < player.holesCompleted ? '#c9a84c'
                        : i === player.holesCompleted && player.status === 'playing' ? 'rgba(201,168,76,0.4)'
                        : 'rgba(255,255,255,0.08)',
                    }} />
                  ))}
                </div>

                {/* GWI badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-dm-mono), monospace' }}>GWI\u2122</span>
                  <span style={{
                    fontFamily: 'var(--font-dm-mono), monospace', fontSize: '20px', fontWeight: 600,
                    color: gwiColor(player.gwi), fontVariantNumeric: 'tabular-nums',
                  }}>
                    {player.gwi.toFixed(1)}
                  </span>
                  <span style={{
                    fontSize: '9px', padding: '2px 8px', borderRadius: '10px',
                    background: 'rgba(201,168,76,0.12)', color: '#c9a84c',
                    fontFamily: 'var(--font-dm-mono), monospace',
                  }}>
                    {player.gwi >= 85 ? 'ELITE' : player.gwi >= 70 ? 'AVANZADO' : player.gwi >= 50 ? 'INTERMEDIO' : 'BÁSICO'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
