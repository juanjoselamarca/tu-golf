// Carga de la tarjeta abierta en el scorer del organizador (golpes y stats de la ronda activa del jugador).
// Separado de `useScoreEntry`: decide cuándo la tarjeta está `lista` para anotar y con qué ronda.
//
// `lista` vale para UNA ronda. Si la ronda activa del jugador cambia (se le crea la tarjeta, el roster recarga y
// aparece una), la tarjeta está en `cargando` desde ese mismo render hasta que la nueva cargue: con la grilla
// editable, anotar y deshacer mandaba `gross_score: null` y borraba un golpe real de esa ronda.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { conTimeout } from '@/lib/red/con-timeout'
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

/** Resultado de la última carga terminada, y de qué ronda es. `undefined` = ninguna ronda todavía. */
interface EstadoCarga {
  ronda: string | null | undefined
  carga: CargaTarjeta
}
const SIN_CARGA: EstadoCarga = { ronda: undefined, carga: 'cargando' }

/** Una carga terminada: filas de la base, o `null` si falló. `vigente()` dice si todavía corresponde aplicarla. */
interface Pedido {
  roundId: string
  vigente: () => boolean
  rows: HoleScoreRow[] | null
}

export function useCargaTarjeta({
  selectedId, players, getActiveRound, tarjetaRef, statsTocadasRef, grossEnVueloRef, aplicar, resetHoleState,
  showError,
}: Args) {
  const [estado, setEstadoState] = useState<EstadoCarga>(SIN_CARGA)
  /** El mismo estado, leído en los handlers sin esperar al render. */
  const estadoRef = useRef<EstadoCarga>(SIN_CARGA)
  const setEstado = useCallback((e: EstadoCarga) => {
    estadoRef.current = e
    setEstadoState(e)
  }, [])
  /** Ronda de la última carga pedida: si la ronda activa es otra, es una tarjeta nueva. */
  const rondaPedidaRef = useRef<string | null | undefined>(undefined)
  /** Cuenta las cargas. Aplica su resultado una carga con número >= `pisoRef` (las anteriores quedan invalidadas). */
  const cargaRef = useRef(0)
  const pisoRef = useRef(0)
  /** Sube con cada Reintentar: reinicia el plazo de "carga lenta". */
  const [intento, setIntento] = useState(0)
  const [cargaLenta, setCargaLenta] = useState(false)
  /** Por ref y no como dependencia: si la identidad de `showError` cambia por render, `loadScores` cambiaría con
   *  ella y el efecto de carga entraría en bucle. */
  const showErrorRef = useRef(showError)
  useEffect(() => {
    showErrorRef.current = showError
  })

  const rondaActiva = selectedId ? (getActiveRound(players.find((p) => p.id === selectedId))?.id ?? null) : undefined
  // Se deriva en el render, no se fija en un efecto: si la ronda activa cambió (se le creó la tarjeta, el roster
  // recargó), la tarjeta ya está en "cargando" en ESTE render, sin un instante con la grilla editable.
  const cargaTarjeta: CargaTarjeta =
    rondaActiva === null ? 'lista' : estado.ronda === rondaActiva ? estado.carga : 'cargando'

  /** La ronda `roundId` es la que está a la vista y cargó: recién ahí se puede anotar en ella. */
  const tarjetaLista = useCallback(
    (roundId: string) => estadoRef.current.ronda === roundId && estadoRef.current.carga === 'lista',
    [],
  )

  /** La pantalla deja de ser de una ronda conocida (se cambió o se cerró la tarjeta). Sólo en handlers. */
  const marcarCargando = useCallback(() => {
    rondaPedidaRef.current = undefined
    setEstado(SIN_CARGA)
  }, [setEstado])

  /** Ninguna carga en vuelo se aplica. Lo usa el guardado confirmado: una recarga pedida antes de que el golpe
   *  llegara a la base lo borraría de la pantalla al volver. */
  const invalidarCargas = useCallback(() => {
    pisoRef.current = ++cargaRef.current
  }, [])

  /** Pide la tarjeta (sólo refs y red: no toca el estado). El resultado lo aplica `aplicarCarga`. */
  const pedirCarga = useCallback(
    async (playerId: string, { reintento = false } = {}): Promise<Pedido | null> => {
      const roundId = getActiveRound(players.find((p) => p.id === playerId))?.id ?? null
      if (roundId !== rondaPedidaRef.current) {
        // Otra ronda: lo que haya en vuelo o en pantalla es de otra tarjeta.
        rondaPedidaRef.current = roundId
        tarjetaRef.current += 1
      }
      // Sin tarjeta no hay nada que pedir (la carga se deriva `lista`).
      if (roundId === null) return null
      const tarjeta = tarjetaRef.current
      const carga = ++cargaRef.current
      // Reintentar mientras la ronda sigue cargando no invalida la carga en vuelo: gana la que responda primero.
      if (!(reintento && !tarjetaLista(roundId))) pisoRef.current = carga
      // La respuesta es de esta tarjeta y no fue invalidada: si mientras tanto se abrió otra (o arrancó otra carga),
      // no se aplica. Sin esto, la carga de A que llegaba tarde pintaba sus stats en la tarjeta de B.
      const vigente = () => tarjetaRef.current === tarjeta && carga >= pisoRef.current
      const control = new AbortController()
      try {
        // Plazo propio (no `AbortSignal.timeout`, que no existe en iOS 15 y lanzaba: la tarjeta quedaba en error).
        const rows = await conTimeout(fetchRoundHoleScores(createClient(), roundId, control.signal), TIMEOUT_CARGA_MS)
        return { roundId, vigente, rows }
      } catch (error) {
        control.abort()
        void captureError(error, { context: 'scoring.useScoreEntry.loadScores', meta: { roundId } })
        return { roundId, vigente, rows: null }
      }
    },
    [players, getActiveRound, tarjetaRef, tarjetaLista],
  )

  const aplicarCarga = useCallback(
    (pedido: Pedido | null) => {
      if (!pedido || !pedido.vigente()) return
      const { roundId, rows } = pedido
      if (rows) {
        const enVuelo: Record<number, number> = {}
        for (const [clave, { valor }] of grossEnVueloRef.current) {
          const [ronda, hoyo] = clave.split(':')
          if (ronda === roundId) enVuelo[Number(hoyo)] = valor
        }
        aplicar(armarTarjeta(rows, tocadasDeLaRonda(statsTocadasRef.current, roundId), enVuelo))
        setEstado({ ronda: roundId, carga: 'lista' })
        return
      }
      // Una recarga de la MISMA ronda ya cargada que falla deja lo que había (sigue siendo lo conocido). Si esta
      // ronda nunca cargó, la tarjeta queda bloqueada con "Reintentar" y sin lo de otra ronda a la vista.
      if (!tarjetaLista(roundId)) {
        if (estadoRef.current.ronda !== roundId) resetHoleState()
        setEstado({ ronda: roundId, carga: 'error' })
      }
      showErrorRef.current('Error', 'No pudimos cargar los scores del jugador. Intenta de nuevo.')
    },
    [grossEnVueloRef, statsTocadasRef, aplicar, resetHoleState, setEstado, tarjetaLista],
  )

  const reintentarCarga = useCallback(() => {
    if (!selectedId) return
    // Una tarjeta en error vuelve a "Cargando…"; una ya cargada se refresca sin bloquearse.
    const e = estadoRef.current
    if (e.carga === 'error') setEstado({ ronda: e.ronda, carga: 'cargando' })
    setIntento((i) => i + 1)
    void pedirCarga(selectedId, { reintento: true }).then(aplicarCarga)
  }, [selectedId, pedirCarga, aplicarCarga, setEstado])

  useEffect(() => {
    // El estado se toca sólo en el `then`, cuando la red responde.
    if (selectedId) void pedirCarga(selectedId).then(aplicarCarga)
  }, [selectedId, pedirCarga, aplicarCarga])

  useEffect(() => {
    if (cargaTarjeta !== 'cargando') return
    // Cada carga (o reintento) cuenta su propio plazo: la cleanup baja el aviso del anterior.
    const t = setTimeout(() => setCargaLenta(true), CARGA_LENTA_MS)
    return () => {
      clearTimeout(t)
      setCargaLenta(false)
    }
  }, [cargaTarjeta, selectedId, intento])

  return { cargaTarjeta, cargaLenta, tarjetaLista, marcarCargando, invalidarCargas, reintentarCarga }
}
