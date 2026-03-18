'use client'

import { useState } from 'react'
import { GWISparkline } from './GWISparkline'
import type { SimPlayer } from '@/hooks/useDemoSimulation'

const DEMO_PARS = [4,5,3,4,3,4,4,3,5,4,5,4,3,5,4,5,3,4]

function scoreColor(vspar: number): string {
  if (vspar <= -2) return '#c9a84c'
  if (vspar === -1) return '#00e676'
  if (vspar === 0) return 'rgba(255,255,255,0.5)'
  if (vspar === 1) return 'rgba(255,255,255,0.35)'
  return '#ff1744'
}

function holeCellStyle(score: number | null, par: number) {
  if (score === null) return { bg: 'transparent', color: 'rgba(255,255,255,0.2)' }
  const d = score - par
  if (d <= -2) return { bg: 'rgba(201,168,76,0.2)', color: '#c9a84c' }
  if (d === -1) return { bg: 'rgba(0,230,118,0.15)', color: '#00e676' }
  if (d === 0) return { bg: 'transparent', color: 'rgba(255,255,255,0.7)' }
  if (d === 1) return { bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }
  return { bg: 'rgba(255,23,68,0.15)', color: '#ff1744' }
}

interface Props {
  players: SimPlayer[]
  getScoreVsPar: (scores: (number | null)[]) => number
  category: string
}

export function MobileLeaderboard({ players, getScoreVsPar, category }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const filtered = category === 'General' ? players
    : category === 'Categoría A' ? players.filter(p => p.categoria === 'A')
    : players.filter(p => p.categoria === 'B')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {filtered.map((player, idx) => {
        const pos = idx + 1
        const vspar = getScoreVsPar(player.scores)
        const isExpanded = expandedId === player.id
        const gwiColor = player.gwi >= 70 ? '#c9a84c' : player.gwi >= 50 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)'
        const deltaColor = player.gwiDelta > 0 ? '#00e676' : player.gwiDelta < 0 ? '#ff1744' : 'rgba(255,255,255,0.3)'

        return (
          <div key={player.id}>
            {/* Card */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : player.id)}
              className={player.justScored ? 'flash-card' : ''}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px',
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'border-color 0.3s',
              }}
            >
              {/* Row 1: Position + Player */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                  background: pos === 1 ? '#c9a84c' : pos === 2 ? 'rgba(192,192,192,0.3)' : pos === 3 ? 'rgba(205,127,50,0.3)' : 'rgba(255,255,255,0.08)',
                  color: pos <= 2 ? '#070d18' : 'rgba(255,255,255,0.7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 700,
                }}>{pos}</div>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #1a4fd6, #c4992a)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: '11px', fontWeight: 700,
                }}>{player.initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#edeae4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {player.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                    {player.pais} Cat. {player.categoria}
                  </div>
                </div>
              </div>

              {/* Row 2: Score + Hole + HCP */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div className={player.justScored ? 'score-bounce' : ''} style={{
                    fontFamily: 'var(--font-cormorant), serif', fontSize: '24px', fontWeight: 300,
                    color: vspar < 0 ? '#c9a84c' : vspar === 0 ? 'rgba(255,255,255,0.6)' : '#ff1744',
                  }}>
                    {vspar === 0 ? 'E' : vspar > 0 ? `+${vspar}` : vspar}
                  </div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-dm-mono), monospace' }}>SCORE</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    {player.status === 'playing' && (
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00e676', animation: 'livePulse 2s infinite' }} />
                    )}
                    <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>
                      {player.status === 'finished' ? 'F' : `${player.holesCompleted}/18`}
                    </span>
                  </div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-dm-mono), monospace' }}>HOYO</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>
                    {player.indice}
                  </div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-dm-mono), monospace' }}>HCP</div>
                </div>
              </div>

              {/* Row 3: GWI */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <GWISparkline series={player.gwiSeries} delta={player.gwiDelta} width={60} height={16} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>GWI™</span>
                  <span style={{ fontFamily: 'var(--font-cormorant), serif', fontSize: '16px', fontWeight: 300, color: gwiColor }}>
                    {player.gwi.toFixed(1)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '9px', color: deltaColor }}>
                    {player.gwiDelta > 0 ? '▲' : player.gwiDelta < 0 ? '▼' : '—'}
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
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '6px', fontFamily: 'var(--font-dm-mono), monospace' }}>
                  FRONT 9 — PAR 35
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '3px', marginBottom: '10px' }}>
                  {player.scores.slice(0, 9).map((s, i) => {
                    const style = holeCellStyle(s, DEMO_PARS[i])
                    return (
                      <div key={i} style={{ textAlign: 'center', padding: '4px 2px', borderRadius: '4px', background: style.bg }}>
                        <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)' }}>H{i+1}</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: style.color }}>{s ?? '—'}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Back 9 */}
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '6px', fontFamily: 'var(--font-dm-mono), monospace' }}>
                  BACK 9 — PAR 37
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '3px', marginBottom: '10px' }}>
                  {player.scores.slice(9).map((s, i) => {
                    const style = holeCellStyle(s, DEMO_PARS[i + 9])
                    return (
                      <div key={i} style={{ textAlign: 'center', padding: '4px 2px', borderRadius: '4px', background: style.bg }}>
                        <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)' }}>H{i+10}</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: style.color }}>{s ?? '—'}</div>
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
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-dm-mono), monospace' }}>GWI™</span>
                  <span style={{ fontFamily: 'var(--font-cormorant), serif', fontSize: '20px', fontWeight: 300, color: gwiColor }}>{player.gwi.toFixed(1)}</span>
                  <span style={{
                    fontSize: '9px', padding: '2px 8px', borderRadius: '10px',
                    background: 'rgba(201,168,76,0.12)', color: '#c9a84c',
                    fontFamily: 'var(--font-dm-mono), monospace',
                  }}>
                    {player.gwi >= 85 ? 'ÉLITE' : player.gwi >= 70 ? 'AVANZADO' : player.gwi >= 50 ? 'INTERMEDIO' : 'BÁSICO'}
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
