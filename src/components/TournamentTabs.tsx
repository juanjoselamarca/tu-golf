'use client'

import { useState, useMemo } from 'react'
import type { Player } from '@/lib/golf-data'
import GWILeaderboard from '@/components/GWILeaderboard'
import { hoyosJugadosGWI, type GWIResponse } from '@/golf/stats/gwi'
import type { ModoJuego } from '@/golf/core/rules'
import Scorecard from '@/components/Scorecard'
import { formatScoreDelRanking } from '@/golf/leaderboard/formato-score'
import type { ScorecardHole, ScorecardProps } from '@/components/Scorecard'
import { ChevronDown } from '@/components/icons'
import { hasPlayData } from '@/golf/leaderboard/board-rules'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { AvisoHcpPct } from '@/components/AvisoHcpPct'
import { formatearHandicap } from '@/golf/handicap-index-range'
import { redondearHandicapWHS } from '@/golf/core/stroke-index'
import { GruposDelTorneo } from '@/components/torneo/GruposDelTorneo'
import { T, hcpAMostrar, scoreColor, thruLabel } from '@/components/torneo/tablero-torneo'
import { esPrimerLugar, etiquetasPorClaveDeEmpate } from '@/golf/core/posiciones'

/* ── Types ────────────────────────────────────────────────── */
export interface GroupData {
  id: string
  name: string
  teeTime: string | null
  sortOrder: number
  playerIds: string[]
}

interface Props {
  players: Player[]
  /** Ranking forzado por gross. Cuando viene + playersByNeto + formato !==
   *  'match_play', se renderiza un sub-toggle "Gross | Neto" sobre el
   *  leaderboard. Si vacío o ausente, el toggle no aparece y el render
   *  cae a `players` (ranking primario por modo del torneo). */
  playersByGross?: Player[]
  playersByNeto?: Player[]
  groups: GroupData[]
  modoJuego: ModoJuego
  totalHoyos: number
  isLive: boolean
  /** GWI ya calculado en el servidor (la página). Nunca los inputs. */
  gwi: Pick<GWIResponse, 'jugadores' | 'results'>
  playerIdToIndex: Record<string, number>
  formato?: string
  courseHoles?: ScorecardHole[]
  /**
   * Hoyos de las rondas que se juegan en OTRA cancha que la ronda 1, por
   * `round_number`. La tarjeta expandida de cada jugador (`p.scores` = su
   * última ronda, `p.latestRound`) se pinta contra el par de ESA ronda, no el
   * de la ronda 1. Ausente = una sola cancha.
   */
  courseHolesByRound?: ReadonlyMap<number, ScorecardHole[]> | null
  courseName?: string
  formatLabel?: string
  /**
   * "Handicap al 85 %" del torneo (`etiquetaHcpPct(hcpPctDelTorneo(t))`), o
   * null al 100 %. Es una regla del torneo: se avisa una vez en la cabecera,
   * no por jugador (la privacidad del handicap de cada uno no cambia).
   */
  etiquetaHcpPct?: string | null
}

type Tab = 'leaderboard' | 'grupos'
type ViewMode = 'gross' | 'neto'

/* ── Component ────────────────────────────────────────────── */
export default function TournamentTabs({ players, playersByGross, playersByNeto, groups, modoJuego, totalHoyos, isLive, gwi, playerIdToIndex, formato, courseHoles, courseHolesByRound, courseName, formatLabel: formatLabelProp, etiquetaHcpPct }: Props) {
  const [tab, setTab] = useState<Tab>('leaderboard')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const hasGroups = groups.length > 0

  // ── Sub-toggle Gross / Neto ─────────────────────────────────────────
  // Visible solo si: (a) ambos rankings llegaron poblados, (b) el torneo
  // no es match_play (modo exclusivo: un solo bracket válido), (c) hay
  // jugadores con datos en ambas listas. Default: el modo del torneo.
  const supportsDualLeaderboard =
    formato !== 'match_play'
    && (playersByGross?.length ?? 0) > 0
    && (playersByNeto?.length ?? 0) > 0
  const [viewMode, setViewMode] = useState<ViewMode>(modoJuego === 'neto' ? 'neto' : 'gross')

  // Players activos en el leaderboard. Cuando dual está activo, vienen del
  // ranking forzado (gross o neto). Caso contrario, ranking primario.
  const activePlayers: Player[] = supportsDualLeaderboard
    ? (viewMode === 'gross' ? (playersByGross as Player[]) : (playersByNeto as Player[]))
    : players

  // El header de la columna SCORE cambia según contexto:
  // - stableford SIN dual = PUNTOS (ranking primario por puntos)
  // - stableford + dual activo = SCORE (Gross/Neto strokes vs par)
  // - resto = SCORE
  const scoreHeader = formato === 'stableford' && !supportsDualLeaderboard ? 'PUNTOS' : 'SCORE'
  // `p.total` son PUNTOS cuando la lista activa es el ranking por puntos: se
  // escriben sin signo (`formatScoreDelRanking`, fuente única).
  const esPuntos = scoreHeader === 'PUNTOS'

  // Los hoyos de la RONDA (fuente única `@/golf/courses/vueltas`): sin catálogo
  // arma una cancha neutra, y con una cancha de 9 en un torneo de 18 repite la
  // vuelta en vez de dejar los hoyos 10-18 en blanco.
  const resolvedHoles: ScorecardHole[] = hoyosDeLaVuelta(courseHoles ?? [], totalHoyos)
  // Los hoyos contra los que se pinta la tarjeta de UN jugador: los de la
  // ronda a la que pertenecen sus `scores` (multi-ronda con canchas distintas).
  const holesFor = (p: Player): ScorecardHole[] =>
    (p.latestRound != null && courseHolesByRound?.get(p.latestRound)) || resolvedHoles

  // Columna HCP sólo si algún jugador tiene un handicap que mostrar: sin sesión, en
  // la vista bruta, no viaja ninguno, y una cabecera sobre celdas vacías es ruido.
  const mostrarHcp = activePlayers.some((p) => p.hcp != null)
  const columnas = mostrarHcp ? '42px 1fr 48px 48px 56px' : '42px 1fr 48px 56px'

  // Posiciones con empate estilo golf ("T2") de la lista activa (dual o primario),
  // con la clave que emitió el motor: si el countback ya separó a dos jugadores
  // con tarjeta terminada, no hay T. Sin hoyos jugados no hay posición.
  const positions = useMemo(() => etiquetasPorClaveDeEmpate(activePlayers, (p) => p.claveEmpate), [activePlayers])

  return (
    <>
      <AvisoHcpPct etiqueta={etiquetaHcpPct} />

      {/* ── Tab toggle ── */}
      {hasGroups && (
        <div style={{
          display: 'flex',
          width: '100%',
          maxWidth: '400px',
          margin: '0 auto 20px',
          borderBottom: `1px solid ${T.border}`,
        }}>
          {([
            { key: 'leaderboard' as Tab, label: 'Leaderboard' },
            { key: 'grupos' as Tab, label: 'Grupos' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1,
                padding: '10px 0',
                fontSize: '14px',
                fontWeight: 600,
                border: 'none',
                borderBottom: tab === key ? `2px solid ${T.gold}` : '2px solid transparent',
                cursor: 'pointer',
                background: 'transparent',
                color: tab === key ? T.gold : T.muted,
                transition: 'all 0.2s ease',
                fontFamily: '"DM Sans", system-ui, sans-serif',
                WebkitTapHighlightColor: 'transparent',
                letterSpacing: '0.02em',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Leaderboard tab ── */}
      {tab === 'leaderboard' && (
        <>
          {/* ── Sub-toggle Gross | Neto ──
              Solo cuando el motor devolvió rankings paralelos completos
              (formato !== match_play) y hay datos. Pills compactas, gold
              activo, fontSize menor que el toggle principal. */}
          {supportsDualLeaderboard && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: '14px',
            }}>
              {(['gross', 'neto'] as const).map((mode) => {
                const active = viewMode === mode
                return (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 999,
                      border: active
                        ? `1px solid ${T.gold}`
                        : `1px solid ${T.border}`,
                      background: active ? T.gold : 'transparent',
                      color: active ? 'var(--bg)' : T.muted,
                      fontFamily: '"DM Sans", system-ui, sans-serif',
                      fontSize: '12px',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                    aria-pressed={active}
                  >
                    {mode === 'gross' ? 'Gross' : 'Neto'}
                  </button>
                )
              })}
            </div>
          )}

          {/* PGA-style table */}
          <div style={{ width: '100%', overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: columnas,
              padding: '8px 12px',
              borderBottom: `1px solid ${T.border}`,
            }}>
              {['POS', 'JUGADOR', ...(mostrarHcp ? ['HCP'] : []), 'THRU', scoreHeader].map(h => (
                <span key={h} style={{
                  fontFamily: '"DM Mono", monospace',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: T.faint,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  textAlign: h === 'JUGADOR' ? 'left' : 'center',
                }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Player rows */}
            {activePlayers.map((p, idx) => {
              const isLeader = esPrimerLugar(positions[idx])
              const isExpanded = expandedIdx === idx
              const hasScores = hasPlayData({ holesPlayed: p.holes })

              // Convert scores array to Record<string, number> for Scorecard
              const scoresRecord: Record<string, number> = {}
              if (p.scores) {
                p.scores.forEach((s, i) => {
                  if (s !== null) scoresRecord[String(i + 1)] = s
                })
              }

              return (
                <div key={idx}>
                  {/* Player row */}
                  <div
                    onClick={() => hasScores && setExpandedIdx(isExpanded ? null : idx)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: columnas,
                      padding: '10px 12px',
                      alignItems: 'center',
                      background: isExpanded ? 'rgba(196,153,42,0.06)' : idx % 2 === 1 ? T.rowAlt : 'transparent',
                      borderLeft: isLeader ? `3px solid ${T.gold}` : isExpanded ? `3px solid rgba(196,153,42,0.4)` : '3px solid transparent',
                      cursor: hasScores ? 'pointer' : 'default',
                      transition: 'background 140ms ease',
                    }}
                  >
                    {/* POS */}
                    <span style={{
                      fontFamily: '"DM Mono", monospace',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: isLeader ? T.gold : idx < 3 ? T.ivory : T.muted,
                      textAlign: 'center',
                    }}>
                      {/* Sin datos no hay posición: con el torneo recién abierto
                          todos están en 0 y la tabla mostraba "T1" para el field
                          entero. /en-vivo ya muestra "—" — misma regla acá. */}
                      {positions[idx] ?? '—'}
                    </span>

                    {/* JUGADOR */}
                    <span style={{
                      fontFamily: '"DM Sans", system-ui, sans-serif',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: T.ivory,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      paddingRight: '8px',
                    }}>
                      {p.name}
                    </span>

                    {/* HCP */}
                    {mostrarHcp && (
                      <span data-testid="celda-hcp" style={{
                        fontFamily: '"DM Mono", monospace',
                        fontSize: '12px',
                        color: T.muted,
                        textAlign: 'center',
                      }}>
                        {hcpAMostrar(p) != null ? formatearHandicap(hcpAMostrar(p)) : ''}
                      </span>
                    )}

                    {/* THRU */}
                    <span style={{
                      fontFamily: '"DM Mono", monospace',
                      fontSize: '12px',
                      color: p.status === 'F' ? T.green : T.muted,
                      textAlign: 'center',
                      fontWeight: p.status === 'F' ? 700 : 400,
                    }}>
                      {thruLabel(p, totalHoyos)}
                    </span>

                    {/* SCORE + expand chevron */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <span style={{
                        fontFamily: '"DM Mono", monospace',
                        fontSize: '18px',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        color: hasPlayData({ holesPlayed: p.holes }) ? scoreColor(p.total, esPuntos) : T.faint,
                        lineHeight: 1,
                      }}>
                        {hasPlayData({ holesPlayed: p.holes }) ? formatScoreDelRanking(p.total, esPuntos) : '-'}
                      </span>
                      {hasScores && (
                        <span
                          aria-hidden="true"
                          style={{
                            color: T.faint,
                            lineHeight: 1,
                            marginTop: '2px',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 200ms ease',
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                        >
                          <ChevronDown size={12} strokeWidth={2} />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expandable Scorecard */}
                  {isExpanded && hasScores && (
                    <div style={{ borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
                      <Scorecard
                        holes={holesFor(p)}
                        scores={scoresRecord}
                        {...(p.hcp == null
                          // Handicap oculto a este visor: la tarjeta muestra sólo golpes brutos.
                          // Sin el handicap no se puede repartir golpes hoyo a hoyo, y un neto o
                          // unos puntos netos recalculados con 0 serían falsos.
                          ? {
                              courseHandicap: 0,
                              modo: 'gross' as const,
                              formato: (formato === 'stableford' && modoJuego === 'neto' ? 'stroke_play' : formato ?? 'stroke_play') as ScorecardProps['formato'],
                            }
                          : {
                              courseHandicap: redondearHandicapWHS(p.hcp),
                              displayHandicap: hcpAMostrar(p) ?? undefined,
                              modo: supportsDualLeaderboard ? viewMode : (modoJuego === 'neto' ? 'neto' : 'gross'),
                              formato: (formato ?? 'stroke_play') as ScorecardProps['formato'],
                            })}
                        playerName={p.name}
                        courseName={courseName}
                        formatLabel={formatLabelProp}
                      />
                    </div>
                  )}
                </div>
              )
            })}

            {activePlayers.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: T.muted, fontSize: '14px' }}>
                Sin jugadores aún
              </div>
            )}
          </div>

          {/* GWI Leaderboard (live only). A propósito NO usa `hayGWIParaMostrar`: en el
              torneo el panel aparece desde el hoyo 1 con su aviso "disponible a partir
              del hoyo N" y barra de avance; la ronda libre lo oculta hasta tener datos. */}
          {isLive && gwi.jugadores.length >= 2 && (
            <div style={{ marginTop: '24px' }}>
              <GWILeaderboard
                results={gwi.results}
                hoyosRestantes={totalHoyos - hoyosJugadosGWI(gwi.jugadores)}
                totalHoyos={totalHoyos}
                modoJuego={modoJuego}
              />
            </div>
          )}
        </>
      )}

      {tab === 'grupos' && (
        <GruposDelTorneo groups={groups} players={players} playerIdToIndex={playerIdToIndex} totalHoyos={totalHoyos} esPuntos={esPuntos} />
      )}
    </>
  )
}
