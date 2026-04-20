import { useEffect, useState } from 'react'

/**
 * Suscripción reactiva al estado online/offline del navegador.
 * Extraído de src/app/ronda-libre/[codigo]/score/page.tsx (T9 Sprint 1).
 *
 * Sprint 2 usará este hook también en el espectador para degradar
 * realtime → polling cuando se pierde la conexión.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return isOnline
}
