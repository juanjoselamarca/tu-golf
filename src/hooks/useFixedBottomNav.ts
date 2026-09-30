/**
 * useFixedBottomNav — la barra inferior fija de la app (Navbar, sólo con
 * sesión) tal como está en pantalla: alto ocupado (incluye su zona segura) y
 * z-index. Fuente única para todo lo anclado abajo que no puede quedar debajo
 * de la barra (avisos, toasts).
 *
 * Se MIDE del DOM en vez de copiar "52px + safe-area" y "zIndex 100" de
 * Navbar.tsx (archivo protegido, sin constante exportada): si la barra cambia
 * de alto, o no está (invitado, ruta sin barra, escritorio), lo anclado se
 * acomoda solo. Sin barra devuelve null.
 */

'use client'

import { useEffect, useState } from 'react'

export interface FixedBottomNavMetrics {
  /** Alto en px que ocupa la barra sobre el borde inferior (con su padding de zona segura). */
  height: number
  zIndex: number
}

/** Identifica la barra: un <nav> fijo pegado al borde inferior y visible. */
export function measureFixedBottomNav(root: Document | null = typeof document === 'undefined' ? null : document): FixedBottomNavMetrics | null {
  if (!root) return null
  let best: FixedBottomNavMetrics | null = null
  for (const nav of Array.from(root.querySelectorAll('nav'))) {
    const cs = root.defaultView?.getComputedStyle(nav)
    if (!cs || cs.position !== 'fixed' || parseFloat(cs.bottom) !== 0) continue
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const height = nav.getBoundingClientRect().height
    if (height <= 0) continue
    const zIndex = Number.parseInt(cs.zIndex, 10)
    const metrics = { height, zIndex: Number.isFinite(zIndex) ? zIndex : 0 }
    if (!best || metrics.height > best.height) best = metrics
  }
  return best
}

function sameMetrics(a: FixedBottomNavMetrics | null, b: FixedBottomNavMetrics | null): boolean {
  return a === b || (!!a && !!b && a.height === b.height && a.zIndex === b.zIndex)
}

/**
 * Métrica viva de la barra: se mide al montar y se vuelve a medir cuando el
 * DOM cambia (la barra aparece al resolverse la sesión) o cambia el viewport.
 */
export function useFixedBottomNav(): FixedBottomNavMetrics | null {
  const [metrics, setMetrics] = useState<FixedBottomNavMetrics | null>(() => measureFixedBottomNav())

  useEffect(() => {
    let frame: number | null = null
    const remeasure = () => {
      if (frame != null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        setMetrics(prev => {
          const next = measureFixedBottomNav()
          return sameMetrics(prev, next) ? prev : next
        })
      })
    }
    remeasure()
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(remeasure) : null
    observer?.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', remeasure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', remeasure)
      if (frame != null) window.cancelAnimationFrame(frame)
    }
  }, [])

  return metrics
}
