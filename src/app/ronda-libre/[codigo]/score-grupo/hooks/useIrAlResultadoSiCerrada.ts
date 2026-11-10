'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * La ronda se cerró en otro dispositivo (el servidor rechazó un envío con P0002): el marcador pasa al
 * resultado, igual que Finalizar cuando la encuentra cerrada. Con Finalizar en curso NO: Finalizar sigue
 * (historial e índice) y navega él; si se detiene (falló el historial, sin servidor), `finalizing` vuelve
 * a false y la redirección salta acá. En la ronda terminada está "Guardar en mi historial" para reintentar.
 */
export function useIrAlResultadoSiCerrada({ rondaCerrada, finalizing, codigo }: {
  rondaCerrada: boolean
  finalizing: boolean
  codigo: string
}): void {
  const router = useRouter()
  useEffect(() => {
    if (rondaCerrada && !finalizing) router.push(`/ronda-libre/${codigo}?finished=true`)
  }, [rondaCerrada, finalizing, router, codigo])
}
