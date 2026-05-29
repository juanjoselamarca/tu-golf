/**
 * Edición inline de scores hoyo-a-hoyo. Aparece dentro de la card expandida
 * cuando el usuario hace click en "Editar" desde el botón inferior del scorecard.
 *
 * Para edición desde el menú "..." (Editar) la navegación va a
 * /perfil/historial/{id}?edit=1, que renderiza un EditMode separado en
 * la página detalle (full screen).
 */
'use client'

import { useEffect, useState } from 'react'
import { formatOv } from '../lib/helpers'

interface Props {
  initialScores: (number | null)[]
  saving:        boolean
  onSave:        (scores: (number | null)[]) => void
  onCancel:      () => void
}

export function InlineEditScores({ initialScores, saving, onSave, onCancel }: Props) {
  const [editScores, setEditScores] = useState<(number | null)[]>(() => {
    return [...(initialScores ?? [])].concat(Array(18).fill(null)).slice(0, 18)
  })

  useEffect(() => {
    setEditScores([...(initialScores ?? [])].concat(Array(18).fill(null)).slice(0, 18))
  }, [initialScores])

  const handleEditScore = (idx: number, value: string) => {
    const num = value === '' ? null : parseInt(value)
    setEditScores(prev => {
      const next = [...prev]
      next[idx] = (num != null && !isNaN(num) && num >= 1 && num <= 15) ? num : null
      return next
    })
  }

  const filled = editScores.filter((s): s is number => s != null)
  const total  = filled.reduce((a, b) => a + b, 0)

  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid #f0f0f0', paddingTop: '12px' }} onClick={(e) => e.stopPropagation()}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '8px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>Editar scores (1-15)</div>
        {total > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
            Total: <strong style={{ color: 'var(--text)' }}>{total}</strong>{' '}
            <span style={{ color: 'var(--text-3)' }}>· {formatOv(total - (filled.length <= 9 ? 36 : 72))}</span>
          </div>
        )}
      </div>
      {[0, 9].map(offset => (
        <div
          key={offset}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '3px', marginBottom: offset === 0 ? '6px' : '10px' }}
        >
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i + offset} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '8px', color: 'var(--text-3)', marginBottom: '2px' }}>{i + offset + 1}</div>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={editScores[i + offset] ?? ''}
                onChange={(e) => handleEditScore(i + offset, e.target.value)}
                style={{
                  width: '100%', textAlign: 'center',
                  fontSize: '14px', fontWeight: 600,
                  padding: '6px 0',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  outline: 'none',
                  background: 'var(--bg-surface)',
                  color: 'var(--text)',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#c4992a'; e.target.select() }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
              />
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onSave(editScores) }}
          disabled={saving}
          style={{
            flex: 1, padding: '10px',
            background: '#c4992a',
            color: 'var(--brand-dark)',
            fontWeight: 700, fontSize: '14px',
            border: 'none', borderRadius: '8px',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onCancel() }}
          disabled={saving}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            color: 'var(--text-2)',
            fontWeight: 600, fontSize: '14px',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
