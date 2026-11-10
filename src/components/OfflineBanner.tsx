'use client'

import { useCallback, useEffect, useState } from 'react'
import { contarHoyosPendientes } from '@/lib/ronda/respaldo-local'
import { useConciliarRespaldos } from '@/hooks/useConciliarRespaldos'

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  const [pendientes, setPendientes] = useState(0)
  // Los respaldos de una ronda borrada se limpian y los de una cerrada dejan de contarse;
  // si no, el aviso de "Sincronizando…" quedaba pegado en todas las páginas (PR #763).
  const recontar = useCallback(() => setPendientes(contarHoyosPendientes()), [])
  useConciliarRespaldos(recontar)

  useEffect(() => {
    const tick = () => setPendientes(contarHoyosPendientes())
    const goOffline = () => { setOffline(true); tick() }
    const goOnline = () => { setOffline(false); tick() }

    if (!navigator.onLine) setOffline(true)
    tick()

    // Solo pollear cuando la tab está visible — evita trabajo innecesario
    // cuando el usuario está en otra app (3s × N tabs ocultas = CPU gratis).
    let interval: ReturnType<typeof setInterval> | null = null
    const startPolling = () => { if (!interval) interval = setInterval(tick, 3000) }
    const stopPolling = () => { if (interval) { clearInterval(interval); interval = null } }
    const onVisibility = () => document.hidden ? stopPolling() : startPolling()

    startPolling()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  // Mostrar siempre que esté offline, o cuando haya scores pendientes (aunque vuelva online).
  if (!offline && pendientes === 0) return null

  const mensaje = offline
    ? pendientes > 0
      ? `Sin conexión — ${pendientes} hoyo${pendientes === 1 ? '' : 's'} en cola, se sincronizará al reconectar`
      : 'Sin conexión — Los scores se guardarán cuando vuelvas a tener internet'
    : `Sincronizando ${pendientes} hoyo${pendientes === 1 ? '' : 's'}...`

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: offline ? 'var(--double)' : 'var(--brand)',
        color: '#fff',
        textAlign: 'center',
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}
    >
      {mensaje}
    </div>
  )
}
