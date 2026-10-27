'use client'

import { useEffect, type RefObject } from 'react'

const FOCUSABLES = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accesibilidad de un diálogo modal — fuente única (antes vivía inline en ShareSheet):
 *  - al abrir, enfoca el contenedor (Escape funciona sin pintar un anillo de foco
 *    sobre un botón) y al cerrar devuelve el foco a donde estaba;
 *  - Escape llama a `onClose`;
 *  - focus-trap real: con `aria-modal="true"`, Tab no puede escaparse al fondo.
 *
 * El contenedor necesita `tabIndex={-1}`.
 */
export function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLES)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      // Con el foco en el contenedor (recién abierto) o fuera del diálogo, Tab entra por el borde.
      const fuera = active === dialog || !dialog.contains(active)
      if (e.shiftKey && (active === first || fuera)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || fuera)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [dialogRef, open, onClose])
}
