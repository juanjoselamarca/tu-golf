// Entrada de scores hoyo a hoyo del scorer del organizador: selección de
// jugador, scores en vivo, stats opcionales (putts/fairway/GIR), undo,
// finalizar ronda. Toda la cuenta de golf sale de `src/golf/` (course handicap,
// SI normalizado, strokes por hoyo, stableford) — acá sólo se orquesta.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { puntosStablefordHoyo, strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import { puntajeDeHoyo, courseHandicapDeScoring } from '@/golf/core/hole-scoring'
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
    },
    [],
  )

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    resetHoleState()
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
        })
      : 0

  const netTotal = holes.reduce((s, h) => {
    if (!currentScores[h]) return s
    const si = siAllocByHole[h] ?? holeByNumero.get(h)?.stroke_index ?? h
    return s + (currentScores[h] - strokesRecibidosEnHoyo(selectedCourseHcp, si, holeCount))
  }, 0)

  const stablefordPtsAt = useCallback(
    (holeNumber: number, gross: number) => {
      const hole = holeByNumero.get(holeNumber)
      const si = siAllocByHole[holeNumber] ?? hole?.stroke_index ?? holeNumber
      return puntosStablefordHoyo(gross, hole?.par ?? 4, selectedCourseHcp, si, holeCount)
    },
    [holeByNumero, siAllocByHole, selectedCourseHcp, holeCount],
  )

  // ── Guardado de un hoyo ──
  const saveScore = useCallback(
    async (holeNumber: number, value: string) => {
      const gross = parseInt(value)
      if (isNaN(gross) || !tournament || !selectedId) return
      if (gross < 1 || gross > 19) {
        showWarning('Score inválido', 'El score debe ser entre 1 y 19 golpes.')
        return
      }
      const player = players.find((p) => p.id === selectedId)
      if (!player) return
      const round = getActiveRound(player)
      if (!round) return

      const hole = holeByNumero.get(holeNumber)
      const par = hole?.par ?? 4
      const si = siAllocByHole[holeNumber] ?? hole?.stroke_index ?? holeNumber
      const courseHcp = courseHandicapDeScoring({
        mode: tournament.hcp_calc_mode, player, tournament, courseTees, courseHoles, holeCount,
      })
      // Neto y puntos por la MISMA fuente que el scorer del jugador y el
      // servidor: los tres escriben en las mismas columnas.
      const { neto: netScore, puntos: points } = puntajeDeHoyo({
        gross, par, courseHandicap: courseHcp, strokeIndex: si, holeCount, formato: tournament,
      })

      setLastAction({ holeNumber, previousScore: currentScores[holeNumber], playerId: selectedId })
      setCurrentScores((prev) => ({ ...prev, [holeNumber]: gross }))
      setErrorHoles((prev) => {
        const next = new Set(prev)
        next.delete(holeNumber)
        return next
      })

      setSaving(true)
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert_score',
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
        }),
      })
      setSaving(false)

      if (!res.ok) {
        showError('Error al guardar', `No pudimos guardar el score del hoyo ${holeNumber}. Intenta nuevamente.`)
        setErrorHoles((prev) => new Set(prev).add(holeNumber))
        return
      }
      showSuccess('Score guardado', '', { duration: 1500 })

      // Refrescar los totales denormalizados de la ficha (no los usa el Resumen).
      try {
        const totals = await fetchRoundTotals(createClient(), round.id)
        if (totals) applyRoundTotals(selectedId, round.id, totals)
      } catch (e) {
        void captureError(e, { context: 'scoring.useScoreEntry.refreshTotals', meta: { roundId: round.id } })
      }
    },
    [
      tournament, selectedId, players, getActiveRound, holeByNumero, siAllocByHole,
      courseHoles, courseTees, holeCount, currentScores, holePutts, holeFairway,
      holeGir, applyRoundTotals, showError, showSuccess, showWarning,
    ],
  )

  const undoLast = useCallback(async () => {
    if (!lastAction || !tournament) return
    const player = players.find((p) => p.id === lastAction.playerId)
    const round = getActiveRound(player)
    if (!round) return
    if (lastAction.previousScore !== undefined) {
      setCurrentScores((prev) => ({ ...prev, [lastAction.holeNumber]: lastAction.previousScore! }))
      const hole = holeByNumero.get(lastAction.holeNumber)
      await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert_score',
          tournament_id: tournament.id,
          round_id: round.id,
          hole_number: lastAction.holeNumber,
          par: hole?.par ?? 4,
          gross_score: lastAction.previousScore,
        }),
      })
    } else {
      setCurrentScores((prev) => {
        const next = { ...prev }
        delete next[lastAction.holeNumber]
        return next
      })
    }
    showSuccess('Deshacer', `Hoyo ${lastAction.holeNumber} restaurado`, { duration: 1500 })
    setLastAction(null)
  }, [lastAction, tournament, players, getActiveRound, holeByNumero, showSuccess])

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
      await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert_score',
          tournament_id: tournament.id,
          round_id: round.id,
          hole_number: holeNumber,
          par: holeByNumero.get(holeNumber)?.par ?? 4,
          gross_score: gross,
          ...patch,
        }),
      })
    },
    [tournament, selectedId, currentScores, players, getActiveRound, holeByNumero],
  )

  const finalizeRound = useCallback(async () => {
    if (!tournament || !selectedId) return
    const player = players.find((p) => p.id === selectedId)
    const round = getActiveRound(player)
    if (!round) return
    setSaving(true)
    await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'finalize_round',
        tournament_id: tournament.id,
        round_id: round.id,
      }),
    })
    setSaving(false)
    await reloadRoster()
    clearSelection()
  }, [tournament, selectedId, players, getActiveRound, reloadRoster, clearSelection])

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
