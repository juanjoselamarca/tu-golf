// Selector de ronda + botón "Iniciar Ronda N+1" para torneos multi-ronda.

import type { ScoringPlayer } from '@/lib/data/tournaments/scoring'

interface MultiRoundControlsProps {
  totalRounds: number
  activeRoundNum: number
  players: ScoringPlayer[]
  canStartNextRound: boolean
  startingNextRound: boolean
  onSelectRound: (rn: number) => void
  onStartNextRound: () => void
}

export function MultiRoundControls({
  totalRounds,
  activeRoundNum,
  players,
  canStartNextRound,
  startingNextRound,
  onSelectRound,
  onStartNextRound,
}: MultiRoundControlsProps) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
      {Array.from({ length: totalRounds }, (_, i) => i + 1).map((rn) => {
        const hasRound = players.some((p) => p.rounds?.some((r) => (r.round_number ?? 1) === rn))
        return (
          <button
            key={rn}
            onClick={() => onSelectRound(rn)}
            disabled={!hasRound}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: activeRoundNum === rn ? 700 : 400,
              border: activeRoundNum === rn ? '2px solid #c4992a' : '1px solid rgba(122,143,168,0.25)',
              background: activeRoundNum === rn ? 'rgba(196,153,42,0.12)' : 'transparent',
              color: !hasRound ? '#3a4a5a' : activeRoundNum === rn ? '#c4992a' : '#4a5568',
              cursor: hasRound ? 'pointer' : 'not-allowed',
            }}
          >
            Ronda {rn}
          </button>
        )
      })}
      {canStartNextRound && (
        <button
          onClick={onStartNextRound}
          disabled={startingNextRound}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 700,
            border: '2px solid #c4992a',
            background: '#c4992a',
            color: 'var(--text)',
            cursor: startingNextRound ? 'not-allowed' : 'pointer',
            opacity: startingNextRound ? 0.7 : 1,
            marginLeft: 'auto',
          }}
        >
          {startingNextRound ? 'Creando...' : `Iniciar Ronda ${activeRoundNum + 1}`}
        </button>
      )}
    </div>
  )
}
