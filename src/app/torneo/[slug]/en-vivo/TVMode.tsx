'use client'

// src/app/torneo/[slug]/en-vivo/TVMode.tsx
// Wrapper fullscreen para TV. Autoswitch entre categorias cada 30s.

import { useEffect, useRef } from 'react'

export interface TVModeProps {
  children: React.ReactNode
  categories: Array<{ id: string; name: string }>
  onCategoryAutoswitch: (id: string | null) => void
  onExit: () => void
}

const AUTOSWITCH_INTERVAL_MS = 30_000

export default function TVMode({ children, categories, onCategoryAutoswitch, onExit }: TVModeProps) {
  // Mantenemos onCategoryAutoswitch en un ref para que el efecto no se reinstale en cada render
  // cuando el padre crea un nuevo handler.
  const handlerRef = useRef(onCategoryAutoswitch)
  useEffect(() => {
    handlerRef.current = onCategoryAutoswitch
  }, [onCategoryAutoswitch])

  useEffect(() => {
    if (categories.length === 0) {
      // Si no hay categorias, no rotamos.
      return
    }
    // Empezar mostrando "todas" (null) y rotar por categorias.
    let idx = -1
    const tick = () => {
      idx = idx + 1
      if (idx >= categories.length) {
        idx = -1
      }
      const next = idx === -1 ? null : categories[idx]?.id ?? null
      handlerRef.current(next)
    }

    const intervalId = setInterval(tick, AUTOSWITCH_INTERVAL_MS)
    return () => {
      clearInterval(intervalId)
    }
  }, [categories])

  // Escape sale del TV mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0b0d12',
        color: '#f8fafc',
        fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
        fontSize: '18px',
        overflow: 'auto',
        padding: '32px 48px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            fontSize: '14px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--brand-gold, #c4992a)',
          }}
        >
          TV MODE
        </div>
        <button
          type="button"
          onClick={onExit}
          aria-label="Salir del modo TV"
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '999px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.05)',
            color: '#f8fafc',
            fontSize: '24px',
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: '22px' }}>{children}</div>
    </div>
  )
}
