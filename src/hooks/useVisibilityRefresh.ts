import { useEffect, useRef } from 'react'

/**
 * Ejecuta `onVisible` cada vez que la pestaña/app vuelve al primer plano.
 * Útil para refrescar datos después de screen sleep o tab switch.
 */
export function useVisibilityRefresh(onVisible: () => void, enabled = true) {
  const ref = useRef(onVisible)
  ref.current = onVisible

  useEffect(() => {
    if (!enabled) return
    function handler() {
      if (document.visibilityState === 'visible') {
        ref.current()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [enabled])
}
