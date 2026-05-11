'use client'

// src/app/torneo/[slug]/en-vivo/formats/MatchPlayBracket.tsx
// Bracket de match-play para los modos single_elimination y round_robin.
// MVP: no expande scorecard al click; solo console.log placeholder.

import type { LiveMatch } from '../types'

export interface MatchPlayBracketProps {
  matches: LiveMatch[]
  bracketMode: 'single_elimination' | 'round_robin'
}

// `round_number` no existe en LiveMatch (types.ts) — lo inferimos via heuristica
// del orden recibido, o si el id sigue convencion `r{N}-...`. Si no, todos van a la primera columna.
function inferRound(match: LiveMatch & { round_number?: number }, fallback: number): number {
  if (typeof match.round_number === 'number') return match.round_number
  // Buscar prefijo "r<digits>" en el id (convencion del simulator de bracket)
  const m = /^r(\d+)/i.exec(match.id)
  if (m) return parseInt(m[1], 10)
  return fallback
}

function statusLabel(match: LiveMatch): string {
  if (match.status === 'completed' && match.result) return match.result
  if (match.status === 'in_progress') {
    if (match.result) return match.result
    if (typeof match.current_hole === 'number') return `H${match.current_hole}`
    return 'En curso'
  }
  return 'Pendiente'
}

function pickWinnerColor(match: LiveMatch): { aBold: boolean; bBold: boolean } {
  if (match.status !== 'completed' || !match.result) return { aBold: false, bBold: false }
  // Result formats: "3&2", "1UP", "AS"
  if (/^AS$/i.test(match.result)) return { aBold: true, bBold: true }
  // Asumimos que si hay un result decisivo, el ganador es player_a por convencion del simulator
  // (los simulators emiten match.result desde la perspectiva de player_a cuando gana A).
  // Sin metadata adicional, marcamos ambos como neutros para no mentir.
  return { aBold: false, bBold: false }
}

const containerStyle: React.CSSProperties = {
  fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
  color: 'var(--text-primary, #111827)',
}

const placeholderStyle: React.CSSProperties = {
  padding: '32px 16px',
  textAlign: 'center',
  color: 'var(--text-secondary, #6b7280)',
  fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
  fontSize: '14px',
  background: 'var(--card-bg, #f9fafb)',
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: '12px',
}

const cardStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: '10px',
  background: 'var(--card-bg, #f9fafb)',
  border: '1px solid var(--border, #e5e7eb)',
  cursor: 'pointer',
  transition: 'border-color 120ms ease, transform 120ms ease',
}

function MatchCard({ match }: { match: LiveMatch }) {
  const { aBold, bBold } = pickWinnerColor(match)
  return (
    <div
      style={cardStyle}
      onClick={() => {
        // eslint-disable-next-line no-console
        console.log('[live/match-play] expand match', match.id)
      }}
      role="button"
      tabIndex={0}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '13px',
          fontWeight: aBold ? 700 : 500,
          color: 'var(--text-primary, #111827)',
        }}
      >
        <span>{match.player_a.name}</span>
        <span style={{ color: 'var(--text-secondary, #6b7280)', fontSize: '11px' }}>vs</span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '13px',
          fontWeight: bBold ? 700 : 500,
          color: 'var(--text-primary, #111827)',
          marginTop: '4px',
        }}
      >
        <span>{match.player_b.name}</span>
        <span
          style={{
            color: 'var(--brand-gold, #c4992a)',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {statusLabel(match)}
        </span>
      </div>
    </div>
  )
}

function SingleEliminationBracket({ matches }: { matches: LiveMatch[] }) {
  // Agrupar por round_number (inferido).
  const groups = new Map<number, LiveMatch[]>()
  matches.forEach((m, idx) => {
    const r = inferRound(m as LiveMatch & { round_number?: number }, 1 + Math.floor(idx / Math.max(1, matches.length)))
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(m)
  })

  const sortedRounds = Array.from(groups.keys()).sort((a, b) => a - b)
  const totalRounds = sortedRounds.length

  function roundLabel(r: number, idx: number): string {
    // Etiquetas estandar segun cantidad de rondas:
    // 4 rondas: 16avos, 8avos, Cuartos, Semi, Final  — escalable.
    // Si solo hay una ronda, "Final".
    if (totalRounds === 1) return 'Final'
    if (idx === totalRounds - 1) return 'Final'
    if (idx === totalRounds - 2) return 'Semis'
    if (idx === totalRounds - 3) return 'Cuartos'
    if (idx === totalRounds - 4) return 'Octavos'
    return `Ronda ${r}`
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '24px',
        overflowX: 'auto',
        padding: '8px 0',
        ...containerStyle,
      }}
    >
      {sortedRounds.map((r, idx) => (
        <div
          key={r}
          style={{
            flex: '0 0 240px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
              color: 'var(--text-secondary, #6b7280)',
              paddingBottom: '6px',
              borderBottom: '1px solid var(--border, #e5e7eb)',
            }}
          >
            {roundLabel(r, idx)}
          </div>
          {groups.get(r)!.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      ))}
    </div>
  )
}

function RoundRobinTable({ matches }: { matches: LiveMatch[] }) {
  // Construir lista de jugadores unicos a partir de los matches.
  const playerMap = new Map<string, { id: string; name: string }>()
  matches.forEach((m) => {
    if (!playerMap.has(m.player_a.id)) playerMap.set(m.player_a.id, { id: m.player_a.id, name: m.player_a.name })
    if (!playerMap.has(m.player_b.id)) playerMap.set(m.player_b.id, { id: m.player_b.id, name: m.player_b.name })
  })
  const players = Array.from(playerMap.values())

  // Index matches por par {a,b} sin orientacion.
  const cellMap = new Map<string, LiveMatch>()
  matches.forEach((m) => {
    const key = [m.player_a.id, m.player_b.id].sort().join('|')
    cellMap.set(key, m)
  })

  const thStyle: React.CSSProperties = {
    padding: '10px 8px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary, #6b7280)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    textAlign: 'left',
    borderBottom: '1px solid var(--border, #e5e7eb)',
    background: 'var(--card-bg, #f9fafb)',
    position: 'sticky',
    top: 0,
    whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    padding: '10px 8px',
    borderBottom: '1px solid var(--border, #e5e7eb)',
    fontSize: '13px',
    color: 'var(--text-primary, #111827)',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  }
  const rowHeaderStyle: React.CSSProperties = {
    ...tdStyle,
    textAlign: 'left',
    fontWeight: 600,
    background: 'var(--card-bg, #f9fafb)',
    position: 'sticky',
    left: 0,
  }

  return (
    <div style={{ overflowX: 'auto', ...containerStyle }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '420px' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, left: 0, position: 'sticky', zIndex: 1 }}></th>
            {players.map((p) => (
              <th key={p.id} style={thStyle}>
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((row) => (
            <tr key={row.id}>
              <td style={rowHeaderStyle}>{row.name}</td>
              {players.map((col) => {
                if (row.id === col.id) {
                  return (
                    <td key={col.id} style={{ ...tdStyle, color: 'var(--text-secondary, #6b7280)' }}>
                      —
                    </td>
                  )
                }
                const key = [row.id, col.id].sort().join('|')
                const m = cellMap.get(key)
                if (!m) {
                  return (
                    <td key={col.id} style={{ ...tdStyle, color: 'var(--text-secondary, #6b7280)' }}>
                      -
                    </td>
                  )
                }
                return (
                  <td
                    key={col.id}
                    style={{
                      ...tdStyle,
                      cursor: 'pointer',
                      fontWeight: 500,
                      color: m.status === 'completed' ? 'var(--brand-gold, #c4992a)' : 'var(--text-primary, #111827)',
                    }}
                    onClick={() => {
                      // eslint-disable-next-line no-console
                      console.log('[live/match-play] expand match', m.id)
                    }}
                  >
                    {statusLabel(m)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function MatchPlayBracket({ matches, bracketMode }: MatchPlayBracketProps) {
  if (!matches || matches.length === 0) {
    return <div style={placeholderStyle}>El bracket se generará cuando se inscriban los jugadores.</div>
  }

  if (bracketMode === 'round_robin') {
    return <RoundRobinTable matches={matches} />
  }
  return <SingleEliminationBracket matches={matches} />
}
