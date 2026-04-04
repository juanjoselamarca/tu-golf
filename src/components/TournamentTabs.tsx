'use client'

import { useState, useMemo } from 'react'
import type { Player } from '@/lib/golf-data'
import GWILeaderboard from '@/components/GWILeaderboard'
import type { JugadorGWIInput } from '@/golf/stats/gwi'
import type { ModoJuego } from '@/golf/core/rules'

/* ── Types ────────────────────────────────────────────────── */
export interface GroupData {
  id: string
  name: string
  teeTime: string | null
  sortOrder: number
  playerIds: string[]
}

interface Props {
  players: Player[]
  groups: GroupData[]
  modoJuego: ModoJuego
  totalHoyos: number
  isLive: boolean
  gwiInputs: JugadorGWIInput[]
  playerIdToIndex: Record<string, number>
}

type Tab = 'leaderboard' | 'grupos'

/* ── Design tokens ────────────────────────────────────────── */
const T = {
  bg:        '#070d18',
  card:      '#0e1c2f',
  gold:      '#c4992a',
  ivory:     '#edeae4',
  muted:     'rgba(255,255,255,0.55)',
  faint:     'rgba(255,255,255,0.35)',
  border:    'rgba(196,153,42,0.12)',
  green:     '#16a34a',
  red:       '#dc2626',
  rowAlt:    'rgba(255,255,255,0.015)',
  leaderBg:  'rgba(196,153,42,0.04)',
  leaderBd:  'rgba(196,153,42,0.25)',
} as const

/* ── Helpers ──────────────────────────────────────────────── */
function formatScore(n: number) {
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
}

function scoreColor(n: number) {
  if (n < 0) return T.green
  if (n > 0) return T.red
  return T.ivory
}

function thruLabel(p: Player, totalHoyos: number) {
  if (p.status === 'F') return 'F'
  if (p.holes === 0) return '-'
  return `${p.holes}`
}

/** Compute tied positions: players with same score get "T3" style labels */
function computePositions(players: Player[]): string[] {
  if (players.length === 0) return []
  const positions: string[] = []
  let i = 0
  while (i < players.length) {
    let j = i + 1
    while (j < players.length && players[j].total === players[i].total) j++
    const tied = j - i > 1
    for (let k = i; k < j; k++) {
      positions.push(tied ? `T${i + 1}` : `${i + 1}`)
    }
    i = j
  }
  return positions
}

/* ── Group status dot ─────────────────────────────────────── */
function groupStatusDot(groupPlayers: Player[], totalHoyos: number): { dot: string; color: string } {
  if (groupPlayers.length === 0) return { dot: '\u26AA', color: '#94a8c0' }
  const allFinished = groupPlayers.every(p => p.status === 'F')
  const anyStarted = groupPlayers.some(p => p.holes > 0)
  if (allFinished) return { dot: '\uD83D\uDFE2', color: T.green }
  if (anyStarted) return { dot: '\uD83D\uDFE1', color: T.gold }
  return { dot: '\u26AA', color: '#94a8c0' }
}

/* ── Component ────────────────────────────────────────────── */
export default function TournamentTabs({ players, groups, modoJuego, totalHoyos, isLive, gwiInputs, playerIdToIndex }: Props) {
  const [tab, setTab] = useState<Tab>('leaderboard')
  const hasGroups = groups.length > 0

  // Build map: playerId → Player
  const playerByDbId = useMemo(() => {
    const map = new Map<string, Player>()
    Object.entries(playerIdToIndex).forEach(([dbId, idx]) => {
      if (players[idx]) map.set(dbId, players[idx])
    })
    return map
  }, [players, playerIdToIndex])

  // Find unassigned players
  const unassignedPlayers = useMemo(() => {
    const assignedIds = new Set(groups.flatMap(g => g.playerIds))
    return Object.entries(playerIdToIndex)
      .filter(([dbId]) => !assignedIds.has(dbId))
      .map(([, idx]) => players[idx])
      .filter(Boolean)
  }, [groups, playerIdToIndex, players])

  // Positions for leaderboard
  const positions = useMemo(() => computePositions(players), [players])

  return (
    <>
      {/* ── Tab toggle ── */}
      {hasGroups && (
        <div style={{
          display: 'flex',
          width: '100%',
          maxWidth: '400px',
          margin: '0 auto 20px',
          borderBottom: `1px solid ${T.border}`,
        }}>
          {([
            { key: 'leaderboard' as Tab, label: 'Leaderboard' },
            { key: 'grupos' as Tab, label: 'Grupos' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1,
                padding: '10px 0',
                fontSize: '14px',
                fontWeight: 600,
                border: 'none',
                borderBottom: tab === key ? `2px solid ${T.gold}` : '2px solid transparent',
                cursor: 'pointer',
                background: 'transparent',
                color: tab === key ? T.gold : T.muted,
                transition: 'all 0.2s ease',
                fontFamily: '"DM Sans", system-ui, sans-serif',
                WebkitTapHighlightColor: 'transparent',
                letterSpacing: '0.02em',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Leaderboard tab ── */}
      {tab === 'leaderboard' && (
        <>
          {/* PGA-style table */}
          <div style={{ width: '100%', overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '42px 1fr 48px 48px 56px',
              padding: '8px 12px',
              borderBottom: `1px solid ${T.border}`,
            }}>
              {['POS', 'JUGADOR', 'HCP', 'THRU', 'SCORE'].map(h => (
                <span key={h} style={{
                  fontFamily: '"DM Mono", monospace',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: T.faint,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  textAlign: h === 'JUGADOR' ? 'left' : 'center',
                }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Player rows */}
            {players.map((p, idx) => {
              const isLeader = idx === 0 && p.holes > 0
              return (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '42px 1fr 48px 48px 56px',
                    padding: '10px 12px',
                    alignItems: 'center',
                    background: idx % 2 === 1 ? T.rowAlt : 'transparent',
                    borderLeft: isLeader ? `3px solid ${T.gold}` : '3px solid transparent',
                    ...(isLeader ? { background: T.leaderBg } : {}),
                  }}
                >
                  {/* POS */}
                  <span style={{
                    fontFamily: '"DM Mono", monospace',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: isLeader ? T.gold : idx < 3 ? T.ivory : T.muted,
                    textAlign: 'center',
                  }}>
                    {positions[idx] || idx + 1}
                  </span>

                  {/* JUGADOR */}
                  <span style={{
                    fontFamily: '"DM Sans", system-ui, sans-serif',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: isLeader ? T.ivory : T.ivory,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    paddingRight: '8px',
                  }}>
                    {p.name}
                  </span>

                  {/* HCP */}
                  <span style={{
                    fontFamily: '"DM Mono", monospace',
                    fontSize: '12px',
                    color: T.muted,
                    textAlign: 'center',
                  }}>
                    {Math.round(p.hcp)}
                  </span>

                  {/* THRU */}
                  <span style={{
                    fontFamily: '"DM Mono", monospace',
                    fontSize: '12px',
                    color: p.status === 'F' ? T.green : T.muted,
                    textAlign: 'center',
                    fontWeight: p.status === 'F' ? 700 : 400,
                  }}>
                    {thruLabel(p, totalHoyos)}
                  </span>

                  {/* SCORE */}
                  <span style={{
                    fontFamily: '"Cormorant Garamond", serif',
                    fontSize: '20px',
                    fontWeight: 700,
                    color: p.holes > 0 ? scoreColor(p.total) : T.faint,
                    textAlign: 'center',
                    lineHeight: 1,
                  }}>
                    {p.holes > 0 ? formatScore(p.total) : '-'}
                  </span>
                </div>
              )
            })}

            {players.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: T.muted, fontSize: '14px' }}>
                Sin jugadores aún
              </div>
            )}
          </div>

          {/* GWI Leaderboard (live only) */}
          {isLive && gwiInputs.length >= 2 && (
            <div style={{ marginTop: '24px' }}>
              <GWILeaderboard
                jugadores={gwiInputs}
                hoyosRestantes={totalHoyos - (gwiInputs.reduce((mx, g) => Math.max(mx, g.hoyosCompletados), 0))}
                totalHoyos={totalHoyos}
                modoJuego={modoJuego}
              />
            </div>
          )}
        </>
      )}

      {/* ── Groups tab ── */}
      {tab === 'grupos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {groups.map(group => {
            const groupPlayers = group.playerIds
              .map(pid => playerByDbId.get(pid))
              .filter(Boolean) as Player[]
            const status = groupStatusDot(groupPlayers, totalHoyos)

            return (
              <div
                key={group.id}
                style={{
                  background: T.card,
                  border: `1px solid ${T.border}`,
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                {/* Group header — tee time · name · dot */}
                <div style={{
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  borderBottom: groupPlayers.length > 0 ? `1px solid rgba(255,255,255,0.04)` : 'none',
                }}>
                  {group.teeTime && (
                    <span style={{
                      fontFamily: '"DM Mono", monospace',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: T.gold,
                    }}>
                      {group.teeTime}
                    </span>
                  )}
                  <span style={{
                    fontFamily: '"DM Sans", system-ui, sans-serif',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: T.ivory,
                    flex: 1,
                  }}>
                    {group.name}
                  </span>
                  <span style={{ fontSize: '10px', lineHeight: 1 }}>{status.dot}</span>
                </div>

                {/* Player rows — compact, no column headers */}
                {groupPlayers.length > 0 ? (
                  <div>
                    {groupPlayers.map((p, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 16px',
                          background: idx % 2 === 1 ? T.rowAlt : 'transparent',
                        }}
                      >
                        {/* Name (HCP) */}
                        <span style={{
                          fontFamily: '"DM Sans", system-ui, sans-serif',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: T.ivory,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                          minWidth: 0,
                        }}>
                          {p.name}
                          <span style={{ color: T.muted, fontWeight: 400 }}> ({Math.round(p.hcp)})</span>
                        </span>

                        {/* Score + THRU */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                          <span style={{
                            fontFamily: '"Cormorant Garamond", serif',
                            fontSize: '18px',
                            fontWeight: 700,
                            color: p.holes > 0 ? scoreColor(p.total) : T.faint,
                            lineHeight: 1,
                          }}>
                            {p.holes > 0 ? formatScore(p.total) : '-'}
                          </span>
                          <span style={{
                            fontFamily: '"DM Mono", monospace',
                            fontSize: '11px',
                            color: p.status === 'F' ? T.green : T.faint,
                            fontWeight: p.status === 'F' ? 600 : 400,
                            minWidth: '16px',
                            textAlign: 'right',
                          }}>
                            {thruLabel(p, totalHoyos)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    padding: '16px',
                    textAlign: 'center',
                    color: T.faint,
                    fontSize: '13px',
                  }}>
                    Sin jugadores
                  </div>
                )}
              </div>
            )
          })}

          {/* Unassigned players */}
          {unassignedPlayers.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <div style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '11px',
                color: T.faint,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '8px',
                paddingLeft: '4px',
              }}>
                Sin grupo asignado
              </div>
              {unassignedPlayers.map((p, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 4px',
                    gap: '8px',
                  }}
                >
                  <span style={{
                    fontFamily: '"DM Sans", system-ui, sans-serif',
                    fontSize: '13px',
                    color: T.muted,
                  }}>
                    {p.name}
                    <span style={{ color: T.faint }}> ({Math.round(p.hcp)})</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
