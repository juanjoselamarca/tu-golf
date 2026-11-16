'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { Portal, Z_OVERLAY, Z_OVERLAY_BACKDROP } from './Portal'

/** Arrastre hacia abajo (px) desde el que soltar cierra la hoja. */
export const UMBRAL_CIERRE_ARRASTRE = 80

interface Props {
  abierto: boolean
  onCerrar: () => void
  /** Nombre accesible del diálogo (lo lee el lector de pantalla al abrir). */
  etiqueta: string
  children: ReactNode
}

/**
 * Hoja inferior modal (fuente única para el patrón "bottom sheet" del asistente). Se cierra tocando fuera,
 * con Escape o deslizándola hacia abajo; el contenido decide si además trae un botón Cerrar. Montada en `body`
 * (`Portal`) para anclarse al viewport. Trampa de foco real (`useDialogFocus`): el foco entra al abrir, Tab no
 * se escapa al fondo y al cerrar vuelve a quien la abrió.
 */
export function BottomSheet({ abierto, onCerrar, etiqueta, children }: Props) {
  const hoja = useRef<HTMLDivElement>(null)
  const inicioY = useRef<number | null>(null)
  const [arrastre, setArrastre] = useState(0)
  // El padre suele pasar una flecha nueva en cada render: con ella en las dependencias de `useDialogFocus`, el
  // foco saldría y volvería a entrar a la hoja en cada render. Se pasa una función estable que lee la última.
  const cerrar = useRef(onCerrar)
  useEffect(() => { cerrar.current = onCerrar }, [onCerrar])
  const cerrarEstable = useCallback(() => cerrar.current(), [])

  // Foco (fuente única `useDialogFocus`): entra a la hoja al abrir, Tab y Shift+Tab ciclan dentro, Escape cierra
  // y al cerrar vuelve a quien la abrió.
  useDialogFocus(hoja, abierto, cerrarEstable)

  useEffect(() => {
    if (!abierto) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [abierto])

  if (!abierto) return null

  const soltar = () => {
    if (inicioY.current != null && arrastre > UMBRAL_CIERRE_ARRASTRE) onCerrar()
    inicioY.current = null
    setArrastre(0)
  }

  return (
    <Portal>
      <div
        data-testid="bottom-sheet-fondo"
        aria-hidden="true"
        onClick={onCerrar}
        style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: Z_OVERLAY_BACKDROP }}
      />
      <div
        ref={hoja}
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        tabIndex={-1}
        // Deslizar hacia abajo cierra, solo con la hoja arriba del todo: si tiene scroll, primero scrollea.
        onTouchStart={e => { inicioY.current = (hoja.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null }}
        onTouchMove={e => { if (inicioY.current != null) setArrastre(Math.max(0, e.touches[0].clientY - inicioY.current)) }}
        onTouchEnd={soltar}
        onTouchCancel={() => { inicioY.current = null; setArrastre(0) }}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: Z_OVERLAY,
          maxWidth: '600px', margin: '0 auto', maxHeight: '88dvh', overflowY: 'auto',
          background: 'var(--bg-surface)', color: 'var(--text)',
          borderRadius: '20px 20px 0 0', padding: '12px 20px calc(24px + env(safe-area-inset-bottom))',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.12)', outline: 'none',
          transform: arrastre > 0 ? `translateY(${arrastre}px)` : undefined,
          transition: arrastre > 0 ? 'none' : 'transform 0.2s ease-out',
          overscrollBehavior: 'contain',
        }}
      >
        <div aria-hidden="true" style={{ width: '40px', height: '4px', borderRadius: '2px', background: 'var(--border)', margin: '0 auto 12px' }} />
        {children}
      </div>
    </Portal>
  )
}
