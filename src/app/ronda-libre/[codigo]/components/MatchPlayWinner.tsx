// Celebración del ganador en match play (ronda finalizada, 2 jugadores). Verbatim del monolito.
import { Trophy, Handshake } from '@/components/icons'
import type { MatchResult } from '@/golf/formats/match-play'
import type { RondaLibre } from '@/types/ronda'

export interface MatchPlayWinnerProps {
  ronda: RondaLibre
  mr: MatchResult
  courseHcpMap: Record<string, number>
  onShare: () => void
}

export function MatchPlayWinner({ ronda, mr, courseHcpMap, onShare }: MatchPlayWinnerProps) {
  const jug = ronda.ronda_libre_jugadores
  const ganador = mr.winner === 'a' ? jug[0] : mr.winner === 'b' ? jug[1] : null
  const isAllSquare = mr.state === 0

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: '16px',
        border: '2px solid #c4992a', overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(196,153,42,0.15)',
      }}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #c4992a, #d4a843, #c4992a)' }} />
        <div style={{ padding: '28px 20px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>{isAllSquare ? <Handshake size={48} /> : <Trophy size={48} />}</div>
          <div style={{
            fontSize: '11px', fontWeight: 700, color: '#c4992a',
            textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px',
          }}>
            {isAllSquare ? 'All Square' : 'Ganador'}
          </div>
          {ganador && (
            <div style={{
              fontFamily: '"Playfair Display", serif', fontSize: '28px',
              fontWeight: 700, color: 'var(--text)', marginBottom: '12px',
            }}>
              {ganador.nombre}
            </div>
          )}
          <div style={{
            fontSize: '40px', fontWeight: 900, color: '#c4992a', lineHeight: 1,
            fontFamily: '"Playfair Display", serif',
          }}>
            {mr.display}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '10px' }}>
            {ronda.modo_juego === 'neto' ? 'Match Play Neto' : 'Match Play Gross'} &middot; {ronda.course_name}
          </div>
        </div>

        {/* VS card */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 16px', background: 'var(--bg)', borderRadius: '10px',
          }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{jug[0].nombre}</div>
              {ronda.modo_juego === 'neto' && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>HCP {courseHcpMap[jug[0].id] ?? '--'}</div>}
            </div>
            <div style={{ fontSize: '11px', color: '#c4992a', fontWeight: 700 }}>VS</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{jug[1].nombre}</div>
              {ronda.modo_juego === 'neto' && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>HCP {courseHcpMap[jug[1].id] ?? '--'}</div>}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: mr.holesWonA > mr.holesWonB ? '#16a34a' : '#374151' }}>
                {mr.holesWonA}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Ganados</div>
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-2)' }}>{mr.holesHalved}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Empates</div>
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: mr.holesWonB > mr.holesWonA ? '#16a34a' : '#374151' }}>
                {mr.holesWonB}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Ganados</div>
            </div>
          </div>
        </div>

        {/* Share button */}
        <div style={{ padding: '0 20px 20px' }}>
          <button onClick={onShare} style={{
            width: '100%', padding: '16px',
            background: 'linear-gradient(135deg, #c4992a 0%, #d4a843 50%, #b8972f 100%)',
            color: 'var(--brand-dark)', fontWeight: 700, fontSize: '16px',
            border: 'none', borderRadius: '12px', cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(196,153,42,0.35)',
          }}>
            Compartir resultado
          </button>
        </div>
      </div>
    </div>
  )
}
