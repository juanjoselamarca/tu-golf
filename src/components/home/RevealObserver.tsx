'use client'

import { useEffect } from 'react'

/**
 * Reveal-on-scroll para el landing. Observa una sola vez todos los `.rv` dentro de
 * `.home-mkt` y les agrega `.in` al entrar al viewport (las secciones quedan como
 * Server Components — este es el único cliente que necesitan).
 *
 * Accesibilidad / CERO FALLOS: si el usuario pidió menos movimiento, o si el
 * navegador no soporta IntersectionObserver, revelamos todo de inmediato — nunca
 * dejamos contenido invisible (opacity:0) atrapado.
 */
export default function RevealObserver() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.home-mkt .rv'))
    if (els.length === 0) return

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add('in'))
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.18 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return null
}
