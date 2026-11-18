// Carga de la tarjeta abierta en el scorer del organizador (golpes y stats de la ronda activa del jugador).
// Separado de `useScoreEntry`: decide cuándo la tarjeta está `lista` para anotar y con qué ronda.
//
// `lista` vale para UNA ronda (`rondaCargadaRef`). Si la ronda activa del jugador cambia (se le crea la tarjeta,
// el roster recarga y aparece una), la pantalla vuelve a `cargando` y se vacía ANTES de pedir la nueva: con la
// grilla editable y vacía, anotar y deshacer mandaba `gross_score: null` y borraba un golpe real de esa ronda.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import {
  fetchRoundHoleScores,
  type HoleScoreRow,
  type ScoringPlayer,
  type ScoringRound,
} from '@/lib/data/tournaments/scoring'
import { tocadasDeLaRonda, type HoleStatPatch, type StatsTocadas } from './envio-hoyo'

/** Estado de la carga de la tarjeta abierta. Hasta que no está `lista`, la pantalla no sabe qué golpes tiene la
 *  base: anotar encima y deshacer mandaría `gross_score: null` (el hoyo "estaba vacío") y borraría un golpe real. */
export type CargaTarjeta = 'cargando' | 'lista' | 'error'

/** Una carga que no responde en este tiempo se corta y pasa a `error` (con "Reintentar"). */
export const TIMEOUT_CARGA_MS = 10_000
/** Pasado este tiempo en `cargando`, la pantalla ofrece "Reintentar" sin esperar el corte. */
export const CARGA_LENTA_MS = 4_000

export interface TarjetaCargada {
  scores: Record<number, number>
  putts: Record<number, number | null>
  fairway: Record<number, boolean | null>
  gir: Record<number, boolean | null>
}

/**
 * La tarjeta que se pinta: lo de la base con lo que este organizador tiene sin confirmar encima (stats tocadas
 * que el servidor todavía no aplicó y golpes en vuelo). Sin la capa, la recarga que sigue a cada golpe borraba de
 * la pantalla el hoyo recién anotado y devolvía a "—" un GIR que no se guardó.
 */
export function armarTarjeta(
  rows: Pick<HoleScoreRow, 'hole_number' | 'gross_score' | 'putts' | 'fairway_hit' | 'gir'>[],
  statsSinConfirmar: Record<number, HoleStatPatch>,
  grossEnVuelo: Record<number, number>,
): TarjetaCargada {
  const t: TarjetaCargada = { scores: {}, putts: {}, fairway: {}, gir: {} }
  for (const s of rows) {
    if (s.gross_score != null) t.scores[s.hole_number] = s.gross_score
    t.putts[s.hole_number] = s.putts ?? null
    t.fairway[s.hole_number] = s.fairway_hit ?? null
    t.gir[s.hole_number] = s.gir ?? null
  }
  for (const [h, gross] of Object.entries(grossEnVuelo)) t.scores[Number(h)] = gross
  for (const [h, patch] of Object.entries(statsSinConfirmar)) {
    const n = Number(h)
    if (patch.putts !== undefined) t.putts[n] = patch.putts
    if (patch.fairway_hit !== undefined) t.fairway[n] = patch.fairway_hit
    if (patch.gir !== undefined) t.gir[n] = patch.gir
  }
  return t
}

/** Golpes en vuelo por `${roundId}:${hoyo}`. La entrada es un objeto propio por envío: la respuesta sólo la saca
 *  si sigue siendo la suya (otro envío del mismo hoyo pudo reemplazarla). */
export type GrossEnVuelo = Map<string, { valor: number }>

interface Args {
  selectedId: string | null
  players: ScoringPlayer[]
  getActiveRound: (player: ScoringPlayer | undefined) => ScoringRound | undefined
  /** Contador de tarjetas de `useScoreEntry`: un cambio de ronda también cuenta como tarjeta nueva. */
  tarjetaRef: MutableRefObject<number>
  statsTocadasRef: MutableRefObject<StatsTocadas>
  grossEnVueloRef: MutableRefObject<GrossEnVuelo>
  aplicar: (t: TarjetaCargada) => void
  resetHoleState: () => void
  showError: (titulo: string, mensaje: string) => void
}

export function useCargaTarjeta({
  selectedId, players, getActiveRound, tarjetaRef, statsTocadasRef, grossEnVueloRef, aplicar, resetHoleState,
  showError,
}: Args) {
  const [cargaTarjeta, setCargaTarjetaState] = useState<CargaTarjeta>('cargando')
  /** La misma carga, leída en los handlers sin esperar al render. */
  const cargaTarjetaRef = useRef<CargaTarjeta>('cargando')
  /** Ronda que muestra la pantalla: `undefined` = ninguna todavía, `null` = el jugador no tiene tarjeta. */
  const rondaCargadaRef = useRef<string | null | undefined>(undefined)
  /** Cuenta las cargas: sólo aplica su resultado la última (una vieja que llega tarde no pisa). */
  const cargaRef = useRef(0)
  const [cargaLenta, setCargaLenta] = useState(false)

  const setCargaTarjeta = useCallback((c: CargaTarjeta) => {
    cargaTarjetaRef.current = c
    setCargaTarjetaState(c)
  }, [])

  /** La pantalla deja de ser de una ronda conocida (se cambió o se cerró la tarjeta). */
  const marcarCargando = useCallback(() => {
    rondaCargadaRef.current = undefined
    setCargaTarjeta('cargando')
  }, [setCargaTarjeta])

  const loadScores = useCallback(
    async (playerId: string) => {
      const roundId = getActiveRound(players.find((p) => p.id === playerId))?.id ?? null
      if (roundId !== rondaCargadaRef.current) {
        // Otra ronda: lo de la pantalla no es de ella. Se vacía y se bloquea antes de pedirla.
        tarjetaRef.current += 1
        resetHoleState()
        marcarCargando()
      }
      const tarjeta = tarjetaRef.current
      const carga = ++cargaRef.current
      // La respuesta es de esta carga y de esta tarjeta: si mientras tanto se abrió otra (o arrancó otra carga),
      // no se aplica. Sin esto, la carga de A que llegaba tarde pintaba sus stats en la tarjeta de B.
      const vigente = () => tarjetaRef.current === tarjeta && cargaRef.current === carga
      if (!roundId) {
        rondaCargadaRef.current = null
        setCargaTarjeta('lista')
        return
      }
      try {
        const rows = await fetchRoundHoleScores(createClient(), roundId, AbortSignal.timeout(TIMEOUT_CARGA_MS))
        if (!vigente()) return
        const enVuelo: Record<number, number> = {}
        for (const [clave, { valor }] of grossEnVueloRef.current) {
          const [ronda, hoyo] = clave.split(':')
          if (ronda === roundId) enVuelo[Number(hoyo)] = valor
        }
        aplicar(armarTarjeta(rows, tocadasDeLaRonda(statsTocadasRef.current, roundId), enVuelo))
        rondaCargadaRef.current = roundId
        setCargaTarjeta('lista')
      } catch (e) {
        void captureError(e, { context: 'scoring.useScoreEntry.loadScores', meta: { roundId } })
        if (!vigente()) return
        // Una recarga de la MISMA ronda ya cargada que falla deja lo que había (sigue siendo lo conocido). Si esta
        // ronda nunca cargó, la tarjeta queda bloqueada con "Reintentar".
        if (rondaCargadaRef.current !== roundId) setCargaTarjeta('error')
        showError('Error', 'No pudimos cargar los scores del jugador. Intenta de nuevo.')
      }
    },
    [players, getActiveRound, tarjetaRef, statsTocadasRef, grossEnVueloRef, aplicar, resetHoleState, marcarCargando, setCargaTarjeta, showError],
  )

  const reintentarCarga = useCallback(() => {
    if (!selectedId) return
    // Una tarjeta ya cargada se refresca sin bloquearse; una que no cargó vuelve a "Cargando…".
    if (cargaTarjetaRef.current !== 'lista') setCargaTarjeta('cargando')
    void loadScores(selectedId)
  }, [selectedId, loadScores, setCargaTarjeta])

  useEffect(() => {
    if (selectedId) void loadScores(selectedId)
  }, [selectedId, loadScores])

  useEffect(() => {
    if (cargaTarjeta !== 'cargando') return
    // Cada tarjeta que empieza a cargar cuenta su propio plazo (la cleanup baja el aviso de la anterior).
    const t = setTimeout(() => setCargaLenta(true), CARGA_LENTA_MS)
    return () => {
      clearTimeout(t)
      setCargaLenta(false)
    }
  }, [cargaTarjeta, selectedId])

  return { cargaTarjeta, cargaTarjetaRef, rondaCargadaRef, cargaLenta, marcarCargando, reintentarCarga }
}
