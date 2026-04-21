'use client'

import { useState } from 'react'
import { GWISparkline } from './GWISparkline'
import type { SimPlayer } from '@/hooks/useDemoSimulation'

const PARS = [4,5,3,4,3,4,4,3,5,4,5,4,3,5,4,5,3,4]
const M = 'var(--font-dm-mono), monospace'

function fmtScore(v: number): string {
  return v === 0 ? 'E' : v > 0 ? `+${v}` : `${v}`
}

// Score vs par color — paleta Garmin canónica (eagle/birdie/par/bogey/double).
// Esta tarjeta está sobre fondo claro → usar variante light.
function scoreClr(v: number): string {
  return getScoreColorLight(v)
}

// GWI color based on value relative to field position (not absolute)
// Since GWI sums to 100, the leader might have 25% and last place 3%
function gwiClr(g: number, playerCount: number): string {
  const avg = playerCount > 0 ? 100 / playerCount : 10
  if (g >= avg * 2) return '#16a34a'   // well above average
  if (g >= avg * 0.8) return '#374151' // around average — neutral
  return '#94a8c0'                      // below average — muted, not red
}

// GWI delta color — this shows movement (up = green, down = red)
function gwiDeltaClr(delta: number): string {
  if (delta > 0) return '#16a34a'
  if (delta < 0) return '#dc2626'
  return '#94a8c0'
}

// Score colors from centralized system
import { SCORE_STYLES_LIGHT, getScoreResult, getScoreColorLight } from '@/golf/core/colors'

function holeCellStyle(s: number | null, par: number) {
  const result = getScoreResult(s, par)
  const st = SCORE_STYLES_LIGHT[result]
  return { bg: st.bg, clr: st.textColor }
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
                background: '#f9fafb', padding: '16px 16px 18px',
                borderBottom: '1px solid #e5e7eb',
              }}>
                {/* GWI + Stats — clean row with breathing room */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: '16px',
                }}>
                  {/* GWI Bloomberg */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '10px', fontFamily: M, color: '#9ca3af', letterSpacing: '0.05em' }}>GWI</span>
                    <span style={{ fontFamily: M, fontSize: '18px', fontWeight: 700, color: gwiClr(player.gwi, filtered.length) }}>
                      {player.gwi.toFixed(1)}
                    </span>
                    <span style={{
                      fontFamily: M, fontSize: '11px', fontWeight: 700,
                      color: gwiDeltaClr(player.gwiDelta),
                    }}>
                      {player.gwiDelta >= 0 ? '+' : ''}{player.gwiDelta.toFixed(1)}
                    </span>
                  </div>

                  {/* Birdies · Bogeys · Last hole */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '13px', color: '#166534', fontFamily: M, fontWeight: 600 }}>{birdies} <span style={{ fontSize: '10px', fontWeight: 400 }}>bir</span></span>
                    <span style={{ fontSize: '13px', color: '#991b1b', fontFamily: M, fontWeight: 600 }}>{bogeys} <span style={{ fontSize: '10px', fontWeight: 400 }}>bog</span></span>
                    {lastHole > 0 && (
                      <span style={{ fontSize: '14px' }}>{lastLabel}</span>
                    )}
                  </div>
                </div>

                {/* Scorecard — generous spacing, easy to read */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '3px', marginBottom: '4px' }}>
                  {player.scores.slice(0, 9).map((s, i) => {
                    const { bg, clr } = holeCellStyle(s, PARS[i])
                    return (
                      <div key={i} style={{ textAlign: 'center', padding: '5px 0', borderRadius: '6px', background: bg }}>
                        <div style={{ fontSize: '7px', color: '#b0b0b0', lineHeight: 1, marginBottom: '2px' }}>{i + 1}</div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: clr, lineHeight: 1 }}>{s ?? '·'}</div>
                      </div>
                    )
                  })}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '3px' }}>
                  {player.scores.slice(9).map((s, i) => {
                    const { bg, clr } = holeCellStyle(s, PARS[i + 9])
                    return (
                      <div key={i} style={{ textAlign: 'center', padding: '5px 0', borderRadius: '6px', background: bg }}>
                        <div style={{ fontSize: '7px', color: '#b0b0b0', lineHeight: 1, marginBottom: '2px' }}>{i + 10}</div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: clr, lineHeight: 1 }}>{s ?? '·'}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Progress */}
                <div style={{ display: 'flex', gap: '2px', marginTop: '12px' }}>
                  {Array.from({ length: 18 }, (_, i) => (
                    <div key={i} style={{
                      flex: 1, height: '3px', borderRadius: '2px',
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
