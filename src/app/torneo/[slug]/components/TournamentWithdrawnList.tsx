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
// 390 px: el nombre se corta con "…" antes de perder el score; el motivo usa hasta
// dos líneas; el detalle del score puede partirse en dos.

import { useId } from 'react'
import { formatScoreDelRanking } from '@/golf/leaderboard/formato-score'
import type { WithdrawnEntry } from '../types'

export interface TournamentWithdrawnListProps {
  withdrawnPlayers: WithdrawnEntry[]
  /** Modo TV (pantalla grande a distancia): todo escala como el resto del modo TV. */
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
  // TV: 1,5× en pantalla grande (desde ~850 px de ancho, a escala con el viewport);
  // en un teléfono queda en el tamaño normal, que es el que cabe a 390 px.
  const px = (n: number) => (tv ? `clamp(${n}px, ${((n * 1.5) / 12.8).toFixed(3)}vw, ${n * 1.5}px)` : `${n}px`)

  return (
    <section aria-labelledby={tituloId}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: px(12),
        padding: `${px(14)} ${px(16)}`,
      }}>
        <h2 id={tituloId} style={{
          fontSize: px(12),
          color: 'var(--text-2)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          fontWeight: 700,
          margin: `0 0 ${px(6)}`,
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
                  gap: px(12),
                  minHeight: px(48),
                  padding: `${px(6)} 0`,
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}
              >
                <span
                  style={{
                    color: 'var(--text)',
                    border: `1.5px solid ${dq ? 'var(--double)' : 'var(--text-3)'}`,
                    fontSize: px(11),
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    padding: `${px(2)} 0`,
                    borderRadius: px(6),
                    flexShrink: 0,
                    width: px(42),
                    boxSizing: 'border-box',
                    textAlign: 'center',
                  }}
                >
                  <span aria-hidden="true">{dq ? 'DQ' : 'WD'}</span>
                  <span style={SR_ONLY}>{dq ? 'Descalificado' : 'Retirado'}</span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', color: 'var(--text)', fontWeight: 600, fontSize: px(16),
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {wp.name}
                  </span>
                  {wp.reason && (
                    <span style={{
                      display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
                      overflow: 'hidden',
                      color: 'var(--text-2)', fontSize: px(13), lineHeight: 1.35,
                    }}>
                      {wp.reason}
                    </span>
                  )}
                </span>
                {score && (
                  <span style={{ textAlign: 'right', flexShrink: 1, minWidth: 0, maxWidth: '40%' }}>
                    <span className="num" style={{ display: 'block', color: 'var(--text)', fontWeight: 700, fontSize: px(16), whiteSpace: 'nowrap' }}>
                      {score.valor}
                    </span>
                    <span className="num" style={{ display: 'block', color: 'var(--text-2)', fontSize: px(12), lineHeight: 1.3 }}>
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
