// React sobre `estado-hoyos`: UN store por torneo a nivel de MÓDULO, con la misma vida que la secuencia y el id de
// dispositivo (`orden-guardado.ts`). Salir de la pantalla (Jugadores, Salida) y volver reutiliza el mismo store: lo
// pendiente se sigue viendo y no queda un store huérfano reintentando un valor viejo con una secuencia más nueva que
// la de una corrección hecha después (eso pisaría la corrección en la base). Con un solo store por torneo hay un solo
// vuelo por hoyo en toda la pestaña. La vista se lee con `useSyncExternalStore`: nada de estado de guardado en refs.

import { useEffect, useSyncExternalStore } from 'react'
import { crearEstadoHoyos, type EstadoHoyos, type Pendiente, type RespuestaSobre, type VistaRonda } from './estado-hoyos'
import { enviarHoyo } from './envio-hoyo'

type Totales = NonNullable<RespuestaSobre['totales']>
type OyenteTotales = (roundId: string, totales: Totales) => void
const SIN_HOYOS: VistaRonda = Object.freeze({})
const SIN_PENDIENTES: Pendiente[] = []

interface Registro { store: EstadoHoyos; oyentes: Set<OyenteTotales> }
const REGISTROS = new Map<string, Registro>()

function registroDe(tournamentId: string): Registro {
  const existente = REGISTROS.get(tournamentId)
  if (existente) return existente
  const oyentes = new Set<OyenteTotales>()
  const store = crearEstadoHoyos({
    enviar: (sobre) => enviarHoyo(tournamentId, sobre),
    // Desmontada la pantalla, los guardados en curso terminan igual, pero ya no avisan a nadie.
    alConfirmar: (roundId, totales) => { for (const o of [...oyentes]) o(roundId, totales) },
  })
  const nuevo = { store, oyentes }
  REGISTROS.set(tournamentId, nuevo)
  return nuevo
}

/** Sin torneo todavía no se anota (`editable` lo exige): este store nunca envía. */
const SIN_TORNEO: EstadoHoyos = crearEstadoHoyos({ enviar: () => Promise.resolve({ lectura: 'sin_respuesta' }) })

export function useEstadoHoyos(tournamentId: string | undefined, alConfirmar: OyenteTotales): EstadoHoyos {
  const registro = tournamentId ? registroDe(tournamentId) : null
  const store = registro?.store ?? SIN_TORNEO
  useEffect(() => {
    if (!registro) return
    registro.oyentes.add(alConfirmar)
    return () => { registro.oyentes.delete(alConfirmar) }
  }, [registro, alConfirmar])

  // Volvió la señal o la pestaña: reintenta ya lo que estaba esperando (no reenvía un rechazo).
  useEffect(() => {
    const reintentar = () => store.reintentar()
    const alVolver = () => {
      if (document.visibilityState === 'visible') store.reintentar()
      // Al ocultarse, lo que esperaba los 600 ms de las stats sale ya (el teléfono puede dormir la pestaña).
      else for (const p of store.pendientesGlobal()) store.apurar(p.roundId)
    }
    // Cerrar o recargar la pestaña con hoyos sin guardar los pierde (no se guardan entre recargas): el navegador
    // pregunta antes. Se mira el store en el momento, no una copia del render.
    const alSalir = (e: BeforeUnloadEvent) => {
      if (store.pendientesGlobal().length === 0) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('online', reintentar)
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('beforeunload', alSalir)
    return () => {
      window.removeEventListener('online', reintentar)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('beforeunload', alSalir)
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
