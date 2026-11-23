'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
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

/** Más que el intervalo de un doble toque y menos de lo que tarda alguien en leer la pregunta. */
export const MS_ANTES_DE_ARMAR = 400

/**
 * Hoja de los scorers: aparece abajo, al alcance del pulgar, sin animación de entrada (en cancha la hoja que
 * se desliza se siente lenta). Fuente única del contenedor para las decisiones que se toman en medio de la
 * ronda: finalizar, retirar a un jugador de la Timba y compartir la ronda.
 *
 * Los botones no reciben toques durante los primeros 400 ms: la hoja aparece bajo el dedo que tocó el botón
 * que la abrió, y el segundo toque de un doble toque caía en lo que hubiera ahí (cerraba la ronda, o el "Sí"
 * de compartir abría la hoja del teléfono). El foco entra a la hoja y vuelve a donde estaba al cerrarla.
 */
export function HojaDelScorer({ titulo, detalle, onCerrar, fondoTestId, children }: HojaDelScorerProps) {
  const tituloId = useId()
  const dialogoRef = useRef<HTMLDivElement>(null)
  const [armada, setArmada] = useState(false)
  // Se captura al renderizar, antes de que un hijo tome el foco en su efecto (los efectos de los hijos
  // corren antes que los de la hoja).
  const [focoPrevio] = useState(() => (typeof document === 'undefined' ? null : document.activeElement))

  useEffect(() => {
    const t = setTimeout(() => setArmada(true), MS_ANTES_DE_ARMAR)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!dialogoRef.current?.contains(document.activeElement)) dialogoRef.current?.focus()
    return () => { if (focoPrevio instanceof HTMLElement && focoPrevio.isConnected) focoPrevio.focus() }
  }, [focoPrevio])

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
          ref={dialogoRef}
          role="dialog"
          tabIndex={-1}
          aria-modal="true"
          aria-labelledby={tituloId}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
            borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '480px',
            padding: '24px 16px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            display: 'flex', flexDirection: 'column', gap: '10px', outline: 'none',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: armada ? 'auto' : 'none' }}>
            {children}
          </div>
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
