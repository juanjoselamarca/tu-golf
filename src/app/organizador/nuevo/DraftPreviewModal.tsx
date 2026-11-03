'use client'

// src/app/organizador/nuevo/DraftPreviewModal.tsx
//
// Modal full-screen que muestra el leaderboard simulado del torneo.
// Al abrir hace POST /api/torneos/draft/{draftId}/preview.

import { useEffect, useState } from 'react'
import type { AnySimulationResult } from '@/lib/draft/simulators'
import { SimulationView, subtitleStyle } from './components/SimulationView'
import { avisoHcpPctPorJugar } from '@/golf/core/playing-handicap'

export interface DraftPreviewModalProps {
  draftId: string
  open: boolean
  onClose: () => void
  /**
   * % de handicap efectivo del borrador (`hcpPctEfectivo`, lo calcula el
   * editor). Si no es 100 se avisa "Se jugará con handicap al N %": los datos
   * simulados no lo aplican, es para que el organizador vea la regla que
   * eligió antes de publicar.
   */
  hcpPct?: number | null
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; simulation: AnySimulationResult; isSimulation: boolean }
  | { kind: 'unsupported'; message: string }
  | { kind: 'error'; message: string }

export function DraftPreviewModal({ draftId, open, onClose, hcpPct }: DraftPreviewModalProps) {
  const avisoHcpPct = avisoHcpPctPorJugar(hcpPct)
  const [state, setState] = useState<FetchState>({ kind: 'idle' })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setState({ kind: 'loading' })
    fetch(`/api/torneos/draft/${draftId}/preview`, { method: 'POST' })
      .then(async (res) => {
        if (cancelled) return
        if (res.ok) {
          const data = (await res.json()) as {
            ok: true
            simulation: AnySimulationResult
            is_simulation: boolean
          }
          setState({
            kind: 'ok',
            simulation: data.simulation,
            isSimulation: !!data.is_simulation,
          })
        } else if (res.status === 501) {
          let msg = 'Simulador no soportado para este formato aún'
          try {
            const j = (await res.json()) as { error?: string }
            if (j.error) msg = j.error
          } catch {
            /* body no JSON */
          }
          setState({ kind: 'unsupported', message: msg })
        } else {
          let msg = `Error ${res.status}`
          try {
            const j = (await res.json()) as { error?: string }
            if (j.error) msg = j.error
          } catch {
            /* body no JSON */
          }
          setState({ kind: 'error', message: msg })
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Error de red',
        })
      })
    return () => {
      cancelled = true
    }
  }, [open, draftId])

  // ESC para cerrar
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div style={backdropStyle} onClick={onClose} role="dialog" aria-modal="true">
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <h2 style={titleStyle}>Vista previa del torneo</h2>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div style={bodyStyle}>
          {state.kind === 'loading' && <LoadingState />}
          {state.kind === 'unsupported' && <NoticeState title="Sin simulador" message={state.message} />}
          {state.kind === 'error' && <NoticeState title="Error" message={state.message} tone="error" />}
          {state.kind === 'ok' && avisoHcpPct && <p style={subtitleStyle}>{avisoHcpPct}</p>}
          {state.kind === 'ok' && <SimulationView result={state.simulation} />}
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div style={loadingStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {/* Skeleton rows con animate-pulse */}
        <div style={{ width: '100%', maxWidth: 500 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{ width: 24, height: 14, borderRadius: 4, background: 'rgba(0,0,0,0.08)' }} />
              <div style={{ flex: 1, height: 14, borderRadius: 4, background: 'rgba(0,0,0,0.08)' }} />
              <div style={{ width: 40, height: 14, borderRadius: 4, background: 'rgba(0,0,0,0.08)' }} />
            </div>
          ))}
        </div>
        <p style={loadingTextStyle}>Generando vista previa...</p>
      </div>
    </div>
  )
}

function NoticeState({
  title,
  message,
  tone = 'info',
}: {
  title: string
  message: string
  tone?: 'info' | 'error'
}) {
  return (
    <div
      style={{
        ...noticeStyle,
        background: tone === 'error' ? 'var(--error-bg)' : 'rgba(196, 153, 42, 0.08)',
        color: tone === 'error' ? 'var(--error-fg)' : 'var(--brand-on-bg)',
        borderColor: tone === 'error' ? 'var(--error-border)' : 'rgba(196, 153, 42, 0.3)',
      }}
    >
      <strong style={{ display: 'block', marginBottom: 4 }}>{title}</strong>
      {message}
    </div>
  )
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(10, 20, 25, 0.7)',
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  fontFamily: '"DM Sans", sans-serif',
}

const modalStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  borderRadius: 14,
  width: '100%',
  maxWidth: 900,
  maxHeight: '90vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 20px',
  borderBottom: '1px solid var(--border)',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--text-primary)',
}

const closeBtnStyle: React.CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  border: 'none',
  fontSize: 28,
  lineHeight: 1,
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  padding: '0 4px',
}

const bodyStyle: React.CSSProperties = {
  padding: 20,
  overflowY: 'auto',
  flex: '1 1 auto',
}

const loadingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 20px',
}

const loadingTextStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
}

const noticeStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 10,
  border: '1px solid',
  fontSize: 14,
}
