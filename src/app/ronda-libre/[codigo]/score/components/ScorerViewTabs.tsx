'use client'

import type { Jugador } from '@/types/ronda'
import type { ScorerView } from '../hooks/useGwiLeaderboard'
import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface ScorerViewTabsProps {
  view: ScorerView
  setView: (v: ScorerView) => void
  /** Pestañas de jugador: sólo cuando NO hay un jugador fijado (legacy/admin). */
  showPlayerTabs: boolean
  jugadores: Jugador[]
  activeJugadorId: string | null
  setActiveJugadorId: (id: string) => void
  theme: ScorerTheme
}

/** Toggle Scorecard / Leaderboard + pestañas de jugador (multi-jugador). */
export function ScorerViewTabs({ view, setView, showPlayerTabs, jugadores, activeJugadorId, setActiveJugadorId, theme }: ScorerViewTabsProps) {
  return (
    <>
      <div style={{ display: 'flex', background: 'var(--surface-soft)', borderRadius: '20px', padding: '2px', margin: '5px 16px', flexShrink: 0 }}>
        {(['scorecard', 'leaderboard'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            flex: 1, padding: '6px', borderRadius: '16px', fontSize: '12px', fontWeight: 500,
            border: 'none', cursor: 'pointer',
            background: view === v ? 'var(--brand)' : 'transparent',
            color: view === v ? 'var(--brand-dark)' : theme.textFaint,
            transition: 'all 0.15s ease', WebkitTapHighlightColor: 'transparent',
          }}>
            {v === 'scorecard' ? 'Scorecard' : 'Leaderboard'}
          </button>
        ))}
      </div>

      {showPlayerTabs && view === 'scorecard' && (
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: `1px solid var(--border)`, WebkitOverflowScrolling: 'touch', flexShrink: 0, height: '36px' }}>
          {jugadores.map(j => {
            const active = j.id === activeJugadorId
            return (
              <button key={j.id} onClick={() => setActiveJugadorId(j.id)} style={{
                padding: '0 16px', height: '36px', border: 'none',
                borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
                background: 'transparent', color: active ? 'var(--brand-on-bg)' : theme.textFaint,
                fontWeight: active ? 600 : 400, fontSize: '13px',
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, minHeight: 0, minWidth: 0,
              }}>{j.nombre}</button>
            )
          })}
        </div>
      )}
    </>
  )
}
