'use client'

import { useState } from 'react'
import { GWISparkline } from './GWISparkline'
import type { SimPlayer } from '@/hooks/useDemoSimulation'

const PARS = [4,5,3,4,3,4,4,3,5,4,5,4,3,5,4,5,3,4]
const M = 'var(--font-dm-mono), monospace'

function fmtScore(v: number): string {
  return v === 0 ? 'E' : v > 0 ? `+${v}` : `${v}`
}

function scoreClr(v: number): string {
  if (v < 0) return '#16a34a'
  if (v === 0) return '#111827'
  return '#dc2626'
}

function gwiClr(g: number): string {
  if (g >= 80) return '#16a34a'
  if (g >= 60) return '#c4992a'
  return '#dc2626'
}

function holeCellStyle(s: number | null, par: number) {
  if (s === null) return { bg: '#f3f4f6', clr: '#d1d5db' }
  const d = s - par
  if (d <= -2) return { bg: '#fef3c7', clr: '#92400e' }
  if (d === -1) return { bg: '#dcfce7', clr: '#166534' }
  if (d === 0) return { bg: '#f9fafb', clr: '#6b7280' }
  if (d === 1) return { bg: '#fef2f2', clr: '#991b1b' }
  return { bg: '#fee2e2', clr: '#991b1b' }
}

function shortName(full: string): string {
  const parts = full.trim().split(' ')
  if (parts.length < 2) return full
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
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
    : players.filter(p => p.categoria === 'B')

  if (filtered.length === 0) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center', color: '#9ca3af', fontSize: '14px', background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
        No hay jugadores en esta categoría.
      </div>
    )
  }

  return (
    <div style={{
      background: '#ffffff', borderRadius: '12px', overflow: 'hidden',
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Table header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '38px 1fr 48px 56px',
        padding: '10px 14px', alignItems: 'center',
        background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
      }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', fontFamily: M, textTransform: 'uppercase', letterSpacing: '0.05em' }}>POS</span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', fontFamily: M, textTransform: 'uppercase', letterSpacing: '0.05em' }}>JUGADOR</span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', fontFamily: M, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>THRU</span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', fontFamily: M, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>TOT</span>
      </div>

      {/* Player rows */}
      {filtered.map((player, idx) => {
        const pos = idx + 1
        const vspar = getScoreVsPar(player.scores)
        const isExpanded = expandedId === player.id
        const isLeader = pos === 1
        const thru = player.status === 'finished' ? 'F' : String(player.holesCompleted)
        const isPlaying = player.status === 'playing'

        // Stats for expanded
        let birdies = 0, bogeys = 0
        player.scores.forEach((s, i) => { if (s !== null) { const d = s - PARS[i]; if (d <= -1) birdies++; else if (d >= 1) bogeys++ } })

        // Last hole info
        let lastHole = 0, lastLabel = ''
        for (let h = player.holesCompleted; h >= 1; h--) {
          const s = player.scores[h - 1]
          if (s !== null) {
            lastHole = h
            const d = s - PARS[h - 1]
            lastLabel = d <= -2 ? '🦅' : d === -1 ? '🐦' : d === 0 ? '—' : d === 1 ? '+1' : `+${d}`
            break
          }
        }

        return (
          <div key={player.id}>
            {/* Row */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : player.id)}
              className={
                player.justScored ? 'flash-card'
                : player.positionDelta > 0 ? 'position-up'
                : player.positionDelta < 0 ? 'position-down' : ''
              }
              style={{
                display: 'grid', gridTemplateColumns: '38px 1fr 48px 56px',
                padding: '12px 14px', alignItems: 'center',
                borderBottom: '1px solid #f3f4f6',
                background: isLeader ? 'rgba(196,153,42,0.04)' : idx % 2 === 0 ? '#ffffff' : '#fafcff',
                cursor: 'pointer',
                transition: 'background 0.3s',
              }}
            >
              {/* POS */}
              <div>
                <span style={{
                  fontFamily: M, fontSize: '14px', fontWeight: 700,
                  color: isLeader ? '#c4992a' : '#374151',
                }}>
                  {pos}
                </span>
                {player.positionDelta !== 0 && (
                  <span style={{
                    display: 'block', fontSize: '9px', fontWeight: 700, fontFamily: M, lineHeight: 1,
                    color: player.positionDelta > 0 ? '#16a34a' : '#dc2626',
                  }}>
                    {player.positionDelta > 0 ? `▲${player.positionDelta}` : `▼${Math.abs(player.positionDelta)}`}
                  </span>
                )}
              </div>

              {/* JUGADOR */}
              <div style={{ minWidth: 0, paddingRight: '8px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  fontSize: '14px', fontWeight: isLeader ? 700 : 500, color: '#111827',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  <span style={{ flexShrink: 0 }}>{player.pais}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {shortName(player.name)}
                  </span>
                </div>
              </div>

              {/* THRU */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                  {isPlaying && (
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#16a34a', flexShrink: 0, animation: 'livePulse 2s infinite' }} />
                  )}
                  <span style={{
                    fontFamily: M, fontSize: '13px', fontWeight: 600,
                    color: thru === 'F' ? '#16a34a' : '#6b7280',
                  }}>
                    {thru}
                  </span>
                </div>
              </div>

              {/* TOT — protagonist */}
              <div style={{ textAlign: 'right' }}>
                <span className={player.justScored ? 'score-bounce' : ''} style={{
                  fontFamily: M, fontSize: '18px', fontWeight: 700,
                  color: scoreClr(vspar),
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {fmtScore(vspar)}
                </span>
              </div>
            </div>

            {/* Expanded */}
            {isExpanded && (
              <div style={{
                background: '#f9fafb', padding: '12px 14px',
                borderBottom: '1px solid #e5e7eb',
              }}>
                {/* Stats strip — GWI + last hole + birdies/bogeys, all inline */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: '12px', flexWrap: 'wrap',
                }}>
                  {/* GWI Bloomberg style */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: '#fff', border: '1px solid #e5e7eb',
                    borderRadius: '8px', padding: '6px 10px',
                  }}>
                    <span style={{ fontSize: '9px', fontFamily: M, color: '#9ca3af', letterSpacing: '0.05em' }}>GWI</span>
                    <span style={{ fontFamily: M, fontSize: '16px', fontWeight: 700, color: gwiClr(player.gwi) }}>
                      {player.gwi.toFixed(1)}
                    </span>
                    <span style={{
                      fontFamily: M, fontSize: '10px', fontWeight: 700,
                      color: player.gwiDelta >= 0 ? '#16a34a' : '#dc2626',
                      background: player.gwiDelta >= 0 ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
                      padding: '1px 5px', borderRadius: '4px',
                    }}>
                      {player.gwiDelta >= 0 ? '+' : ''}{player.gwiDelta.toFixed(1)}
                    </span>
                  </div>

                  {/* Last hole */}
                  {lastHole > 0 && (
                    <div style={{
                      background: '#fff', border: '1px solid #e5e7eb',
                      borderRadius: '8px', padding: '6px 10px',
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                      <span style={{ fontSize: '9px', fontFamily: M, color: '#9ca3af' }}>H{lastHole}</span>
                      <span style={{ fontSize: '14px' }}>{lastLabel}</span>
                    </div>
                  )}

                  {/* Birdies / Bogeys */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <div style={{ background: '#dcfce7', borderRadius: '6px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534', fontFamily: M }}>{birdies}</span>
                      <span style={{ fontSize: '8px', color: '#166534', fontFamily: M }}>bir</span>
                    </div>
                    <div style={{ background: '#fef2f2', borderRadius: '6px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#991b1b', fontFamily: M }}>{bogeys}</span>
                      <span style={{ fontSize: '8px', color: '#991b1b', fontFamily: M }}>bog</span>
                    </div>
                  </div>
                </div>

                {/* Scorecard compact */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ fontSize: '8px', fontFamily: M, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.05em' }}>OUT</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: '8px', fontFamily: M, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.05em' }}>IN</span>
                  <span style={{ flex: 1 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 8px 1fr', gap: 0, marginBottom: '2px' }}>
                  {/* Front 9 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '1px' }}>
                    {player.scores.slice(0, 9).map((s, i) => {
                      const { bg, clr } = holeCellStyle(s, PARS[i])
                      return (
                        <div key={i} style={{ textAlign: 'center', padding: '3px 0', borderRadius: '3px', background: bg }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: clr, lineHeight: 1 }}>{s ?? '·'}</div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Separator */}
                  <div />
                  {/* Back 9 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '1px' }}>
                    {player.scores.slice(9).map((s, i) => {
                      const { bg, clr } = holeCellStyle(s, PARS[i + 9])
                      return (
                        <div key={i} style={{ textAlign: 'center', padding: '3px 0', borderRadius: '3px', background: bg }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: clr, lineHeight: 1 }}>{s ?? '·'}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Hole numbers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 8px 1fr', gap: 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '1px' }}>
                    {[1,2,3,4,5,6,7,8,9].map(h => (
                      <div key={h} style={{ textAlign: 'center', fontSize: '7px', color: '#c0c0c0', lineHeight: 1, padding: '2px 0' }}>{h}</div>
                    ))}
                  </div>
                  <div />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '1px' }}>
                    {[10,11,12,13,14,15,16,17,18].map(h => (
                      <div key={h} style={{ textAlign: 'center', fontSize: '7px', color: '#c0c0c0', lineHeight: 1, padding: '2px 0' }}>{h}</div>
                    ))}
                  </div>
                </div>

                {/* Progress — thinner, more subtle */}
                <div style={{ display: 'flex', gap: '1px', marginTop: '6px' }}>
                  {Array.from({ length: 18 }, (_, i) => (
                    <div key={i} style={{
                      flex: 1, height: '2px', borderRadius: '1px',
                      background: i < player.holesCompleted ? '#c4992a'
                        : i === player.holesCompleted && isPlaying ? 'rgba(196,153,42,0.3)' : '#e5e7eb',
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
