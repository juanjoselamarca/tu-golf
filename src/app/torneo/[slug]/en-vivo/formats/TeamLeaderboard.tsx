'use client'

// src/app/torneo/[slug]/en-vivo/formats/TeamLeaderboard.tsx
// Tabla de equipos para best_ball, scramble y foursome.

import type { LiveTeam } from '../types'
import { formatVsPar, formatThru, vsParColor } from './golf-format'
import { esPrimerLugar } from '@/golf/core/posiciones'
import { posicionesDeEquipos, type PosicionesPorId } from '../posiciones-en-vivo'

export interface TeamLeaderboardProps {
  teams: LiveTeam[]
  /** Hoyos de la ronda: sin esto un equipo que terminó 9 hoyos mostraba "9" en vez de "F". */
  holeCount: number
  /** Posiciones dentro de la competencia, por id (ver IndividualLeaderboard). Sin esto, sobre `teams`. */
  posiciones?: PosicionesPorId
}

function joinPlayerNames(team: LiveTeam): string {
  if (!team.players || team.players.length === 0) return '-'
  return team.players.map((p) => p.name).join(' / ')
}

export default function TeamLeaderboard({ teams, holeCount, posiciones }: TeamLeaderboardProps) {
  // El orden lo decide el motor (`rankTeamsWithCountback`): vs par, más hoyos
  // arriba entre empatados, countback cuando el grupo terminó y sin hoyos al final.
  // Re-ordenar acá por vs par perdía el countback y contradecía al podio.
  const sorted = teams
  // Empates estilo golf con la clave del motor (T2, T2, 4); sin hoyos, sin posición.
  const positions = posiciones ?? posicionesDeEquipos(sorted)

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
    fontSize: '14px',
    color: 'var(--text)',
  }
  const theadStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border-md)',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-2)',
  }
  const thStyle: React.CSSProperties = { padding: '12px 8px', textAlign: 'left' }
  const thNumStyle: React.CSSProperties = { ...thStyle, textAlign: 'right' }
  const tdStyle: React.CSSProperties = {
    padding: '14px 8px',
    borderBottom: '1px solid var(--border)',
  }
  const tdNumStyle: React.CSSProperties = {
    ...tdStyle,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    fontFamily: "var(--font-dm-mono, 'DM Mono', monospace)",
  }

  if (sorted.length === 0) {
    return (
      <div
        style={{
          padding: '32px 16px',
          textAlign: 'center',
          color: 'var(--text-3)',
          fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
          fontSize: '14px',
        }}
      >
        Aún no hay equipos con scores.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead style={theadStyle}>
          <tr>
            <th style={thNumStyle}>Pos</th>
            <th style={thStyle}>Equipo</th>
            <th style={thStyle}>Jugadores</th>
            <th style={thNumStyle}>Score</th>
            <th style={{ ...thNumStyle, whiteSpace: 'nowrap' }}>
              <span className="team-lb-apar-full">A par</span>
              <span className="team-lb-apar-short">&#177;</span>
            </th>
            <th style={thNumStyle}>THRU</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, idx) => {
            const posicion = positions.get(t.id) ?? null
            const isLeader = esPrimerLugar(posicion)
            const isEvenRow = idx % 2 === 1
            const rowStyle: React.CSSProperties = {
              background: isLeader
                ? 'var(--leader-row-bg)'
                : isEvenRow
                  ? 'var(--zebra-row-bg)'
                  : undefined,
            }
            return (
              <tr key={t.id} style={rowStyle}>
                <td style={tdNumStyle}>{posicion ?? '—'}</td>
                <td style={{ ...tdStyle, fontWeight: isLeader ? 700 : 600 }}>{t.name}</td>
                <td style={{ ...tdStyle, color: 'var(--text-2)' }}>{joinPlayerNames(t)}</td>
                <td style={tdNumStyle}>{t.team_total}</td>
                <td style={{
                  ...tdNumStyle,
                  fontWeight: isLeader ? 700 : 600,
                  fontSize: isLeader ? '16px' : undefined,
                  color: vsParColor(t.vs_par),
                }}>
                  {formatVsPar(t.vs_par)}
                </td>
                <td style={{ ...tdNumStyle, color: 'var(--text-2)' }}>{formatThru(t.thru, holeCount)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Mobile: "A par" → "±" para evitar line break */}
      <style>{`
        .team-lb-apar-short { display: none; }
        .team-lb-apar-full { display: inline; }
        @media (max-width: 639px) {
          .team-lb-apar-short { display: inline; }
          .team-lb-apar-full { display: none; }
        }
      `}</style>
    </div>
  )
}
