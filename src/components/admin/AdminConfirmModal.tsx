'use client'

import { useState, useEffect, useCallback } from 'react'
import { adminColors, adminFonts } from './admin-tokens'

interface AdminConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  loading?: boolean
  variant?: 'danger' | 'warning'
}

export default function AdminConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'ELIMINAR',
  loading = false,
  variant = 'danger',
}: AdminConfirmModalProps) {
  const [input, setInput] = useState('')

  const matched = input === confirmText

  const accentColor = variant === 'danger' ? adminColors.red : adminColors.yellow
  const accentDim = variant === 'danger' ? adminColors.redDim : adminColors.yellowDim

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (open) {
      setInput('')
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          background: adminColors.card,
          border: `1px solid ${adminColors.border}`,
          borderRadius: '12px',
          padding: '28px',
          width: '420px',
          maxWidth: 'calc(100vw - 32px)',
          animation: 'adminModalFadeIn 200ms ease-out',
        }}
      >
        {/* Title */}
        <h3 style={{ ...adminFonts.sectionTitle, margin: '0 0 12px' }}>{title}</h3>

        {/* Message */}
        <p style={{ ...adminFonts.body, color: adminColors.gray, margin: '0 0 20px', lineHeight: 1.5 }}>
          {message}
        </p>

        {/* Confirmation input */}
        <label
          style={{
            ...adminFonts.label,
            display: 'block',
            marginBottom: '8px',
          }}
        >
          Escribe <span style={{ color: accentColor, fontWeight: 700 }}>{confirmText}</span> para confirmar
        </label>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={confirmText}
          autoFocus
          style={{
            width: '100%',
            padding: '10px 12px',
            background: adminColors.bgDeep,
            border: `1px solid ${matched ? accentColor : adminColors.border}`,
            borderRadius: '8px',
            color: adminColors.ivory,
            fontFamily: "'DM Mono', monospace",
            fontSize: '0.875rem',
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: '24px',
          }}
        />

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: `1px solid ${adminColors.border}`,
              background: 'transparent',
              color: adminColors.gray,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!matched || loading}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: matched ? accentColor : accentDim,
              color: matched ? '#fff' : adminColors.grayDim,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: matched && !loading ? 'pointer' : 'not-allowed',
              opacity: loading ? 0.7 : 1,
              minWidth: '100px',
            }}
          >
            {loading ? '...' : 'Confirmar'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes adminModalFadeIn {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </>
  )
}
