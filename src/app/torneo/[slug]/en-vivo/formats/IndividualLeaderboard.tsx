'use client'

// src/app/torneo/[slug]/en-vivo/formats/IndividualLeaderboard.tsx
// Tabla individual para stroke_play y stableford.
// Sin click-expandir (eso es follow-up de Wave 3 tanda 2).

import type { LivePlayer } from '../types'
import { formatThru, vsParColor, computePositions } from './golf-format'
import { EMPTY_LABEL, formatScoreVsPar } from '@/golf/leaderboard/individual-score'

export interface IndividualLeaderboardProps {
  players: LivePlayer[]
  format: 'stroke_play' | 'stableford'
  modo: 'gross' | 'neto'
}

/** ¿Cargó al menos un hoyo? Sin datos NO es cero: va al fondo y se muestra "—". */
function tieneDatos(p: LivePlayer): boolean {
  return p.has_data ?? p.thru > 0
}

/** Métrica que ordena y que decide los empates, según formato y modo. */
function valorDeRanking(
  p: LivePlayer,
  format: 'stroke_play' | 'stableford',
  modo: 'gross' | 'neto',
): number {
  if (format === 'stableford') return p.points_total ?? 0
  return modo === 'neto' ? (p.net_total ?? 0) : p.gross_total
}

/**
 * Ordena por la métrica del torneo y manda al fondo a los que no empezaron.
 *
 * El `?? Infinity` anterior sólo protegía el neto: en bruto, un jugador sin
 * cargar nada tenía `gross_total = 0` y lideraba la tabla.
 */
function sortPlayers(
  players: LivePlayer[],
  format: 'stroke_play' | 'stableford',
  modo: 'gross' | 'neto'
): { ranked: LivePlayer[]; sinDatos: LivePlayer[] } {
  const ranked = players.filter(tieneDatos)
  const sinDatos = players.filter((p) => !tieneDatos(p))

  ranked.sort((a, b) => {
    const va = valorDeRanking(a, format, modo)
    const vb = valorDeRanking(b, format, modo)
    // Stableford: más puntos es mejor. Bruto/neto: menos golpes es mejor.
    return format === 'stableford' ? vb - va : va - vb
  })

  return { ranked, sinDatos }
}

export default function IndividualLeaderboard({
  players,
  format,
  modo,
}: IndividualLeaderboardProps) {
  const { ranked, sinDatos } = sortPlayers(players, format, modo)
  const sorted = [...ranked, ...sinDatos]
  // Empates estilo golf por la misma métrica que ordenó (puntos / neto / bruto).
  // Sólo entre los que tienen datos: los que no empezaron no comparten posición
  // con nadie, muestran "—".
  const positions = computePositions(ranked.map((p) => valorDeRanking(p, format, modo)))
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
          {sorted.map((p, idx) => {
            const conDatos = tieneDatos(p)
            return (
              <tr key={p.id}>
                <td style={tdNumStyle}>{conDatos ? positions[idx] : EMPTY_LABEL}</td>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{p.name}</td>
                <td style={{ ...tdStyle, color: 'var(--text-2, #5a6573)' }}>{p.category_name ?? '-'}</td>
                <td style={tdNumStyle}>{conDatos ? p.gross_total : EMPTY_LABEL}</td>
                <td style={tdNumStyle}>{p.handicap_index}</td>
                {isStableford ? (
                  <td style={{ ...tdNumStyle, fontWeight: 600 }}>
                    {conDatos ? (p.points_total ?? 0) : EMPTY_LABEL}
                  </td>
                ) : (
                  <>
                    <td style={tdNumStyle}>
                      {modo === 'neto' && conDatos ? (p.net_total ?? EMPTY_LABEL) : EMPTY_LABEL}
                    </td>
                    <td style={{ ...tdNumStyle, fontWeight: 600, color: conDatos ? vsParColor(p.vs_par) : undefined }}>
                      {formatScoreVsPar(p.vs_par, conDatos)}
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
