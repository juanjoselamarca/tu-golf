'use client'

import { useState } from 'react'
import { GWISparkline } from './GWISparkline'
import type { SimPlayer } from '@/hooks/useDemoSimulation'

const DEMO_PARS = [4, 5, 3, 4, 3, 4, 4, 3, 5, 4, 5, 4, 3, 5, 4, 5, 3, 4]

/* ── Helpers ──────────────────────────────────────────── */
function scoreColor(v: number): string {
  if (v < 0) return '#16a34a'
  if (v === 0) return '#374151'
  return '#dc2626'
}

function fmtScore(v: number): string {
  return v === 0 ? 'E' : v > 0 ? `+${v}` : `${v}`
}

function gwiColor(g: number): string {
  if (g >= 80) return '#16a34a'
  if (g >= 60) return '#c4992a'
  return '#dc2626'
}

function gwiTrend(d: number): { arrow: string; color: string } {
  if (d > 1) return { arrow: '▲', color: '#16a34a' }
  if (d > 0) return { arrow: '↑', color: '#16a34a' }
  if (d < -1) return { arrow: '▼', color: '#dc2626' }
  if (d < 0) return { arrow: '↓', color: '#dc2626' }
  return { arrow: '—', color: '#d1d5db' }
}

function holeBg(s: number | null, par: number) {
  if (s === null) return { bg: '#f3f4f6', color: '#d1d5db' }
  const d = s - par
  if (d <= -2) return { bg: '#fef3c7', color: '#92400e' }
  if (d === -1) return { bg: '#dcfce7', color: '#166534' }
  if (d === 0) return { bg: '#f9fafb', color: '#6b7280' }
  if (d === 1) return { bg: '#fef2f2', color: '#991b1b' }
  return { bg: '#fee2e2', color: '#991b1b' }
}

const M = 'var(--font-dm-mono), monospace'
const SERIF = 'var(--font-cormorant), serif'

/* ── Component ────────────────────────────────────────── */
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
    : players.filter(p => p.categoria === 'B')

  const leaderScore = filtered.length > 0 ? getScoreVsPar(filtered[0].scores) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {filtered.length === 0 && (
        <div style={{ padding: '48px 16px', textAlign: 'center', color: '#9ca3af', fontSize: '14px', background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb' }}>
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
        const trend = gwiTrend(player.gwiDelta)

        // Last scored hole
        let lastHole = 0, lastResult = ''
        for (let h = player.holesCompleted; h >= 1; h--) {
          const s = player.scores[h - 1]
          if (s !== null) {
            lastHole = h
            const d = s - DEMO_PARS[h - 1]
            lastResult = d <= -2 ? '🦅 Eagle' : d === -1 ? '🐦 Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : `+${d}`
            break
          }
        }

        // Quick stats
        let birdies = 0, pars = 0, bogeys = 0
        player.scores.forEach((s, i) => {
          if (s === null) return
          const d = s - DEMO_PARS[i]
          if (d <= -1) birdies++
          else if (d === 0) pars++
          else bogeys++
        })

        return (
          <div key={player.id}>
            {/* ── Main card ─────────────────────── */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : player.id)}
              className={
                player.justScored ? 'flash-card'
                  : player.positionDelta > 0 ? 'position-up'
                  : player.positionDelta < 0 ? 'position-down' : ''
              }
              style={{
                background: isLeader
                  ? 'linear-gradient(135deg, rgba(196,153,42,0.06), rgba(196,153,42,0.02))'
                  : '#ffffff',
                border: isLeader ? '1px solid rgba(196,153,42,0.2)' : '1px solid #e5e7eb',
                borderRadius: isExpanded ? '14px 14px 0 0' : '14px',
                padding: '14px 16px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Position */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '28px', flexShrink: 0 }}>
                  <span style={{
                    fontFamily: M, fontSize: isLeader ? '16px' : '14px', fontWeight: 700,
                    color: isLeader ? '#c4992a' : '#374151',
                  }}>{pos}</span>
                  {player.positionDelta !== 0 && (
                    <span style={{
                      fontSize: '9px', fontWeight: 700, fontFamily: M,
                      color: player.positionDelta > 0 ? '#16a34a' : '#dc2626',
                    }}>
                      {player.positionDelta > 0 ? `▲${player.positionDelta}` : `▼${Math.abs(player.positionDelta)}`}
                    </span>
                  )}
                </div>

                {/* Player info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    fontSize: '15px', fontWeight: 600, color: '#111827',
                  }}>
                    <span>{player.pais}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {player.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: M }}>
                      Thru {thru}
                    </span>
                    {player.status === 'playing' && (
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#16a34a', animation: 'livePulse 2s infinite' }} />
                    )}
                    {player.status === 'finished' && (
                      <span style={{ fontSize: '9px', color: '#16a34a', fontFamily: M, fontWeight: 600 }}>✓</span>
                    )}
                  </div>
                </div>

                {/* Score — protagonist */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className={player.justScored ? 'score-bounce' : ''} style={{
                    fontFamily: SERIF, fontSize: isLeader ? '28px' : '24px', fontWeight: 600,
                    color: scoreColor(vspar), lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {fmtScore(vspar)}
                  </div>
                </div>

                {/* GWI — stock ticker style */}
                <div style={{
                  width: '48px', flexShrink: 0, textAlign: 'right',
                  borderLeft: '1px solid #f3f4f6', paddingLeft: '10px',
                }}>
                  <div style={{
                    fontFamily: M, fontSize: '13px', fontWeight: 700,
                    color: gwiColor(player.gwi), fontVariantNumeric: 'tabular-nums',
                  }}>
                    {player.gwi.toFixed(0)}
                  </div>
                  <div style={{ fontFamily: M, fontSize: '9px', fontWeight: 600, color: trend.color }}>
                    {trend.arrow}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Expanded detail ──────────────────── */}
            {isExpanded && (
              <div style={{
                background: '#fafafa', borderRadius: '0 0 14px 14px',
                border: '1px solid #e5e7eb', borderTop: 'none', padding: '16px',
              }}>
                {/* GWI live chart — Bloomberg style */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb',
                  padding: '12px 14px', marginBottom: '14px',
                }}>
                  <div>
                    <div style={{ fontSize: '9px', fontFamily: M, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.08em', marginBottom: '2px' }}>
                      GWI™ EN VIVO
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ fontFamily: SERIF, fontSize: '28px', fontWeight: 600, color: gwiColor(player.gwi) }}>
                        {player.gwi.toFixed(1)}
                      </span>
                      <span style={{
                        fontFamily: M, fontSize: '11px', fontWeight: 700, color: trend.color,
                        background: player.gwiDelta > 0 ? 'rgba(22,163,74,0.08)' : player.gwiDelta < 0 ? 'rgba(220,38,38,0.08)' : 'transparent',
                        padding: '2px 6px', borderRadius: '4px',
                      }}>
                        {player.gwiDelta > 0 ? '+' : ''}{player.gwiDelta.toFixed(1)} {trend.arrow}
                      </span>
                    </div>
                  </div>
                  <div style={{ width: '80px', height: '32px' }}>
                    <GWISparkline series={player.gwiSeries} delta={player.gwiDelta} width={80} height={32} lightTheme={true} />
                  </div>
                </div>

                {/* Last play + quick stats */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  {lastHole > 0 && (
                    <div style={{ flex: 1, background: '#fff', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '10px 12px' }}>
                      <div style={{ fontSize: '9px', fontFamily: M, color: '#9ca3af', letterSpacing: '0.05em', marginBottom: '4px' }}>ÚLTIMO HOYO</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>H{lastHole} · {lastResult}</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[
                      { n: birdies, label: 'BIR', bg: '#dcfce7', color: '#166534' },
                      { n: pars, label: 'PAR', bg: '#f9fafb', color: '#6b7280' },
                      { n: bogeys, label: 'BOG', bg: '#fef2f2', color: '#991b1b' },
                    ].map(s => (
                      <div key={s.label} style={{ background: s.bg, borderRadius: '10px', padding: '8px 10px', textAlign: 'center', minWidth: '42px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: s.color }}>{s.n}</div>
                        <div style={{ fontSize: '8px', color: s.color, fontFamily: M }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Front 9 */}
                <div style={{ fontSize: '9px', fontFamily: M, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '4px' }}>FRONT 9</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '2px', marginBottom: '8px' }}>
                  {player.scores.slice(0, 9).map((s, i) => {
                    const { bg, color } = holeBg(s, DEMO_PARS[i])
                    return (
                      <div key={i} style={{ textAlign: 'center', padding: '3px 1px', borderRadius: '5px', background: bg }}>
                        <div style={{ fontSize: '7px', color: '#9ca3af', lineHeight: 1 }}>{i + 1}</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color, lineHeight: 1.3 }}>{s ?? '·'}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Back 9 */}
                <div style={{ fontSize: '9px', fontFamily: M, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '4px' }}>BACK 9</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '2px' }}>
                  {player.scores.slice(9).map((s, i) => {
                    const { bg, color } = holeBg(s, DEMO_PARS[i + 9])
                    return (
                      <div key={i} style={{ textAlign: 'center', padding: '3px 1px', borderRadius: '5px', background: bg }}>
                        <div style={{ fontSize: '7px', color: '#9ca3af', lineHeight: 1 }}>{i + 10}</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color, lineHeight: 1.3 }}>{s ?? '·'}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Progress */}
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
