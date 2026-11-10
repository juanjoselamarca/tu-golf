'use client'
// Pestaña "Grupos" del board de torneo: cada grupo de salida con su estado y
// el score de sus jugadores, más los que no tienen grupo. Salió de TournamentTabs.
import { useMemo } from 'react'
import type { Player } from '@/lib/golf-data'
import { hasPlayData } from '@/golf/leaderboard/board-rules'
import { formatScoreDelRanking } from '@/golf/leaderboard/formato-score'
import type { GroupData } from '@/components/TournamentTabs'
import { T, hcpAMostrar, scoreColor, thruLabel } from './tablero-torneo'
import { formatearHandicap } from '@/golf/handicap-index-range'

/* ── Group status dot ─────────────────────────────────────── */
function groupStatusDot(groupPlayers: Player[], totalHoyos: number): { dot: string; color: string } {
  if (groupPlayers.length === 0) return { dot: '\u26AA', color: T.faint }
  const allFinished = groupPlayers.every(p => p.status === 'F')
  const anyStarted = groupPlayers.some(p => hasPlayData({ holesPlayed: p.holes }))
  if (allFinished) return { dot: '\uD83D\uDFE2', color: T.green }
  if (anyStarted) return { dot: '\uD83D\uDFE1', color: T.gold }
  return { dot: '\u26AA', color: T.faint }
}

export function GruposDelTorneo({ groups, players, playerIdToIndex, totalHoyos, esPuntos }: {
  groups: GroupData[]
  players: Player[]
  playerIdToIndex: Record<string, number>
  totalHoyos: number
  /** `p.total` son puntos (ranking por puntos): se escriben sin signo. */
  esPuntos: boolean
}) {
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

  return (
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
              borderBottom: groupPlayers.length > 0 ? `1px solid ${T.border}` : 'none',
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
                      {hcpAMostrar(p) != null && <span style={{ color: T.muted, fontWeight: 400 }}> ({formatearHandicap(hcpAMostrar(p))})</span>}
                    </span>

                    {/* Score + THRU */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                      <span style={{
                        fontFamily: '"DM Mono", monospace',
                        fontSize: '16px',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        color: hasPlayData({ holesPlayed: p.holes }) ? scoreColor(p.total, esPuntos) : T.faint,
                        lineHeight: 1,
                      }}>
                        {hasPlayData({ holesPlayed: p.holes }) ? formatScoreDelRanking(p.total, esPuntos) : '-'}
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
                {hcpAMostrar(p) != null && <span style={{ color: T.faint }}> ({formatearHandicap(hcpAMostrar(p))})</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
