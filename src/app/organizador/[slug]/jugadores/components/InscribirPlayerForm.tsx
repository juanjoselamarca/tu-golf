'use client'

import { type RefObject, useState } from 'react'
import { inputStyle } from '../styles'
import type { Profile } from '../hooks/useProfileSearch'
import { useEntitlement } from '@/hooks/useEntitlement'
import { UpsellCard } from '@/components/billing/UpsellCard'
import {
  formatearHandicap,
  formatearIndice,
  parsearHandicap,
  PLACEHOLDER_CAMPO_HANDICAP,
} from '@/golf/handicap-index-range'
import { AvisoCampo } from '@/components/ui/AvisoCampo'
import { useAvisoIndiceAlEnviar } from '@/hooks/useAvisoIndiceAlEnviar'

export type InscribirMode = 'search' | 'guest' | 'batch'

/** Al final de la línea: el hándicap (con signo y coma o punto decimal). Tras coma, punto y coma o tab
 *  cualquier número; tras un ESPACIO solo uno con signo o decimal ("Ana +2", "Juan Pérez 18,5"), porque
 *  "Invitado 1" es un nombre, no "Invitado" con hándicap 1. */
const HCP_AL_FINAL = /(?:[,;\t]\s*|\s+(?=[+-]|\d+[.,]\d))([+-]?\d+(?:[.,]\d+)?)$/
/** Separadores sobrantes al final ("Juan;18,5;" de una planilla). */
const SEPARADORES_AL_FINAL = /[\s,;\t]+$/

/** Parsea una línea de texto en {nombre, handicap}.
 *  Acepta "Nombre", "Nombre, 18.4", "Nombre 18,5", "Nombre<TAB>18,5" (Excel chileno),
 *  "Nombre, email@x.com, 18.4" y el plus "Nombre, +2" (−2).
 *  El hándicap se saca del FINAL antes de partir por comas: si no, "18,5" quedaba en 18.
 *  Es opcional; si la línea no termina en un número, queda null. */
export function parseBatchLine(line: string): { name: string; hcp: number | null } | null {
  const trimmed = line.trim().replace(SEPARADORES_AL_FINAL, '')
  if (!trimmed) return null

  const m = HCP_AL_FINAL.exec(trimmed)
  const resto = m ? trimmed.slice(0, m.index) : trimmed
  const name = resto.split(/[,;\t]+/).map(s => s.trim()).find(Boolean)
  if (!name) return null
  return { name, hcp: m ? parsearHandicap(m[1]) : null }
}

interface Props {
  dropdownRef: RefObject<HTMLDivElement | null>
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
  const { allowed: guestAllowed } = useEntitlement('guest-tournament')

  // Handicap es opcional: si está vacío se inscribe con null. Si tiene valor se lee como en el
  // resto de la app ("+2" plus, "18,5" con coma); lo que no es número se avisa, no se pierde.
  // El botón no se apaga por el hándicap: a medio escribir ("+", "-") se avisa en el campo al tocarlo, con foco.
  // El rango depende de lo que guarda el torneo: lo valida quien inscribe.
  const campoGuestHcp = useAvisoIndiceAlEnviar(guestHcp, 'guest-hcp', { opcional: true, rango: null })
  const guestReady = guestName.trim() !== ''

  // Batch state
  const [batchText, setBatchText] = useState('')
  const [batchConfirm, setBatchConfirm] = useState(false)
  const [batchAdding, setBatchAdding] = useState(false)
  const [batchResult, setBatchResult] = useState<{ added: number; total: number } | null>(null)

  const parsedBatch = batchText
    .split('\n')
    .map(parseBatchLine)
    .filter((e): e is { name: string; hcp: number | null } => e !== null)

  // Detectar nombres duplicados (case-insensitive)
  const batchDuplicates: string[] = (() => {
    const counts: Record<string, number> = {}
    for (const entry of parsedBatch) {
      const key = entry.name.toLowerCase().trim()
      counts[key] = (counts[key] ?? 0) + 1
    }
    const dupeKeys = new Set(
      Object.keys(counts).filter((k) => counts[k] > 1),
    )
    return parsedBatch
      .filter((e) => dupeKeys.has(e.name.toLowerCase().trim()))
      .map((e) => e.name)
      .filter((name, i, arr) => arr.indexOf(name) === i)
  })()

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
    minHeight: '44px',
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

      {/* Gate: si el usuario no tiene acceso al guest-tournament, mostrar upsell */}
      {!guestAllowed && (mode === 'guest' || mode === 'batch') ? (
        <UpsellCard
          feature="guest-tournament"
          title="Sistema de invitados"
          description="Inscribe jugadores sin cuenta y agrega varios de una vez"
        />
      ) : mode === 'search' ? (
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
              style={{ ...inputStyle, width: '100%' }}
              onFocus={() => search && setShowResults(true)}
            />
            {selectedProfile && (
              <div style={{ fontSize: '12px', color: 'var(--brand-on-bg)', marginTop: '3px' }}>
                {selectedProfile.name}{selectedProfile.indice != null ? ` — Hcp ${formatearIndice(Number(selectedProfile.indice))}` : ''}
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
                    <div style={{ color: 'var(--text-2)', fontSize: '12px' }}>
                      {p.email}
                      {p.indice != null && <span> · Índice {formatearIndice(Number(p.indice))}</span>}
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
              background: 'var(--brand)',
              color: '#1a1a2e',
              fontWeight: 600,
              fontSize: '14px',
              padding: '10px 20px',
              minHeight: '44px',
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
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>

          {/* Handicap (indice) */}
          <div style={{ flex: '0 1 130px' }}>
            <label htmlFor="guest-hcp" style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Handicap (opcional)</label>
            {/* type="text": un type="number" deja el valor en '' con "+2" (y se inscribía sin
                hándicap sin avisar); inputMode "text" porque el teclado decimal del iPhone no tiene signo. */}
            <input
              id="guest-hcp"
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder={PLACEHOLDER_CAMPO_HANDICAP}
              value={guestHcp}
              onChange={(e) => setGuestHcp(e.target.value)}
              {...campoGuestHcp.propsDelCampo}
              style={{ ...inputStyle, width: '100%' }}
            />
            {campoGuestHcp.aviso != null && <AvisoCampo id={campoGuestHcp.idAviso}>{campoGuestHcp.aviso}</AvisoCampo>}
          </div>

          {/* Button */}
          <button
            type="button"
            onClick={() => { if (campoGuestHcp.validarAlEnviar()) onInscribirGuest() }}
            disabled={loading || !guestReady}
            style={{
              background: 'var(--brand)',
              color: '#1a1a2e',
              fontWeight: 600,
              fontSize: '14px',
              padding: '10px 20px',
              minHeight: '44px',
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
          <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '8px' }}>
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
                Se agregarán <strong>{parsedBatch.length}</strong> jugador{parsedBatch.length !== 1 ? 'es' : ''} como invitados:
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
                      <span style={{ color: 'var(--text-2)', marginLeft: '8px' }}>Hcp {formatearHandicap(entry.hcp)}</span>
                    )}
                    {entry.hcp == null && (
                      <span style={{ color: 'var(--text-2)', marginLeft: '8px', fontStyle: 'italic' }}>sin handicap</span>
                    )}
                  </div>
                ))}
              </div>
              {batchDuplicates.length > 0 && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(251,191,36,0.1)',
                  border: '1px solid rgba(251,191,36,0.3)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#fbbf24',
                  marginBottom: '12px',
                }}>
                  <strong>Atención:</strong> hay {batchDuplicates.length} nombre{batchDuplicates.length !== 1 ? 's' : ''} repetido{batchDuplicates.length !== 1 ? 's' : ''} en la lista: {batchDuplicates.join(', ')}
                </div>
              )}
              <button
                type="button"
                onClick={() => setBatchConfirm(true)}
                style={{
                  background: 'var(--brand)',
                  color: '#070d18',
                  fontWeight: 700,
                  fontSize: '14px',
                  padding: '10px 24px',
                  minHeight: '44px',
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
                  minHeight: '44px',
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
                  minHeight: '44px',
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
              color: 'var(--status-live-fg)',
              fontWeight: 600,
            }}>
              {batchResult.added} de {batchResult.total} jugadores agregados exitosamente
            </div>
          )}

          {parsedBatch.length === 0 && batchText.trim() !== '' && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--error-fg)' }}>
              No se encontraron nombres validos. Escribe un nombre por linea.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
