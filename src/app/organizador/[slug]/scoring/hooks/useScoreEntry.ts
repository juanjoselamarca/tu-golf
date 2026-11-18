// Entrada de scores hoyo a hoyo del scorer del organizador: selección de jugador, golpes y stats opcionales
// (putts/fairway/GIR), deshacer y cierre de la tarjeta. El estado de cada hoyo (lo que se ve, si está guardado)
// vive en `estado-hoyos` y se lee de su vista: este hook no guarda copias. Toda la cuenta de golf sale de
// `src/golf/` (course handicap, SI normalizado, strokes por hoyo, stableford): acá sólo se orquesta.

import { useCallback, useMemo, useRef, useState } from 'react'
import { useToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { resolveLegacyPlayerName } from '@/golf/leaderboard/board-rules'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import { puntajeDeHoyo, courseHandicapDeScoring } from '@/golf/core/hole-scoring'
import { hcpPctDelTorneo } from '@/golf/core/playing-handicap'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import type { CourseHole } from '@/golf/leaderboard/types'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import type { ScoringPlayer, ScoringRound, ScoringTournament } from '@/lib/data/tournaments/scoring'
import { ESPERA_STAT_MS, type HoleStatPatch, type RespuestaSobre } from './estado-hoyos'
import { useEstadoHoyos, usePendientesGlobal, useRondaSellada, useVistaRonda } from './useEstadoHoyos'
import { TIMEOUT_CARGA_MS, useCargaTarjeta } from './useCargaTarjeta'
import { descartarRechazados as descartarDelStore } from './descartar-rechazados'
import { createClient } from '@/lib/supabase'
import { conTimeout } from '@/lib/red/con-timeout'
import { fetchRoundHoleScores, fetchRoundTotals } from '@/lib/data/tournaments/scoring'
import { esRechazoPermanente } from '@/lib/api/respuesta-score'
import { esTarjetaCerrada } from '@/golf/tournament-rounds'
import { useCerrarTarjeta } from './useCerrarTarjeta'

export type { HoleStatPatch } from './estado-hoyos'

interface UseScoreEntryArgs {
  tournament: ScoringTournament | null
  players: ScoringPlayer[]
  courseHoles: CourseHole[]
  courseTees: CourseTeeRow[]
  holeCount: number
  getActiveRound: (player: ScoringPlayer | undefined) => ScoringRound | undefined
  applyRoundTotals: (
    playerId: string,
    roundId: string,
    totals: Pick<ScoringRound, 'total_gross' | 'total_net' | 'total_points'>,
  ) => void
  reloadRoster: () => Promise<unknown>
}

/** Último golpe anotado, para "Deshacer hoyo N". Siempre se puede deshacer, también con el guardado en vuelo:
 *  el deshacer es una edición más del hoyo y sale detrás del envío anterior. */
export interface LastAction {
  id: number
  hole: number
  /** Tarjeta donde se anotó: deshacer el hoyo 18 de la R1 con la R2 abierta escribe en la R1. */
  roundId: string
  playerId: string
  previo: number | null
  nuevo: number
}

export function useScoreEntry({
  tournament,
  players,
  courseHoles,
  courseTees,
  holeCount,
  getActiveRound,
  applyRoundTotals,
  reloadRoster,
}: UseScoreEntryArgs) {
  const { showError, showSuccess, showWarning } = useToast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Selección vigente leída en el mismo handler (sin esperar el render): re-tocar al jugador abierto no hace nada. */
  const selectedIdRef = useRef<string | null>(null)
  const [lastAction, setLastAction] = useState<LastAction | null>(null)
  const accionesRef = useRef(0)

  const holes = useMemo(() => Array.from({ length: holeCount }, (_, i) => i + 1), [holeCount])
  // SI normalizado (permutación 1..N) para alocar golpes de neto/stableford (idempotente).
  const siAllocByHole = useMemo(() => normalizedStrokeIndexByHole(courseHoles, holeCount), [courseHoles, holeCount])
  const holeByNumero = useMemo(() => new Map(courseHoles.map((h) => [h.numero, h])), [courseHoles])
  const parDe = useCallback((hole: number) => holeByNumero.get(hole)?.par ?? 4, [holeByNumero])

  const selectedPlayer = players.find((p) => p.id === selectedId)
  const selectedRound = getActiveRound(selectedPlayer)
  /** Tarjeta cerrada en la base (`roundClosed`): no se edita más. No depende del sello del store. */
  const rondaCerrada = esTarjetaCerrada(selectedRound?.status)

  // Totales de la ronda que trae cada guardado confirmado, a la ficha del jugador DUEÑO de esa ronda. `null`: las
  // respuestas llegaron fuera de orden y se leen de la base (si la lectura falla, quedan los de la ficha hasta el
  // próximo guardado o la relectura del listado).
  // Avisos de totales por ronda: una relectura sólo se aplica si no llegó otro aviso después de pedirla (si no, unos
  // totales leídos antes de un guardado posterior pisarían los de ese guardado).
  const avisosTotalesRef = useRef(new Map<string, number>())
  const alConfirmar = useCallback(
    (roundId: string, t: NonNullable<RespuestaSobre['totales']> | null) => {
      const n = (avisosTotalesRef.current.get(roundId) ?? 0) + 1
      avisosTotalesRef.current.set(roundId, n)
      const aplicar = (tot: { total_gross: number; total_net: number; total_points: number }) => {
        const dueno = players.find((p) => p.rounds?.some((r) => r.id === roundId))
        if (dueno) applyRoundTotals(dueno.id, roundId, tot)
      }
      if (t) return aplicar({ total_gross: t.totalGross, total_net: t.totalNet, total_points: t.totalPoints })
      void conTimeout(fetchRoundTotals(createClient(), roundId), TIMEOUT_CARGA_MS)
        .then((tot) => { if (avisosTotalesRef.current.get(roundId) === n) aplicar(tot) })
        .catch((e) => { void captureError(e, { context: 'scoring.useScoreEntry.releerTotales', meta: { roundId } }) })
    },
    [players, applyRoundTotals],
  )
  const store = useEstadoHoyos(tournament?.id, alConfirmar)
  const rondaAbierta = selectedId ? (selectedRound?.id ?? null) : undefined
  const vista = useVistaRonda(store, rondaAbierta)
  const pendientes = usePendientesGlobal(store)
  const sellada = useRondaSellada(store, rondaAbierta)
  const hayTorneo = tournament != null
  // Sin torneo no se lee la tarjeta: se sembraría en un store que no es el del torneo y la ronda real quedaría
  // vacía (y un deshacer con previo vacío podría borrar un golpe real). Se lee al resolver el torneo.
  const { cargaTarjeta, cargaLenta, reintentarCarga } = useCargaTarjeta({
    roundId: hayTorneo ? rondaAbierta : undefined, store, parDe, showError,
    nombre: selectedPlayer ? resolveLegacyPlayerName(selectedPlayer) : null,
  })

  /** Golpes de la tarjeta abierta (derivado de la vista). */
  const currentScores = useMemo(() => {
    const r: Record<number, number> = {}
    for (const [h, v] of Object.entries(vista)) if (v.gross != null) r[Number(h)] = v.gross
    return r
  }, [vista])
  /** Algún hoyo (de cualquier tarjeta) esperando la respuesta de su primer intento. */
  const saving = pendientes.some((p) => p.estado === 'guardando')

  const selectPlayer = useCallback((playerId: string) => {
    // Re-tocar al jugador abierto (doble toque con guante) no hace nada.
    if (selectedIdRef.current === playerId) return
    const anterior = selectedIdRef.current
    selectedIdRef.current = playerId
    setSelectedId(playerId)
    // Lo de la tarjeta anterior sigue guardándose en SU ronda; sólo se apura lo que esperaba los 600 ms.
    if (anterior) for (const p of store.pendientesGlobal()) store.apurar(p.roundId)
  }, [store])

  const clearSelection = useCallback(() => {
    selectedIdRef.current = null
    setSelectedId(null)
    // Cerrar la tarjeta (o cambiar de ronda) descarta el deshacer pendiente: el botón quedaba vivo sin tarjeta.
    setLastAction(null)
  }, [])

  // ── Derivados de la tarjeta seleccionada ──
  const filledCount = holes.filter((h) => currentScores[h] != null).length
  const allFilled = filledCount === holeCount

  // Par acumulado SOLO de hoyos jugados (no del recorrido completo).
  const parJugado = holes.reduce((s, h) => (currentScores[h] ? s + parDe(h) : s), 0)
  const grossTotal = holes.reduce((s, h) => s + (currentScores[h] ?? 0), 0)
  const outGross = holes.filter((h) => h <= 9).reduce((s, h) => s + (currentScores[h] ?? 0), 0)
  const inGross = holes.filter((h) => h > 9).reduce((s, h) => s + (currentScores[h] ?? 0), 0)

  // Par de los hoyos que se juegan (no el de la cancha): con el CR de 9h y el
  // par de 18 la fórmula WHS devolvía course handicaps NEGATIVOS.
  const selectedCourseHcp =
    tournament && selectedPlayer
      ? courseHandicapDeScoring({
          mode: tournament.hcp_calc_mode,
          player: selectedPlayer,
          tournament,
          courseTees,
          courseHoles,
          holeCount,
          hcpPct: hcpPctDelTorneo(tournament),
        })
      : 0

  const netTotal = holes.reduce((s, h) => {
    if (!currentScores[h]) return s
    const si = siAllocByHole[h] ?? holeByNumero.get(h)?.stroke_index ?? h
    return s + (currentScores[h] - strokesRecibidosEnHoyo(selectedCourseHcp, si, holeCount))
  }, 0)

  // Los puntos que se MUESTRAN salen de la misma fuente que los que el servidor persiste (`puntajeDeHoyo`):
  // en Stableford Gross, contra el par sin golpes.
  const modoJuego = tournament?.modo_juego
  const stablefordPtsAt = useCallback(
    (holeNumber: number, gross: number) => {
      const hole = holeByNumero.get(holeNumber)
      const si = siAllocByHole[holeNumber] ?? hole?.stroke_index ?? holeNumber
      return puntajeDeHoyo({
        gross, par: hole?.par ?? 4, courseHandicap: selectedCourseHcp, strokeIndex: si, holeCount,
        formato: 'stableford', modo: modoJuego,
      }).puntos
    },
    [holeByNumero, siAllocByHole, selectedCourseHcp, holeCount, modoJuego],
  )

  /** Tarjeta abierta en la que se puede escribir ahora: torneo resuelto, tarjeta cargada, ronda no cerrada (en la
   *  base: `roundClosed`) y sin cierre en curso (sello del store). */
  const editable = hayTorneo && cargaTarjeta === 'lista' && !!selectedRound && !rondaCerrada && !sellada

  // ── Golpe de un hoyo ──
  const saveScore = useCallback(
    (holeNumber: number, value: string) => {
      const gross = parseInt(value)
      if (isNaN(gross) || !tournament || !selectedId) return
      if (gross < 1 || gross > 19) {
        showWarning('Score inválido', 'El score debe ser entre 1 y 19 golpes.')
        return
      }
      const player = players.find((p) => p.id === selectedId)
      if (!player) return
      const round = getActiveRound(player)
      if (!round) {
        // Sin tarjeta en la ronda en juego no hay dónde guardar: se dice, no se pierde en silencio. El panel
        // ofrece "Crear su tarjeta" (POST /api/torneos/[slug]/tarjeta).
        showWarning('No se guardó', `${resolveLegacyPlayerName(player)} no tiene tarjeta en esta ronda. Créala con "Crear su tarjeta" y vuelve a anotar.`)
        void captureError(new Error('Scorer del organizador: jugador sin tarjeta en la ronda en juego'), {
          context: 'organizador.score.sinTarjeta', level: 'warning', meta: { tournamentId: tournament.id, playerId: player.id, holeNumber },
        })
        return
      }
      // Con la tarjeta sin cargar, "lo que había" es desconocido: el deshacer borraría un golpe real.
      if (!editable) return
      const previo = store.vista(round.id)[holeNumber]?.gross ?? null
      if (!store.editar(round.id, holeNumber, { gross }, { par: parDe(holeNumber) })) return
      if (gross === previo) return
      setLastAction({ id: ++accionesRef.current, hole: holeNumber, roundId: round.id, playerId: player.id, previo, nuevo: gross })
    },
    [tournament, selectedId, players, getActiveRound, editable, store, parDe, showWarning],
  )

  const undoLast = useCallback(() => {
    const a = lastAction
    if (!a) return
    const actual = store.vista(a.roundId)[a.hole]
    if (actual?.gross !== a.nuevo) {
      // Mientras tanto se anotó otro valor en ese hoyo: ese manda.
      setLastAction(null)
      showWarning('No se deshizo', `El hoyo ${a.hole} cambió después.`)
      return
    }
    // Un golpe rechazado que nunca llegó a la base se deshace sólo en pantalla; si no, se envía el previo.
    const hecho = (actual.estado === 'rechazado' && store.revertirLocal(a.roundId, a.hole))
      || store.editar(a.roundId, a.hole, { gross: a.previo }, { par: parDe(a.hole) })
    if (!hecho) {
      showWarning('No se deshizo', 'La tarjeta se está cerrando.')
      return
    }
    setLastAction((x) => (x?.id === a.id ? null : x))
    showSuccess('Deshacer', `Hoyo ${a.hole}: ${a.previo ?? 'sin golpe'}`, { duration: 1500 })
  }, [lastAction, store, parDe, showSuccess, showWarning])

  /** Una stat del hoyo (putts / fairway / GIR) en la ronda ACTIVA. Sale a los 600 ms, junto con lo que se toque
   *  mientras tanto. `false` si no se aceptó (sin golpe, tarjeta no editable, hoyo rechazado). */
  const editarStat = useCallback(
    (holeNumber: number, patch: HoleStatPatch): boolean => {
      if (!editable || !selectedRound) return false
      return store.editar(selectedRound.id, holeNumber, patch, { par: parDe(holeNumber), esperaMs: ESPERA_STAT_MS })
    },
    [editable, selectedRound, store, parDe],
  )

  /** "Reintentar": también reenvía un rechazo (el organizador lo pide). */
  const reintentarGuardado = useCallback((roundId?: string) => {
    store.reintentar({ roundId, limpiarRechazo: true })
  }, [store])

  const leerBase = useCallback(
    (roundId: string) => conTimeout(fetchRoundHoleScores(createClient(), roundId), TIMEOUT_CARGA_MS),
    [],
  )
  /**
   * "Descartar" hoyos rechazados de una ronda: sólo los pedidos (el grupo del aviso) y sólo con motivo permanente
   * (`esRechazoPermanente`). Si alguno pudo quedar escrito, primero se lee la base; si la lectura no llega, no se
   * descarta nada y se avisa.
   */
  const descartarRechazados = useCallback(async (roundId: string, holes: readonly number[]) => {
    const r = await descartarDelStore(store, roundId, holes, leerBase)
    if (r === 'sin_lectura') showWarning('No pudimos confirmar qué quedó guardado', 'Revisa la señal y vuelve a tocar Descartar.')
  }, [store, leerBase, showWarning])

  /** Rechazos permanentes de las tarjetas que NO están abiertas (no tienen su aviso), por tarjeta: el chip los nombra. */
  const descartablesEnOtras = useMemo(() => {
    const porRonda = new Map<string, number[]>()
    for (const p of pendientes) {
      if (p.estado !== 'rechazado' || p.roundId === rondaAbierta) continue
      if (!esRechazoPermanente(store.vista(p.roundId)[p.hole]?.motivo)) continue
      porRonda.set(p.roundId, [...(porRonda.get(p.roundId) ?? []), p.hole])
    }
    return [...porRonda].map(([roundId, holes]) => {
      const jugador = players.find((x) => x.rounds?.some((r) => r.id === roundId))
      return { roundId, holes: holes.sort((a, b) => a - b), nombre: jugador ? resolveLegacyPlayerName(jugador) : null }
    })
  }, [pendientes, rondaAbierta, store, players])

  /** Desde el chip (tras confirmar): descarta los rechazos permanentes de esas tarjetas. */
  const descartarRechazosDeOtras = useCallback(async () => {
    for (const { roundId, holes } of descartablesEnOtras) await descartarRechazados(roundId, holes)
  }, [descartablesEnOtras, descartarRechazados])
  const hayDescartablesEnOtras = descartablesEnOtras.length > 0

  const cierre = useCerrarTarjeta({
    tournamentId: tournament?.id ?? null, store, reloadRoster, clearSelection, selectedIdRef,
    showError, showWarning,
  })
  const finalizeRound = useCallback(() => {
    if (!selectedPlayer || !selectedRound) return Promise.resolve()
    return cierre.cerrar({ roundId: selectedRound.id, playerId: selectedPlayer.id, nombre: resolveLegacyPlayerName(selectedPlayer) })
  }, [cierre, selectedPlayer, selectedRound])

  /** Nombre del jugador dueño de una ronda (para el chip de pendientes de otra tarjeta). */
  const nombreDeRonda = useCallback((roundId: string) => {
    const p = players.find((x) => x.rounds?.some((r) => r.id === roundId))
    return p ? resolveLegacyPlayerName(p) : null
  }, [players])

  return {
    selectedId,
    selectedPlayer,
    selectedRound,
    selectPlayer,
    clearSelection,
    vista,
    currentScores,
    saving,
    pendientes,
    nombreDeRonda,
    reintentarGuardado,
    descartarRechazados,
    descartarRechazosDeOtras,
    descartablesEnOtras,
    hayDescartablesEnOtras,
    lastAction,
    undoLast,
    holes,
    filledCount,
    allFilled,
    parJugado,
    grossTotal,
    outGross,
    inGross,
    netTotal,
    selectedCourseHcp,
    stablefordPtsAt,
    saveScore,
    editarStat,
    editable,
    cargaTarjeta,
    cargaLenta,
    reintentarCarga,
    finalizeRound,
    cierre: cierre.estado,
  }
}

export type UseScoreEntryReturn = ReturnType<typeof useScoreEntry>
