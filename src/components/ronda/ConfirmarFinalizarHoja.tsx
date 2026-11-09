'use client'

import { useEffect, useId, useRef } from 'react'
import { Portal, Z_OVERLAY } from '@/components/ui/Portal'

interface ConfirmarFinalizarHojaProps {
  /** La pregunta: `textoConfirmarFinalizar` (hoyos que se marcan como par, ronda parcial o completa). */
  titulo: string
  onConfirmar: () => void
  onCancelar: () => void
}

/**
 * Confirmación de "Finalizar ronda", la misma en los dos scorers. Queda abierta hasta
 * que la persona decide: antes era el mismo botón armado por 5 segundos, y quien se
 * distraía entre hoyos volvía a verlo desarmado sin saber si la ronda se había cerrado.
 *
 * "Cancelar" va abajo a propósito: cae donde estaba el dedo que abrió la hoja desde la
 * barra inferior, así un doble toque cancela en vez de cerrar la ronda.
 */
export function ConfirmarFinalizarHoja({ titulo, onConfirmar, onCancelar }: ConfirmarFinalizarHojaProps) {
  const tituloId = useId()
  const confirmarRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { confirmarRef.current?.focus() }, [])

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar() }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [onCancelar])

  return (
    <Portal>
      <div
        data-testid="confirmar-finalizar-fondo"
        onClick={onCancelar}
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
          <button
            ref={confirmarRef}
            onClick={onConfirmar}
            style={{
              minHeight: '52px', borderRadius: '12px', border: 'none',
              background: 'var(--brand)', color: 'var(--brand-dark)',
              fontSize: '16px', fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            Finalizar
          </button>
          <button
            onClick={onCancelar}
            style={{
              minHeight: '52px', borderRadius: '12px', border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text)',
              fontSize: '16px', fontWeight: 500, cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </Portal>
  )
}
