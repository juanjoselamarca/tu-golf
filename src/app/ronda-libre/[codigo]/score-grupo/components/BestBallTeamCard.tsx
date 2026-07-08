'use client'

/**
 * Componente que renderiza UN equipo en modo Best Ball.
 *
 * Layout:
 *   Header equipo (nombre + BB total + vs par + thru)
 *   ├─ Jugador 1 row (nombre · HCP · • golpe · controles +/- · gross + net · ★ si gana hoyo)
 *   └─ Jugador 2 row (idem)
 *
 * Diferencias vs Scramble/Foursome (que tienen 1 score por equipo):
 * - Cada jugador tiene controles +/- propios (cada uno scorea su tarjeta)
 * - El equipo suma el "best ball" de cada hoyo (menor net si neto, menor gross si gross)
 * - El indicador • marca quién recibe golpe ESE hoyo (HCP ≥ SI)
 * - El ★ marca quién ganó el hoyo para el equipo
 *
 * Usado solo cuando ronda.formato_juego === 'best_ball'.
 */
import type React from 'react'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import { normalizeStrokeIndexMap } from '@/golf/core/stroke-index'
import { calcBestBallHole, calcBestBallTotals } from '../hooks/useTeamScorecard'

interface ThemeTokens {
  card: string
  text: string
  textMuted: string
  textFaint: string
  border: string
  gold: string
}

interface JugadorMinimal {
  id: string
  nombre: string
}

export interface BestBallTeamCardProps {
  equipo: {
    id: string
    nombre: string
    jugadorIds: string[]
  }
  jugadores: JugadorMinimal[]
  scores: Record<string, Record<number, number>>
  playerHcp: Record<string, number>
  playerDotHcps: Record<string, number> // por isMatchPlay: hcps relativos
  modoJuego: 'gross' | 'neto'
  currentHole: number
  par: number
  strokeIndex: number
  parMap: Record<number, number>
  strokeIndexByHole: Record<number, number>
  totalHoles: number
  onIncrement: (jugadorId: string) => void
  onDecrement: (jugadorId: string) => void
  getVsParColor: (diff: number) => string
  getVsParLabel: (diff: number) => string
  theme: ThemeTokens
}

export function BestBallTeamCard({
  equipo,
  jugadores,
  scores,
  playerHcp,
  playerDotHcps,
  modoJuego,
  currentHole,
  par,
  strokeIndex,
  parMap,
  strokeIndexByHole,
  totalHoles,
  onIncrement,
  onDecrement,
  getVsParColor,
  getVsParLabel,
  theme,
}: BestBallTeamCardProps): React.ReactElement {
  const totals = calcBestBallTotals({
    equipoJugadorIds: equipo.jugadorIds,
    totalHoles,
    scores,
    modoJuego,
    playerDotHcps,
    strokeIndexByHole,
    parMap,
  })
  const holeWinner = calcBestBallHole({
    equipoJugadorIds: equipo.jugadorIds,
    hole: currentHole,
    scores,
    modoJuego,
    playerDotHcps,
    strokeIndexByHole,
    roundHoles: totalHoles,
  })
  // SI normalizado del hoyo actual para el dot "recibe golpe": debe coincidir con
  // la alocación real del scorer (SI 18h-impar en 9h perdía golpes). El tooltip
  // sigue mostrando el SI de catálogo (qué hoyo es el más difícil), no el rango.
  const siAllocCard = normalizeStrokeIndexMap(strokeIndexByHole, totalHoles)
  const siCurrentAlloc = siAllocCard[currentHole] ?? strokeIndex

  return (
    <div
      style={{
        background: theme.card,
        borderRadius: '14px',
        border: `1px solid ${theme.border}`,
        padding: '10px 12px',
      }}
    >
      {/* Team header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '8px',
          paddingBottom: '6px',
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: theme.text,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {equipo.nombre}
          </span>
          {totals.played > 0 && (
            <span
              style={{
                fontSize: '10px',
                color: theme.textFaint,
                fontFamily: '"DM Mono", monospace',
              }}
            >
              thru {totals.played}/{totalHoles}
            </span>
          )}
        </div>
        {totals.played > 0 && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span
              style={{
                fontSize: '9px',
                color: theme.textFaint,
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            >
              BB
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: theme.text,
                fontFamily: '"DM Mono", monospace',
              }}
            >
              {totals.total}
            </span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: getVsParColor(totals.vsPar),
              }}
            >
              {getVsParLabel(totals.vsPar)}
            </span>
          </div>
        )}
      </div>

      {/* Player rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {equipo.jugadorIds.map((jid) => {
          const j = jugadores.find((x) => x.id === jid)
          if (!j) return null
          const gross = scores[jid]?.[currentHole]
          const dotHcp = playerDotHcps[jid] ?? 0
          const strokes = modoJuego === 'neto' ? strokesRecibidosEnHoyo(dotHcp, siCurrentAlloc, totalHoles) : 0
          const net = gross != null ? gross - strokes : null
          const recibeGolpe = strokes > 0
          const isWinner = holeWinner?.winnerJugadorId === jid
          const hcp = playerHcp[jid] ?? 0

          return (
            <div
              key={jid}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 4px',
                background: isWinner && gross != null ? 'rgba(196,153,42,0.06)' : 'transparent',
                borderRadius: '8px',
                border: isWinner && gross != null ? `1px solid ${theme.gold}` : '1px solid transparent',
              }}
            >
              {/* Name + HCP + golpe dot */}
              <div style={{ flex: '0 0 auto', minWidth: '110px', maxWidth: '140px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: theme.text,
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {j.nombre}
                  </span>
                  {recibeGolpe && (
                    <span
                      title={`Recibe ${strokes} golpe${strokes > 1 ? 's' : ''} en SI ${strokeIndex}`}
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: theme.gold,
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: theme.textFaint,
                    fontFamily: '"DM Mono", monospace',
                  }}
                >
                  HCP {hcp}
                </div>
              </div>

              {/* Score controls */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flex: 1,
                  justifyContent: 'center',
                }}
              >
                <button
                  type="button"
                  onClick={() => onDecrement(jid)}
                  disabled={gross != null && gross <= 1}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    fontSize: '20px',
                    fontWeight: 300,
                    background: 'var(--bg)',
                    color: '#374151',
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'manipulation',
                    userSelect: 'none',
                    opacity: gross != null && gross <= 1 ? 0.3 : 1,
                  }}
                  aria-label={`Bajar score de ${j.nombre}`}
                >
                  {'−'}
                </button>

                <div
                  style={{
                    minWidth: '40px',
                    textAlign: 'center',
                    fontFamily: '"DM Mono", monospace',
                    fontSize: '24px',
                    fontWeight: 700,
                    lineHeight: 1,
                    color: gross != null ? theme.text : '#d1d5db',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {gross ?? par}
                </div>

                <button
                  type="button"
                  onClick={() => onIncrement(jid)}
                  disabled={gross != null && gross >= 15}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    fontSize: '20px',
                    fontWeight: 600,
                    background: theme.gold,
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'manipulation',
                    userSelect: 'none',
                    opacity: gross != null && gross >= 15 ? 0.3 : 1,
                  }}
                  aria-label={`Subir score de ${j.nombre}`}
                >
                  +
                </button>
              </div>

              {/* Net + star si gana */}
              <div
                style={{
                  flex: '0 0 auto',
                  minWidth: '52px',
                  textAlign: 'right',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '2px',
                }}
              >
                {gross != null ? (
                  <>
                    {modoJuego === 'neto' && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: theme.textMuted,
                          fontFamily: '"DM Mono", monospace',
                        }}
                      >
                        net {net}
                      </div>
                    )}
                    {isWinner && (
                      <div style={{ fontSize: '14px', color: theme.gold, lineHeight: 1 }} title="Best ball del hoyo">
                        {'★'}
                      </div>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: '11px', color: theme.textFaint }}>—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
