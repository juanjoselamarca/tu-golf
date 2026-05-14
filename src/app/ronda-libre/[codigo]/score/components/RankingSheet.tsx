'use client'

import type React from 'react'
import type { MatchResult } from '@/golf/formats/match-play'

interface RankingEntry {
  id: string
  nombre: string
  vsPar: number
  holesPlayed: number
  gross: number
}

interface RankingSheetProps {
  ranking: RankingEntry[]
  isMatchPlay: boolean
  matchResult: MatchResult | null
  jugadores: Array<{ id: string; nombre: string }>
  activeJugadorId: string | null
  showRanking: boolean
  setShowRanking: React.Dispatch<React.SetStateAction<boolean>>
}

export function RankingSheet({
  ranking,
  isMatchPlay,
  matchResult,
  jugadores,
  activeJugadorId,
  showRanking,
  setShowRanking,
}: RankingSheetProps) {
  return (
    <div style={{ margin: '0 16px 8px', flexShrink: 0 }}>
      {isMatchPlay && matchResult ? (
        /* ── Match Play: show match state bar ── */
        <div style={{
          padding: '12px 16px',
          background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
              {jugadores[0]?.nombre}
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
              {jugadores[1]?.nombre}
            </span>
          </div>
          <div style={{
            textAlign: 'center', padding: '8px 0',
            fontSize: '20px', fontWeight: 700, fontFamily: '"Playfair Display", serif',
            color: matchResult.state === 0 ? '#6b7280' : matchResult.state > 0 ? '#16a34a' : '#dc2626',
          }}>
            {matchResult.display}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-3)' }}>
            <span>{matchResult.holesWonA} ganados</span>
            <span>{matchResult.holesHalved} empates</span>
            <span>{matchResult.holesWonB} ganados</span>
          </div>
          {matchResult.isFinished && matchResult.winner && (
            <div style={{
              marginTop: '8px', padding: '6px 12px', borderRadius: '8px',
              background: 'rgba(196,153,42,0.1)', textAlign: 'center',
              fontSize: '13px', fontWeight: 600, color: '#c4992a',
            }}>
              {jugadores[matchResult.winner === 'a' ? 0 : 1]?.nombre} gana {matchResult.display}
            </div>
          )}
        </div>
      ) : (
        /* ── Stroke/Stableford: show ranking ── */
        <>
          <button
            onClick={() => setShowRanking(!showRanking)}
            style={{
              width: '100%', padding: '8px 12px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-2)',
            }}
          >
            <span>Ranking</span>
            <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
              {showRanking ? '▲' : '▼'}
            </span>
          </button>
          {showRanking && (
            <div style={{ marginTop: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              {ranking.map((r, idx) => {
                const isMe = r.id === activeJugadorId
                const vsParStr = r.vsPar > 0 ? `+${r.vsPar}` : r.vsPar === 0 ? 'E' : String(r.vsPar)
                return (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: isMe ? 'rgba(196,153,42,0.08)' : 'transparent',
                    borderBottom: idx < ranking.length - 1 ? '1px solid #e2e8f0' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', width: '20px' }}>{idx + 1}</span>
                      <span style={{ fontSize: '14px', fontWeight: isMe ? 700 : 500, color: isMe ? '#c4992a' : '#1a1a2e' }}>
                        {r.nombre}{isMe ? ' ←' : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: r.vsPar < 0 ? '#16a34a' : r.vsPar > 0 ? '#dc2626' : '#1a1a2e' }}>
                        {vsParStr}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>({r.holesPlayed}h)</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
