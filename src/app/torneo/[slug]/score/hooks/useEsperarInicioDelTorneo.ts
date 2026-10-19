// El jugador abre el scorer en el tee, antes de que el organizador inicie el torneo, y ve "todavía no empieza".
// Nadie recarga la página en cancha: mientras espera, se pregunta el estado cada 30 s (y al volver a la pestaña) y,
// cuando deja de ser "no empezó", `onCambio` recarga torneo y roster — que trae las tarjetas recién creadas.
// Sigue preguntando hasta que la recarga funcione (la página deja de pasar `esperando`): si la recarga falla
// por señal, el próximo tick la reintenta en vez de dejar al jugador esperando para siempre.

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { fetchTournamentStatus } from '@/lib/data/tournaments/scoring'
import { motivoSinScores } from '@/golf/tournament-status'

export const INTERVALO_ESPERA_INICIO_MS = 30_000

export function useEsperarInicioDelTorneo({ tournamentId, esperando, onCambio }: {
  tournamentId: string | null | undefined
  /** `true` mientras el torneo cargado está en 'no_empezo'. */
  esperando: boolean
  onCambio: () => void
}) {
  // El callback cambia en cada render de la página; el intervalo no se reinicia por eso.
  const onCambioRef = useRef(onCambio)
  useEffect(() => { onCambioRef.current = onCambio })

  useEffect(() => {
    if (!esperando || !tournamentId) return
    let cancelled = false
    const revisar = async () => {
      if (document.hidden) return
      try {
        const status = await fetchTournamentStatus(createClient(), tournamentId)
        if (cancelled || motivoSinScores(status) === 'no_empezo') return
        onCambioRef.current()
      } catch {
        // Señal floja en cancha: no es un error de la app y el próximo tick reintenta. Reportarlo cada 30 s
        // llenaría el tracker de ruido sin decir nada nuevo.
      }
    }
    const id = setInterval(() => { void revisar() }, INTERVALO_ESPERA_INICIO_MS)
    const alVolver = () => { void revisar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [esperando, tournamentId])
}
