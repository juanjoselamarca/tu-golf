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
  /** Jugador de la tarjeta abierta: el aviso de una relectura fallida lo nombra. */
  nombre?: string | null
}

type Store = Args['store']
/** Estado de carga por ronda DE UN store: si el store cambia (otro usuario), todas las rondas vuelven a "cargando". */
interface Cargas { store: Store; porRonda: Readonly<Record<string, CargaTarjeta>> }
const SIN_CARGAS: Readonly<Record<string, CargaTarjeta>> = Object.freeze({})

export function useCargaTarjeta({ roundId, store, parDe, showError, nombre }: Args) {
  const [cargas, setCargasState] = useState<Cargas>(() => ({ store, porRonda: SIN_CARGAS }))
  /** Lo mismo que `cargas`, escrito en el mismo setter: el `then` de una lectura decide sin esperar el render. */
  const cargasRef = useRef(cargas)
  const fijarCarga = useCallback((de: Store, ronda: string, carga: CargaTarjeta) => {
    const previas = cargasRef.current.store === de ? cargasRef.current.porRonda : SIN_CARGAS
    cargasRef.current = { store: de, porRonda: { ...previas, [ronda]: carga } }
    setCargasState(cargasRef.current)
  }, [])
  const cargaDe = useCallback((de: Store, ronda: string): CargaTarjeta | undefined =>
    cargasRef.current.store === de ? cargasRef.current.porRonda[ronda] : undefined, [])
  const [intento, setIntento] = useState(0)
  const [cargaLenta, setCargaLenta] = useState(false)
  // Los callbacks del toast y del par se leen por ref: si cambian de identidad, la carga no se vuelve a pedir.
  const showErrorRef = useRef(showError)
  const parDeRef = useRef(parDe)
  // Ronda abierta y su jugador AHORA (no al pedir): el aviso de una lectura que falla tarde sólo sale si sigue abierta.
  const rondaRef = useRef(roundId)
  const nombreRef = useRef(nombre)
  const storeRef = useRef(store)
  useEffect(() => {
    showErrorRef.current = showError
    parDeRef.current = parDe
    rondaRef.current = roundId
    nombreRef.current = nombre
    storeRef.current = store
  })

  const porRonda = cargas.store === store ? cargas.porRonda : SIN_CARGAS
  const cargaTarjeta: CargaTarjeta =
    roundId === null ? 'lista' : roundId === undefined ? 'cargando' : (porRonda[roundId] ?? 'cargando')

  const pedir = useCallback(async (ronda: string) => {
    const marca = store.marca()
    const control = new AbortController()
    try {
      const filas = await conTimeout(fetchRoundHoleScores(createClient(), ronda, control.signal), TIMEOUT_CARGA_MS)
      // El store cambió mientras se leía (otro usuario): esta lectura es del anterior y no se siembra.
      if (storeRef.current !== store) return
      store.sembrar(ronda, filas, marca, (h) => parDeRef.current(h))
      fijarCarga(store, ronda, 'lista')
    } catch (error) {
      control.abort()
      void captureError(error, { context: 'scoring.useCargaTarjeta', meta: { roundId: ronda } })
      if (storeRef.current !== store) return
      // Ya cargada: una relectura que falla no bloquea la tarjeta, pero se dice si sigue abierta (lo que se ve puede
      // no estar al día).
      if (cargaDe(store, ronda) === 'lista') {
        if (rondaRef.current !== ronda) return
        const de = nombreRef.current ? ` de ${nombreRef.current}` : ''
        showErrorRef.current(`No pudimos actualizar la tarjeta${de}`, 'Lo que ves es lo último que cargó. Ábrela de nuevo para releerla.')
        return
      }
      fijarCarga(store, ronda, 'error')
      if (rondaRef.current === ronda) showErrorRef.current('Error', 'No pudimos cargar los scores del jugador. Intenta de nuevo.')
    }
  }, [store, fijarCarga, cargaDe])

  useEffect(() => {
    if (roundId) void pedir(roundId)
  }, [roundId, pedir])

  const reintentarCarga = useCallback(() => {
    if (!roundId) return Promise.resolve()
    // Reintentar con la ronda cargando no invalida la lectura en vuelo: gana la primera que responda.
    if (cargaDe(store, roundId) === 'error') fijarCarga(store, roundId, 'cargando')
    setIntento((i) => i + 1)
    return pedir(roundId)
  }, [roundId, pedir, fijarCarga, cargaDe, store])

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
