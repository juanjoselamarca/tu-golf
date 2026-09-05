'use client'

/**
 * TeamLeaderboard — Leaderboard de equipos para best ball, scramble, foursome.
 *
 * Muestra ranking de equipos con score primario, jugadores del equipo,
 * y detalles según formato.
 */

import type { ReactNode } from 'react'
import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'
import { formatOverUnder } from '@/golf/core/rules'
import { getScoreColor } from '@/golf/core/colors'

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
  if (formato === 'stableford') return team.totalStableford
  if (modo === 'neto') return team.overUnderNeto
  return team.overUnderGross
}

function displayScore(team: TeamEntry, modo: ModoJuego, formato: FormatoJuego, hasCourse: boolean): string {
  if (formato === 'stableford') return `${team.totalStableford} pts`
  if (!hasCourse) return String(modo === 'neto' ? team.totalNeto : team.totalGross)
  return formatOverUnder(modo === 'neto' ? team.overUnderNeto : team.overUnderGross)
}

export default function TeamLeaderboard({ teams, modoJuego, formatoJuego = 'stroke_play', totalHoles, formato, expandedTeamId, onToggleTeam, renderTeamDetail }: Props) {
  const hasCourse = teams.some(t => t.overUnderGross !== t.totalGross)
  const isStableford = formatoJuego === 'stableford'
  const sorted = [...teams].sort((a, b) => {
    const sa = primaryScore(a, modoJuego, formatoJuego)
    const sb = primaryScore(b, modoJuego, formatoJuego)
    if (isStableford) return sb - sa
    return sa - sb
  })

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
            {isStableford ? 'Stableford' : modoJuego === 'neto' ? 'Neto' : 'Gross'}
          </span>
        </div>
      </div>

      {/* Table header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '32px 1fr 72px 60px',
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase' }}>#</span>
        <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Equipo</span>
        <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'center' }}>
          {isStableford ? 'PTS' : hasCourse ? '+/- Par' : 'Score'}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'right' }}>Hoyos</span>
      </div>

      {/* Team rows */}
      {sorted.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: '14px' }}>
          Esperando scores...
        </div>
      ) : sorted.map((team, idx) => {
        const score = primaryScore(team, modoJuego, formatoJuego)
        const isEven = score === 0 && !isStableford
        const isGood = isStableford ? score > 0 : score < 0

        return (
          <div key={team.teamId} style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            role={onToggleTeam ? 'button' : undefined}
            onClick={onToggleTeam ? () => onToggleTeam(team.teamId) : undefined}
            style={{
            display: 'grid', gridTemplateColumns: '32px 1fr 72px 60px',
            padding: '12px 16px',
            background: idx === 0 ? 'rgba(196,153,42,0.03)' : 'transparent',
            cursor: onToggleTeam ? 'pointer' : 'default',
          }}>
            {/* Position */}
            <span style={{
              fontSize: '14px', fontWeight: 700, fontFamily: '"DM Mono", monospace',
              color: idx === 0 ? 'var(--brand-on-bg)' : 'var(--text-2)',
            }}>
              {idx + 1}
            </span>

            {/* Team info */}
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                {team.teamNombre}
                {onToggleTeam && (
                  <span style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 400, marginLeft: '6px' }}>
                    {expandedTeamId === team.teamId ? '▲' : '▼'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                {team.jugadores.join(' · ')}
                {team.teamHandicap != null && (
                  <span style={{ marginLeft: '6px', color: 'var(--brand-on-bg)' }}>
                    HCP {team.teamHandicap}
                  </span>
                )}
              </div>
            </div>

            {/* Score */}
            <div style={{ textAlign: 'center' }}>
              <span style={{
                fontSize: '16px', fontWeight: 700, fontFamily: '"DM Mono", monospace',
                // Stableford: pts altos = bueno → mapear a birdie color; stroke: score IS el diff.
                color: isStableford
                  ? (score > 0 ? getScoreColor(-1) : score === 0 ? getScoreColor(0) : getScoreColor(1))
                  : getScoreColor(score),
              }}>
                {displayScore(team, modoJuego, formatoJuego, hasCourse)}
              </span>
            </div>

            {/* Holes */}
            <span style={{
              fontSize: '13px', color: 'var(--text-2)', textAlign: 'right',
              fontFamily: '"DM Mono", monospace',
            }}>
              {team.holesPlayed}/{totalHoles}
            </span>
            </div>
            {onToggleTeam && expandedTeamId === team.teamId && renderTeamDetail && (
              <div>{renderTeamDetail(team.teamId)}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
