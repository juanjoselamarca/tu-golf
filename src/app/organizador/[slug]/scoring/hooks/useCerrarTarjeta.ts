// Cierre de la tarjeta (`finalize_round`) del scorer del organizador.
//
// La tarjeta no se cierra con golpes sin guardar: se sella (no se edita más), se apuran los envíos y se espera a
// que la ronda quede limpia (hasta `PLAZO_CIERRE_MS`). Si quedan hoyos sin guardar, no se cierra y se dice cuáles.
// El cierre va a la ronda capturada en el toque, aunque el organizador abra otro jugador mientras tanto.

import { useCallback, useRef, useState, type MutableRefObject } from 'react'
import { captureError } from '@/lib/error-tracking'
import { fetchJsonConPlazo } from '@/lib/red/fetch-json-con-plazo'
import { PLAZO_CERRAR_TARJETA_MS } from '@/lib/red/plazos'
import { ESPERAS_REINTENTO_MS, PLAZO_CIERRE_MS, type EstadoHoyos } from './estado-hoyos'

export interface TarjetaACerrar { roundId: string; playerId: string; nombre: string }
export interface EstadoCierre extends TarjetaACerrar { fase: 'guardando' | 'cerrando'; hoyos: number[] }

/** Intentos de `finalize_round` cuando no hay respuesta (corte, sin señal, 5xx). Un 4xx no se reintenta. */
export const INTENTOS_CIERRE = 3

const esperarMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface Args {
  tournamentId: string | null
  store: EstadoHoyos
  reloadRoster: () => Promise<unknown>
  clearSelection: () => void
  selectedIdRef: MutableRefObject<string | null>
  showError: (titulo: string, mensaje: string) => void
  showWarning: (titulo: string, mensaje: string) => void
  /** Sólo tests: la espera entre intentos. */
  esperar?: (ms: number) => Promise<void>
}

type Final = { tipo: 'ok' } | { tipo: 'ya_cerrada' } | { tipo: 'rechazo'; mensaje: string | null } | { tipo: 'sin_respuesta' }

async function pedirCierre(tournamentId: string, roundId: string): Promise<Final> {
  try {
    const { res, json } = await fetchJsonConPlazo('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'finalize_round', tournament_id: tournamentId, round_id: roundId }),
    }, PLAZO_CERRAR_TARJETA_MS, { leerCuerpoSiNoOk: true })
    if (res.ok) return { tipo: 'ok' }
    const cuerpo = (json ?? {}) as { error?: unknown; code?: unknown }
    if (cuerpo.code === 'round_closed') return { tipo: 'ya_cerrada' }
    if (res.status >= 500 || res.status === 429) return { tipo: 'sin_respuesta' }
    return { tipo: 'rechazo', mensaje: typeof cuerpo.error === 'string' ? cuerpo.error : null }
  } catch {
    // Corte, sin señal o un cuerpo que no es JSON (HTML de un proxy): el cierre pudo o no aplicarse.
    return { tipo: 'sin_respuesta' }
  }
}

export function useCerrarTarjeta({
  tournamentId, store, reloadRoster, clearSelection, selectedIdRef, showError, showWarning, esperar = esperarMs,
}: Args) {
  const [estado, setEstado] = useState<EstadoCierre | null>(null)
  // Síncrono: un segundo toque antes del render no arranca otro cierre.
  const cierreRef = useRef<string | null>(null)

  const cerrar = useCallback(async (t: TarjetaACerrar) => {
    if (!tournamentId || cierreRef.current) return
    cierreRef.current = t.roundId
    const { roundId } = t
    try {
      store.sellar(roundId)
      store.apurar(roundId)
      // Cerrar es una orden del organizador: lo que espera un reintento sale ya (un rechazo no se reenvía solo).
      store.reintentar({ roundId })
      setEstado({ ...t, fase: 'guardando', hoyos: store.sinGuardar(roundId) })
      const quitar = store.suscribir(() => {
        setEstado((e) => (e && e.roundId === roundId && e.fase === 'guardando' ? { ...e, hoyos: store.sinGuardar(roundId) } : e))
      })
      try {
        await store.asentar(roundId, PLAZO_CIERRE_MS)
      } finally {
        quitar()
      }
      // Lectura síncrona: lo que diga ahora el store, no lo que resolvió `asentar`.
      const faltan = store.sinGuardar(roundId)
      if (faltan.length > 0) {
        store.desellar(roundId)
        showError(`No se cerró la tarjeta de ${t.nombre}`, `${faltan.length === 1 ? 'Hoyo' : 'Hoyos'} ${faltan.join(', ')} sin guardar.`)
        return
      }

      setEstado({ ...t, fase: 'cerrando', hoyos: [] })
      let final: Final = { tipo: 'sin_respuesta' }
      for (let i = 0; i < INTENTOS_CIERRE; i++) {
        if (i > 0) await esperar(ESPERAS_REINTENTO_MS[Math.min(i - 1, ESPERAS_REINTENTO_MS.length - 1)])
        final = await pedirCierre(tournamentId, roundId)
        if (final.tipo !== 'sin_respuesta') break
      }

      if (final.tipo === 'ok' || final.tipo === 'ya_cerrada') {
        if (final.tipo === 'ya_cerrada') showWarning('La tarjeta ya estaba cerrada', 'Actualizamos el listado.')
        await reloadRoster()
        // Sólo si sigue abierto el mismo jugador: si el organizador ya pasó a otro, no se le cierra la vista.
        if (selectedIdRef.current === t.playerId) clearSelection()
        // Queda sellada: la tarjeta está cerrada en la base.
        return
      }
      store.desellar(roundId)
      if (final.tipo === 'rechazo') {
        showError(`No se cerró la tarjeta de ${t.nombre}`, final.mensaje ?? 'Intenta de nuevo.')
      } else {
        showError(`No se cerró la tarjeta de ${t.nombre}`, 'Sin respuesta del servidor. Intenta de nuevo.')
      }
    } catch (e) {
      store.desellar(roundId)
      void captureError(e, { context: 'scoring.useCerrarTarjeta', meta: { roundId } })
      showError(`No se cerró la tarjeta de ${t.nombre}`, 'Intenta de nuevo.')
    } finally {
      cierreRef.current = null
      setEstado(null)
    }
  }, [tournamentId, store, reloadRoster, clearSelection, selectedIdRef, showError, showWarning, esperar])

  return { cerrar, estado }
}
