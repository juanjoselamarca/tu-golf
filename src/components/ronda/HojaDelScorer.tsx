'use client'

import { useEffect, useId, type ReactNode } from 'react'
import { Portal, Z_OVERLAY } from '@/components/ui/Portal'

interface HojaDelScorerProps {
  /** La pregunta o el título de la hoja. */
  titulo: string
  /** Texto bajo el título (opcional). */
  detalle?: string
  /** Tocar fuera o Escape: la misma salida que el botón de cancelar de la hoja. */
  onCerrar: () => void
  /** `data-testid` del fondo, para los tests que tocan fuera. */
  fondoTestId?: string
  children: ReactNode
}

/**
 * Hoja de los scorers: aparece abajo, al alcance del pulgar, sin animación de entrada (en cancha la hoja que
 * se desliza se siente lenta). Fuente única del contenedor para las decisiones que se toman en medio de la
 * ronda: finalizar, retirar a un jugador de la Timba y compartir la ronda.
 */
export function HojaDelScorer({ titulo, detalle, onCerrar, fondoTestId, children }: HojaDelScorerProps) {
  const tituloId = useId()

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  return (
    <Portal>
      <div
        data-testid={fondoTestId}
        onClick={onCerrar}
        style={{
          position: 'fixed', inset: 0, zIndex: Z_OVERLAY,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={tituloId}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
            borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '480px',
            padding: '24px 16px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            display: 'flex', flexDirection: 'column', gap: '10px',
          }}
        >
          <div id={tituloId} style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', textAlign: 'center', marginBottom: '8px', lineHeight: 1.3 }}>
            {titulo}
          </div>
          {detalle && (
            <p style={{ margin: '-4px 0 8px', fontSize: '15px', lineHeight: 1.45, color: 'var(--text-2)', textAlign: 'center' }}>
              {detalle}
            </p>
          )}
          {children}
        </div>
      </div>
    </Portal>
  )
}

/** Botón de pie de hoja: 52 px de alto, ancho completo. `principal` es el dorado de confirmar. */
export const estiloBotonDeHoja = (principal: boolean) => ({
  minHeight: '52px', borderRadius: '12px',
  border: principal ? 'none' : '1px solid var(--border)',
  background: principal ? 'var(--brand)' : 'transparent',
  color: principal ? 'var(--brand-dark)' : 'var(--text)',
  fontSize: '16px', fontWeight: principal ? 600 : 500,
  cursor: 'pointer', touchAction: 'manipulation' as const,
})
