// src/app/torneo/[slug]/components/TournamentPodium.tsx
//
// Seccion de podio para torneos cerrados. Muestra top 3 con display especial.
// Se renderiza ARRIBA del leaderboard completo.

import type { Player } from '@/lib/golf-data'

export interface PodiumEntry {
  pos: number
  name: string
  score: string
}

export interface TournamentPodiumProps {
  entries: PodiumEntry[]
}

const POSITION_STYLES: Record<number, { fontSize: string; iconSize: string; medal: string }> = {
  1: { fontSize: '20px', iconSize: '28px', medal: '1' },
  2: { fontSize: '17px', iconSize: '24px', medal: '2' },
  3: { fontSize: '15px', iconSize: '22px', medal: '3' },
}

function MedalIcon({ pos }: { pos: number }) {
  const colors: Record<number, string> = {
    1: '#c4992a', // oro
    2: '#94a3b8', // plata
    3: '#b8734a', // bronce
  }
  const color = colors[pos] ?? '#94a3b8'
  return (
    <div
      style={{
        width: pos === 1 ? '36px' : '30px',
        height: pos === 1 ? '36px' : '30px',
        borderRadius: '50%',
        background: `${color}18`,
        border: `2px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Cormorant Garamond", serif',
        fontSize: pos === 1 ? '18px' : '15px',
        fontWeight: 700,
        color,
        flexShrink: 0,
      }}
    >
      {pos}
    </div>
  )
}

export function TournamentPodium({ entries }: TournamentPodiumProps) {
  if (entries.length === 0) return null

  return (
    <div
      style={{
        maxWidth: '1080px',
        margin: '0 auto',
        padding: '0 16px 8px',
      }}
    >
      <div
        style={{
          fontFamily: '"DM Mono", monospace',
          fontSize: '10px',
          color: 'var(--text-3, #94a3b8)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '12px',
          paddingLeft: '4px',
        }}
        className="dark:text-gray-500"
      >
        Podio
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {entries.map((entry) => {
          const isFirst = entry.pos === 1
          return (
            <div
              key={entry.pos}
              className="dark:bg-gray-900/80 dark:border-gray-700/50"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: isFirst ? '16px 18px' : '12px 16px',
                borderRadius: '12px',
                background: isFirst
                  ? 'rgba(196,153,42,0.06)'
                  : 'var(--bg-surface, #f8f9fa)',
                border: `1px solid ${isFirst ? 'rgba(196,153,42,0.25)' : 'var(--border, #e2e8f0)'}`,
              }}
            >
              <MedalIcon pos={entry.pos} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="dark:text-gray-100"
                  style={{
                    fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
                    fontSize: isFirst ? '17px' : '15px',
                    fontWeight: 700,
                    color: 'var(--text, #1a1d24)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entry.name}
                </div>
              </div>
              <div
                style={{
                  fontFamily: '"Cormorant Garamond", serif',
                  fontSize: isFirst ? '24px' : '20px',
                  fontWeight: 700,
                  color: 'var(--brand-gold, #c4992a)',
                  flexShrink: 0,
                }}
              >
                {entry.score}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
