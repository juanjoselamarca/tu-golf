'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { captureError } from '@/lib/error-tracking'
import type { MotivoSinJuego, VistaDelJuego } from '@/golf/ronda-libre/juego-de-la-ronda'

/**
 * El juego de una Timba libre, leído SOLO de `GET /api/ronda-libre/[codigo]/juego` (spec, "Para el PR C"): ni el
 * neto ni el hándicap salen de `/live` ni de `/hcp`.
 *
 * - Sin sesión (401) se lee el mismo juego de `/juego/publico` (decisión de Juanjo, 17-nov: el link muestra los
 *   puntos sin hándicaps). Esa ruta se cachea en el CDN: se pide sin cookies y sin `no-store` (ver `api-en-vivo.ts`).
 *
 * - Se vuelve a pedir cuando cambia `firma` (los golpes que anotó el scorer), con un respiro para juntar toques,
 *   y cada `intervaloS` mientras la pantalla está a la vista.
 * - Una respuesta vieja nunca pisa a una más nueva (número de pedido).
 * - Si un pedido falla, se queda con lo último que llegó y lo marca `desactualizado`: los puntos de hace un
 *   momento, avisados, valen más que una pantalla vacía en la cancha.
 */
export type EstadoDelJuego =
  | { estado: 'cargando' }
  /**
   * `pedidaEn`: cuándo se PIDIÓ la vista (ms): con sesión, lo enviado antes de ese momento ya viene en ella. `firma`:
   * la `firma` vigente al pedirla. `publica`: vino de `/juego/publico`, que sale del CDN y puede ser de hasta ~40 s
   * antes de pedirla: ni `pedidaEn` ni `firma` prueban que traiga lo último (ver `vistaPedidaEn`, `vista.rondaCerrada`).
   */
  | { estado: 'ok'; vista: VistaDelJuego; desactualizado: boolean; pedidaEn: number; firma: string; publica: boolean }
  | { estado: 'sin_juego'; motivo: MotivoSinJuego }
  | { estado: 'error' }

export const PLAZO_JUEGO_MS = 12_000
export const RESPIRO_JUEGO_MS = 600

export interface JuegoDeLaTimba {
  juego: EstadoDelJuego
  /** Lo último que llegó bien (también si el último pedido falló: va con `desactualizado`). */
  vista: VistaDelJuego | null
  /**
   * Cuándo se pidió `vista` (ms): lo enviado antes ya viene en ella. `null` sin vista o si vino de la ruta pública
   * (cacheada en el CDN, no prueba qué trae): el scorer no da por recibida una marca con ella.
   */
  vistaPedidaEn: number | null
  recargar: () => Promise<void>
}

export function useJuegoDeLaTimba(
  codigo: string,
  opciones: { activo: boolean; firma?: string; intervaloS?: number },
): JuegoDeLaTimba {
  const { activo, firma = '', intervaloS = 20 } = opciones
  const [juego, setJuego] = useState<EstadoDelJuego>({ estado: 'cargando' })
  const ultimaVista = useRef<{ vista: VistaDelJuego; pedidaEn: number; firma: string; publica: boolean } | null>(null)
  const pedido = useRef(0)
  // Ya respondió 401: los pedidos siguientes van directo a la pública (uno por poll, no dos). Se olvida cuando cambia
  // la `firma` (la de la página incluye al usuario: al ingresar se vuelve a probar la privada).
  const sinSesion = useRef(false)
  useEffect(() => { sinSesion.current = false }, [codigo, firma])

  const recargar = useCallback(async () => {
    if (!activo) return
    const mio = ++pedido.current
    const pedidaEn = Date.now()
    const firmaPedida = firma
    const control = new AbortController()
    const plazo = setTimeout(() => control.abort(), PLAZO_JUEGO_MS)
    let siguiente: EstadoDelJuego
    try {
      const base = `/api/ronda-libre/${encodeURIComponent(codigo)}/juego`
      const publica = () => fetch(`${base}/publico`, { credentials: 'omit', signal: control.signal })
      let esPublica = sinSesion.current
      let res = esPublica ? await publica() : await fetch(base, { cache: 'no-store', signal: control.signal })
      if (!esPublica && res.status === 401) {
        sinSesion.current = true
        esPublica = true
        res = await publica()
      }
      if (!res.ok) {
        if (res.status >= 500 && res.status !== 503) {
          void captureError(new Error(`GET /juego ${res.status}`), { context: 'ronda-libre.juego.leer', level: 'warning', meta: { codigo } })
        }
        siguiente = ultimaVista.current ? { estado: 'ok', ...ultimaVista.current, desactualizado: true } : { estado: 'error' }
      } else {
        const cuerpo = await res.json() as ({ estado: 'ok' } & VistaDelJuego) | { estado: 'sin_juego'; motivo: MotivoSinJuego }
        if (cuerpo.estado === 'sin_juego') siguiente = { estado: 'sin_juego', motivo: cuerpo.motivo }
        else {
          const { estado: _estado, ...vista } = cuerpo
          ultimaVista.current = { vista, pedidaEn, firma: firmaPedida, publica: esPublica }
          siguiente = { estado: 'ok', vista, desactualizado: false, pedidaEn, firma: firmaPedida, publica: esPublica }
        }
      }
    } catch {
      // Sin señal o plazo vencido: no es un error de la app, se reintenta solo.
      siguiente = ultimaVista.current ? { estado: 'ok', ...ultimaVista.current, desactualizado: true } : { estado: 'error' }
    } finally {
      clearTimeout(plazo)
    }
    if (mio === pedido.current) setJuego(siguiente)
  }, [activo, codigo, firma])

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
    vistaPedidaEn: juego.estado === 'ok' && !juego.publica ? juego.pedidaEn : null,
    recargar,
  }
}
