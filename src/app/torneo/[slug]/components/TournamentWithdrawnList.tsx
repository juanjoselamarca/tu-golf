// src/app/torneo/[slug]/components/TournamentWithdrawnList.tsx
//
// Jugadores en estado withdrawn / disqualified. Aparecen al pie del
// leaderboard con badge WD/DQ para transparencia USGA: sus scores se
// preservan en BD pero no compiten por posición.

import type { WithdrawnEntry } from '../types'

export interface TournamentWithdrawnListProps {
  withdrawnPlayers: WithdrawnEntry[]
}

export function TournamentWithdrawnList({ withdrawnPlayers }: TournamentWithdrawnListProps) {
  if (withdrawnPlayers.length === 0) return null

  return (
    <section style={{ maxWidth: '1080px', margin: '20px auto 0', padding: '0 20px' }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px 20px',
      }}>
        <div style={{
          fontSize: '11px',
          color: 'var(--text-3)',
          fontFamily: 'var(--font-dm-mono, "DM Mono", monospace)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          fontWeight: 700,
          marginBottom: '10px',
        }}>
          No compiten por posición
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {withdrawnPlayers.map((wp, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              <span style={{
                background: wp.status === 'disqualified' ? 'rgba(220,38,38,0.10)' : 'rgba(156,163,175,0.15)',
                color: wp.status === 'disqualified' ? '#991b1b' : '#4a5568',
                fontSize: '9px',
                fontWeight: 700,
                fontFamily: 'var(--font-dm-mono, "DM Mono", ui-monospace, monospace)',
                letterSpacing: '0.08em',
                padding: '2px 8px',
                borderRadius: '999px',
                flexShrink: 0,
              }}>
                {wp.status === 'disqualified' ? 'DQ' : 'WD'}
              </span>
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>{wp.name}</span>
              {wp.reason && (
                <span style={{ color: 'var(--text-3)', fontSize: '12px', marginLeft: 'auto', fontStyle: 'italic' }}>
                  {wp.reason}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
