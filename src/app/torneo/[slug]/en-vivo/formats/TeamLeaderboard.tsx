'use client'

// src/app/torneo/[slug]/en-vivo/formats/TeamLeaderboard.tsx
// Tabla de equipos para best_ball, scramble y foursome.

import type { LiveTeam } from '../types'

export interface TeamLeaderboardProps {
  teams: LiveTeam[]
}

function formatVsPar(vsPar: number): string {
  if (vsPar === 0) return 'E'
  return vsPar > 0 ? `+${vsPar}` : `${vsPar}`
}

function formatThru(thru: number, holeCount = 18): string {
  if (thru >= holeCount) return 'F'
  if (thru <= 0) return '-'
  return String(thru)
}

function joinPlayerNames(team: LiveTeam): string {
  if (!team.players || team.players.length === 0) return '-'
  return team.players.map((p) => p.name).join(' / ')
}

export default function TeamLeaderboard({ teams }: TeamLeaderboardProps) {
  // Ordenar por vs_par (par-relativo): comparable entre equipos con distinto
  // `thru`. Ordenar por team_total (golpes totales) haría liderar erróneamente a
  // un equipo que jugó menos hoyos. Desempate por más hoyos jugados.
  const sorted = [...teams].sort((a, b) => a.vs_par - b.vs_par || b.thru - a.thru)

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
    fontSize: '14px',
    color: 'var(--text, #1a1d24)',
  }
  const theadStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    background: 'var(--bg-surface, #ffffff)',
    borderBottom: '1px solid var(--border-md, rgba(26,29,36,0.12))',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-2, #5a6573)',
  }
  const thStyle: React.CSSProperties = { padding: '12px 8px', textAlign: 'left' }
  const thNumStyle: React.CSSProperties = { ...thStyle, textAlign: 'right' }
  const tdStyle: React.CSSProperties = {
    padding: '14px 8px',
    borderBottom: '1px solid var(--border, rgba(26,29,36,0.08))',
  }
  const tdNumStyle: React.CSSProperties = { ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  if (sorted.length === 0) {
    return (
      <div
        style={{
          padding: '32px 16px',
          textAlign: 'center',
          color: 'var(--text-3, #6B7280)',
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
            <th style={thNumStyle}>A par</th>
            <th style={thNumStyle}>THRU</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, idx) => (
            <tr key={t.id}>
              <td style={tdNumStyle}>{idx + 1}</td>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{t.name}</td>
              <td style={{ ...tdStyle, color: 'var(--text-2, #5a6573)' }}>{joinPlayerNames(t)}</td>
              <td style={tdNumStyle}>{t.team_total}</td>
              <td style={{ ...tdNumStyle, fontWeight: 600 }}>{formatVsPar(t.vs_par)}</td>
              <td style={{ ...tdNumStyle, color: 'var(--text-2, #5a6573)' }}>{formatThru(t.thru)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
