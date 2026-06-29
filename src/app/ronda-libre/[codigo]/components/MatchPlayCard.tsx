// Card de estado del match play en vivo (2 jugadores). Orquesta nombres + estado
// + stats + strip + tabla detallada + GWI. Verbatim del monolito.
import type { MatchResult } from '@/golf/formats/match-play'
import type { RondaLibre } from '@/types/ronda'
import { MatchStrip } from './matchplay/MatchStrip'
import { MatchDetailTable } from './matchplay/MatchDetailTable'
import { MatchGwiPanel } from './matchplay/MatchGwiPanel'

export interface MatchPlayCardProps {
  ronda: RondaLibre
  mr: MatchResult
  /** Course handicap de SCORING (9h en rondas de 9h) — stroke math del GWI. */
  courseHcpMap: Record<string, number>
  /** Course handicap COMPLETO (18h) — el que se muestra como "HCP" bajo cada nombre. */
  displayHcpMap: Record<string, number>
}

export function MatchPlayCard({ ronda, mr, courseHcpMap, displayHcpMap }: MatchPlayCardProps) {
  const jug = ronda.ronda_libre_jugadores

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid #e5e7eb', borderRadius: '12px',
      padding: '20px', marginBottom: '12px',
    }}>
      {/* Player names */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{jug[0].nombre}</div>
          {ronda.modo_juego === 'neto' && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>HCP {displayHcpMap[jug[0].id] ?? courseHcpMap[jug[0].id] ?? '--'}</div>}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 600 }}>VS</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{jug[1].nombre}</div>
          {ronda.modo_juego === 'neto' && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>HCP {displayHcpMap[jug[1].id] ?? courseHcpMap[jug[1].id] ?? '--'}</div>}
        </div>
      </div>

      {/* Match state */}
      <div style={{
        textAlign: 'center', padding: '16px 0',
        background: 'var(--bg)', borderRadius: '10px', marginBottom: '12px',
      }}>
        <div style={{
          fontSize: '28px', fontWeight: 700, fontFamily: '"Playfair Display", serif',
          color: mr.state === 0 ? '#6b7280' : '#c4992a',
        }}>
          {mr.holesPlayed > 0 ? mr.display : 'All Square'}
        </div>
        {mr.isFinished && mr.winner && (
          <div style={{ fontSize: '13px', color: '#16a34a', fontWeight: 600, marginTop: '4px' }}>
            {jug[mr.winner === 'a' ? 0 : 1].nombre} gana
          </div>
        )}
        {!mr.isFinished && mr.holesPlayed > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>
            {mr.holesPlayed} de {ronda.holes} hoyos jugados
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: mr.holesWonA > mr.holesWonB ? '#16a34a' : '#374151' }}>
            {mr.holesWonA}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Ganados</div>
        </div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-2)' }}>{mr.holesHalved}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Empates</div>
        </div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: mr.holesWonB > mr.holesWonA ? '#16a34a' : '#374151' }}>
            {mr.holesWonB}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Ganados</div>
        </div>
      </div>

      {mr.holesPlayed > 0 && <MatchStrip mr={mr} nombreA={jug[0].nombre} nombreB={jug[1].nombre} />}

      {mr.holesPlayed > 0 && <MatchDetailTable mr={mr} nombreA={jug[0].nombre} nombreB={jug[1].nombre} />}

      {!mr.isFinished && mr.holesPlayed >= 2 && mr.holesRemaining > 0 && (
        <MatchGwiPanel ronda={ronda} mr={mr} courseHcpMap={courseHcpMap} />
      )}
    </div>
  )
}
