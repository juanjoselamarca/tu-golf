// Cierre de la tarjeta (`finalize_round`) del scorer del organizador.

import { useCallback, useState, type MutableRefObject } from 'react'
import type { EstadoHoyos } from './estado-hoyos'

export interface TarjetaACerrar { roundId: string; playerId: string; nombre: string }
export interface EstadoCierre extends TarjetaACerrar { fase: 'guardando' | 'cerrando'; hoyos: number[] }

interface Args {
  tournamentId: string | null
  store: EstadoHoyos
  reloadRoster: () => Promise<unknown>
  clearSelection: () => void
  selectedIdRef: MutableRefObject<string | null>
  showError: (titulo: string, mensaje: string) => void
  showWarning: (titulo: string, mensaje: string) => void
}

export function useCerrarTarjeta({ tournamentId, reloadRoster, clearSelection, showError, showWarning }: Args) {
  const [estado, setEstado] = useState<EstadoCierre | null>(null)

  const cerrar = useCallback(async (t: TarjetaACerrar) => {
    if (!tournamentId) return
    setEstado({ ...t, fase: 'cerrando', hoyos: [] })
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'finalize_round', tournament_id: tournamentId, round_id: t.roundId }),
    }).catch(() => null)
    setEstado(null)
    const cuerpo: { error?: unknown; code?: unknown } | null = res && !res.ok ? await res.json().catch(() => null) : null
    if (cuerpo?.code === 'round_closed') {
      showWarning('La tarjeta ya estaba cerrada', 'Actualizamos el listado.')
      await reloadRoster()
      clearSelection()
      return
    }
    if (!res?.ok) {
      showError('No se cerró la tarjeta', typeof cuerpo?.error === 'string' ? cuerpo.error : 'Intenta de nuevo.')
      return
    }
    await reloadRoster()
    clearSelection()
  }, [tournamentId, reloadRoster, clearSelection, showError, showWarning])

  return { cerrar, estado }
}
