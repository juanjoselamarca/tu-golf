'use client'

// src/components/tournament-draft/UndoToast.tsx
//
// Toast efímero "Cambio aplicado" con botón Deshacer. Aparece al pie de la
// pantalla (bottom-right desktop, bottom-center mobile) cuando el AssistantPanel
// confirma que el server aplicó un cambio. Auto-dismiss tras `durationMs`
// (default 5000ms).
//
// Diseño:
// - Pill oscuro con texto claro (alto contraste, no ornament).
// - Botón "Deshacer" alineado a la derecha del texto, color brand-on-dark.
// - Animación fade-in desde abajo (200ms), fade-out en el unmount.
// - z-index alto para flotar sobre modales del editor.
// - Sin emojis (regla de diseño premium).

import { useEffect, useRef, useState } from 'react'

export interface UndoToastProps {
  /** Texto principal del toast. Ej: "Aplicado: formato y modo actualizados." */
  message: string
  /** Callback cuando el user clickea "Deshacer". Cierra el toast inmediato. */
  onUndo: () => void
  /** Callback opcional cuando el toast se cierra (por timeout o por undo). */
  onDismiss?: () => void
  /** Duración del toast en ms antes de auto-dismiss. Default 5000. */
  durationMs?: number
  /** Texto del botón. Default "Deshacer". */
  undoLabel?: string
}

const DEFAULT_DURATION_MS = 5000
const ANIMATION_OUT_MS = 180

export function UndoToast({
  message,
  onUndo,
  onDismiss,
  durationMs = DEFAULT_DURATION_MS,
  undoLabel = 'Deshacer',
}: UndoToastProps) {
  // Animación: 'in' al montar, 'out' antes de desaparecer.
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const dismissedRef = useRef(false)
  const timersRef = useRef<{ auto?: number; out?: number }>({})

  // Cierra el toast: dispara animación 'out', luego llama onDismiss.
  const close = (reason: 'auto' | 'undo') => {
    if (dismissedRef.current) return
    dismissedRef.current = true

    // Limpia el timer de auto-dismiss si todavía está pendiente.
    if (timersRef.current.auto) {
      window.clearTimeout(timersRef.current.auto)
      timersRef.current.auto = undefined
    }

    if (reason === 'undo') {
      // El undo se ejecuta de inmediato (no esperamos animación) para
      // que el editor revierta el state YA y el user vea feedback al toque.
      try {
        onUndo()
      } catch (err) {
        // No queremos romper el toast si el undo falla.
        console.error('[UndoToast] onUndo lanzo error:', err)
      }
    }

    setPhase('out')
    timersRef.current.out = window.setTimeout(() => {
      onDismiss?.()
    }, ANIMATION_OUT_MS)
  }

  useEffect(() => {
    // Auto-dismiss después de durationMs.
    timersRef.current.auto = window.setTimeout(() => {
      close('auto')
    }, durationMs)

    return () => {
      if (timersRef.current.auto) window.clearTimeout(timersRef.current.auto)
      if (timersRef.current.out) window.clearTimeout(timersRef.current.out)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs])

  return (
    <>
      <div
        className={`tdraft-undo-toast tdraft-undo-toast--${phase}`}
        role="status"
        aria-live="polite"
      >
        <span className="tdraft-undo-toast__message">{message}</span>
        <button
          type="button"
          className="tdraft-undo-toast__action"
          onClick={() => close('undo')}
          aria-label={`${undoLabel} último cambio`}
        >
          {undoLabel}
        </button>
      </div>
      <style jsx>{`
        .tdraft-undo-toast {
          position: fixed;
          bottom: 20px;
          right: 20px;
          display: inline-flex;
          align-items: center;
          gap: 16px;
          max-width: calc(100vw - 32px);
          padding: 12px 16px;
          border-radius: 10px;
          background-color: #1a1a1a;
          color: #f5f5f5;
          font-family: var(--font-dm-sans);
          font-size: 14px;
          line-height: 1.4;
          box-shadow:
            0 8px 24px rgba(0, 0, 0, 0.18),
            0 2px 6px rgba(0, 0, 0, 0.12);
          z-index: 1000;
          will-change: transform, opacity;
        }
        .tdraft-undo-toast--in {
          animation: tdraft-undo-toast-in 200ms ease-out;
        }
        .tdraft-undo-toast--out {
          animation: tdraft-undo-toast-out 180ms ease-in forwards;
        }
        @keyframes tdraft-undo-toast-in {
          0% {
            opacity: 0;
            transform: translateY(12px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes tdraft-undo-toast-out {
          0% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(8px);
          }
        }
        .tdraft-undo-toast__message {
          flex: 1 1 auto;
          color: #f5f5f5;
        }
        .tdraft-undo-toast__action {
          flex: 0 0 auto;
          background: transparent;
          border: none;
          padding: 4px 8px;
          margin: -4px -4px -4px 0;
          color: var(--brand, #c4992a);
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.02em;
          cursor: pointer;
          border-radius: 6px;
          transition: background-color 120ms ease, color 120ms ease;
        }
        .tdraft-undo-toast__action:hover {
          background-color: rgba(196, 153, 42, 0.16);
          color: #f0c863;
        }
        .tdraft-undo-toast__action:active {
          transform: scale(0.97);
        }
        .tdraft-undo-toast__action:focus-visible {
          outline: 2px solid var(--brand, #c4992a);
          outline-offset: 2px;
        }
        @media (max-width: 640px) {
          .tdraft-undo-toast {
            left: 16px;
            right: 16px;
            bottom: 16px;
            justify-content: space-between;
          }
        }
      `}</style>
    </>
  )
}
