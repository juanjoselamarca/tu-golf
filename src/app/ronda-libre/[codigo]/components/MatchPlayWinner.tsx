// Cuadro ganador de match play (finalizada). Héroe editorial puro: el VS + el
// detalle hoyo-a-hoyo viven UNA sola vez en MatchPlayCard, abajo.
import { Trophy, Handshake } from '@/components/icons'
import type { MatchResult } from '@/golf/formats/match-play'
import type { RondaLibre } from '@/types/ronda'

export interface MatchPlayWinnerProps {
  ronda: RondaLibre
  mr: MatchResult
  onShare: () => void
}

export function MatchPlayWinner({ ronda, mr, onShare }: MatchPlayWinnerProps) {
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
        <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 20px 0' }}>
          <span style={{
            padding: '4px 12px', background: 'rgba(196,153,42,0.1)', color: '#c4992a',
            border: '1px solid rgba(196,153,42,0.28)', borderRadius: '999px',
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
            fontFamily: 'DM Mono, monospace', textTransform: 'uppercase',
          }}>{ronda.modo_juego === 'neto' ? 'Match Play Neto' : 'Match Play Gross'}</span>
        </div>
        <div style={{ padding: '18px 20px 20px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', color: '#c4992a', marginBottom: '8px' }}>
            {isAllSquare ? <Handshake size={34} /> : <Trophy size={34} />}
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px' }}>
            {isAllSquare ? 'All Square' : 'Ganador'}
          </div>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '30px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.05, marginBottom: '2px' }}>
            {isAllSquare ? `${jug[0].nombre} y ${jug[1].nombre}` : ganador?.nombre}
          </div>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '40px', fontWeight: 700, color: '#c4992a', lineHeight: 1.1 }}>
            {mr.display}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-3)', marginTop: '6px' }}>
            {jug[0].nombre} vs {jug[1].nombre} · {ronda.course_name}
          </div>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <button onClick={onShare} style={{
            width: '100%', padding: '15px',
            background: '#c4992a', color: 'var(--brand-dark)', fontWeight: 700, fontSize: '15px',
            border: 'none', borderRadius: '12px', cursor: 'pointer',
          }}>
            Compartir resultado
          </button>
        </div>
      </div>
    </div>
  )
}
