// src/app/torneo/[slug]/components/TournamentWithdrawnList.tsx
//
// Pie de la tabla: retirados (WD) o descalificados (DQ), jugadores o equipos de
// foursome. No compiten por posición, pero se ven con su score (#813, como The
// Grint y los boards de federación). Lo usan /torneo/[slug] y /en-vivo (y su
// modo TV, con `tv`).
//
// Contraste: la etiqueta WD/DQ va en `--text` con borde (no texto de color sobre
// un tinte, que en oscuro no llegaba a AA); el DQ se distingue por el texto y el
// borde rojo, nunca sólo por el color. El lector de pantalla oye "Retirado" o
// "Descalificado" (texto oculto), no la sigla.
//
// 390 px: el nombre y el motivo usan hasta dos líneas (después "…") sin quitarle
// espacio al score; el detalle del score puede partirse en dos.

import { useId } from 'react'
import { formatScoreDelRanking } from '@/golf/leaderboard/formato-score'
import { SIGLA_FUERA } from '@/golf/leaderboard/fuera-del-ranking'
import type { WithdrawnEntry } from '../types'

export interface TournamentWithdrawnListProps {
  withdrawnPlayers: WithdrawnEntry[]
  /** Modo TV: misma escala que las filas de la tabla, con aire arriba (va después de la tabla). */
  tv?: boolean
}

function scoreDelPie(s: NonNullable<WithdrawnEntry['score']>): { valor: string; detalle: string[] } {
  const hoyos = `${s.hoyos} ${s.hoyos === 1 ? 'hoyo' : 'hoyos'}`
  return {
    valor: formatScoreDelRanking(s.valor, s.esPuntos, { conUnidad: s.esPuntos }),
    // En piezas: si no cabe en una línea, se parte en el "·", nunca dentro de "12 hoyos".
    detalle: s.esPuntos || s.grossTotal == null ? [hoyos] : [`${s.grossTotal} golpes`, hoyos],
  }
}

const SR_ONLY = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const

export function TournamentWithdrawnList({ withdrawnPlayers, tv = false }: TournamentWithdrawnListProps) {
  const tituloId = useId()
  if (withdrawnPlayers.length === 0) return null

  return (
    // TV: misma escala que las filas de la tabla (que no escalan) y separado de ella.
    <section aria-labelledby={tituloId} style={tv ? { marginTop: '16px' } : undefined}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: `14px 16px`,
      }}>
        <h2 id={tituloId} style={{
          fontSize: '12px',
          color: 'var(--text-2)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          fontWeight: 700,
          margin: `0 0 6px`,
        }}>
          No compiten por posición
        </h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {withdrawnPlayers.map((wp, i) => {
            const dq = wp.status === 'disqualified'
            const score = wp.score ? scoreDelPie(wp.score) : null
            return (
              <li
                key={wp.id ?? `${wp.name}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  minHeight: '48px',
                  padding: `6px 0`,
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}
              >
                <span
                  style={{
                    color: 'var(--text)',
                    border: `1.5px solid ${dq ? 'var(--double)' : 'var(--text-3)'}`,
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    padding: `2px 0`,
                    borderRadius: '6px',
                    flexShrink: 0,
                    width: '42px',
                    boxSizing: 'border-box',
                    textAlign: 'center',
                  }}
                >
                  <span aria-hidden="true">{SIGLA_FUERA[wp.status]}</span>
                  <span style={SR_ONLY}>{dq ? 'Descalificado' : 'Retirado'}</span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
                    overflow: 'hidden', overflowWrap: 'anywhere',
                    color: 'var(--text)', fontWeight: 600, fontSize: '16px', lineHeight: 1.3,
                  }}>
                    {wp.name}
                  </span>
                  {wp.reason && (
                    <span style={{
                      display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
                      overflow: 'hidden',
                      color: 'var(--text-2)', fontSize: '13px', lineHeight: 1.35,
                    }}>
                      {wp.reason}
                    </span>
                  )}
                </span>
                {score && (
                  <span style={{ textAlign: 'right', flexShrink: 1, minWidth: 0, maxWidth: '40%' }}>
                    <span className="num" style={{ display: 'block', color: 'var(--text)', fontWeight: 700, fontSize: '16px', whiteSpace: 'nowrap' }}>
                      {score.valor}
                    </span>
                    <span className="num" style={{ display: 'block', color: 'var(--text-2)', fontSize: '12px', lineHeight: 1.3 }}>
                      {score.detalle.map((pieza, j) => (
                        <span key={j}>{j > 0 ? ' ' : ''}<span style={{ whiteSpace: 'nowrap' }}>{pieza}{j < score.detalle.length - 1 ? ' ·' : ''}</span></span>
                      ))}
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
