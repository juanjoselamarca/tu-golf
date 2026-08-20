'use client'

import { type RefObject, useState } from 'react'
import { inputStyle } from '../styles'
import type { Profile } from '../hooks/useProfileSearch'

export type InscribirMode = 'search' | 'guest' | 'batch'

/** Parsea una línea de texto en {nombre, handicap}.
 *  Acepta "Nombre" o "Nombre, 18.4" o "Nombre, email@x.com, 18.4".
 *  El handicap es opcional; si no se puede parsear como numero, queda null. */
function parseBatchLine(line: string): { name: string; hcp: number | null } | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const parts = trimmed.split(/[,;\t]+/).map(s => s.trim()).filter(Boolean)
  const name = parts[0]
  if (!name) return null

  // Buscar el primer token que sea numerico entre los restantes
  let hcp: number | null = null
  for (let i = 1; i < parts.length; i++) {
    const n = Number(parts[i])
    if (!Number.isNaN(n) && parts[i] !== '') {
      hcp = n
      break
    }
  }
  return { name, hcp }
}

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
  /** Inscripcion masiva: recibe array de {name, hcp} y retorna cuantos se agregaron. */
  onInscribirBatch?: (entries: Array<{ name: string; hcp: number | null }>) => Promise<number>
}

/** Formulario de inscripcion: buscar un perfil existente, agregar un invitado,
 *  o pegar una lista de nombres para inscripcion masiva. */
export function InscribirPlayerForm({
  dropdownRef, search, setSearch, results, showResults, setShowResults,
  selectedProfile, setSelectedProfile, loading, onInscribir,
  mode, setMode, guestName, setGuestName, guestHcp, setGuestHcp, onInscribirGuest,
  onInscribirBatch,
}: Props) {
  const guestHcpValid = guestHcp.trim() !== '' && !Number.isNaN(Number(guestHcp))
  const guestReady = guestName.trim() !== '' && guestHcpValid

  // Batch state
  const [batchText, setBatchText] = useState('')
  const [batchConfirm, setBatchConfirm] = useState(false)
  const [batchAdding, setBatchAdding] = useState(false)
  const [batchResult, setBatchResult] = useState<{ added: number; total: number } | null>(null)

  const parsedBatch = batchText
    .split('\n')
    .map(parseBatchLine)
    .filter((e): e is { name: string; hcp: number | null } => e !== null)

  const handleBatchSubmit = async () => {
    if (!onInscribirBatch || parsedBatch.length === 0) return
    setBatchAdding(true)
    try {
      const added = await onInscribirBatch(parsedBatch)
      setBatchResult({ added, total: parsedBatch.length })
      setBatchText('')
      setBatchConfirm(false)
    } finally {
      setBatchAdding(false)
    }
  }

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

      {/* Toggle: buscar perfil vs invitado vs batch */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', maxWidth: '540px' }}>
        <button type="button" style={tabStyle(mode === 'search')} onClick={() => setMode('search')}>
          Buscar jugador
        </button>
        <button type="button" style={tabStyle(mode === 'guest')} onClick={() => setMode('guest')}>
          Agregar invitado
        </button>
        <button type="button" style={tabStyle(mode === 'batch')} onClick={() => { setMode('batch'); setBatchResult(null) }}>
          Agregar varios
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
                {selectedProfile.name}{selectedProfile.indice != null ? ` — Hcp ${Number(selectedProfile.indice).toFixed(1)}` : ''}
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
                      {p.indice != null && <span> · Indice {p.indice}</span>}
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
      ) : mode === 'guest' ? (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Nombre del invitado */}
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Nombre del invitado</label>
            <input
              type="text"
              placeholder="Ej: Juan Perez"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Handicap (indice) */}
          <div style={{ flex: '0 1 130px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Handicap (indice)</label>
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
      ) : (
        /* Batch mode */
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>
            Pega una lista de nombres (uno por linea)
          </label>
          <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '8px' }}>
            Formato: Nombre o Nombre, Handicap (ej: Juan Perez, 18.4)
          </div>
          <textarea
            value={batchText}
            onChange={(e) => { setBatchText(e.target.value); setBatchConfirm(false); setBatchResult(null) }}
            placeholder={'Juan Perez, 18.4\nMaria Lopez, 12.0\nPedro Gonzalez'}
            rows={6}
            style={{
              ...inputStyle,
              width: '100%',
              resize: 'vertical',
              minHeight: '120px',
              fontFamily: 'monospace',
              fontSize: '13px',
            }}
          />

          {parsedBatch.length > 0 && !batchConfirm && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '8px' }}>
                Se agregaran <strong>{parsedBatch.length}</strong> jugador{parsedBatch.length !== 1 ? 'es' : ''} como invitados:
              </div>
              <div
                style={{
                  background: 'rgba(196,153,42,0.06)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  maxHeight: '150px',
                  overflowY: 'auto',
                  marginBottom: '12px',
                }}
              >
                {parsedBatch.map((entry, i) => (
                  <div key={i} style={{ fontSize: '12px', color: 'var(--text)', padding: '3px 0', borderBottom: i < parsedBatch.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    {entry.name}
                    {entry.hcp != null && (
                      <span style={{ color: 'var(--text-2)', marginLeft: '8px' }}>Hcp {entry.hcp}</span>
                    )}
                    {entry.hcp == null && (
                      <span style={{ color: 'var(--text-2)', marginLeft: '8px', fontStyle: 'italic' }}>sin handicap</span>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setBatchConfirm(true)}
                style={{
                  background: '#c4992a',
                  color: '#1a1a2e',
                  fontWeight: 700,
                  fontSize: '14px',
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Confirmar y agregar {parsedBatch.length} jugador{parsedBatch.length !== 1 ? 'es' : ''}
              </button>
            </div>
          )}

          {batchConfirm && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleBatchSubmit}
                disabled={batchAdding}
                style={{
                  background: '#1a4fd6',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '14px',
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: batchAdding ? 'not-allowed' : 'pointer',
                  opacity: batchAdding ? 0.7 : 1,
                }}
              >
                {batchAdding ? 'Agregando...' : `Agregar ${parsedBatch.length} invitados`}
              </button>
              <button
                type="button"
                onClick={() => setBatchConfirm(false)}
                disabled={batchAdding}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-md)',
                  color: 'var(--text-2)',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          )}

          {batchResult && (
            <div style={{
              marginTop: '12px',
              padding: '10px 14px',
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#22c55e',
              fontWeight: 600,
            }}>
              {batchResult.added} de {batchResult.total} jugadores agregados exitosamente
            </div>
          )}

          {parsedBatch.length === 0 && batchText.trim() !== '' && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#f87171' }}>
              No se encontraron nombres validos. Escribe un nombre por linea.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
