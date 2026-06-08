'use client'

// src/app/torneo/[slug]/en-vivo/formats/IndividualLeaderboard.tsx
// Tabla individual para stroke_play y stableford.
// Sin click-expandir (eso es follow-up de Wave 3 tanda 2).

import type { LivePlayer } from '../types'

export interface IndividualLeaderboardProps {
  players: LivePlayer[]
  format: 'stroke_play' | 'stableford'
  modo: 'gross' | 'neto'
}

function sortPlayers(
  players: LivePlayer[],
  format: 'stroke_play' | 'stableford',
  modo: 'gross' | 'neto'
): LivePlayer[] {
  const copy = [...players]
  if (format === 'stableford') {
    // Mas puntos = mejor.
    copy.sort((a, b) => (b.points_total ?? 0) - (a.points_total ?? 0))
  } else if (modo === 'neto') {
    copy.sort((a, b) => (a.net_total ?? Number.POSITIVE_INFINITY) - (b.net_total ?? Number.POSITIVE_INFINITY))
  } else {
    copy.sort((a, b) => a.gross_total - b.gross_total)
  }
  return copy
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

export default function IndividualLeaderboard({
  players,
  format,
  modo,
}: IndividualLeaderboardProps) {
  const sorted = sortPlayers(players, format, modo)
  const isStableford = format === 'stableford'

  // Estilos inline para tokens con fallback hex (sin tocar Tailwind config).
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
  const thStyle: React.CSSProperties = {
    padding: '12px 8px',
    textAlign: 'left',
  }
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
        Aún no hay jugadores con scores.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead style={theadStyle}>
          <tr>
            <th style={thNumStyle}>Pos</th>
            <th style={thStyle}>Jugador</th>
            <th style={thStyle}>Cat</th>
            <th style={thNumStyle}>Bruto</th>
            <th style={thNumStyle}>HCP Cancha</th>
            {isStableford ? (
              <th style={thNumStyle}>Puntos</th>
            ) : (
              <>
                <th style={thNumStyle}>Neto</th>
                <th style={thNumStyle}>A par</th>
              </>
            )}
            <th style={thNumStyle}>THRU</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, idx) => (
            <tr key={p.id}>
              <td style={tdNumStyle}>{idx + 1}</td>
              <td style={{ ...tdStyle, fontWeight: 500 }}>{p.name}</td>
              <td style={{ ...tdStyle, color: 'var(--text-2, #5a6573)' }}>{p.category_name ?? '-'}</td>
              <td style={tdNumStyle}>{p.gross_total}</td>
              <td style={tdNumStyle}>{p.handicap_index}</td>
              {isStableford ? (
                <td style={{ ...tdNumStyle, fontWeight: 600 }}>{p.points_total ?? 0}</td>
              ) : (
                <>
                  <td style={tdNumStyle}>{modo === 'neto' ? (p.net_total ?? '-') : '-'}</td>
                  <td style={{ ...tdNumStyle, fontWeight: 600 }}>{formatVsPar(p.vs_par)}</td>
                </>
              )}
              <td style={{ ...tdNumStyle, color: 'var(--text-2, #5a6573)' }}>{formatThru(p.thru)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
