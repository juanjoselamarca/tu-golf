'use client'

/**
 * MatchStatusBar — Barra visual compacta del estado de un match play.
 *
 * Muestra: dots por hoyo (verde/rojo/gris), score running,
 * nombres de jugadores, y estado del match.
 *
 * Uso: leaderboards, mini-leaderboard, compartir, resumen de ronda.
 */

import type { MatchResult, HoleResult } from '@/golf/formats/match-play'

interface Props {
  matchResult: MatchResult
  nombreA: string
  nombreB: string
  handicapA?: number | null
  handicapB?: number | null
  totalHoles: number
  /** Si true, muestra versión compacta (para mini-leaderboard) */
  compact?: boolean
}

const DOT_COLORS: Record<string, { bg: string; color: string }> = {
  won_a:      { bg: 'rgba(22,163,74,0.12)', color: '#16a34a' },
  conceded_b: { bg: 'rgba(22,163,74,0.12)', color: '#16a34a' },
  won_b:      { bg: 'rgba(220,38,38,0.12)', color: '#dc2626' },
  conceded_a: { bg: 'rgba(220,38,38,0.12)', color: '#dc2626' },
  halved:     { bg: 'rgba(107,114,128,0.08)', color: '#6b7280' },
}

function dotLabel(result: HoleResult, nombreA: string, nombreB: string): string {
  if (result === 'halved') return '='
  if (result === 'won_a' || result === 'conceded_b') return nombreA[0]
  if (result === 'won_b' || result === 'conceded_a') return nombreB[0]
  return ''
}

export default function MatchStatusBar({
  matchResult: mr,
  nombreA,
  nombreB,
  handicapA,
  handicapB,
  totalHoles,
  compact = false,
}: Props) {
  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{nombreA}</span>
        <span style={{
          fontSize: '14px', fontWeight: 700, fontFamily: '"DM Mono", monospace',
          color: mr.state === 0 ? '#6b7280' : '#c4992a',
        }}>
          {mr.holesPlayed > 0 ? mr.display : 'AS'}
        </span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{nombreB}</span>
      </div>
    )
  }

  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px',
      padding: '20px', marginBottom: '12px',
    }}>
      {/* Player names */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>{nombreA}</div>
          {handicapA != null && <div style={{ fontSize: '11px', color: '#9ca3af' }}>HCP {handicapA}</div>}
        </div>
        <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>VS</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>{nombreB}</div>
          {handicapB != null && <div style={{ fontSize: '11px', color: '#9ca3af' }}>HCP {handicapB}</div>}
        </div>
      </div>

      {/* Match state */}
      <div style={{
        textAlign: 'center', padding: '16px 0',
        background: '#f9fafb', borderRadius: '10px', marginBottom: '12px',
      }}>
        <div style={{
          fontSize: '28px', fontWeight: 700, fontFamily: '"Playfair Display", serif',
          color: mr.state === 0 ? '#6b7280' : '#c4992a',
        }}>
          {mr.holesPlayed > 0 ? mr.display : 'All Square'}
        </div>
        {mr.isFinished && mr.winner && (
          <div style={{ fontSize: '13px', color: '#16a34a', fontWeight: 600, marginTop: '4px' }}>
            {mr.winner === 'a' ? nombreA : nombreB} gana
          </div>
        )}
        {!mr.isFinished && mr.holesPlayed > 0 && (
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
            {mr.holesPlayed} de {totalHoles} hoyos jugados
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: mr.holesWonA > mr.holesWonB ? '#16a34a' : '#374151' }}>
            {mr.holesWonA}
          </div>
          <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>Ganados</div>
        </div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#6b7280' }}>{mr.holesHalved}</div>
          <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>Empates</div>
        </div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: mr.holesWonB > mr.holesWonA ? '#16a34a' : '#374151' }}>
            {mr.holesWonB}
          </div>
          <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>Ganados</div>
        </div>
      </div>

      {/* Hole-by-hole dots */}
      {mr.holesPlayed > 0 && (
        <div style={{ marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 600 }}>
            Hoyo a hoyo
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {mr.holes.filter(h => !h.afterMatchEnd && h.result !== 'not_played').map(h => {
              const style = DOT_COLORS[h.result] ?? { bg: 'transparent', color: '#9ca3af' }
              return (
                <div key={h.numero} style={{
                  width: '28px', height: '28px', borderRadius: '6px',
                  background: style.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 600, color: style.color,
                }} title={`Hoyo ${h.numero}`}>
                  {dotLabel(h.result, nombreA, nombreB)}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
