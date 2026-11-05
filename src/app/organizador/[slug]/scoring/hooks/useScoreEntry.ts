// Entrada de scores hoyo a hoyo del scorer del organizador: selección de
// jugador, scores en vivo, stats opcionales (putts/fairway/GIR), undo,
// finalizar ronda. Toda la cuenta de golf sale de `src/golf/` (course handicap,
// SI normalizado, strokes por hoyo, stableford) — acá sólo se orquesta.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import { puntajeDeHoyo, courseHandicapDeScoring } from '@/golf/core/hole-scoring'
import { hcpPctDelTorneo } from '@/golf/core/playing-handicap'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import type { CourseHole } from '@/golf/leaderboard/types'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import {
  fetchRoundHoleScores,
  fetchRoundTotals,
  type ScoringPlayer,
  type ScoringRound,
  type ScoringTournament,
} from '@/lib/data/tournaments/scoring'

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
  reloadRoster: () => Promise<void>
}

export interface LastAction {
  holeNumber: number
  previousScore: number | undefined
  playerId: string
}

export type HoleStatPatch = Partial<{
  putts: number | null
  fairway_hit: boolean | null
  gir: boolean | null
}>

/**
 * POST de un hoyo a `/api/game` (`upsert_score`). Es el único camino por el
 * que este scorer escribe un golpe: guardar, corregir, borrar y deshacer.
 *
 * - `gross_score: null` BORRA el golpe: el servidor deja la fila sin bruto, neto
 *   ni puntos y recalcula los totales de la ronda.
 * - Devuelve `null` si no hubo respuesta (sin señal en la cancha). Un `fetch`
 *   que rechaza sin `catch` dejaba "Guardando…" pegado para siempre y ningún
 *   aviso: el organizador creía que el score había entrado.
 */
function postHoyo(body: Record<string, unknown>): Promise<Response | null> {
  return fetch('/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upsert_score', ...body }),
  }).catch(() => null)
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
  const [currentScores, setCurrentScores] = useState<Record<number, number>>({})
  const [errorHoles, setErrorHoles] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [lastAction, setLastAction] = useState<LastAction | null>(null)
  /** Hoyos que ya avisaron que sus stats no se guardaron — un aviso por hoyo,
   *  no uno por cada tap de putts/fairway/GIR.
   *
   *  La llave lleva jugador y ronda, no sólo el número de hoyo: con la clave
   *  suelta, un fallo en el hoyo 5 del jugador A silenciaba el aviso del hoyo 5
   *  de B. El dedupe se comía un aviso legítimo de pérdida de datos, que es
   *  justo lo que el aviso existe para evitar. */
  const statWarnedHolesRef = useRef<Set<string>>(new Set())
  const [holePutts, setHolePutts] = useState<Record<number, number | null>>({})
  const [holeFairway, setHoleFairway] = useState<Record<number, boolean | null>>({})
  const [holeGir, setHoleGir] = useState<Record<number, boolean | null>>({})

  const holes = useMemo(() => Array.from({ length: holeCount }, (_, i) => i + 1), [holeCount])
  // SI normalizado (permutación 1..N) para alocar golpes de neto/stableford (idempotente).
  const siAllocByHole = useMemo(
    () => normalizedStrokeIndexByHole(courseHoles, holeCount),
    [courseHoles, holeCount],
  )
  const holeByNumero = useMemo(
    () => new Map(courseHoles.map((h) => [h.numero, h])),
    [courseHoles],
  )

  const selectedPlayer = players.find((p) => p.id === selectedId)
  const selectedRound = getActiveRound(selectedPlayer)

  const resetHoleState = useCallback(() => {
    setCurrentScores({})
    setHolePutts({})
    setHoleFairway({})
    setHoleGir({})
  }, [])

  const selectPlayer = useCallback(
    (playerId: string) => {
      setSelectedId(playerId)
      setCurrentScores({})
      setLastAction(null)
      // Los hoyos en error son de la tarjeta que se estaba mirando: sin esto el
      // hoyo 5 de A seguía en rojo en la tarjeta de B.
      setErrorHoles(new Set())
    },
    [],
  )

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    resetHoleState()
    setErrorHoles(new Set())
  }, [resetHoleState])

  const loadScores = useCallback(
    async (playerId: string) => {
      const player = players.find((p) => p.id === playerId)
      const roundId = getActiveRound(player)?.id
      if (!roundId) {
        resetHoleState()
        return
      }
      try {
        const rows = await fetchRoundHoleScores(createClient(), roundId)
        const scores: Record<number, number> = {}
        const putts: Record<number, number | null> = {}
        const fairway: Record<number, boolean | null> = {}
        const gir: Record<number, boolean | null> = {}
        rows.forEach((s) => {
          if (s.gross_score != null) scores[s.hole_number] = s.gross_score
          putts[s.hole_number] = s.putts ?? null
          fairway[s.hole_number] = s.fairway_hit ?? null
          gir[s.hole_number] = s.gir ?? null
        })
        setCurrentScores(scores)
        setHolePutts(putts)
        setHoleFairway(fairway)
        setHoleGir(gir)
      } catch (e) {
        void captureError(e, { context: 'scoring.useScoreEntry.loadScores', meta: { roundId } })
        showError('Error', 'No pudimos cargar los scores del jugador. Intenta de nuevo.')
      }
    },
    [players, getActiveRound, resetHoleState, showError],
  )

  useEffect(() => {
    if (selectedId) void loadScores(selectedId)
  }, [selectedId, loadScores])

  // ── Derivados de la tarjeta seleccionada ──
  const filledCount = holes.filter((h) => currentScores[h] != null).length
  const allFilled = filledCount === holeCount

  // Par acumulado SOLO de hoyos jugados (no del recorrido completo).
  const parJugado = holes.reduce((s, h) => {
    if (!currentScores[h]) return s
    return s + (holeByNumero.get(h)?.par ?? 4)
  }, 0)

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

  // Los puntos que se MUESTRAN salen de la misma fuente que los que se
  // persisten (`puntajeDeHoyo`): en Stableford Gross, contra el par sin golpes.
  const stablefordPtsAt = useCallback(
    (holeNumber: number, gross: number) => {
      const hole = holeByNumero.get(holeNumber)
      const si = siAllocByHole[holeNumber] ?? hole?.stroke_index ?? holeNumber
      return puntajeDeHoyo({
        gross, par: hole?.par ?? 4, courseHandicap: selectedCourseHcp, strokeIndex: si, holeCount,
        formato: 'stableford', modo: tournament?.modo_juego,
      }).puntos
    },
    [holeByNumero, siAllocByHole, selectedCourseHcp, holeCount, tournament?.modo_juego],
  )

  /** Totales denormalizados de la ficha del jugador (no los usa el Resumen). */
  const refrescarTotales = useCallback(
    async (playerId: string, roundId: string) => {
      try {
        const totals = await fetchRoundTotals(createClient(), roundId)
        if (totals) applyRoundTotals(playerId, roundId, totals)
      } catch (e) {
        void captureError(e, { context: 'scoring.useScoreEntry.refreshTotals', meta: { roundId } })
      }
    },
    [applyRoundTotals],
  )

  const marcarError = useCallback((holeNumber: number) => {
    setErrorHoles((prev) => new Set(prev).add(holeNumber))
  }, [])
  const limpiarError = useCallback((holeNumber: number) => {
    setErrorHoles((prev) => {
      if (!prev.has(holeNumber)) return prev
      const next = new Set(prev)
      next.delete(holeNumber)
      return next
    })
  }, [])

  // ── Guardado de un hoyo ──
  // Regla de esta función: lo que queda en la celda es lo que hay en la base, o
  // la celda queda marcada en rojo. Antes había tres caminos donde la pantalla
  // y la base se separaban sin aviso en la celda: un valor fuera de rango se
  // quedaba escrito como si hubiera entrado, vaciar una celda no borraba nada,
  // y sin señal el guardado se perdía con "Guardando…" pegado.
  const saveScore = useCallback(
    async (holeNumber: number, value: string) => {
      if (!tournament || !selectedId) return
      const player = players.find((p) => p.id === selectedId)
      if (!player) return
      const round = getActiveRound(player)
      if (!round) return

      const hole = holeByNumero.get(holeNumber)
      const par = hole?.par ?? 4
      const previo = currentScores[holeNumber]
      const crudo = value.trim()

      // Celda vacía: si el hoyo tenía score, el organizador lo borró (lo anotó
      // en el hoyo equivocado) y se borra también en el servidor. Se puede deshacer.
      if (crudo === '') {
        if (previo == null) {
          limpiarError(holeNumber)
          return
        }
        setSaving(true)
        const res = await postHoyo({
          tournament_id: tournament.id, round_id: round.id, hole_number: holeNumber, par, gross_score: null,
        })
        setSaving(false)
        if (!res?.ok) {
          showError('No se borró', `El hoyo ${holeNumber} sigue con ${previo} en el servidor. Intenta nuevamente.`)
          marcarError(holeNumber)
          return
        }
        setLastAction({ holeNumber, previousScore: previo, playerId: selectedId })
        setCurrentScores((prev) => {
          const next = { ...prev }
          delete next[holeNumber]
          return next
        })
        limpiarError(holeNumber)
        showSuccess('Score borrado', `Hoyo ${holeNumber}`, { duration: 1500 })
        await refrescarTotales(selectedId, round.id)
        return
      }

      const gross = parseInt(crudo, 10)
      if (isNaN(gross) || gross < 1 || gross > 19) {
        // El número queda escrito en la celda pero NO se guardó: la celda en rojo
        // lo dice ahí mismo (el toast dura unos segundos y bajo el sol se pierde).
        showWarning('Score inválido', 'El score debe ser entre 1 y 19 golpes.')
        marcarError(holeNumber)
        return
      }
      // Salir de la celda sin cambiar nada no es un guardado: antes cada Tab sobre
      // una celda con score la reenviaba (una fila de auditoría y un "Deshacer"
      // que no deshacía nada). Un hoyo en error sí se reintenta.
      if (gross === previo && !errorHoles.has(holeNumber)) return

      const si = siAllocByHole[holeNumber] ?? hole?.stroke_index ?? holeNumber
      const courseHcp = courseHandicapDeScoring({
        mode: tournament.hcp_calc_mode, player, tournament, courseTees, courseHoles, holeCount,
        hcpPct: hcpPctDelTorneo(tournament),
      })
      // Neto y puntos por la MISMA fuente que el scorer del jugador y el
      // servidor: los tres escriben en las mismas columnas.
      const { neto: netScore, puntos: points } = puntajeDeHoyo({
        gross, par, courseHandicap: courseHcp, strokeIndex: si, holeCount, formato: tournament,
        modo: tournament.modo_juego,
      })

      setLastAction({ holeNumber, previousScore: previo, playerId: selectedId })
      setCurrentScores((prev) => ({ ...prev, [holeNumber]: gross }))
      limpiarError(holeNumber)

      setSaving(true)
      const res = await postHoyo({
        tournament_id: tournament.id,
        round_id: round.id,
        hole_number: holeNumber,
        par,
        gross_score: gross,
        net_score: netScore,
        points,
        putts: holePutts[holeNumber] ?? null,
        fairway_hit: holeFairway[holeNumber] ?? null,
        gir: holeGir[holeNumber] ?? null,
      })
      setSaving(false)

      if (!res?.ok) {
        showError('Error al guardar', `No pudimos guardar el score del hoyo ${holeNumber}. Intenta nuevamente.`)
        marcarError(holeNumber)
        return
      }
      showSuccess('Score guardado', '', { duration: 1500 })
      await refrescarTotales(selectedId, round.id)
    },
    [
      tournament, selectedId, players, getActiveRound, holeByNumero, siAllocByHole,
      courseHoles, courseTees, holeCount, currentScores, errorHoles, holePutts, holeFairway,
      holeGir, refrescarTotales, marcarError, limpiarError, showError, showSuccess, showWarning,
    ],
  )

  const undoLast = useCallback(async () => {
    if (!lastAction || !tournament) return
    const player = players.find((p) => p.id === lastAction.playerId)
    const round = getActiveRound(player)
    if (!round) return
    const { holeNumber, previousScore } = lastAction
    // Deshacer SIEMPRE pasa por el servidor. Con score previo, lo repone; sin
    // score previo (el hoyo estaba vacío), BORRA el golpe (`gross_score: null`).
    // Antes ese segundo caso solo quitaba el número de la pantalla y decía
    // "Hoyo N restaurado": el golpe seguía en la base, contaba en el
    // leaderboard y reaparecía al recargar.
    //
    // La respuesta SE MIRA: este caller manda sólo el gross, así que el
    // servidor deriva el neto — y esa derivación puede fallar. `saving` marca
    // el round-trip: como la tarjeta no revierte de forma optimista, sin esto
    // el botón queda vivo y aparentemente muerto durante 1-2s en 3G.
    // `ScoringHeader` lo esconde con `lastAction && !saving`.
    setSaving(true)
    const res = await postHoyo({
      tournament_id: tournament.id,
      round_id: round.id,
      hole_number: holeNumber,
      par: holeByNumero.get(holeNumber)?.par ?? 4,
      gross_score: previousScore ?? null,
    })
    setSaving(false)
    if (!res?.ok) {
      // La pantalla NO se toca si el servidor rechazó (o no hubo señal):
      // `lastAction` queda vivo para poder reintentar.
      showWarning('No pudimos deshacer', `El hoyo ${holeNumber} sigue como estaba en el servidor. Reintenta.`)
      return
    }
    setCurrentScores((prev) => {
      const next = { ...prev }
      if (previousScore !== undefined) next[holeNumber] = previousScore
      else delete next[holeNumber]
      return next
    })
    limpiarError(holeNumber)
    showSuccess('Deshacer', `Hoyo ${holeNumber} restaurado`, { duration: 1500 })
    setLastAction(null)
    await refrescarTotales(lastAction.playerId, round.id)
  }, [
    lastAction, tournament, players, getActiveRound, holeByNumero, refrescarTotales, limpiarError,
    showSuccess, showWarning,
  ])

  /** Persiste una stat opcional del hoyo (putts / fairway / GIR) contra la ronda
   *  ACTIVA — antes las stats escribían siempre contra `rounds[0]`, así que en
   *  multi-ronda los putts de la R2 caían en la ronda 1. */
  const saveHoleStat = useCallback(
    async (holeNumber: number, patch: HoleStatPatch) => {
      if (!tournament || !selectedId) return
      const gross = currentScores[holeNumber]
      if (gross == null) return
      const player = players.find((p) => p.id === selectedId)
      const round = getActiveRound(player)
      if (!round) return
      const avisoKey = `${selectedId}:${round.id}:${holeNumber}`
      // Igual que el deshacer: manda sólo el gross, el servidor deriva el neto,
      // y si eso falla la stat se pierde. Antes se perdía sin decir nada.
      const res = await postHoyo({
        tournament_id: tournament.id,
        round_id: round.id,
        hole_number: holeNumber,
        par: holeByNumero.get(holeNumber)?.par ?? 4,
        gross_score: gross,
        ...patch,
      })
      if (!res?.ok) {
        // Un solo aviso por hoyo, no uno por stat: putts, fairway y GIR son
        // tres taps sobre el MISMO hoyo, y con la red caída eso son tres
        // toasts de 5s apilados sobre el del score — tapando la pantalla justo
        // cuando el organizador tiene menos tiempo para leerlos.
        if (statWarnedHolesRef.current.has(avisoKey)) return
        statWarnedHolesRef.current.add(avisoKey)
        showWarning('No se guardó', `Las estadísticas del hoyo ${holeNumber} no quedaron registradas. Reintenta.`)
        return
      }
      statWarnedHolesRef.current.delete(avisoKey)
    },
    [tournament, selectedId, currentScores, players, getActiveRound, holeByNumero, showWarning],
  )

  const finalizeRound = useCallback(async () => {
    if (!tournament || !selectedId) return
    const player = players.find((p) => p.id === selectedId)
    const round = getActiveRound(player)
    if (!round) return
    setSaving(true)
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'finalize_round',
        tournament_id: tournament.id,
        round_id: round.id,
      }),
    }).catch(() => null)
    setSaving(false)
    const cuerpo: { error?: unknown; code?: unknown } | null = res && !res.ok
      ? await res.json().catch(() => null)
      : null
    // Ya estaba cerrada (la cerró otro dispositivo, o el primer cierre llegó y se
    // perdió la respuesta): reconciliar con el servidor, no pedir que reintente.
    if (cuerpo?.code === 'round_closed') {
      showWarning('La tarjeta ya estaba cerrada', 'Actualizamos el listado.')
      await reloadRoster()
      clearSelection()
      return
    }
    // Sin esto, un cierre que falló se veía igual que uno exitoso: la tarjeta
    // seguía abierta y el organizador no se enteraba ("el botón no hace nada").
    // El motivo del servidor (torneo cerrado, tarjeta de otro torneo) dice más
    // que "intenta de nuevo", que no arregla esos casos.
    if (!res?.ok) {
      showError('No se cerró la tarjeta', typeof cuerpo?.error === 'string' ? cuerpo.error : 'Intenta de nuevo.')
      return
    }
    await reloadRoster()
    clearSelection()
  }, [tournament, selectedId, players, getActiveRound, reloadRoster, clearSelection, showError, showWarning])

  return {
    selectedId,
    selectedPlayer,
    selectedRound,
    selectPlayer,
    clearSelection,
    currentScores,
    errorHoles,
    saving,
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
    finalizeRound,
    holePutts,
    setHolePutts,
    holeFairway,
    setHoleFairway,
    holeGir,
    setHoleGir,
    saveHoleStat,
  }
}

export type UseScoreEntryReturn = ReturnType<typeof useScoreEntry>
