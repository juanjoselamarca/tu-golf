// src/app/torneo/[slug]/components/TournamentWithdrawnList.tsx
//
// Pie de la tabla: jugadores retirados (WD) o descalificados (DQ). No compiten
// por posición, pero se ven con sus golpes (#813, como The Grint y los boards de
// federación). Lo usan /torneo/[slug] y /en-vivo.
//
// Contraste: la etiqueta WD/DQ va en `--text` con borde (no texto de color sobre
// un tinte, que en oscuro no llegaba a AA); el DQ se distingue por el texto y el
// borde rojo, nunca sólo por el color.

import { formatVsPar } from '@/golf/share/vs-par'
import type { WithdrawnEntry } from '../types'

export interface TournamentWithdrawnListProps {
  withdrawnPlayers: WithdrawnEntry[]
}

function golpesDelPie(g: NonNullable<WithdrawnEntry['golpes']>): { score: string; detalle: string } | null {
  if (g.hoyos === 0) return null
  return { score: formatVsPar(g.vsPar), detalle: `${g.golpes} golpes · ${g.hoyos} ${g.hoyos === 1 ? 'hoyo' : 'hoyos'}` }
}

export function TournamentWithdrawnList({ withdrawnPlayers }: TournamentWithdrawnListProps) {
  if (withdrawnPlayers.length === 0) return null

  return (
    <section aria-label="Retirados y descalificados">
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '14px 16px',
      }}>
        <div style={{
          fontSize: '12px',
          color: 'var(--text-2)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          fontWeight: 700,
          marginBottom: '6px',
        }}>
          No compiten por posición
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {withdrawnPlayers.map((wp, i) => {
            const dq = wp.status === 'disqualified'
            const golpes = wp.golpes ? golpesDelPie(wp.golpes) : null
            return (
              <li
                key={`${wp.name}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  minHeight: '48px',
                  padding: '6px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}
              >
                <span
                  aria-label={dq ? 'Descalificado' : 'Retirado'}
                  style={{
                    color: 'var(--text)',
                    border: `1.5px solid ${dq ? 'var(--double)' : 'var(--text-3)'}`,
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    padding: '2px 7px',
                    borderRadius: '6px',
                    flexShrink: 0,
                    minWidth: '34px',
                    textAlign: 'center',
                  }}
                >
                  {dq ? 'DQ' : 'WD'}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', color: 'var(--text)', fontWeight: 600, fontSize: '16px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {wp.name}
                  </span>
                  {wp.reason && (
                    <span style={{
                      display: 'block', color: 'var(--text-2)', fontSize: '13px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {wp.reason}
                    </span>
                  )}
                </span>
                {golpes && (
                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span className="num" style={{ display: 'block', color: 'var(--text)', fontWeight: 700, fontSize: '16px' }}>
                      {golpes.score}
                    </span>
                    <span className="num" style={{ display: 'block', color: 'var(--text-2)', fontSize: '12px' }}>
                      {golpes.detalle}
                    </span>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
