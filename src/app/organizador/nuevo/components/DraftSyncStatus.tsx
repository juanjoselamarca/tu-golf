'use client'

// src/app/organizador/nuevo/components/DraftSyncStatus.tsx
//
// Estado del autosave del borrador, en el header:
// - `SyncChip`: una palabra de estado (aria-live, se anuncia al cambiar).
//   Rojo nunca: el rojo queda solo para la fila que pide corregir algo.
// - `SyncProblemRow`: qué hay que corregir y cómo. Acción principal "Ir al
//   campo" (corregir); "Descartar" es secundaria, lleva el conteo y pide
//   confirmación (es destructiva y está al tope, a un pulgar de distancia).
// - `SessionExpiredRow`: la sesión venció; lo escrito está a salvo en el
//   navegador y sale solo al volver a entrar. Salida: "Iniciar sesión".

import { useState } from 'react'
import type { SyncStatus } from '@/lib/draft/store'

export function SyncChip({ status, pendingCount }: { status: SyncStatus; pendingCount: number }) {
  const { label, tone } = chipFor(status, pendingCount)
  const colors = TONES[tone]
  return (
    <div style={{ ...chipStyle, background: colors.bg, color: colors.fg }} aria-live="polite">
      <span style={{ ...chipDotStyle, background: colors.fg }} aria-hidden="true" />
      {label}
    </div>
  )
}

type Tone = 'ok' | 'wait' | 'neutral'

const TONES: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: 'var(--status-live-bg)', fg: 'var(--status-live-fg)' },
  // Esperando algo (red, sesión, guardado en curso): ámbar, no es un error.
  wait: { bg: 'var(--status-open-bg)', fg: 'var(--status-open-fg)' },
  // Hay algo por corregir: el detalle rojo vive en la fila de abajo, no acá.
  neutral: { bg: 'var(--bg)', fg: 'var(--text-secondary)' },
}

function chipFor(status: SyncStatus, pendingCount: number): { label: string; tone: Tone } {
  switch (status) {
    case 'invalid':
    case 'rejected':
      return { label: 'Sin guardar', tone: 'neutral' }
    case 'auth':
      return { label: 'Sesión vencida', tone: 'wait' }
    case 'offline':
      return { label: `Sin conexión · ${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}`, tone: 'wait' }
    case 'syncing':
      return { label: 'Sincronizando…', tone: 'wait' }
    case 'conflict':
      return { label: 'Reconciliando…', tone: 'wait' }
    case 'saved':
      return { label: 'Guardado', tone: 'ok' }
    default:
      return { label: 'Sincronizado', tone: 'ok' }
  }
}

/** Lleva el foco al primer campo inválido; si no hay, al bloque de errores de su sección. */
export function focusFirstInvalidField(): void {
  if (typeof document === 'undefined') return
  const field = document.querySelector<HTMLElement>('[aria-invalid="true"]')
  const target = field ?? document.querySelector<HTMLElement>('[data-section-errors="true"]')
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (field) field.focus({ preventScroll: true })
}

export interface SyncProblemRowProps {
  message: string
  unsavedCount: number
  onDiscard?: () => void
}

export function SyncProblemRow({ message, unsavedCount, onDiscard }: SyncProblemRowProps) {
  const [confirming, setConfirming] = useState(false)
  const cambios = `${unsavedCount} ${unsavedCount === 1 ? 'cambio' : 'cambios'}`

  return (
    <div style={{ ...rowStyle, background: 'var(--error-bg)', color: 'var(--error-fg)' }} role="alert">
      <span style={rowTextStyle}>
        {confirming ? `¿Descartar ${cambios}? Lo que no se guardó se pierde.` : message}
      </span>
      <div style={actionsStyle}>
        {confirming ? (
          <>
            <button
              type="button"
              style={outlineButtonStyle}
              onClick={() => {
                setConfirming(false)
                onDiscard?.()
              }}
            >
              Sí, descartar
            </button>
            <button type="button" style={textButtonStyle} onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button type="button" style={outlineButtonStyle} onClick={focusFirstInvalidField}>
              Ir al campo
            </button>
            {onDiscard && unsavedCount > 0 && (
              <button type="button" style={textButtonStyle} onClick={() => setConfirming(true)}>
                Descartar {cambios}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function SessionExpiredRow({ draftId }: { draftId: string }) {
  const next = `/organizador/nuevo?draft=${encodeURIComponent(draftId)}`
  return (
    <div style={{ ...rowStyle, background: 'var(--status-open-bg)', color: 'var(--status-open-fg)' }} role="alert">
      <span style={rowTextStyle}>
        Tu sesión venció. Lo que cambiaste quedó guardado en este navegador y se enviará al volver a entrar.
      </span>
      <a href={`/login?next=${encodeURIComponent(next)}`} style={{ ...outlineButtonStyle, textDecoration: 'none' }}>
        Iniciar sesión
      </a>
    </div>
  )
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
}

const chipDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
}

const rowStyle: React.CSSProperties = {
  flexBasis: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  padding: '10px 12px',
  borderRadius: 10,
  fontSize: 14,
  lineHeight: 1.4,
}

const rowTextStyle: React.CSSProperties = {
  flex: '1 1 220px',
  minWidth: 0,
}

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
}

const outlineButtonStyle: React.CSSProperties = {
  appearance: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 600,
  padding: '10px 14px',
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid currentColor',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  flexShrink: 0,
}

const textButtonStyle: React.CSSProperties = {
  appearance: 'none',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 500,
  padding: '10px 10px',
  minHeight: 44,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  textDecoration: 'underline',
  cursor: 'pointer',
}
