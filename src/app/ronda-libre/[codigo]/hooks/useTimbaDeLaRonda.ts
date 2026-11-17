'use client'

import { esFormatoPersonalizado } from '@/golf/formats/personalizado'
import { esRondaCerrada } from '@/golf/ronda-libre/estado-ronda'
import { useJuegoDeLaTimba, type EstadoDelJuego } from './useJuegoDeLaTimba'

interface RondaParaLaTimba {
  formato_juego: string | null
  estado: string | null
  ronda_libre_jugadores: readonly { scores: unknown }[]
}

/**
 * El juego de la Timba en la ronda en vivo, pedido UNA vez para toda la página: lo muestran la pestaña Juego y el
 * resultado final, y "Guardar en mi historial" necesita los retiros (lo anotado desde el retiro no va al historial).
 *
 * - Fuera de una Timba no pide nada y `retiros` es `{}`.
 * - Se vuelve a pedir cuando cambian los golpes, el estado o la sesión; cerrada, no cada 20 s (los puntos ya no cambian).
 * - `retiros` es `null` mientras no se saben (cargando, sin sesión, sin señal): así no se guarda una tarjeta con golpes
 *   que el juego no cuenta. Sin juego armable (`sin_juego`) no hay retiros que aplicar: `{}`.
 */
export function useTimbaDeLaRonda(codigo: string, ronda: RondaParaLaTimba | null, currentUserId: string | null | undefined): {
  esTimba: boolean
  juego: EstadoDelJuego
  recargar: () => void
  retiros: Readonly<Record<string, number>> | null
} {
  const esTimba = !!ronda && esFormatoPersonalizado(ronda.formato_juego)
  const firma = ronda && esTimba
    ? `${currentUserId ?? ''}:${ronda.estado}:${JSON.stringify(ronda.ronda_libre_jugadores.map(j => j.scores))}`
    : ''
  const { juego, recargar } = useJuegoDeLaTimba(codigo, {
    activo: esTimba,
    firma,
    intervaloS: esRondaCerrada(ronda?.estado) ? 0 : undefined,
  })
  const retiros = !esTimba
    ? {}
    : juego.estado === 'ok' ? juego.vista.retiros : juego.estado === 'sin_juego' ? {} : null
  return { esTimba, juego, recargar: () => { void recargar() }, retiros }
}
