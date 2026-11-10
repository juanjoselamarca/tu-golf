'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Portal, Z_OVERLAY } from '@/components/ui/Portal'

interface ConfirmarFinalizarHojaProps {
  /** La pregunta: `textoConfirmarFinalizar` (hoyos que se marcan como par, o tarjeta completa). */
  titulo: string
  onConfirmar: () => void
  onCancelar: () => void
}

/** Más que el intervalo de un doble toque y menos de lo que tarda alguien en leer la pregunta. */
export const MS_ANTES_DE_ARMAR = 400

/**
 * Confirmación de "Finalizar ronda", la misma en los dos scorers. Queda abierta hasta
 * que la persona decide: antes era el mismo botón armado por 5 segundos, y quien se
 * distraía entre hoyos volvía a verlo desarmado sin saber si la ronda se había cerrado.
 *
 * "Finalizar" no recibe toques durante los primeros 400 ms: la hoja aparece bajo el dedo
 * que tocó "Finalizar ronda" y, según lo alta que esté la barra (sube si debajo está
 * "Descartar ronda"), el segundo toque de un doble toque caía justo en él y cerraba la ronda.
 */
export function ConfirmarFinalizarHoja({ titulo, onConfirmar, onCancelar }: ConfirmarFinalizarHojaProps) {
  const tituloId = useId()
  const confirmarRef = useRef<HTMLButtonElement>(null)
  const [armada, setArmada] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setArmada(true), MS_ANTES_DE_ARMAR)
    return () => clearTimeout(t)
  }, [])

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
              pointerEvents: armada ? 'auto' : 'none',
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
