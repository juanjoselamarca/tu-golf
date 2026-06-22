'use client'

import { useEffect, useState } from 'react'

/**
 * Cuánto del fondo del layout viewport queda tapado por el teclado virtual.
 *
 * En mobile, cuando se abre el teclado, `visualViewport.height` se achica pero
 * `position: fixed; bottom: 0` se ancla al LAYOUT viewport (no al visual) → el
 * input queda DETRÁS del teclado. La diferencia `innerHeight - (vvHeight +
 * vvOffsetTop)` es exactamente el alto tapado; lo usamos para subir el input.
 *
 * Función PURA (sin `window`) para poder testear la aritmética. Clamp a ≥0:
 * sin teclado la diferencia es ~0 (o levemente negativa por redondeo).
 */
export function computeKeyboardInset(
  innerHeight: number,
  vvHeight: number,
  vvOffsetTop: number,
): number {
  return Math.max(0, Math.round(innerHeight - vvHeight - vvOffsetTop))
}

/**
 * Devuelve el alto (px) que el teclado virtual tapa del fondo de la pantalla.
 * 0 cuando no hay teclado (o el navegador no soporta `visualViewport`).
 *
 * E6a: limpia los listeners en unmount (sin leak). Escucha `resize` Y `scroll`
 * del visualViewport porque iOS dispara `scroll` (no `resize`) al abrir teclado.
 */
export function useVisualViewport(): number {
  const [keyboardInset, setKeyboardInset] = useState(0)

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return

    const update = () => {
      setKeyboardInset(computeKeyboardInset(window.innerHeight, vv.height, vv.offsetTop))
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return keyboardInset
}
