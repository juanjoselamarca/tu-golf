// React sobre `estado-hoyos`: un store por pantalla del scorer, que sobrevive a cambiar de jugador o de ronda
// (está indexado por ronda) y sigue guardando aunque la pantalla se desmonte. La vista se lee con
// `useSyncExternalStore`: no hay estado de guardado copiado en `useState` ni en refs.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { crearEstadoHoyos, type EstadoHoyos, type Pendiente, type RespuestaSobre, type VistaRonda } from './estado-hoyos'
import { enviarHoyo } from './envio-hoyo'

type Totales = NonNullable<RespuestaSobre['totales']>
const SIN_HOYOS: VistaRonda = Object.freeze({})
const SIN_PENDIENTES: Pendiente[] = []

class Puente {
  private t: string | undefined
  private oyente: ((roundId: string, totales: Totales) => void) | undefined
  constructor(t: string | undefined) { this.t = t }
  torneo() { return this.t }
  fijarTorneo(t: string | undefined) { this.t = t }
  fijarOyente(fn: ((roundId: string, totales: Totales) => void) | undefined) { this.oyente = fn }
  confirmar(roundId: string, totales: Totales) { this.oyente?.(roundId, totales) }
}

export function useEstadoHoyos(
  tournamentId: string | undefined,
  alConfirmar: (roundId: string, totales: Totales) => void,
): EstadoHoyos {
  // Puente fuera del render: el store (creado una vez) lee el torneo y el oyente vigentes al responder.
  const [puente] = useState(() => new Puente(tournamentId))
  const [store] = useState(() => crearEstadoHoyos({
    enviar: (sobre) => {
      const torneo = puente.torneo()
      return torneo ? enviarHoyo(torneo, sobre) : Promise.resolve<RespuestaSobre>({ lectura: 'sin_respuesta' })
    },
    alConfirmar: (roundId, totales) => puente.confirmar(roundId, totales),
  }))
  useEffect(() => {
    puente.fijarTorneo(tournamentId)
  }, [puente, tournamentId])
  useEffect(() => {
    puente.fijarOyente(alConfirmar)
    // Desmontada la pantalla, los guardados en curso terminan igual, pero ya no avisan a nadie.
    return () => puente.fijarOyente(undefined)
  }, [puente, alConfirmar])

  // Volvió la señal o la pestaña: reintenta ya lo que estaba esperando (no reenvía un rechazo).
  useEffect(() => {
    const reintentar = () => store.reintentar()
    const alVolver = () => {
      if (document.visibilityState === 'visible') store.reintentar()
      // Al ocultarse, lo que esperaba los 600 ms de las stats sale ya (el teléfono puede dormir la pestaña).
      else for (const p of store.pendientesGlobal()) store.apurar(p.roundId)
    }
    window.addEventListener('online', reintentar)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.removeEventListener('online', reintentar)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [store])

  return store
}

/** Vista de una ronda: se re-renderiza sólo cuando cambia algo de esa ronda. */
export function useVistaRonda(store: EstadoHoyos, roundId: string | null | undefined): VistaRonda {
  const leer = () => (roundId ? store.vista(roundId) : SIN_HOYOS)
  return useSyncExternalStore(store.suscribir, leer, leer)
}

/** Hoyos sin guardar de todas las rondas (para el chip global y el aviso al salir). */
export function usePendientesGlobal(store: EstadoHoyos): Pendiente[] {
  return useSyncExternalStore(store.suscribir, store.pendientesGlobal, () => SIN_PENDIENTES)
}

/** Ronda sellada mientras se cierra la tarjeta (grilla en solo lectura). */
export function useRondaSellada(store: EstadoHoyos, roundId: string | null | undefined): boolean {
  const leer = () => (roundId ? store.sellada(roundId) : false)
  return useSyncExternalStore(store.suscribir, leer, leer)
}
