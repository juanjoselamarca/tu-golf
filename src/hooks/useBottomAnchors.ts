/**
 * useBottomAnchors — qué ocupa el borde inferior de la pantalla AHORA, medido
 * del DOM. Fuente única para todo lo anclado abajo que no puede quedar debajo
 * de otra cosa (avisos, toasts).
 *
 * Anclas:
 *  - la barra inferior fija de Navbar (sólo con sesión): un <nav> fijo pegado
 *    al borde inferior. Navbar.tsx es un archivo protegido sin constante
 *    exportada, así que se detecta por su forma, no se copia su alto.
 *  - cualquier elemento fijo con `data-bottom-anchor` (banner de instalación
 *    de la PWA y los que vengan).
 *
 * Devuelve el alto ocupado desde el borde inferior hasta el tope del ancla más
 * alta (el aviso se apoya sobre ella) y el z-index mayor (el aviso va por
 * encima). Si no hay anclas, null. Se vuelve a medir cuando el DOM cambia (la
 * barra aparece al resolverse la sesión, el banner entra a los 3 s), termina
 * una animación o cambia el viewport.
 */

'use client'

import { useEffect, useState } from 'react'

/** Atributo que marca un elemento fijo anclado al borde inferior. */
export const BOTTOM_ANCHOR_ATTR = 'data-bottom-anchor'

export interface BottomAnchors {
  /** Px desde el borde inferior del viewport hasta el tope del ancla más alta. */
  inset: number
  /** z-index mayor entre las anclas. */
  zIndex: number
}

function isFixedBottomNav(el: Element, cs: CSSStyleDeclaration): boolean {
  return el.tagName === 'NAV' && cs.position === 'fixed' && parseFloat(cs.bottom) === 0
}

export function measureBottomAnchors(root: Document | null = typeof document === 'undefined' ? null : document): BottomAnchors | null {
  if (!root) return null
  const view = root.defaultView
  if (!view) return null
  let best: BottomAnchors | null = null
  for (const el of Array.from(root.querySelectorAll(`nav, [${BOTTOM_ANCHOR_ATTR}]`))) {
    const cs = view.getComputedStyle(el)
    if (!el.hasAttribute(BOTTOM_ANCHOR_ATTR) && !isFixedBottomNav(el, cs)) continue
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const rect = el.getBoundingClientRect()
    if (rect.height <= 0) continue
    const inset = Math.max(0, view.innerHeight - rect.top)
    const z = Number.parseInt(cs.zIndex, 10)
    const zIndex = Number.isFinite(z) ? z : 0
    best = best
      ? { inset: Math.max(best.inset, inset), zIndex: Math.max(best.zIndex, zIndex) }
      : { inset, zIndex }
  }
  return best
}

function same(a: BottomAnchors | null, b: BottomAnchors | null): boolean {
  return a === b || (!!a && !!b && a.inset === b.inset && a.zIndex === b.zIndex)
}

export function useBottomAnchors(): BottomAnchors | null {
  const [anchors, setAnchors] = useState<BottomAnchors | null>(() => measureBottomAnchors())

  useEffect(() => {
    let frame: number | null = null
    const remeasure = () => {
      if (frame != null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        setAnchors(prev => {
          const next = measureBottomAnchors()
          return same(prev, next) ? prev : next
        })
      })
    }
    remeasure()
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(remeasure) : null
    observer?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: [BOTTOM_ANCHOR_ATTR, 'style', 'class'] })
    window.addEventListener('resize', remeasure)
    // El banner entra con una animación: su rect final se conoce al terminar.
    document.addEventListener('animationend', remeasure, true)
    document.addEventListener('transitionend', remeasure, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', remeasure)
      document.removeEventListener('animationend', remeasure, true)
      document.removeEventListener('transitionend', remeasure, true)
      if (frame != null) window.cancelAnimationFrame(frame)
    }
  }, [])

  return anchors
}
