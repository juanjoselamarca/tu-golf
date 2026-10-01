'use client'

import type React from 'react'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import type { Jugador } from '@/types/ronda'
import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface HoleProgressRowProps {
  ordenHoyos: readonly number[]
  currentHole: number
  setCurrentHole: (h: number) => void
  jugadores: Jugador[]
  scores: Record<string, Record<number, number>>
  /** Marca (punto dorado) los hoyos donde algún jugador recibe golpe. */
  showNetStableford: boolean
  getDotHcp: (jugadorId: string) => number
  siAllocByHole: Record<number, number>
  totalHoles: number
  /** De `useHoleNavigation`: centra el hoyo actual (celdas con `data-hoyo`). */
  progressRowRef: React.RefObject<HTMLDivElement | null>
  theme: ScorerTheme
}

/** Fila de hoyos en orden de juego: ✓ cuando todos anotaron, activo resaltado. */
export function HoleProgressRow({
  ordenHoyos, currentHole, setCurrentHole, jugadores, scores, showNetStableford, getDotHcp, siAllocByHole, totalHoles, progressRowRef, theme,
}: HoleProgressRowProps) {
  return (
    <div style={{ borderBottom: `1px solid ${theme.border}`, flexShrink: 0, overflow: 'hidden' }}>
      <div ref={progressRowRef} style={{ display: 'flex', overflowX: 'auto', padding: '5px 6px', gap: '2px', WebkitOverflowScrolling: 'touch' }}>
        {ordenHoyos.map(h => {
          const isActive = h === currentHole
          const allHaveScore = jugadores.every(j => scores[j.id]?.[h] != null)
          const anyPlayerGetsStroke = showNetStableford && jugadores.some(j => strokesRecibidosEnHoyo(getDotHcp(j.id), siAllocByHole[h] ?? h, totalHoles) > 0)
          return (
            <div key={h} data-hoyo={h} onClick={() => setCurrentHole(h)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '22px', cursor: 'pointer', position: 'relative',
            }}>
              <div style={{ fontSize: '8px', color: isActive ? theme.gold : theme.textFaint, fontWeight: isActive ? 600 : 400, marginBottom: '2px' }}>{h}</div>
              <div style={{
                width: '22px', height: '22px', borderRadius: '3px',
                background: allHaveScore ? 'rgba(196,153,42,0.12)' : isActive ? 'rgba(196,153,42,0.08)' : 'var(--bg)',
                border: isActive ? '1.5px solid #C4992A' : allHaveScore ? '1px solid rgba(196,153,42,0.3)' : '1px solid #e2e8f0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '9px', color: allHaveScore ? theme.gold : 'transparent', fontWeight: 600,
              }}>
                {allHaveScore ? '✓' : ''}
              </div>
              {anyPlayerGetsStroke && (
                <div style={{ position: 'absolute', bottom: '-2px', right: '-1px', width: '6px', height: '6px', borderRadius: '50%', background: '#c4992a', border: '0.5px solid rgba(255,255,255,0.8)' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
