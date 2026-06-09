'use client'

import type { RefObject } from 'react'
import { inputStyle } from '../styles'
import type { Profile } from '../hooks/useProfileSearch'

export type InscribirMode = 'search' | 'guest'

interface Props {
  dropdownRef: RefObject<HTMLDivElement>
  search: string
  setSearch: (v: string) => void
  results: Profile[]
  showResults: boolean
  setShowResults: (v: boolean) => void
  selectedProfile: Profile | null
  setSelectedProfile: (p: Profile | null) => void
  loading: boolean
  onInscribir: () => void
  /** Modo invitado (jugador sin cuenta): nombre + handicap tipeados a mano. */
  mode: InscribirMode
  setMode: (m: InscribirMode) => void
  guestName: string
  setGuestName: (v: string) => void
  guestHcp: string
  setGuestHcp: (v: string) => void
  onInscribirGuest: () => void
}

/** Formulario de inscripción: buscar un perfil existente o agregar un invitado
 *  (jugador sin cuenta, con nombre + handicap tipeados por el organizador). */
export function InscribirPlayerForm({
  dropdownRef, search, setSearch, results, showResults, setShowResults,
  selectedProfile, setSelectedProfile, loading, onInscribir,
  mode, setMode, guestName, setGuestName, guestHcp, setGuestHcp, onInscribirGuest,
}: Props) {
  const guestHcpValid = guestHcp.trim() !== '' && !Number.isNaN(Number(guestHcp))
  const guestReady = guestName.trim() !== '' && guestHcpValid

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 12px',
    minHeight: '40px',
    borderRadius: '8px',
    border: `1px solid ${active ? 'var(--border-md)' : 'var(--border)'}`,
    background: active ? 'rgba(196,153,42,0.12)' : 'transparent',
    color: active ? 'var(--brand-on-bg)' : 'var(--text-2)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  })

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-card)',
        padding: '28px',
        marginBottom: '32px',
      }}
    >
      <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: 'var(--text)', margin: '0 0 16px' }}>
        Inscribir jugador
      </h2>

      {/* Toggle: buscar perfil vs invitado */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', maxWidth: '360px' }}>
        <button type="button" style={tabStyle(mode === 'search')} onClick={() => setMode('search')}>
          Buscar jugador
        </button>
        <button type="button" style={tabStyle(mode === 'guest')} onClick={() => setMode('guest')}>
          Agregar invitado
        </button>
      </div>

      {mode === 'search' ? (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Search */}
          <div ref={dropdownRef} style={{ flex: '1 1 220px', position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Jugador</label>
            <input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={selectedProfile ? selectedProfile.name : search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSelectedProfile(null)
              }}
              style={inputStyle}
              onFocus={() => search && setShowResults(true)}
            />
            {selectedProfile && (
              <div style={{ fontSize: '11px', color: 'var(--brand-on-bg)', marginTop: '3px' }}>
                ✓ {selectedProfile.name}{selectedProfile.indice != null ? ` — Hcp ${Number(selectedProfile.indice).toFixed(1)}` : ''}
              </div>
            )}
            {showResults && results.length > 0 && !selectedProfile && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-md)', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto', zIndex: 50, boxShadow: 'var(--shadow-md)' }}>
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedProfile(p)
                      setSearch(p.name)
                      setShowResults(false)
                    }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,153,42,0.08)')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}
                  >
                    <div style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>{p.name}</div>
                    <div style={{ color: 'var(--text-2)', fontSize: '11px' }}>
                      {p.email}
                      {p.indice != null && <span> · Índice {p.indice}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Button */}
          <button
            type="button"
            onClick={onInscribir}
            disabled={loading || !selectedProfile}
            style={{
              background: '#1a4fd6',
              color: 'white',
              fontWeight: 600,
              fontSize: '14px',
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              cursor: loading || !selectedProfile ? 'not-allowed' : 'pointer',
              opacity: loading || !selectedProfile ? 0.6 : 1,
              alignSelf: 'flex-end',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? '...' : 'Inscribir'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Nombre del invitado */}
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Nombre del invitado</label>
            <input
              type="text"
              placeholder="Ej: Juan Pérez"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Handicap (índice) */}
          <div style={{ flex: '0 1 130px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Hándicap (índice)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="Ej: 18.4"
              value={guestHcp}
              onChange={(e) => setGuestHcp(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Button */}
          <button
            type="button"
            onClick={onInscribirGuest}
            disabled={loading || !guestReady}
            style={{
              background: '#1a4fd6',
              color: 'white',
              fontWeight: 600,
              fontSize: '14px',
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              cursor: loading || !guestReady ? 'not-allowed' : 'pointer',
              opacity: loading || !guestReady ? 0.6 : 1,
              alignSelf: 'flex-end',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? '...' : 'Agregar invitado'}
          </button>
        </div>
      )}
    </div>
  )
}
