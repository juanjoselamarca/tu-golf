'use client'

import { Users } from '@/components/icons'
import { inputStyle } from '../styles'
import type { Player, TournamentGroup } from '../types'

interface Props {
  players: Player[]
  groups: TournamentGroup[]
  tournamentStatus: string
  getPlayerGroupId: (playerId: string) => string
  onAssignPlayer: (playerId: string, groupId: string) => void
  onWithdraw: (playerId: string) => void
  onDisqualify: (playerId: string) => void
}

/** Tabla de jugadores inscritos: índice, course hcp, categoría, selector de
 *  grupo, acciones WD/DQ. Extraído verbatim de JugadoresPanel. */
export function PlayersTable({
  players, groups, tournamentStatus,
  getPlayerGroupId, onAssignPlayer, onWithdraw, onDisqualify,
}: Props) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: 'var(--text)', margin: 0 }}>
          Jugadores inscritos ({players.length})
        </h2>
      </div>

      {players.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-2)' }}>
          <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Users size={40} strokeWidth={1.5} /></div>
          <div style={{ fontSize: '16px', marginBottom: '6px', color: 'var(--text)' }}>Sin jugadores aún</div>
          <div style={{ fontSize: '13px' }}>Busca y añade jugadores usando el formulario de arriba.</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Nombre', 'Índice', 'Course HCP', 'Categoría', 'Grupo', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr
                  key={p.id}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 150ms' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'rgba(var(--text-2-rgb), 0.04)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                >
                  <td style={{ padding: '12px 16px', color: 'var(--text-2)', fontSize: '14px' }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text)', fontSize: '14px', fontWeight: 500 }}>
                    {p.profiles?.name || '—'}
                    {p.status === 'withdrawn' && (
                      <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(148,168,192,0.15)', color: 'var(--text-2)', letterSpacing: '0.05em' }}>WD</span>
                    )}
                    {p.status === 'disqualified' && (
                      <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(220,38,38,0.2)', color: '#fca5a5', letterSpacing: '0.05em' }}>DQ</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-2)', fontSize: '14px' }}>{p.profiles?.indice ?? '—'}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--brand-on-bg)', fontSize: '14px', fontWeight: 600 }}>{p.handicap_at_registration ?? '—'}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-2)', fontSize: '13px' }}>{p.categories?.name || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {groups.length > 0 ? (
                      <select
                        value={getPlayerGroupId(p.id)}
                        onChange={(e) => onAssignPlayer(p.id, e.target.value)}
                        style={{ ...inputStyle, fontSize: '12px', padding: '4px 6px', minWidth: '100px' }}
                      >
                        <option value="">Sin grupo</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ color: 'var(--text-2)', fontSize: '12px' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', display: 'flex', gap: '6px' }}>
                    {tournamentStatus !== 'closed' && p.status !== 'withdrawn' && p.status !== 'disqualified' && (
                      <>
                        <button
                          onClick={() => onWithdraw(p.id)}
                          title="Retirar (WD)"
                          style={{ background: 'rgba(148,168,192,0.12)', border: '1px solid rgba(148,168,192,0.3)', color: 'var(--text-2)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          WD
                        </button>
                        {tournamentStatus === 'in_progress' && (
                          <button
                            onClick={() => onDisqualify(p.id)}
                            title="Descalificar (DQ)"
                            style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#fca5a5', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            DQ
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
