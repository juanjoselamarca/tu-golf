import { useEffect, useRef } from 'react'

/**
 * Re-ejecuta `onResume` cuando la pestaña vuelve a ser visible (el usuario
 * volvió de WhatsApp, cambió de app, desbloqueó el teléfono, etc.).
 *
 * Debounce integrado: si el tab fue invisible <2s (swipe accidental, notificación
 * rápida), no dispara. Si fue >2s, asume que el usuario estuvo afuera y conviene
 * refrescar. Esto evita refetches innecesarios por gestos rápidos de navegación.
 *
 * Post-mortem evento 30-ago-2026: el scorer no tenía visibilitychange y se
 * "pegaba" al volver de otra app porque los WebSockets morían en background
 * y múltiples reconexiones simultáneas saturaban el main thread.
 *
 * @param onResume  Callback a ejecutar al volver. No necesita ser estable (ref interna).
 * @param enabled   Desactivar si el componente no está en modo activo.
 */
export function useRefreshOnResume(onResume: () => void, enabled: boolean = true) {
  const callbackRef = useRef(onResume)
  callbackRef.current = onResume
  const hiddenAtRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const handler = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now()
      } else if (document.visibilityState === 'visible') {
        // Solo refrescar si estuvo oculto >2s (evita swipes accidentales)
        const elapsed = Date.now() - hiddenAtRef.current
        if (hiddenAtRef.current > 0 && elapsed > 2000) {
          callbackRef.current()
        }
      }
    }

    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [enabled])
}
