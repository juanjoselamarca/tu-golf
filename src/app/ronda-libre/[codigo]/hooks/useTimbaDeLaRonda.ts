'use client'

import { useEffect, useRef } from 'react'
import { esFormatoPersonalizado } from '@/golf/formats/personalizado'
import { esJuegoConPlata } from '@/golf/formats/juegos-con-plata'
import { esRondaCerrada } from '@/golf/ronda-libre/estado-ronda'
import type { VistaDelJuego } from '@/golf/ronda-libre/juego-de-la-ronda'
import { esVistaDelSkins, type VistaDelSkinsEnElScorer } from '@/golf/ronda-libre/skins-del-scorer'
import { useJuegoDeLaTimba, type EstadoDelJuego } from './useJuegoDeLaTimba'

interface RondaParaLaTimba {
  formato_juego: string | null
  estado: string | null
  ronda_libre_jugadores: readonly { scores: unknown }[]
}

/** Reintento del juego con la ronda cerrada si el pedido falla: 3 s, 6 s, 12 s… hasta 30 s. */
export const REINTENTO_CERRADA_BASE_MS = 3_000
export const REINTENTO_CERRADA_MAX_MS = 30_000
/**
 * Si el pedido responde bien pero con una vista de antes del cierre (sin sesión sale del CDN, que la renueva en
 * segundos), se reintenta a ritmo fijo: la espera creciente es para la falta de señal, no para esto.
 */
export const REINTENTO_CERRADA_VIEJA_MS = 5_000

/**
 * Con la ronda cerrada, el resultado final solo se arma con una vista pedida con la `firma` de ahora (la ronda ya
 * cerrada y sus golpes finales), calculada con la ronda ya cerrada (`vista.rondaCerrada`) y que no venga de un pedido
 * fallido: una vista de antes del cierre (o la última buena tras un error) puede no tener los últimos golpes, y un
 * "Ganó X" con puntos viejos es peor que esperar. La firma sola no basta: sin sesión la vista sale del CDN y puede ser
 * de antes del cierre aunque se haya pedido después. Mientras tanto, cargando (y se reintenta); si el último pedido
 * falló, error (con Reintentar).
 */
export function juegoDeLaRondaCerrada<V extends { rondaCerrada: boolean }>(juego: EstadoDelJuego<V>, firma: string): EstadoDelJuego<V> {
  // Un motivo calculado antes del cierre (CDN) puede ya no ser el de ahora. Sin el campo (respuesta anterior), pasa.
  if (juego.estado === 'sin_juego') return juego.rondaCerrada === false ? { estado: 'cargando' } : juego
  if (juego.estado !== 'ok') return juego
  if (juego.desactualizado) return { estado: 'error' }
  return juego.firma === firma && juego.vista.rondaCerrada ? juego : { estado: 'cargando' }
}

type VistaDeLaRonda = VistaDelJuego | VistaDelSkinsEnElScorer

/**
 * Separa lo que llegó de `GET /juego` según la vista que trae de verdad (`esVistaDelSkins`), no según el formato que
 * la página cree: una Timba nunca recibe la vista de un skins ni al revés (queda cargando).
 */
export function separarJuego(juego: EstadoDelJuego<VistaDeLaRonda>, esSkins: boolean): {
  timba: EstadoDelJuego<VistaDelJuego>
  skins: EstadoDelJuego<VistaDelSkinsEnElScorer>
} {
  const cargando = { estado: 'cargando' } as const
  if (juego.estado !== 'ok') return esSkins ? { timba: cargando, skins: juego } : { timba: juego, skins: cargando }
  const deSkins = esVistaDelSkins(juego.vista)
  if (esSkins && deSkins) return { timba: cargando, skins: { ...juego, vista: juego.vista as VistaDelSkinsEnElScorer } }
  if (!esSkins && !deSkins) return { timba: { ...juego, vista: juego.vista as VistaDelJuego }, skins: cargando }
  return { timba: cargando, skins: cargando }
}

/**
 * El juego de la Timba (o del Skins) en la ronda en vivo, pedido UNA vez para toda la página: lo muestran la pestaña Juego y el
 * resultado final, y "Guardar en mi historial" necesita los retiros (lo anotado desde el retiro no va al historial).
 *
 * - Fuera de una Timba no pide nada y `retiros` es `{}`.
 * - Se vuelve a pedir cuando cambian los golpes, el estado o la sesión; cerrada, no cada 20 s (los puntos ya no cambian).
 * - Cerrada, solo vale una vista fresca (`juegoDeLaRondaCerrada`); sin ella se reintenta solo, con espera creciente.
 * - `retiros` es `null` mientras no se saben (cargando, sin sesión, sin señal, vista vieja con la ronda cerrada): así
 *   no se guarda una tarjeta con golpes que el juego no cuenta. Sin juego armable (`sin_juego`) no hay retiros: `{}`.
 */
export function useTimbaDeLaRonda(codigo: string, ronda: RondaParaLaTimba | null, currentUserId: string | null | undefined): {
  esTimba: boolean
  esSkins: boolean
  juego: EstadoDelJuego
  juegoSkins: EstadoDelJuego<VistaDelSkinsEnElScorer>
  recargar: () => void
  retiros: Readonly<Record<string, number>> | null
} {
  const esTimba = !!ronda && esFormatoPersonalizado(ronda.formato_juego)
  // Timba o Skins: los dos traen su resultado de `GET /juego` (`esJuegoConPlata`).
  const conJuego = !!ronda && esJuegoConPlata(ronda.formato_juego)
  const esSkins = conJuego && !esTimba
  const cerrada = conJuego && esRondaCerrada(ronda?.estado)
  const firma = ronda && conJuego
    ? `${currentUserId ?? ''}:${ronda.estado}:${JSON.stringify(ronda.ronda_libre_jugadores.map(j => j.scores))}`
    : ''
  const { juego: crudo, recargar } = useJuegoDeLaTimba<VistaDeLaRonda>(codigo, {
    activo: conJuego,
    firma,
    intervaloS: cerrada ? 0 : undefined,
    visorSinCuenta: !currentUserId,
  })
  const juego = cerrada ? juegoDeLaRondaCerrada(crudo, firma) : crudo

  // Cerrada y sin vista fresca porque el pedido falló o llegó una vieja: reintenta solo hasta lograrlo
  // (`juegoDeLaRondaCerrada` devuelve el mismo objeto cuando lo acepta). Llegó vieja pero respondió: ritmo fijo.
  const reintentar = cerrada && crudo.estado !== 'cargando' && (crudo.estado === 'error' || juego !== crudo)
  const respondioViejo = reintentar && juego.estado === 'cargando'
  // La espera siguiente se cuenta desde que el pedido anterior TERMINA (con mala señal un pedido dura hasta
  // PLAZO_JUEGO_MS: contarla desde que se lanza encadenaría pedidos). Lograda la vista, el contador vuelve a 0.
  const intento = useRef(0)
  useEffect(() => {
    if (!reintentar) {
      intento.current = 0
      return
    }
    let vivo = true
    let t: ReturnType<typeof setTimeout> | undefined
    const ciclo = () => {
      const espera = respondioViejo
        ? REINTENTO_CERRADA_VIEJA_MS
        : Math.min(REINTENTO_CERRADA_BASE_MS * 2 ** intento.current, REINTENTO_CERRADA_MAX_MS)
      t = setTimeout(async () => {
        intento.current += 1
        await recargar()
        if (vivo) ciclo()
      }, espera)
    }
    ciclo()
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [reintentar, respondioViejo, recargar])

  const retiros = !conJuego
    ? {}
    : juego.estado === 'ok' ? juego.vista.retiros : juego.estado === 'sin_juego' ? {} : null
  const { timba, skins } = separarJuego(juego, esSkins)
  return { esTimba, esSkins, juego: timba, juegoSkins: skins, recargar: () => { void recargar() }, retiros }
}
