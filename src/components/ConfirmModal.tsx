'use client'

import { useEffect, useRef } from 'react'

export interface ConfirmModalProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning'
}

/**
 * Modal de confirmación branded — reemplaza los `window.confirm()` nativos que
 * no se pueden estilizar y rompen la experiencia premium en mobile (390px).
 *
 * Dos variantes:
 *  - `danger` (default): botón rojo, para acciones destructivas (eliminar, DQ).
 *  - `warning`: botón dorado, para acciones irreversibles no destructivas (iniciar, cerrar).
 *
 * Usa design tokens del proyecto (--brand, --bg-surface, --text, --border, etc.)
 * para funcionar correctamente en light y dark mode.
 */
export function ConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Focus trap: al abrir, foco en el botón de confirmar
  useEffect(() => {
    if (isOpen) confirmRef.current?.focus()
  }, [isOpen])

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const isDanger = variant === 'danger'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      {/* Card */}
      <div
        style={{
          position: 'relative',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '28px 24px 24px',
          maxWidth: '400px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Warning icon */}
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: isDanger
              ? 'rgba(220, 38, 38, 0.12)'
              : 'rgba(196, 153, 42, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={isDanger ? '#dc2626' : 'var(--brand-on-bg)'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        {/* Title */}
        <h3
          id="confirm-modal-title"
          style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--text)',
            textAlign: 'center',
            margin: '0 0 8px',
          }}
        >
          {title}
        </h3>

        {/* Description */}
        <p
          style={{
            fontSize: '14px',
            lineHeight: '1.5',
            color: 'var(--text-2)',
            textAlign: 'center',
            margin: '0 0 24px',
          }}
        >
          {description}
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-2)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 150ms',
            }}
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              background: isDanger ? '#dc2626' : 'var(--brand)',
              color: isDanger ? '#ffffff' : 'var(--brand-dark)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'filter 150ms',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.filter =
                'brightness(1.1)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.filter =
                'brightness(1)'
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
