'use client'

import { useMemo, useState } from 'react'
import { Users } from '@/components/icons'
import { inputStyle } from '../styles'
import type { Player, TournamentGroup } from '../types'

type StatusFilter = 'all' | 'approved' | 'withdrawn' | 'disqualified'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'approved', label: 'Aprobados' },
  { value: 'withdrawn', label: 'WD' },
  { value: 'disqualified', label: 'DQ' },
]

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
  const [loadingPlayerId, setLoadingPlayerId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const filteredPlayers = useMemo(() => {
    let result = players
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((p) => {
        const name = (p.profiles?.name ?? p.player_name ?? '').toLowerCase()
        return name.includes(q)
      })
    }
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter)
    }
    return result
  }, [players, searchQuery, statusFilter])

  const handleWithdraw = async (playerId: string) => {
    setLoadingPlayerId(playerId)
    try {
      await onWithdraw(playerId)
    } finally {
      setLoadingPlayerId(null)
    }
  }

  const handleDisqualify = async (playerId: string) => {
    setLoadingPlayerId(playerId)
    try {
      await onDisqualify(playerId)
    } finally {
      setLoadingPlayerId(null)
    }
  }
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
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: 'var(--text)', margin: '0 0 12px' }}>
          Jugadores inscritos ({players.length})
        </h2>

        {players.length > 0 && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Buscador */}
            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '320px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar jugador..."
                style={{ ...inputStyle, paddingLeft: '32px', fontSize: '13px', width: '100%', boxSizing: 'border-box' as const }}
              />
            </div>

            {/* Filtros de status */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {STATUS_FILTERS.map((f) => {
                const active = statusFilter === f.value
                return (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(f.value)}
                    style={{
                      padding: '5px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: 500,
                      border: active ? '1px solid var(--brand, #c4992a)' : '1px solid var(--border)',
                      background: active ? 'rgba(196,153,42,0.12)' : 'transparent',
                      color: active ? 'var(--brand-on-bg, #c4992a)' : 'var(--text-2)',
                      cursor: 'pointer', transition: 'all 150ms',
                    }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
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
              {filteredPlayers.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-2)', fontSize: '14px' }}>
                    No se encontraron jugadores{searchQuery ? ` con "${searchQuery}"` : ''}
                  </td>
                </tr>
              )}
              {filteredPlayers.map((p, i) => (
                <tr
                  key={p.id}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 150ms' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'rgba(var(--text-2-rgb), 0.04)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                >
                  <td style={{ padding: '12px 16px', color: 'var(--text-2)', fontSize: '14px' }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text)', fontSize: '14px', fontWeight: 500 }}>
                    {p.profiles?.name ?? p.player_name ?? '—'}
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
                          onClick={() => handleWithdraw(p.id)}
                          disabled={loadingPlayerId === p.id}
                          title="Retirar (WD)"
                          aria-label="Retirar jugador"
                          style={{
                            background: 'rgba(148,168,192,0.12)', border: '1px solid rgba(148,168,192,0.3)',
                            color: 'var(--text-2)', borderRadius: '6px', padding: '4px 10px',
                            fontSize: '11px', fontWeight: 600,
                            cursor: loadingPlayerId === p.id ? 'not-allowed' : 'pointer',
                            opacity: loadingPlayerId === p.id ? 0.5 : 1,
                            transition: 'opacity 150ms',
                          }}
                        >
                          WD
                        </button>
                        {tournamentStatus === 'in_progress' && (
                          <button
                            onClick={() => handleDisqualify(p.id)}
                            disabled={loadingPlayerId === p.id}
                            title="Descalificar (DQ)"
                            aria-label="Descalificar jugador"
                            style={{
                              background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)',
                              color: '#fca5a5', borderRadius: '6px', padding: '4px 10px',
                              fontSize: '11px', fontWeight: 600,
                              cursor: loadingPlayerId === p.id ? 'not-allowed' : 'pointer',
                              opacity: loadingPlayerId === p.id ? 0.5 : 1,
                              transition: 'opacity 150ms',
                            }}
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
