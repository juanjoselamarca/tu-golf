/**
 * BulkDeleteModal — confirmación FUERTE para borrar todas las rondas.
 *
 * Acción destructiva e irreversible sobre data real del usuario, por eso:
 *  - Muestra el conteo exacto de rondas que se van a borrar.
 *  - Requiere marcar un checkbox ("Entiendo que es permanente") para habilitar
 *    el botón rojo. Evita el borrado masivo accidental de un tap.
 *  - Patrón común en apps de golf (The Grint / V-Par): el "borrar todo" vive
 *    detrás de una confirmación deliberada, no un botón suelto.
 */
'use client'

import { useEffect, useRef, useState } from 'react'

export interface BulkDeleteModalProps {
  open:     boolean
  count:    number
  deleting: boolean
  onConfirm: () => void
  onCancel:  () => void
}

export function BulkDeleteModal({ open, count, deleting, onConfirm, onCancel }: BulkDeleteModalProps) {
  const [understood, setUnderstood] = useState(false)
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)

  // Reset del checkbox cada vez que se abre + foco en Cancelar (acción destructiva).
  useEffect(() => {
    if (open) {
      setUnderstood(false)
      requestAnimationFrame(() => cancelBtnRef.current?.focus())
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !deleting) onCancel() }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }
  }, [open, deleting, onCancel])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-delete-title"
      data-testid="historial-bulk-delete-modal"
      onClick={(e) => { if (e.target === e.currentTarget && !deleting) onCancel() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          width: '100%', maxWidth: '440px',
          borderRadius: '16px 16px 0 0',
          padding: '20px 20px 24px',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <div
          aria-hidden
          style={{ width: '40px', height: '4px', background: 'var(--border)', borderRadius: '4px', margin: '0 auto 16px' }}
        />
        <h3
          id="bulk-delete-title"
          style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '18px', fontWeight: 700,
            color: 'var(--text)', margin: '0 0 8px',
          }}
        >
          ¿Eliminar todas tus rondas?
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--text-2)', margin: '0 0 6px', lineHeight: 1.5 }}>
          Vas a borrar <strong style={{ color: '#dc2626' }}>{count} {count === 1 ? 'ronda' : 'rondas'}</strong> de tu historial.
        </p>
        <p style={{ fontSize: '13px', color: 'var(--text-3)', margin: '0 0 16px', lineHeight: 1.5 }}>
          Esta acción es permanente, no se puede deshacer y tu índice se recalculará desde cero.
        </p>

        <label
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '12px', marginBottom: '16px',
            borderRadius: '10px', background: 'rgba(220,38,38,0.06)',
            border: '1px solid rgba(220,38,38,0.2)',
            cursor: deleting ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={understood}
            disabled={deleting}
            onChange={(e) => setUnderstood(e.target.checked)}
            data-testid="historial-bulk-delete-understood"
            style={{ width: '18px', height: '18px', accentColor: '#dc2626', flexShrink: 0 }}
          />
          <span style={{ fontSize: '13px', color: 'var(--text-2)', fontWeight: 600 }}>
            Entiendo que es permanente
          </span>
        </label>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            disabled={deleting}
            data-testid="historial-bulk-delete-cancel"
            style={{
              flex: 1, height: '48px',
              background: 'transparent', color: 'var(--text-2)',
              fontWeight: 600, fontSize: '14px',
              border: '1px solid var(--border)', borderRadius: '10px',
              cursor: deleting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting || !understood}
            data-testid="historial-bulk-delete-confirm"
            style={{
              flex: 1, height: '48px',
              background: (deleting || !understood) ? 'rgba(220,38,38,0.4)' : '#dc2626',
              color: '#ffffff', fontWeight: 700, fontSize: '14px',
              border: 'none', borderRadius: '10px',
              cursor: (deleting || !understood) ? 'not-allowed' : 'pointer',
              transition: 'background 150ms',
            }}
          >
            {deleting ? 'Eliminando…' : `Eliminar ${count}`}
          </button>
        </div>
      </div>
    </div>
  )
}
