'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { captureError } from '@/lib/error-tracking'
import type { MotivoSinJuego, VistaDelJuego } from '@/golf/ronda-libre/juego-de-la-ronda'

/**
 * El juego de una Timba libre, leído SOLO de `GET /api/ronda-libre/[codigo]/juego` (spec, "Para el PR C"): ni el
 * neto ni el hándicap salen de `/live` ni de `/hcp`.
 *
 * - Se vuelve a pedir cuando cambia `firma` (los golpes que anotó el scorer), con un respiro para juntar toques,
 *   y cada `intervaloS` mientras la pantalla está a la vista.
 * - Una respuesta vieja nunca pisa a una más nueva (número de pedido).
 * - Si un pedido falla, se queda con lo último que llegó y lo marca `desactualizado`: los puntos de hace un
 *   momento, avisados, valen más que una pantalla vacía en la cancha.
 */
export type EstadoDelJuego =
  | { estado: 'cargando' }
  /** `pedidaEn`: cuándo se PIDIÓ la vista (ms): lo enviado antes de ese momento ya viene en ella. */
  | { estado: 'ok'; vista: VistaDelJuego; desactualizado: boolean; pedidaEn: number }
  | { estado: 'sin_juego'; motivo: MotivoSinJuego }
  | { estado: 'sin_sesion' }
  | { estado: 'error' }

export const PLAZO_JUEGO_MS = 12_000
export const RESPIRO_JUEGO_MS = 600

export interface JuegoDeLaTimba {
  juego: EstadoDelJuego
  /** Lo último que llegó bien (también si el último pedido falló: va con `desactualizado`). */
  vista: VistaDelJuego | null
  /** Cuándo se pidió `vista` (ms); `null` sin vista. */
  vistaPedidaEn: number | null
  recargar: () => Promise<void>
}

export function useJuegoDeLaTimba(
  codigo: string,
  opciones: { activo: boolean; firma?: string; intervaloS?: number },
): JuegoDeLaTimba {
  const { activo, firma = '', intervaloS = 20 } = opciones
  const [juego, setJuego] = useState<EstadoDelJuego>({ estado: 'cargando' })
  const ultimaVista = useRef<{ vista: VistaDelJuego; pedidaEn: number } | null>(null)
  const pedido = useRef(0)

  const recargar = useCallback(async () => {
    if (!activo) return
    const mio = ++pedido.current
    const pedidaEn = Date.now()
    const control = new AbortController()
    const plazo = setTimeout(() => control.abort(), PLAZO_JUEGO_MS)
    let siguiente: EstadoDelJuego
    try {
      const res = await fetch(`/api/ronda-libre/${encodeURIComponent(codigo)}/juego`, { cache: 'no-store', signal: control.signal })
      if (res.status === 401) siguiente = { estado: 'sin_sesion' }
      else if (!res.ok) {
        if (res.status >= 500 && res.status !== 503) {
          void captureError(new Error(`GET /juego ${res.status}`), { context: 'ronda-libre.juego.leer', level: 'warning', meta: { codigo } })
        }
        siguiente = ultimaVista.current ? { estado: 'ok', ...ultimaVista.current, desactualizado: true } : { estado: 'error' }
      } else {
        const cuerpo = await res.json() as ({ estado: 'ok' } & VistaDelJuego) | { estado: 'sin_juego'; motivo: MotivoSinJuego }
        if (cuerpo.estado === 'sin_juego') siguiente = { estado: 'sin_juego', motivo: cuerpo.motivo }
        else {
          const { estado: _estado, ...vista } = cuerpo
          ultimaVista.current = { vista, pedidaEn }
          siguiente = { estado: 'ok', vista, desactualizado: false, pedidaEn }
        }
      }
    } catch {
      // Sin señal o plazo vencido: no es un error de la app, se reintenta solo.
      siguiente = ultimaVista.current ? { estado: 'ok', ...ultimaVista.current, desactualizado: true } : { estado: 'error' }
    } finally {
      clearTimeout(plazo)
    }
    if (mio === pedido.current) setJuego(siguiente)
  }, [activo, codigo])

  // Al abrir y cada vez que cambian los golpes (con respiro para juntar toques seguidos).
  useEffect(() => {
    if (!activo) return
    const t = setTimeout(() => { void recargar() }, firma ? RESPIRO_JUEGO_MS : 0)
    return () => clearTimeout(t)
  }, [activo, firma, recargar])

  // Lo que anotan otros teléfonos o el cierre de la ronda: cada `intervaloS`, solo con la pantalla a la vista.
  useEffect(() => {
    if (!activo || intervaloS <= 0) return
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void recargar()
    }, intervaloS * 1000)
    return () => clearInterval(id)
  }, [activo, intervaloS, recargar])

  return {
    juego,
    vista: juego.estado === 'ok' ? juego.vista : null,
    vistaPedidaEn: juego.estado === 'ok' ? juego.pedidaEn : null,
    recargar,
  }
}
