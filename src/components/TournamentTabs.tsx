'use client'

import { useState } from 'react'
import type { Player } from '@/lib/golf-data'
import LeaderboardTable from '@/components/LeaderboardTable'
import GWILeaderboard from '@/components/GWILeaderboard'
import type { JugadorGWIInput } from '@/golf/stats/gwi'
import type { ModoJuego } from '@/golf/core/rules'

/* ── Types ────────────────────────────────────────────────── */
export interface GroupData {
  id: string
  name: string
  teeTime: string | null   // formatted HH:MM
  sortOrder: number
  playerIds: string[]       // player_id references
}

interface Props {
  players: Player[]
  groups: GroupData[]
  modoJuego: ModoJuego
  totalHoyos: number
  isLive: boolean
  gwiInputs: JugadorGWIInput[]
  /** Map from player.id (DB) → index in players[] */
  playerIdToIndex: Record<string, number>
}

type Tab = 'leaderboard' | 'grupos'

/* ── Helpers ──────────────────────────────────────────────── */
function formatScore(n: number) {
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
}

function scoreColor(n: number) {
  if (n < 0) return '#16a34a'
  if (n > 0) return '#dc2626'
  return '#edeae4'
}

function thruLabel(p: Player, totalHoyos: number) {
  if (p.status === 'F') return 'F'
  if (p.holes === 0) return '-'
  return `${p.holes}`
}

/* ── Group status ─────────────────────────────────────────── */
function groupStatus(groupPlayers: Player[], totalHoyos: number): { label: string; color: string; bg: string } {
  if (groupPlayers.length === 0) return { label: 'Sin jugadores', color: '#94a8c0', bg: 'rgba(148,168,192,0.1)' }
  const allFinished = groupPlayers.every(p => p.status === 'F')
  const anyStarted = groupPlayers.some(p => p.holes > 0)
  if (allFinished) return { label: 'Terminado', color: '#16a34a', bg: 'rgba(22,163,74,0.1)' }
  if (anyStarted) return { label: 'En cancha', color: '#c4992a', bg: 'rgba(196,153,42,0.1)' }
  return { label: 'Por salir', color: '#94a8c0', bg: 'rgba(148,168,192,0.1)' }
}

/* ── Component ────────────────────────────────────────────── */
export default function TournamentTabs({ players, groups, modoJuego, totalHoyos, isLive, gwiInputs, playerIdToIndex }: Props) {
  const [tab, setTab] = useState<Tab>('leaderboard')
  const hasGroups = groups.length > 0

  // Build map: playerId → Player
  const playerByDbId = new Map<string, Player>()
  Object.entries(playerIdToIndex).forEach(([dbId, idx]) => {
    if (players[idx]) playerByDbId.set(dbId, players[idx])
  })

  // Find players not in any group
  const assignedPlayerIds = new Set(groups.flatMap(g => g.playerIds))
  const unassignedPlayers = Object.entries(playerIdToIndex)
    .filter(([dbId]) => !assignedPlayerIds.has(dbId))
    .map(([dbId, idx]) => players[idx])
    .filter(Boolean)

  return (
    <>
      {/* ── Tab toggle (only if groups exist) ── */}
      {hasGroups && (
        <div style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.07)',
          borderRadius: '12px',
          padding: '3px',
          marginBottom: '16px',
          maxWidth: '320px',
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
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: tab === key ? '#c4992a' : 'transparent',
                color: tab === key ? '#070d18' : 'rgba(255,255,255,0.55)',
                transition: 'all 0.15s ease',
                fontFamily: '"DM Sans", system-ui, sans-serif',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Leaderboard view ── */}
      {tab === 'leaderboard' && (
        <>
          <LeaderboardTable players={players} modoJuego={modoJuego} />
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

      {/* ── Groups view ── */}
      {tab === 'grupos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {groups.map(group => {
            const groupPlayers = group.playerIds
              .map(pid => playerByDbId.get(pid))
              .filter(Boolean) as Player[]
            const status = groupStatus(groupPlayers, totalHoyos)

            return (
              <div
                key={group.id}
                style={{
                  background: '#0e1c2f',
                  border: '1px solid rgba(196,153,42,0.12)',
                  borderRadius: '14px',
                  overflow: 'hidden',
                }}
              >
                {/* Group header */}
                <div style={{
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(196,153,42,0.08)',
                  background: 'rgba(196,153,42,0.04)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      fontFamily: '"DM Sans", system-ui, sans-serif',
                      fontSize: '15px',
                      fontWeight: 700,
                      color: '#edeae4',
                    }}>
                      {group.name}
                    </span>
                    {group.teeTime && (
                      <span style={{
                        fontFamily: '"DM Mono", monospace',
                        fontSize: '12px',
                        color: '#c4992a',
                        background: 'rgba(196,153,42,0.1)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(196,153,42,0.2)',
                      }}>
                        {group.teeTime}
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: status.color,
                    background: status.bg,
                    padding: '3px 10px',
                    borderRadius: '8px',
                    border: `1px solid ${status.color}25`,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: '"DM Mono", monospace',
                  }}>
                    {status.label}
                  </span>
                </div>

                {/* Player rows */}
                {groupPlayers.length > 0 ? (
                  <div>
                    {/* Table header */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 60px 60px 70px',
                      padding: '8px 18px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      {['JUGADOR', 'HCP', 'THRU', 'SCORE'].map(h => (
                        <span key={h} style={{
                          fontFamily: '"DM Mono", monospace',
                          fontSize: '10px',
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.35)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          textAlign: h === 'JUGADOR' ? 'left' : 'center',
                        }}>
                          {h}
                        </span>
                      ))}
                    </div>

                    {groupPlayers.map((p, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 60px 60px 70px',
                          padding: '10px 18px',
                          alignItems: 'center',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                          borderBottom: idx < groupPlayers.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                        }}
                      >
                        {/* Name */}
                        <div style={{
                          fontFamily: '"DM Sans", system-ui, sans-serif',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: '#edeae4',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {p.name}
                        </div>
                        {/* HCP */}
                        <div style={{
                          fontFamily: '"DM Mono", monospace',
                          fontSize: '12px',
                          color: 'rgba(255,255,255,0.55)',
                          textAlign: 'center',
                        }}>
                          {p.hcp.toFixed(1)}
                        </div>
                        {/* THRU */}
                        <div style={{
                          fontFamily: '"DM Mono", monospace',
                          fontSize: '12px',
                          color: p.status === 'F' ? '#16a34a' : 'rgba(255,255,255,0.55)',
                          textAlign: 'center',
                          fontWeight: p.status === 'F' ? 700 : 400,
                        }}>
                          {thruLabel(p, totalHoyos)}
                        </div>
                        {/* Score */}
                        <div style={{
                          fontFamily: '"Cormorant Garamond", serif',
                          fontSize: '18px',
                          fontWeight: 700,
                          color: scoreColor(p.total),
                          textAlign: 'center',
                        }}>
                          {p.holes > 0 ? formatScore(p.total) : '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    padding: '20px 18px',
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.35)',
                    fontSize: '13px',
                  }}>
                    Sin jugadores asignados
                  </div>
                )}
              </div>
            )
          })}

          {/* Unassigned players */}
          {unassignedPlayers.length > 0 && (
            <div style={{
              background: '#0e1c2f',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '14px',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: 'rgba(255,255,255,0.02)',
              }}>
                <span style={{
                  fontFamily: '"DM Sans", system-ui, sans-serif',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.55)',
                }}>
                  Sin grupo
                </span>
              </div>
              <div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 60px 60px 70px',
                  padding: '8px 18px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  {['JUGADOR', 'HCP', 'THRU', 'SCORE'].map(h => (
                    <span key={h} style={{
                      fontFamily: '"DM Mono", monospace',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.35)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      textAlign: h === 'JUGADOR' ? 'left' : 'center',
                    }}>
                      {h}
                    </span>
                  ))}
                </div>
                {unassignedPlayers.map((p, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 60px 60px 70px',
                      padding: '10px 18px',
                      alignItems: 'center',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '14px', fontWeight: 600, color: '#edeae4' }}>
                      {p.name}
                    </div>
                    <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '12px', color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
                      {p.hcp.toFixed(1)}
                    </div>
                    <div style={{
                      fontFamily: '"DM Mono", monospace', fontSize: '12px',
                      color: p.status === 'F' ? '#16a34a' : 'rgba(255,255,255,0.55)',
                      textAlign: 'center', fontWeight: p.status === 'F' ? 700 : 400,
                    }}>
                      {thruLabel(p, totalHoyos)}
                    </div>
                    <div style={{
                      fontFamily: '"Cormorant Garamond", serif', fontSize: '18px', fontWeight: 700,
                      color: scoreColor(p.total), textAlign: 'center',
                    }}>
                      {p.holes > 0 ? formatScore(p.total) : '-'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
