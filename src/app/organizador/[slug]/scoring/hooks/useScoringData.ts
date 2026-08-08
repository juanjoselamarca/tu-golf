// Carga y estado base del scorer del organizador: torneo, roster, catálogo de
// cancha y navegación multi-ronda. Acceso a datos vía `lib/data/tournaments/scoring`
// (cero `supabase.from()` en la página).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import type { CourseHole } from '@/golf/leaderboard/types'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { parDeLaRondaDelTorneo } from '@/golf/core/course-handicap'
import {
  fetchScoringCourseContext,
  fetchScoringRoster,
  fetchScoringTournament,
  type ScoringPlayer,
  type ScoringRound,
  type ScoringTournament,
} from '@/lib/data/tournaments/scoring'

/** "La ronda está cerrada" para el flujo legacy: acción del organizador.
 *  (`'completed'` NO existe en prod — la columna toma in_progress/closed.) */
export function isClosedRoundStatus(status: string | undefined): boolean {
  return status === 'closed' || status === 'official'
}

export interface UseScoringDataReturn {
  tournament: ScoringTournament | null
  players: ScoringPlayer[]
  courseHoles: CourseHole[]
  /**
   * Par de la RONDA (fuente única `parDeLaRondaDelTorneo`). Se deriva acá,
   * donde está el catálogo CRUDO: una vez resuelto en hoyos ya no se
   * distingue "sin catálogo" de "cancha neutra a par 4", y ahí se pierde el
   * par que la cancha sí publica en `courses.par_total`.
   */
  parTotal: number
  courseTees: CourseTeeRow[]
  loading: boolean
  loadError: boolean
  retryLoad: () => void
  reloadRoster: () => Promise<void>
  /** Ronda del jugador que corresponde a la ronda activa del torneo. */
  getActiveRound: (player: ScoringPlayer | undefined) => ScoringRound | undefined
  setPlayerHandicap: (playerId: string, value: number) => void
  applyRoundTotals: (
    playerId: string,
    roundId: string,
    totals: Pick<ScoringRound, 'total_gross' | 'total_net' | 'total_points'>,
  ) => void
  // Multi-ronda
  totalRounds: number
  isMultiRound: boolean
  holeCount: number
  activeRoundNum: number
  selectRound: (rn: number) => void
  canStartNextRound: boolean
  startingNextRound: boolean
  startNextRound: () => Promise<boolean>
}

export function useScoringData(slug: string): UseScoringDataReturn {
  const { showError, showSuccess } = useToast()

  const [tournament, setTournament] = useState<ScoringTournament | null>(null)
  const [players, setPlayers] = useState<ScoringPlayer[]>([])
  const [courseHoles, setCourseHoles] = useState<CourseHole[]>([])
  const [parTotal, setParTotal] = useState(72)
  const [courseTees, setCourseTees] = useState<CourseTeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadNonce, setLoadNonce] = useState(0)
  const [activeRoundNum, setActiveRoundNum] = useState(1)
  const [startingNextRound, setStartingNextRound] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setLoadError(false)
      try {
        const supabase = createClient()
        const t = await fetchScoringTournament(supabase, slug)
        if (cancelled) return
        if (!t) {
          setTournament(null)
          setLoading(false)
          return
        }
        setTournament(t)

        const [roster, courseCtx] = await Promise.all([
          fetchScoringRoster(supabase, t.id),
          t.courses?.id
            ? fetchScoringCourseContext(supabase, t.courses.id)
            : Promise.resolve({ holes: [] as CourseHole[], tees: [] as CourseTeeRow[] }),
        ])
        if (cancelled) return

        setPlayers(roster)
        // Los hoyos de la RONDA, no los del catálogo: una cancha de 9 hoyos en
        // un torneo de 18 se recorre dos veces y los hoyos 10-18 son los 1-9
        // otra vez, con su par y su dificultad reales (`@/golf/courses/vueltas`).
        setCourseHoles(hoyosDeLaVuelta(courseCtx.holes, t.hole_count || 18))
        setParTotal(
          parDeLaRondaDelTorneo(courseCtx.holes, t.hole_count || 18, t.courses?.par_total),
        )
        setCourseTees(courseCtx.tees)

        // Ronda activa = mayor round_number existente en el field.
        const maxRound = roster.reduce((max, pl) => {
          const pMax = pl.rounds?.reduce((m, r) => Math.max(m, r.round_number ?? 1), 0) ?? 0
          return Math.max(max, pMax)
        }, 1)
        setActiveRoundNum(maxRound)
        setLoading(false)
      } catch (e) {
        void captureError(e, { context: 'scoring.useScoringData.load', meta: { slug } })
        if (!cancelled) {
          setLoadError(true)
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [slug, loadNonce])

  const retryLoad = useCallback(() => setLoadNonce((n) => n + 1), [])

  const reloadRoster = useCallback(async () => {
    if (!tournament) return
    try {
      const roster = await fetchScoringRoster(createClient(), tournament.id)
      setPlayers(roster)
    } catch (e) {
      void captureError(e, { context: 'scoring.useScoringData.reloadRoster', meta: { slug } })
      showError('Error', 'No pudimos refrescar la lista de jugadores.')
    }
  }, [tournament, slug, showError])

  const getActiveRound = useCallback(
    (player: ScoringPlayer | undefined) => {
      if (!player?.rounds) return undefined
      return player.rounds.find((r) => (r.round_number ?? 1) === activeRoundNum) || player.rounds[0]
    },
    [activeRoundNum],
  )

  const setPlayerHandicap = useCallback((playerId: string, value: number) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, handicap_at_registration: value } : p)),
    )
  }, [])

  const applyRoundTotals = useCallback(
    (
      playerId: string,
      roundId: string,
      totals: Pick<ScoringRound, 'total_gross' | 'total_net' | 'total_points'>,
    ) => {
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id !== playerId) return p
          const rounds = (p.rounds || []).map((r) => (r.id === roundId ? { ...r, ...totals } : r))
          return { ...p, rounds }
        }),
      )
    },
    [],
  )

  const totalRounds = tournament?.total_rounds || 1
  const isMultiRound = totalRounds > 1
  const holeCount = tournament?.hole_count || 18

  const allCurrentRoundsClosed = useMemo(
    () =>
      players.every((p) => {
        const r = p.rounds?.find((r) => (r.round_number ?? 1) === activeRoundNum)
        return r ? isClosedRoundStatus(r.status) : true
      }),
    [players, activeRoundNum],
  )
  const canStartNextRound =
    isMultiRound && allCurrentRoundsClosed && activeRoundNum < totalRounds && players.length > 0

  const selectRound = useCallback(
    (rn: number) => {
      const hasRound = players.some((p) => p.rounds?.some((r) => (r.round_number ?? 1) === rn))
      if (hasRound) setActiveRoundNum(rn)
    },
    [players],
  )

  const startNextRound = useCallback(async (): Promise<boolean> => {
    if (!tournament || !canStartNextRound) return false
    setStartingNextRound(true)
    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_next_round', tournament_id: tournament.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.roundNumber) {
        showError('Error', data.error || 'No se pudo iniciar la siguiente ronda')
        return false
      }
      setActiveRoundNum(data.roundNumber)
      showSuccess('Ronda iniciada', `Se creo la ronda ${data.roundNumber} para ${data.playersCount} jugadores`)
      await reloadRoster()
      return true
    } catch (e) {
      void captureError(e, { context: 'scoring.useScoringData.startNextRound', meta: { slug } })
      showError('Error', 'No se pudo iniciar la siguiente ronda')
      return false
    } finally {
      setStartingNextRound(false)
    }
  }, [tournament, canStartNextRound, reloadRoster, showError, showSuccess, slug])

  return {
    tournament,
    players,
    courseHoles,
    parTotal,
    courseTees,
    loading,
    loadError,
    retryLoad,
    reloadRoster,
    getActiveRound,
    setPlayerHandicap,
    applyRoundTotals,
    totalRounds,
    isMultiRound,
    holeCount,
    activeRoundNum,
    selectRound,
    canStartNextRound,
    startingNextRound,
    startNextRound,
  }
}
