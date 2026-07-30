'use client'

// src/app/torneo/[slug]/en-vivo/formats/IndividualLeaderboard.tsx
// Tabla individual para stroke_play y stableford.
// Sin click-expandir (eso es follow-up de Wave 3 tanda 2).

import type { LivePlayer } from '../types'
import { hasPlayData } from '@/golf/leaderboard/board-rules'
import { formatVsPar, formatThru, vsParColor, computePositions } from './golf-format'

/** Celda sin dato. Em dash, el mismo que usa `formatThru`. */
const EMPTY = '—'

export interface IndividualLeaderboardProps {
  players: LivePlayer[]
  format: 'stroke_play' | 'stableford'
  modo: 'gross' | 'neto'
}

export default function IndividualLeaderboard({
  players,
  format,
  modo,
}: IndividualLeaderboardProps) {
  // El orden lo decide el motor (`buildLeaderboardFromLegacy` → `rankEntries`),
  // que ya aplicó countback y dejó a los que no scorearon al final. Re-ordenar
  // acá por golpes crudos era el bug que ponía primero al que menos hoyos
  // llevaba, y en modo neto dejaba la tabla sin orden.
  const sorted = players
  const isStableford = format === 'stableford'

  // Empates estilo golf sobre la MISMA métrica que ordenó: puntos en
  // stableford, "a par" en el resto. Quien no jugó no empata con quien está en
  // par — va aparte, al final.
  const positions = computePositions(
    sorted.map((p) => {
      if (!hasPlayData({ holesPlayed: p.thru })) return Number.POSITIVE_INFINITY
      return isStableford ? (p.points_total ?? 0) : p.vs_par
    }),
  )

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
          {sorted.map((p, idx) => {
            // Sin hoyos jugados no hay score: se muestra "—", nunca un número
            // derivado de totales en cero (así aparecía un líder a −60).
            const played = hasPlayData({ holesPlayed: p.thru })
            return (
              <tr key={p.id}>
                <td style={tdNumStyle}>{played ? positions[idx] : EMPTY}</td>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{p.name}</td>
                <td style={{ ...tdStyle, color: 'var(--text-2, #5a6573)' }}>{p.category_name ?? EMPTY}</td>
                <td style={tdNumStyle}>{played ? p.gross_total : EMPTY}</td>
                <td style={tdNumStyle}>{p.handicap_index}</td>
                {isStableford ? (
                  <td style={{ ...tdNumStyle, fontWeight: 600 }}>{played ? (p.points_total ?? 0) : EMPTY}</td>
                ) : (
                  <>
                    <td style={tdNumStyle}>{played && p.net_total != null ? p.net_total : EMPTY}</td>
                    <td style={{ ...tdNumStyle, fontWeight: 600, color: played ? vsParColor(p.vs_par) : undefined }}>
                      {played ? formatVsPar(p.vs_par) : EMPTY}
                    </td>
                  </>
                )}
                <td style={{ ...tdNumStyle, color: 'var(--text-2, #5a6573)' }}>{formatThru(p.thru)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
