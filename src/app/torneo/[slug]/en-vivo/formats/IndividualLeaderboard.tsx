'use client'

// src/app/torneo/[slug]/en-vivo/formats/IndividualLeaderboard.tsx
// Tabla individual para stroke_play y stableford.
// Sin click-expandir (eso es follow-up de Wave 3 tanda 2).

import type { LivePlayer } from '../types'
import { hasPlayData } from '@/golf/leaderboard/board-rules'
import { formatVsPar, formatThru, vsParColor, computePositions } from './golf-format'

/** Celda sin dato. Em dash, el mismo que usa `formatThru`. */
const EMPTY = '—'
/** Marcadores vacios de categoría que significan "sin categoría". */
const EMPTY_CAT = new Set(['---', '—', '-', ''])

/** Quitar marcadores de género "(M)" / "(F)" del nombre para mobile. */
function stripGenderMarker(name: string): string {
  return name.replace(/\s*\((M|F)\)\s*$/i, '').trim()
}

export interface IndividualLeaderboardProps {
  players: LivePlayer[]
  format: 'stroke_play' | 'stableford'
  modo: 'gross' | 'neto'
  /** Mostrar nota "recién actualizado" con punto verde pulsante. */
  recentlyUpdated?: boolean
  /** Total de hoyos del torneo (para detectar THRU = "F"). Default 18. */
  holeCount?: number
}

export default function IndividualLeaderboard({
  players,
  format,
  modo,
  recentlyUpdated,
  holeCount = 18,
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

  // Si TODAS las filas tienen categoría vacía, ocultar la columna CAT para no
  // desperdiciar espacio horizontal (frecuente en torneos sin categorías).
  const allCatsEmpty = sorted.every((p) => {
    const cat = p.category_name ?? ''
    return EMPTY_CAT.has(cat.trim())
  })

  // Estilos inline para tokens con fallback hex (sin tocar Tailwind config).
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
  const thStyle: React.CSSProperties = {
    padding: '12px 8px',
    textAlign: 'left',
  }
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
        Aún no hay jugadores con scores.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Keyframes para punto pulsante */}
      <style>{`
        @keyframes leaderboardPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {recentlyUpdated && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 12px', marginBottom: '4px',
          fontSize: '12px', color: 'var(--text-3)',
        }}>
          <span style={{
            display: 'inline-block', width: '7px', height: '7px',
            borderRadius: '50%', background: '#22c55e',
            animation: 'leaderboardPulse 2s ease-in-out infinite',
          }} />
          Recién actualizado
        </div>
      )}

      <table style={tableStyle}>
        <thead style={theadStyle}>
          <tr>
            <th style={thNumStyle}>Pos</th>
            <th style={thStyle}>Jugador</th>
            {!allCatsEmpty && <th style={thStyle}>Cat</th>}
            <th style={thNumStyle}>Bruto</th>
            <th style={{ ...thNumStyle }} className="leaderboard-hcp-header">
              <span className="leaderboard-hcp-full">HCP Cancha</span>
              <span className="leaderboard-hcp-short">HCP</span>
            </th>
            {isStableford ? (
              <th style={thNumStyle}>Puntos</th>
            ) : (
              <>
                <th style={thNumStyle}>Neto</th>
                <th style={{ ...thNumStyle, whiteSpace: 'nowrap' }}>
                  <span className="leaderboard-apar-full">A par</span>
                  <span className="leaderboard-apar-short">&#177;</span>
                </th>
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
            const isLeader = idx === 0 && played
            const isEvenRow = idx % 2 === 1
            const isFinished = p.thru >= holeCount
            const notStarted = p.thru <= 0

            const rowStyle: React.CSSProperties = {
              background: isLeader
                ? 'var(--leader-row-bg)'
                : isEvenRow
                  ? 'var(--zebra-row-bg)'
                  : undefined,
              // Jugadores que no empezaron: texto mas tenue
              opacity: notStarted ? 0.5 : undefined,
            }

            const shortName = stripGenderMarker(p.name)

            return (
              <tr key={p.id} style={rowStyle}>
                <td style={tdNumStyle}>{played ? positions[idx] : EMPTY}</td>
                <td style={{ ...tdStyle, fontWeight: isLeader ? 700 : isFinished ? 600 : 400 }}>
                  {/* Desktop: nombre completo con marcador. Mobile: sin "(M)"/"(F)" */}
                  <span className="leaderboard-name-full">{p.name}</span>
                  <span className="leaderboard-name-short">{shortName}</span>
                </td>
                {!allCatsEmpty && (
                  <td style={{ ...tdStyle, color: 'var(--text-2)' }}>{p.category_name ?? EMPTY}</td>
                )}
                <td style={tdNumStyle}>{played ? p.gross_total : EMPTY}</td>
                <td style={tdNumStyle}>{p.handicap_index}</td>
                {isStableford ? (
                  <td style={{ ...tdNumStyle, fontWeight: 600, fontSize: isLeader ? '16px' : undefined }}>
                    {played ? (p.points_total ?? 0) : EMPTY}
                  </td>
                ) : (
                  <>
                    <td style={tdNumStyle}>{played && p.net_total != null ? p.net_total : EMPTY}</td>
                    <td style={{
                      ...tdNumStyle,
                      fontWeight: isLeader ? 700 : 600,
                      fontSize: isLeader ? '16px' : undefined,
                      color: played ? vsParColor(p.vs_par) : undefined,
                    }}>
                      {played ? formatVsPar(p.vs_par) : EMPTY}
                    </td>
                  </>
                )}
                <td style={{
                  ...tdNumStyle,
                  color: isFinished
                    ? 'var(--brand-on-bg)'
                    : notStarted
                      ? 'var(--text-3)'
                      : 'var(--text-2)',
                  fontWeight: isFinished ? 600 : undefined,
                }}>
                  {formatThru(p.thru, holeCount)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Mobile responsive: ocultar "(M)"/"(F)" y abreviar HCP header */}
      <style>{`
        .leaderboard-hcp-short { display: none; }
        .leaderboard-hcp-full { display: inline; }
        .leaderboard-name-short { display: none; }
        .leaderboard-name-full { display: inline; }
        .leaderboard-apar-short { display: none; }
        .leaderboard-apar-full { display: inline; }
        @media (max-width: 639px) {
          .leaderboard-hcp-short { display: inline; }
          .leaderboard-hcp-full { display: none; }
          .leaderboard-name-short { display: inline; }
          .leaderboard-name-full { display: none; }
          .leaderboard-apar-short { display: inline; }
          .leaderboard-apar-full { display: none; }
        }
      `}</style>
    </div>
  )
}
