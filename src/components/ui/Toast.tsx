'use client'

import { useEffect, useState } from 'react'

export type ToastType = 'error' | 'success' | 'warning' | 'info'

export interface ToastProps {
  type:      ToastType
  title:     string
  message?:  string
  onClose:   () => void
  duration?: number // ms, 0 = no auto-close, default 5000
}

const CFG: Record<ToastType, { bg: string; border: string; icon: string; iconColor: string }> = {
  error:   { bg: 'rgba(220,38,38,0.15)',  border: '#dc2626', icon: '✕', iconColor: '#f87171' },
  success: { bg: 'rgba(22,163,74,0.15)',  border: '#16a34a', icon: '✓', iconColor: '#4ade80' },
  warning: { bg: 'rgba(196,153,42,0.15)', border: '#c4992a', icon: '⚠', iconColor: '#c4992a' },
  info:    { bg: 'rgba(26,79,214,0.15)',  border: '#1a4fd6', icon: 'ℹ', iconColor: '#7a9ef5' },
}

export function Toast({ type, title, message, onClose, duration = 5000 }: ToastProps) {
  const [visible, setVisible] = useState(false)
  const cfg = CFG[type]

  useEffect(() => {
    // Trigger slide-in
    const t1 = setTimeout(() => setVisible(true), 10)

    if (duration > 0) {
      const t2 = setTimeout(() => {
        setVisible(false)
        setTimeout(onClose, 300)
      }, duration)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    return () => clearTimeout(t1)
  }, [duration, onClose])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  return (
    <>
      <style>{`
        @keyframes toast-shrink {
          from { width: 100%; }
          to   { width: 0%;   }
        }
      `}</style>
      <div
        role="alert"
        style={{
          background:           cfg.bg,
          border:               `1px solid ${cfg.border}`,
          borderRadius:         '12px',
          backdropFilter:       'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding:              '16px 20px',
          maxWidth:             '380px',
          width:                '100%',
          position:             'relative',
          overflow:             'hidden',
          boxShadow:            '0 8px 32px rgba(0,0,0,0.45)',
          transform:            visible ? 'translateY(0)' : 'translateY(-20px)',
          opacity:              visible ? 1 : 0,
          transition:           'transform 300ms ease, opacity 300ms ease',
          marginBottom:         '8px',
        }}
      >
        {/* Body */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          {/* Icon */}
          <span style={{ fontSize: '15px', color: cfg.iconColor, flexShrink: 0, fontWeight: 700, lineHeight: '20px' }}>
            {cfg.icon}
          </span>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#edeae4', fontSize: '14px', fontWeight: 600, lineHeight: 1.3, marginBottom: message ? '4px' : 0 }}>
              {title}
            </div>
            {message && (
              <div style={{ color: 'rgba(237,234,228,0.75)', fontSize: '13px', lineHeight: 1.4 }}>
                {message}
              </div>
            )}
          </div>

          {/* Close */}
          <button
            onClick={handleClose}
            aria-label="Cerrar"
            style={{
              background: 'none',
              border:     'none',
              color:      'rgba(237,234,228,0.45)',
              cursor:     'pointer',
              fontSize:   '18px',
              padding:    '0 0 0 6px',
              flexShrink: 0,
              lineHeight:  1,
              transition:  'color 150ms',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = '#edeae4')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,234,228,0.45)')}
          >
            ×
          </button>
        </div>

        {/* Progress bar */}
        {duration > 0 && (
          <div
            style={{
              position:   'absolute',
              bottom:     0,
              left:       0,
              height:     '3px',
              background: cfg.border,
              opacity:    0.55,
              animation:  `toast-shrink ${duration}ms linear forwards`,
            }}
          />
        )}
      </div>
    </>
  )
}
