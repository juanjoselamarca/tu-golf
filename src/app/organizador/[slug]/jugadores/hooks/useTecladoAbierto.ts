// src/app/organizador/[slug]/jugadores/hooks/useTecladoAbierto.ts
//
// ¿El teclado del teléfono está abierto? En Android/iOS un elemento `fixed` con
// `bottom` sube junto con el teclado: la barra de acciones del organizador
// terminaba tapando todo lo visible mientras se escribía (inbox 16-nov, foto con
// el teclado abierto y solo la barra a la vista). Se aproxima con "hay un campo
// de texto con foco en una pantalla táctil": no depende de `visualViewport`
// (que varía por navegador) y en escritorio nunca esconde nada.

import { useEffect, useState } from 'react'

/** Campos que abren el teclado. Un `select` abre un selector nativo, no el teclado. */
const CAMPO_DE_TEXTO =
  'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]):not([type=range]):not([type=color]), textarea, [contenteditable=""], [contenteditable="true"]'

export function abreTeclado(el: Element | null): boolean {
  return el instanceof HTMLElement && el.matches(CAMPO_DE_TEXTO)
}

function pantallaTactil(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches
}

export function useTecladoAbierto(): boolean {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!pantallaTactil()) return
    const revisar = () => setAbierto(abreTeclado(document.activeElement))
    // focusout llega ANTES de que el foco pase al campo siguiente: se revisa en
    // el próximo tick, cuando `activeElement` ya es el nuevo (o el body).
    let pendiente: ReturnType<typeof setTimeout> | undefined
    const alSalir = () => {
      clearTimeout(pendiente)
      pendiente = setTimeout(revisar, 0)
    }
    document.addEventListener('focusin', revisar)
    document.addEventListener('focusout', alSalir)
    revisar()
    return () => {
      clearTimeout(pendiente)
      document.removeEventListener('focusin', revisar)
      document.removeEventListener('focusout', alSalir)
    }
  }, [])

  return abierto
}
