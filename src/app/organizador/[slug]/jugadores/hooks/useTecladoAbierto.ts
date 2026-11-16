// src/app/organizador/[slug]/jugadores/hooks/useTecladoAbierto.ts
//
// ¿El teclado del teléfono está abierto? En Android/iOS un elemento `fixed` con
// `bottom` sube junto con el teclado: la barra de acciones del organizador
// terminaba tapando todo lo visible mientras se escribía (inbox 16-nov, foto con
// el teclado abierto y solo la barra a la vista).
//
// Dos señales, las dos necesarias:
//  1. Un campo de texto con foco (en pantalla táctil; en escritorio nunca).
//  2. Si el navegador expone `visualViewport`: el viewport visible se achicó más
//     de UMBRAL_PX respecto del más alto visto. Sin esta segunda señal la barra
//     quedaba escondida al cerrar el teclado con "atrás" en Android (el campo
//     conserva el foco) o si el campo con foco se desmontaba: el organizador
//     perdía "Iniciar torneo" sin pista. Sin `visualViewport` (navegadores
//     viejos) basta la primera.

import { useEffect, useState } from 'react'

/** Campos que abren el teclado. Un `select` abre un selector nativo, no el teclado. */
const CAMPO_DE_TEXTO =
  'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]):not([type=range]):not([type=color]), textarea, [contenteditable=""], [contenteditable="true"]'

/** Lo que el viewport tiene que achicarse para contarlo como teclado (la barra de
 *  direcciones que se esconde al hacer scroll mueve ~60 px; un teclado, >250). */
export const UMBRAL_PX = 150

export function abreTeclado(el: Element | null): boolean {
  return el instanceof HTMLElement && el.isConnected && el.matches(CAMPO_DE_TEXTO)
}

function pantallaTactil(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches
}

export function useTecladoAbierto(): boolean {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!pantallaTactil()) return
    const vv = window.visualViewport ?? null
    // El alto "sin teclado": el mayor visto (se actualiza al girar el teléfono).
    let alturaBase = vv ? Math.max(vv.height, window.innerHeight) : 0

    const revisar = () => {
      const campo = abreTeclado(document.activeElement)
      if (!vv) { setAbierto(campo); return }
      alturaBase = Math.max(alturaBase, vv.height)
      setAbierto(campo && alturaBase - vv.height > UMBRAL_PX)
    }
    const alGirar = () => {
      // Al girar cambia el alto de referencia: se reinicia con el actual.
      alturaBase = vv ? vv.height : 0
      revisar()
    }
    // focusout llega ANTES de que el foco pase al campo siguiente: se revisa en
    // el próximo tick, cuando `activeElement` ya es el nuevo (o el body).
    let pendiente: ReturnType<typeof setTimeout> | undefined
    const alSalir = () => {
      clearTimeout(pendiente)
      pendiente = setTimeout(revisar, 0)
    }
    document.addEventListener('focusin', revisar)
    document.addEventListener('focusout', alSalir)
    vv?.addEventListener('resize', revisar)
    window.addEventListener('orientationchange', alGirar)
    revisar()
    return () => {
      clearTimeout(pendiente)
      document.removeEventListener('focusin', revisar)
      document.removeEventListener('focusout', alSalir)
      vv?.removeEventListener('resize', revisar)
      window.removeEventListener('orientationchange', alGirar)
    }
  }, [])

  return abierto
}
