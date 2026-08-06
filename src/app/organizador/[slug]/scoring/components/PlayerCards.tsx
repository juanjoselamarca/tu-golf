// Carrusel horizontal de jugadores del scorer (selección de tarjeta).

import type { ScoringPlayer, ScoringRound } from '@/lib/data/tournaments/scoring'
import { isClosedRoundStatus } from '../hooks/useScoringData'

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

interface PlayerCardsProps {
  players: ScoringPlayer[]
  selectedId: string | null
  holeCount: number
  filledCount: number
  getActiveRound: (player: ScoringPlayer | undefined) => ScoringRound | undefined
  hasScoresLoaded: boolean
  onSelect: (playerId: string) => void
}

export function PlayerCards({
  players,
  selectedId,
  holeCount,
  filledCount,
  getActiveRound,
  hasScoresLoaded,
  onSelect,
}: PlayerCardsProps) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: '28px' }}>
      <div style={{ display: 'flex', gap: '12px', padding: '4px 0' }}>
        {players.map((p) => {
          const round = getActiveRound(p)
          const isSelected = p.id === selectedId
          const isDone = isClosedRoundStatus(round?.status)
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              style={{
                minWidth: '120px',
                padding: '14px 16px',
                background: isSelected ? 'rgba(196,153,42,0.12)' : 'rgba(14,28,47,0.9)',
                border: isSelected ? '2px solid #c4992a' : '1px solid rgba(122,143,168,0.2)',
                borderRadius: '10px',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 180ms',
                flexShrink: 0,
              }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isSelected ? '#c4992a' : '#e2e8f0', color: isSelected ? 'var(--brand-dark)' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', margin: '0 auto 8px' }}>
                {getInitials(p.profiles?.name || '?')}
              </div>
              <div style={{ color: 'var(--text)', fontSize: '12px', fontWeight: 500, lineHeight: 1.2, marginBottom: '4px' }}>
                {p.profiles?.name?.split(' ')[0] || '—'}
              </div>
              <div style={{ fontSize: '11px', color: isDone ? '#4ade80' : '#4a5568' }}>
                {isDone ? '✓ Completo' : `${hasScoresLoaded && isSelected ? filledCount : 0}/${holeCount}`}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
