// React sobre `estado-hoyos`: UN store por torneo a nivel de MÓDULO, con la misma vida que la secuencia y el id de
// dispositivo (`orden-guardado.ts`). Salir de la pantalla (Jugadores, Salida) y volver reutiliza el mismo store: lo
// pendiente se sigue viendo y no queda un store huérfano reintentando un valor viejo con una secuencia más nueva que
// la de una corrección hecha después (eso pisaría la corrección en la base). Con un solo store por torneo hay un solo
// vuelo por hoyo en toda la pestaña. La vista se lee con `useSyncExternalStore`: nada de estado de guardado en refs.

import { useEffect, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase'
import { crearEstadoHoyos, type EstadoHoyos, type Pendiente, type RespuestaSobre, type VistaRonda } from './estado-hoyos'
import { enviarHoyo } from './envio-hoyo'
import { captureError } from '@/lib/error-tracking'

type Totales = NonNullable<RespuestaSobre['totales']>
/** Totales confirmados de una ronda; `null` = hay que releerlos de la base (respuestas fuera de orden). */
type OyenteTotales = (roundId: string, totales: Totales | null) => void
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
    releerTotales: (roundId) => { for (const o of [...oyentes]) o(roundId, null) },
  })
  const nuevo = { store, oyentes }
  REGISTROS.set(tournamentId, nuevo)
  instalarGlobales()
  return nuevo
}

function hayPendientes(): boolean {
  for (const { store } of REGISTROS.values()) if (store.pendientesGlobal().length > 0) return true
  return false
}

/** Al cerrar la sesión se apagan y se olvidan todos los stores (los pendientes eran del usuario que salió). */
export function olvidarStoresDeLaSesion() {
  for (const { store } of REGISTROS.values()) store.apagar()
  REGISTROS.clear()
}

let globalesInstalados = false
/**
 * Una vez por página, con el primer store: (1) cerrar o recargar la pestaña con hoyos sin guardar en CUALQUIER
 * torneo pregunta antes, también desde Jugadores o Salida (el store sigue vivo y reintentando aunque el scorer no
 * esté montado); (2) un cierre de sesión sin recarga (sesión vencida, cerró en otra pestaña) apaga los stores, para
 * que un reintento no salga con la sesión del siguiente usuario. Los cierres de sesión de la app recargan la página.
 */
function instalarGlobales() {
  if (globalesInstalados || typeof window === 'undefined') return
  globalesInstalados = true
  window.addEventListener('beforeunload', (e) => {
    if (!hayPendientes()) return
    e.preventDefault()
    e.returnValue = ''
  })
  try {
    // Callback síncrono (nada de async en un listener de auth).
    createClient().auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') olvidarStoresDeLaSesion()
    })
  } catch (e) {
    void captureError(e, { context: 'scoring.useEstadoHoyos.auth' })
  }
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
