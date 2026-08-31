// Carrusel horizontal de jugadores del scorer (selección de tarjeta).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScoringPlayer, ScoringRound } from '@/lib/data/tournaments/scoring'
import { isClosedRoundStatus } from '../hooks/useScoringData'

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

interface PlayerCardsProps {
  players: ScoringPlayer[]
  selectedId: string | null
  holeCount: number
  /** filledCount del jugador SELECCIONADO (real-time del scorer). */
  filledCount: number
  getActiveRound: (player: ScoringPlayer | undefined) => ScoringRound | undefined
  hasScoresLoaded: boolean
  /** Conteos batch de hoyos por round_id (para progreso de TODOS los jugadores). */
  roundHoleCounts: Map<string, number>
  onSelect: (playerId: string) => void
}

export function PlayerCards({
  players,
  selectedId,
  holeCount,
  filledCount,
  getActiveRound,
  hasScoresLoaded,
  roundHoleCounts,
  onSelect,
}: PlayerCardsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollIndicators = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollIndicators()
    el.addEventListener('scroll', updateScrollIndicators, { passive: true })
    const ro = new ResizeObserver(updateScrollIndicators)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollIndicators)
      ro.disconnect()
    }
  }, [updateScrollIndicators, players.length])

  return (
    <div style={{ position: 'relative', marginBottom: '28px' }}>
      {/* Gradiente izquierdo */}
      {canScrollLeft && (
        <div
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 32,
            background: 'linear-gradient(to right, var(--bg, #0e1c2f), transparent)',
            zIndex: 1, pointerEvents: 'none', borderRadius: '10px 0 0 10px',
          }}
        />
      )}
      {/* Gradiente derecho */}
      {canScrollRight && (
        <div
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: 32,
            background: 'linear-gradient(to left, var(--bg, #0e1c2f), transparent)',
            zIndex: 1, pointerEvents: 'none', borderRadius: '0 10px 10px 0',
          }}
        />
      )}
      <div ref={scrollRef} style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
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
                {isDone
                  ? '✓ Completo'
                  : `${isSelected && hasScoresLoaded ? filledCount : (round ? (roundHoleCounts.get(round.id) ?? 0) : 0)}/${holeCount}`}
              </div>
            </button>
          )
        })}
      </div>
      </div>
    </div>
  )
}
