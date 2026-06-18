// Cuadro ganador + podium (rondas finalizadas, no match play). Verbatim del monolito.
import { Trophy, Handshake } from '@/components/icons'
import { formatOverUnder } from '@/constants/golf'
import { getScoreColorLight } from '@/golf/core/colors'
import type { RondaLibre } from '@/types/ronda'
import type { LeaderboardEntry } from '@/lib/ronda/leaderboard'

export interface WinnerCelebrationProps {
  ronda: RondaLibre
  leaderboard: LeaderboardEntry[]
  fechaDisplay: string
  onShare: () => void
}

export function WinnerCelebration({ ronda, leaderboard, fechaDisplay, onShare }: WinnerCelebrationProps) {
  const isStab = ronda.formato_juego === 'stableford'
  const isTie = leaderboard.length > 1 && (isStab
    ? leaderboard[0].stablefordPts === leaderboard[1].stablefordPts
    : leaderboard[0].vsPar === leaderboard[1].vsPar)
  const winnerScore = leaderboard[0].vsPar
  const scoreColor = isStab ? '#c4992a' : getScoreColorLight(winnerScore)
  const playedPlayers = leaderboard.filter(j => j.holesPlayed > 0)

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: '16px',
        border: '2px solid #c4992a',
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(196,153,42,0.15)',
      }}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #c4992a, #d4a843, #c4992a)' }} />
        <div style={{ padding: '24px 20px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '4px' }}>{isTie ? <Handshake size={48} /> : <Trophy size={48} />}</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px' }}>
            {isTie ? 'Empate' : 'Ganador'}
          </div>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '26px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            {isTie
              ? leaderboard.filter(j => isStab ? j.stablefordPts === leaderboard[0].stablefordPts : j.vsPar === winnerScore).map(j => j.nombre.split(' ')[0]).join(' y ')
              : leaderboard[0].nombre}
          </div>
          <div style={{ fontSize: '36px', fontWeight: 900, color: scoreColor, lineHeight: 1 }}>
            {isStab ? `${leaderboard[0].stablefordPts} pts` : formatOverUnder(winnerScore)}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '6px' }}>{ronda.course_name} · {fechaDisplay}</div>
        </div>

        {/* Final leaderboard with positions */}
        {playedPlayers.length > 1 && (
          <div style={{ padding: '0 20px 16px' }}>
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
              {playedPlayers.map((j, idx) => {
                const posLabel = idx === 0 ? '1°' : idx === 1 ? '2°' : idx === 2 ? '3°' : `${idx + 1}°`
                const posColor = idx === 0 ? '#c4992a' : idx === 1 ? '#94a8c0' : idx === 2 ? '#b87333' : '#9ca3af'
                const isWinner = idx === 0
                const jScoreColor = isStab ? '#c4992a' : getScoreColorLight(j.vsPar)
                return (
                  <div key={j.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '8px 0',
                    borderBottom: idx < playedPlayers.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}>
                    <span style={{
                      fontSize: '15px', fontWeight: 800, color: posColor,
                      minWidth: '28px', textAlign: 'center',
                    }}>{posLabel}</span>
                    <span style={{
                      flex: 1, fontSize: '14px', color: 'var(--text)',
                      fontWeight: isWinner ? 700 : 500,
                    }}>{j.nombre}</span>
                    <span style={{
                      fontSize: '15px', fontWeight: 700, color: jScoreColor,
                    }}>{isStab ? `${j.stablefordPts} pts` : formatOverUnder(j.vsPar)}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-3)', minWidth: '40px', textAlign: 'right' }}>
                      {j.holesPlayed}/{ronda.holes}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Share button — "Compartir resultados" CTA */}
        <div style={{ padding: '0 20px 20px' }}>
          <button
            onClick={onShare}
            style={{
              width: '100%', padding: '16px',
              background: 'linear-gradient(135deg, #c4992a 0%, #d4a843 50%, #b8972f 100%)',
              color: 'var(--brand-dark)', fontWeight: 700, fontSize: '16px',
              border: 'none', borderRadius: '12px', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(196,153,42,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            Compartir resultados
          </button>
        </div>
      </div>
    </div>
  )
}
