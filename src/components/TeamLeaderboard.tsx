'use client'

/**
 * TeamLeaderboard — Leaderboard de equipos para best ball, scramble, foursome.
 *
 * Muestra ranking de equipos con score primario, jugadores del equipo,
 * y detalles según formato.
 */

import type { ReactNode } from 'react'
import { formatearHandicap } from '@/golf/handicap-index-range'
import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'
import { formatOverUnder, nombreDelModo } from '@/golf/core/rules'
import { scoreFgVar } from '@/lib/score-tokens'
import { formatThru, THRU_LABEL } from '@/golf/leaderboard/thru'
import { formatPuntosStableford } from '@/golf/leaderboard/formato-score'
import { esPrimerLugar } from '@/golf/core/posiciones'
import { scorePrimarioDeEquipo } from '@/golf/leaderboard/team-tiebreak'
import { posicionesDeEquiposRondaLibre } from '@/golf/ronda-libre/resultado-de-equipos'

interface TeamEntry {
  teamId: string
  teamNombre: string
  totalGross: number
  totalNeto: number
  totalStableford: number
  overUnderGross: number
  overUnderNeto: number
  holesPlayed: number
  jugadores: string[]
  teamHandicap?: number
}

interface Props {
  teams: TeamEntry[]
  modoJuego: ModoJuego
  formatoJuego?: FormatoJuego
  totalHoles: number
  formato: 'best_ball' | 'scramble' | 'foursome'
  /**
   * Expand opt-in (fix 126). Si se pasan, cada fila de equipo es clickeable y
   * despliega `renderTeamDetail`. Sin estas props el comportamiento es idéntico
   * al previo (filas no clickeables) — los otros call sites no se ven afectados.
   */
  expandedTeamId?: string | null
  onToggleTeam?: (teamId: string) => void
  renderTeamDetail?: (teamId: string) => ReactNode
}

const FORMATO_LABEL: Record<string, string> = {
  best_ball: 'Best Ball',
  scramble: 'Scramble',
  foursome: 'Foursome',
}

function primaryScore(team: TeamEntry, modo: ModoJuego, formato: FormatoJuego): number {
  return scorePrimarioDeEquipo(team, formato, modo)
}

/**
 * En una tabla NETO, el gross del equipo va en su propia columna GROSS, al lado del NETO, como un leaderboard del PGA
 * Tour: los dos a la vista y sin confundirse (ensayo 24-nov: el espectador no sabía cuál de los dos era el número).
 * `null` = la tabla no lleva columna GROSS (gross o stableford). Sin hoyos no hay gross que dar: «—».
 */
export function grossDeLaColumna(team: TeamEntry, modo: ModoJuego, formato: FormatoJuego, hasCourse: boolean): string | null {
  if (modo !== 'neto' || formato === 'stableford') return null
  if (team.holesPlayed === 0) return '—'
  return hasCourse ? formatOverUnder(team.overUnderGross) : String(team.totalGross)
}

/** Sin hoyos no hay score que dar: «—», igual que la posición, el gross y el hoyo (un «E» decía «va par»). */
function displayScore(team: TeamEntry, modo: ModoJuego, formato: FormatoJuego, hasCourse: boolean): string {
  if (team.holesPlayed === 0) return '—'
  if (formato === 'stableford') return formatPuntosStableford(team.totalStableford, { conUnidad: true })
  if (!hasCourse) return String(modo === 'neto' ? team.totalNeto : team.totalGross)
  return formatOverUnder(modo === 'neto' ? team.overUnderNeto : team.overUnderGross)
}

export default function TeamLeaderboard({ teams, modoJuego, formatoJuego = 'stroke_play', totalHoles, formato, expandedTeamId, onToggleTeam, renderTeamDetail }: Props) {
  const hasCourse = teams.some(t => t.overUnderGross !== t.totalGross)
  const isStableford = formatoJuego === 'stableford'
  const conGross = modoJuego === 'neto' && !isStableford
  // POS · EQUIPO · NETO · GROSS · HOYO (neto) o POS · EQUIPO · score · HOYO.
  const columnas = conGross ? '32px minmax(0, 1fr) 52px 52px 44px' : '36px 1fr 72px 60px'
  const cabecera = { fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' } as const
  // El orden lo decide el motor (`ordenarEquipos*` → countback, sin hoyos al final).
  // Re-ordenar acá por score perdía el countback y subía al equipo que no ha salido.
  const sorted = teams
  // Empates estilo golf (T2, T2, 4) con la MISMA cuenta que el cuadro ganador y la imagen
  // (`posicionesDeEquiposRondaLibre`): mismo score = mismo lugar, sin countback. Sin hoyos: "—".
  const posiciones = posicionesDeEquiposRondaLibre(
    sorted.map((t) => ({ diff: primaryScore(t, modoJuego, formatoJuego), holesPlayed: t.holesPlayed })),
  )

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px',
      overflow: 'hidden', marginBottom: '12px',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
            {FORMATO_LABEL[formato]}
          </span>
          <span style={{
            fontSize: '10px', fontWeight: 600, color: 'var(--brand-on-bg)',
            background: 'rgba(196,153,42,0.08)', padding: '2px 8px', borderRadius: '10px',
          }}>
            {isStableford ? 'Stableford' : nombreDelModo(modoJuego)}
          </span>
        </div>
      </div>

      {/* Table header */}
      <div style={{
        display: 'grid', gridTemplateColumns: columnas, alignItems: 'center',
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
      }}>
        <span style={cabecera}>Pos</span>
        <span style={cabecera}>Equipo</span>
        <span style={{ ...cabecera, textAlign: 'center' }}>
          {isStableford ? 'PTS' : nombreDelModo(modoJuego)}
        </span>
        {conGross && <span style={{ ...cabecera, textAlign: 'center' }}>Gross</span>}
        <span style={{ ...cabecera, textAlign: 'right' }}>{THRU_LABEL}</span>
      </div>

      {/* Team rows */}
      {sorted.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: '14px' }}>
          Esperando scores...
        </div>
      ) : sorted.map((team, idx) => {
        const posicion = posiciones[idx]
        const lider = esPrimerLugar(posicion)
        const score = primaryScore(team, modoJuego, formatoJuego)
        const isEven = score === 0 && !isStableford
        const isGood = isStableford ? score > 0 : score < 0
        const gross = grossDeLaColumna(team, modoJuego, formatoJuego, hasCourse)
        const abierto = expandedTeamId === team.teamId

        return (
          <div key={team.teamId} style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            role={onToggleTeam ? 'button' : undefined}
            tabIndex={onToggleTeam ? 0 : undefined}
            aria-expanded={onToggleTeam ? abierto : undefined}
            onClick={onToggleTeam ? () => onToggleTeam(team.teamId) : undefined}
            onKeyDown={onToggleTeam ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleTeam(team.teamId) } } : undefined}
            style={{
            display: 'grid', gridTemplateColumns: columnas, alignItems: 'center',
            padding: '12px 16px', minHeight: '48px',
            background: lider ? 'rgba(196,153,42,0.03)' : 'transparent',
            cursor: onToggleTeam ? 'pointer' : 'default',
          }}>
            {/* Position */}
            <span style={{
              fontSize: '14px', fontWeight: 700, fontFamily: '"DM Mono", monospace', whiteSpace: 'nowrap',
              color: lider ? 'var(--brand-on-bg)' : 'var(--text-2)',
            }}>
              {posicion ?? '—'}
            </span>

            {/* Team info */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' }}>
                {team.teamNombre}
                {onToggleTeam && (
                  <span aria-hidden="true" style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 400, marginLeft: '6px' }}>
                    {abierto ? '▲' : '▼'}
                  </span>
                )}
              </div>
              {/* Un equipo sin integrantes a la vista (equipo de club) muestra solo su HCP, sin el hueco de la
                  lista vacía; sin integrantes ni HCP, la línea no existe. */}
              {(team.jugadores.length > 0 || team.teamHandicap != null) && (
                <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                  {team.jugadores.join(' · ')}
                  {team.teamHandicap != null && (
                    <span style={{ marginLeft: team.jugadores.length > 0 ? '6px' : 0, color: 'var(--brand-on-bg)' }}>
                      HCP {formatearHandicap(team.teamHandicap)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Score */}
            <div style={{ textAlign: 'center' }}>
              <span style={{
                fontSize: '16px', fontWeight: 700, fontFamily: '"DM Mono", monospace',
                // Stableford: pts altos = bueno → mapear a birdie color; stroke: score IS el diff.
                // Tokens con tema (no hex fijo): #0B6BA6 daba ~3:1 sobre el fondo oscuro.
                color: isStableford
                  ? (score > 0 ? scoreFgVar(-1) : score === 0 ? scoreFgVar(0) : scoreFgVar(1))
                  : scoreFgVar(score),
              }}>
                {displayScore(team, modoJuego, formatoJuego, hasCourse)}
              </span>
            </div>

            {gross != null && (
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-2)', textAlign: 'center', fontFamily: '"DM Mono", monospace' }}>
                {gross}
              </span>
            )}

            {/* Holes */}
            <span style={{
              fontSize: '13px', color: 'var(--text-2)', textAlign: 'right',
              fontFamily: '"DM Mono", monospace',
            }}>
              {formatThru(team.holesPlayed, totalHoles)}
            </span>
            </div>
            {onToggleTeam && abierto && renderTeamDetail && (
              <div>{renderTeamDetail(team.teamId)}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
