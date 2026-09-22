import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Suscripcion Supabase Realtime Broadcast al canal de un torneo.
 * Recibe eventos `score_update` emitidos por el API de scoring.
 *
 * A diferencia de useRondaRealtime (postgres_changes), usa Broadcast
 * porque hole_scores no tiene tournament_id directo, y Broadcast:
 * - Es tournament-scoped por nombre de canal (sin eventos cruzados)
 * - No requiere RLS (espectadores anonimos pueden recibir)
 * - El API de scoring emite el broadcast despues de guardar (Task 4)
 *
 * Debounce de 500ms para manejar rafagas de score updates (ej. al
 * guardar multiples hoyos de golpe o scores simultaneos de varios
 * jugadores).
 *
 * @param tournamentId  UUID del torneo. Si vacio, no suscribe.
 * @param onChange       Callback en cada evento de score. No precisa ser estable.
 * @param enabled        Si false, no suscribe (default true).
 * @returns { isConnected } — true cuando el canal esta SUBSCRIBED.
 */
export function useTorneoRealtime(
  tournamentId: string,
  onChange: () => void,
  enabled = true,
): { isConnected: boolean } {
  const [isConnected, setIsConnected] = useState(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!enabled || !tournamentId) {
      setIsConnected(false)
      return
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const supabase = createClient()
    const channel = supabase
      .channel(`tournament:${tournamentId}`)
      .on('broadcast', { event: 'score_update' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => onChangeRef.current(), 500)
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
      setIsConnected(false)
    }
  }, [tournamentId, enabled])

  return { isConnected }
}
