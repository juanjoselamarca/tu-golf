'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Portal canónico a `document.body` (fuente única: no re-implementar
 * `createPortal` + `mounted` a mano en cada modal).
 *
 * Para qué: todo overlay `position: fixed` (sheet, modal, toast) debe anclarse
 * al VIEWPORT. Si un ancestro tiene `transform`, `filter`, `perspective`,
 * `contain` o `will-change: transform`, ese ancestro pasa a ser el containing
 * block del `fixed` y el sheet con `bottom: 0` se ancla al fondo de la página
 * en vez de la pantalla (incidente 02-oct-2026: `main { animation: pageIn
 * ... forwards }` dejaba un transform permanente). Montando en `body` el
 * overlay queda fuera de cualquier ancestro así, hoy y a futuro.
 *
 * SSR / hidratación: en el servidor y durante la hidratación no renderiza nada
 * (no existe `document`); en el cliente monta en el mismo commit que el resto
 * cuando el overlay se abre después de hidratar (caso normal de un modal), sin
 * frame vacío. Los eventos de React siguen burbujeando por el árbol de React,
 * no por el DOM, así que `onClick` del padre y el contexto siguen funcionando.
 *
 * El tema (`data-theme`) vive en `<html>`, así que el contenido portaleado
 * hereda los tokens igual que antes.
 */
const noopSubscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

export function Portal({ children }: { children: ReactNode }) {
  const canPortal = useSyncExternalStore(noopSubscribe, getClientSnapshot, getServerSnapshot)
  if (!canPortal) return null
  return createPortal(children, document.body)
}
