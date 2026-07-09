'use client'

import { useState } from 'react'
import { inputStyle } from '../styles'
import { useCupo } from '../hooks/useCupo'

interface Props {
  slug: string
  initialMax: number | null
  /** Inscritos que ocupan cupo (status='approved'). */
  approvedCount: number
}

/**
 * Cupo del torneo: muestra "inscritos / cupo" y deja al organizador AMPLIARLO
 * (política "bloquear + ampliar"). La validación real (no bajar por debajo de
 * los inscritos) vive en el backend; acá sólo se refleja el resultado.
 */
export function CupoSection({ slug, initialMax, approvedCount }: Props) {
  const { maxPlayers, saving, save } = useCupo({ slug, initialMax })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(maxPlayers != null ? String(maxPlayers) : '')

  const full = maxPlayers != null && approvedCount >= maxPlayers

  const openEditor = () => {
    setDraft(maxPlayers != null ? String(maxPlayers) : '')
    setEditing(true)
  }

  const submit = async () => {
    const trimmed = draft.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    if (value !== null && (!Number.isInteger(value) || value < 1)) return
    const ok = await save(value)
    if (ok) setEditing(false)
  }

  const draftValid =
    draft.trim() === '' || (Number.isInteger(Number(draft)) && Number(draft) >= 1)

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${full ? 'var(--border-md)' : 'var(--border)'}`,
        borderRadius: '16px',
        boxShadow: 'var(--shadow-card)',
        padding: '20px 24px',
        marginBottom: '20px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}
    >
      <div>
        <div style={{ fontSize: '12px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
          Cupo del torneo
        </div>
        <div style={{ fontSize: '18px', color: 'var(--text)', fontWeight: 600 }}>
          {approvedCount} {approvedCount === 1 ? 'inscrito' : 'inscritos'}
          {maxPlayers != null ? (
            <span style={{ color: 'var(--text-2)', fontWeight: 500 }}> {' / '} cupo {maxPlayers}</span>
          ) : (
            <span style={{ color: 'var(--text-2)', fontWeight: 500 }}> {' · '} sin tope</span>
          )}
        </div>
        {full && (
          <div style={{ fontSize: '12px', color: 'var(--brand-on-bg)', marginTop: '4px' }}>
            Cupo lleno — amplíalo para inscribir más jugadores.
          </div>
        )}
      </div>

      {!editing ? (
        <button
          type="button"
          onClick={openEditor}
          style={{
            background: 'transparent',
            color: 'var(--brand-on-bg)',
            fontWeight: 600,
            fontSize: '13px',
            padding: '9px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border-md)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {maxPlayers != null ? 'Editar cupo' : 'Fijar cupo'}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="Sin tope"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ ...inputStyle, width: '110px' }}
            aria-label="Cupo máximo"
          />
          <button
            type="button"
            onClick={submit}
            disabled={saving || !draftValid}
            style={{
              background: '#1a4fd6',
              color: 'white',
              fontWeight: 600,
              fontSize: '13px',
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: saving || !draftValid ? 'not-allowed' : 'pointer',
              opacity: saving || !draftValid ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {saving ? '...' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            style={{
              background: 'transparent',
              color: 'var(--text-2)',
              fontWeight: 600,
              fontSize: '13px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
