import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Suscripción Supabase Realtime a cambios en ronda_libre_jugadores para
 * una ronda específica (por `codigo`). Dispara `onChange` cuando cualquier
 * jugador inserta/actualiza/borra scores.
 *
 * Sprint 2 C — reemplaza el polling cada 15s del espectador como primary
 * path. El countdown queda como fallback (60s) cuando isConnected=false.
 *
 * Patrón ya probado en src/components/MiniLeaderboard.tsx (en prod desde
 * sprint de en-vivo). Filter por ronda_id no aplicado — Realtime dispara
 * en cualquier cambio de la tabla; el consumer re-fetchea solo su ronda.
 *
 * Ref interna para `onChange`: cambios en la identidad del callback NO
 * reinician la suscripción (costosa en handshake + reconnect).
 *
 * @param codigo  Código corto de la ronda (ej. "X7K2"). Si vacío, no suscribe.
 * @param onChange Callback invocado en cada evento de cambio. No precisa ser estable.
 * @param enabled  Si es false, la suscripción no se crea. Útil para activar
 *                 solo en rol espectador.
 * @returns { isConnected } — true cuando el canal está SUBSCRIBED.
 */
export function useRondaRealtime(
  codigo: string,
  onChange: () => void,
  enabled: boolean = true,
): { isConnected: boolean } {
  const [isConnected, setIsConnected] = useState(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!enabled || !codigo) {
      setIsConnected(false)
      return
    }

    const supabase = createClient()
    const channel = supabase
      .channel(`ronda-${codigo}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ronda_libre_jugadores' },
        () => onChangeRef.current(),
      )
      .subscribe(status => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
      setIsConnected(false)
    }
  }, [codigo, enabled])

  return { isConnected }
}
