'use client'

import { useEffect, useCallback } from 'react'
import { adminColors, adminFonts } from './admin-tokens'

interface AdminDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  width?: string
  children: React.ReactNode
  footer?: React.ReactNode
}

export default function AdminDrawer({
  open,
  onClose,
  title,
  width = '480px',
  children,
  footer,
}: AdminDrawerProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (open) {
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
          animation: 'adminDrawerFadeIn 200ms ease-out',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width,
          maxWidth: '100vw',
          background: adminColors.bgDeep,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          animation: 'adminDrawerSlideIn 250ms ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: `1px solid ${adminColors.border}`,
            flexShrink: 0,
          }}
        >
          <span style={adminFonts.sectionTitle}>{title}</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: adminColors.gray,
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px 8px',
            }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              borderTop: `1px solid ${adminColors.border}`,
              padding: '16px',
              background: adminColors.bgDeep,
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>

      {/* Responsive + animation styles */}
      <style>{`
        @keyframes adminDrawerSlideIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes adminDrawerFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (max-width: 767px) {
          div[style*="adminDrawerSlideIn"] {
            width: 100vw !important;
          }
        }
      `}</style>
    </>
  )
}
