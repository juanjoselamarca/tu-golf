'use client'

import { useEffect } from 'react'

interface ShareToastProps {
  /** Mostrar el toast. */
  show: boolean
  /** Mensaje. Default "Copiado". */
  message?: string
  /** Se llama cuando el toast se auto-oculta (el caller baja `show`). */
  onDismiss?: () => void
  /** Duración antes de auto-ocultar (ms). Default 1800. */
  durationMs?: number
}

/**
 * Toast mínimo "Copiado" para el sistema de compartir. Presentacional: el caller
 * controla `show` y reacciona a `onDismiss` (auto-ocultado tras `durationMs`).
 * Vive a nivel del trigger (ShareButton) para sobrevivir al cierre del sheet.
 *
 * Siempre-oscuro (paleta vitrina), coherente con el ShareSheet. role=status +
 * aria-live=polite para lectores de pantalla.
 */
export function ShareToast({ show, message = 'Copiado', onDismiss, durationMs = 1800 }: ShareToastProps) {
  useEffect(() => {
    if (!show || !onDismiss) return
    const t = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(t)
  }, [show, onDismiss, durationMs])

  if (!show) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 bottom-8 z-[260] -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg"
      style={{
        background: '#0e1c2f',
        color: '#eef2f8',
        border: '1px solid rgba(196,153,42,0.45)',
      }}
    >
      {message}
    </div>
  )
}
