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
  store.suscribir(actualizarAvisoSalida)
  escucharSesion()
  return nuevo
}

function hayPendientes(): boolean {
  for (const { store } of REGISTROS.values()) if (store.pendientesGlobal().length > 0) return true
  return false
}

// ── Aviso al salir: cerrar o recargar la pestaña con hoyos sin guardar en CUALQUIER torneo pregunta antes, también
// desde Jugadores o Salida (el store sigue vivo aunque el scorer no esté montado). El listener existe sólo mientras
// hay pendientes: un `beforeunload` registrado de más le quita a la página el back/forward cache.
function preguntarAlSalir(e: BeforeUnloadEvent) {
  e.preventDefault()
  e.returnValue = ''
}
let avisoSalidaPuesto = false
function actualizarAvisoSalida() {
  if (typeof window === 'undefined') return
  const hay = hayPendientes()
  if (hay === avisoSalidaPuesto) return
  avisoSalidaPuesto = hay
  if (hay) window.addEventListener('beforeunload', preguntarAlSalir)
  else window.removeEventListener('beforeunload', preguntarAlSalir)
}

// ── Cambio de store: los suscriptores (el hook) se enteran al olvidar los registros y toman uno nuevo en ese momento.
let versionRegistros = 0
const oyentesRegistros = new Set<() => void>()
function suscribirRegistros(fn: () => void): () => void {
  oyentesRegistros.add(fn)
  return () => { oyentesRegistros.delete(fn) }
}
const leerVersion = () => versionRegistros

/** Olvida todos los stores (apagados: no envían más) y avisa a los suscriptores para que tomen uno nuevo. */
function olvidarRegistros() {
  for (const { store } of REGISTROS.values()) store.apagar()
  REGISTROS.clear()
  versionRegistros += 1
  actualizarAvisoSalida()
  for (const fn of [...oyentesRegistros]) fn()
}

// ── Sesión: los registros son del usuario que anotó (`uidDueno`). `SIGNED_OUT` NO borra nada: auth-js lo emite también
// cuando el refresh es rechazado, y los envíos siguientes dan 401 → rechazados `sin_sesion`, visibles y sin reenvío
// automático. Volver a entrar con el MISMO usuario los reenvía; entrar con OTRO usuario (aquí o en otra pestaña:
// supabase-js propaga la sesión entre pestañas) los olvida, para que lo de A no salga con la sesión de B.
let uidDueno: string | null = null
let sesionEscuchada = false
function alCambiarSesion(evento: string, uid: string | null) {
  if (evento === 'SIGNED_OUT' || !uid) return
  if (uidDueno && uid !== uidDueno) {
    uidDueno = uid
    olvidarRegistros()
    return
  }
  uidDueno = uid
  if (evento === 'SIGNED_IN') {
    for (const { store } of REGISTROS.values()) store.reintentar({ limpiarRechazo: true, soloMotivo: 'sin_sesion' })
  }
}
function escucharSesion() {
  if (sesionEscuchada || typeof window === 'undefined') return
  sesionEscuchada = true
  try {
    // Callback síncrono (nada de async en un listener de auth).
    createClient().auth.onAuthStateChange((evento, sesion) => alCambiarSesion(evento, sesion?.user?.id ?? null))
  } catch (e) {
    void captureError(e, { context: 'scoring.useEstadoHoyos.auth' })
  }
}

/** Sin torneo todavía no se anota (`editable` lo exige): este store nunca envía. */
const SIN_TORNEO: EstadoHoyos = crearEstadoHoyos({ enviar: () => Promise.resolve({ lectura: 'sin_respuesta' }) })

export function useEstadoHoyos(tournamentId: string | undefined, alConfirmar: OyenteTotales): EstadoHoyos {
  // Re-renderiza al olvidar los registros (otro usuario): `registroDe` crea entonces el store nuevo.
  useSyncExternalStore(suscribirRegistros, leerVersion, leerVersion)
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
