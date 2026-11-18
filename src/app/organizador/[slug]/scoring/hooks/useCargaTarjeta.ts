// Carga de la tarjeta abierta en el scorer del organizador: lee los hoyos de la base con plazo y los siembra en
// `estado-hoyos`. El orden entre lecturas y guardados lo resuelve `sembrar` con la marca tomada al pedir la
// lectura (una lectura vieja no pisa un hoyo cambiado después); acá sólo vive el estado de carga por ronda.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { conTimeout } from '@/lib/red/con-timeout'
import { fetchRoundHoleScores } from '@/lib/data/tournaments/scoring'
import type { EstadoHoyos } from './estado-hoyos'

export type CargaTarjeta = 'cargando' | 'lista' | 'error'

/** Corte de la lectura de la tarjeta: con la red colgada la grilla no queda en "Cargando…" para siempre. */
export const TIMEOUT_CARGA_MS = 10_000
/** A los 4 s cargando ya se ofrece Reintentar. */
export const CARGA_LENTA_MS = 4_000

interface Args {
  /** Ronda de la tarjeta abierta. `undefined` = nadie abierto; `null` = el jugador no tiene tarjeta en la ronda. */
  roundId: string | null | undefined
  store: Pick<EstadoHoyos, 'marca' | 'sembrar'>
  parDe: (hole: number) => number
  showError: (titulo: string, mensaje: string) => void
}

export function useCargaTarjeta({ roundId, store, parDe, showError }: Args) {
  const [cargas, setCargasState] = useState<Readonly<Record<string, CargaTarjeta>>>({})
  /** Lo mismo que `cargas`, escrito en el mismo setter: el `then` de una lectura decide sin esperar el render. */
  const cargasRef = useRef(cargas)
  const fijarCarga = useCallback((ronda: string, carga: CargaTarjeta) => {
    cargasRef.current = { ...cargasRef.current, [ronda]: carga }
    setCargasState(cargasRef.current)
  }, [])
  const [intento, setIntento] = useState(0)
  const [cargaLenta, setCargaLenta] = useState(false)
  // Los callbacks del toast y del par se leen por ref: si cambian de identidad, la carga no se vuelve a pedir.
  const showErrorRef = useRef(showError)
  const parDeRef = useRef(parDe)
  useEffect(() => {
    showErrorRef.current = showError
    parDeRef.current = parDe
  })

  const cargaTarjeta: CargaTarjeta =
    roundId === null ? 'lista' : roundId === undefined ? 'cargando' : (cargas[roundId] ?? 'cargando')

  const pedir = useCallback(async (ronda: string) => {
    const marca = store.marca()
    const control = new AbortController()
    try {
      const filas = await conTimeout(fetchRoundHoleScores(createClient(), ronda, control.signal), TIMEOUT_CARGA_MS)
      store.sembrar(ronda, filas, marca, (h) => parDeRef.current(h))
      fijarCarga(ronda, 'lista')
    } catch (error) {
      control.abort()
      void captureError(error, { context: 'scoring.useCargaTarjeta', meta: { roundId: ronda } })
      // Ya cargada (otra lectura llegó antes): una recarga que falla no bloquea ni avisa.
      if (cargasRef.current[ronda] === 'lista') return
      fijarCarga(ronda, 'error')
      showErrorRef.current('Error', 'No pudimos cargar los scores del jugador. Intenta de nuevo.')
    }
  }, [store, fijarCarga])

  useEffect(() => {
    if (roundId) void pedir(roundId)
  }, [roundId, pedir])

  const reintentarCarga = useCallback(() => {
    if (!roundId) return Promise.resolve()
    // Reintentar con la ronda cargando no invalida la lectura en vuelo: gana la primera que responda.
    if (cargasRef.current[roundId] === 'error') fijarCarga(roundId, 'cargando')
    setIntento((i) => i + 1)
    return pedir(roundId)
  }, [roundId, pedir, fijarCarga])

  useEffect(() => {
    if (cargaTarjeta !== 'cargando') return
    const t = setTimeout(() => setCargaLenta(true), CARGA_LENTA_MS)
    return () => {
      clearTimeout(t)
      setCargaLenta(false)
    }
  }, [cargaTarjeta, roundId, intento])

  return { cargaTarjeta, cargaLenta, reintentarCarga }
}
