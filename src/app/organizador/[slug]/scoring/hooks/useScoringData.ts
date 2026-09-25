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
  fetchBulkRoundHoleCounts,
  fetchScoringCourse,
  fetchScoringCourseContext,
  fetchScoringRoster,
  fetchScoringTournament,
  type ScoringPlayer,
  type ScoringRound,
  type ScoringTournament,
} from '@/lib/data/tournaments/scoring'
import { fetchRoundPlayConfig } from '@/lib/data/tournaments/rounds'

/**
 * Lo que el scorer necesita de la cancha en que se juega UNA ronda. En un
 * torneo multi-ronda cada ronda puede jugarse en otra cancha
 * (`@/golf/tournament-rounds`): el par, los hoyos, los tees y los ratings con
 * los que se puntúa la ronda 2 son los de la cancha de la ronda 2.
 */
export interface RondaActivaContext {
  roundNumber: number
  holeCount: number
  courseHoles: CourseHole[]
  parTotal: number
  courseTees: CourseTeeRow[]
  /** El torneo con `courses`/`hole_count` de ESTA ronda — es lo que consume el
   *  gate de handicap (`courseHandicapDeScoring`) y la tarjeta. */
  tournament: ScoringTournament
}

/** "La ronda está cerrada" para el flujo legacy: acción del organizador.
 *  (`'completed'` NO existe en prod — la columna toma in_progress/closed.) */
export function isClosedRoundStatus(status: string | undefined): boolean {
  return status === 'closed' || status === 'official'
}

export interface UseScoringDataReturn {
  tournament: ScoringTournament | null
  players: ScoringPlayer[]
  /** Hoyos de la RONDA 1 (la cancha del torneo). Es el contexto BASE del board
   *  del Resumen; las rondas en otra cancha viajan aparte (`fetchRoundContexts`). */
  courseHoles: CourseHole[]
  /**
   * Par de la RONDA 1 (fuente única `parDeLaRondaDelTorneo`). Se deriva acá,
   * donde está el catálogo CRUDO: una vez resuelto en hoyos ya no se
   * distingue "sin catálogo" de "cancha neutra a par 4", y ahí se pierde el
   * par que la cancha sí publica en `courses.par_total`.
   */
  parTotal: number
  courseTees: CourseTeeRow[]
  /**
   * Contexto de la ronda ACTIVA (la que se está scoreando). Igual al base
   * mientras la ronda activa se juegue en la cancha de la ronda 1; distinto
   * cuando la ronda 2..N se juega en otra cancha. `null` hasta que resuelve.
   */
  rondaActiva: RondaActivaContext | null
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
  /** Hoyos con score completados por round_id (para progreso de todos los jugadores). */
  roundHoleCounts: Map<string, number>
  /** Refresca los conteos de hoyos (llamar tras guardar un score). */
  refreshHoleCounts: () => Promise<void>
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
  const [roundHoleCounts, setRoundHoleCounts] = useState<Map<string, number>>(new Map())
  /** Catálogo CRUDO de la ronda 1, para armar el contexto de una ronda que repite cancha. */
  const [catalogoBase, setCatalogoBase] = useState<CourseHole[]>([])
  const [rondaActiva, setRondaActiva] = useState<RondaActivaContext | null>(null)

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

        // Progreso de TODOS los jugadores (batch): una sola query.
        const allRoundIds = roster.flatMap((p) => (p.rounds ?? []).map((r) => r.id))
        const holeCounts = await fetchBulkRoundHoleCounts(supabase, allRoundIds)
        if (cancelled) return
        setRoundHoleCounts(holeCounts)

        // Los hoyos de la RONDA, no los del catálogo: una cancha de 9 hoyos en
        // un torneo de 18 se recorre dos veces y los hoyos 10-18 son los 1-9
        // otra vez, con su par y su dificultad reales (`@/golf/courses/vueltas`).
        setCatalogoBase(courseCtx.holes)
        setCourseHoles(hoyosDeLaVuelta(courseCtx.holes, t.hole_count || 18))
        setParTotal(
          parDeLaRondaDelTorneo(courseCtx.holes, t.hole_count || 18, t.courses?.par_total),
        )
        setCourseTees(courseCtx.tees)
        // Hasta que se resuelva la ronda activa (efecto de abajo), la ronda 1.
        setRondaActiva(null)

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

  // ── Contexto de la ronda ACTIVA: cancha, hoyos, tees y ratings de ESA ronda. ──
  // Se resuelve con la fuente única (`fetchRoundPlayConfig` →
  // `resolveRoundPlayConfig`). Si la ronda activa se juega en la cancha de la
  // ronda 1 (o es la ronda 1), se reusa lo ya cargado: cero viajes extra en un
  // torneo de una ronda. Si es otra cancha, se cargan SU catálogo, SUS tees y
  // SUS ratings — el gate WHS reparte el handicap con la cancha en que se juega.
  useEffect(() => {
    if (!tournament) return
    let cancelled = false
    const resolver = async () => {
      try {
        const supabase = createClient()
        const config = await fetchRoundPlayConfig(supabase, tournament, activeRoundNum)
        if (cancelled) return

        const mismaCancha = config.courseId === tournament.course_id
        const holeCountRonda = config.holeCount
        if (mismaCancha) {
          setRondaActiva({
            roundNumber: activeRoundNum,
            holeCount: holeCountRonda,
            courseHoles: hoyosDeLaVuelta(catalogoBase, holeCountRonda),
            parTotal: parDeLaRondaDelTorneo(catalogoBase, holeCountRonda, tournament.courses?.par_total),
            courseTees,
            tournament: { ...tournament, hole_count: holeCountRonda },
          })
          return
        }

        const [ctx, course] = await Promise.all([
          config.courseId
            ? fetchScoringCourseContext(supabase, config.courseId)
            : Promise.resolve({ holes: [] as CourseHole[], tees: [] as CourseTeeRow[] }),
          config.courseId ? fetchScoringCourse(supabase, config.courseId) : Promise.resolve(null),
        ])
        if (cancelled) return
        setRondaActiva({
          roundNumber: activeRoundNum,
          holeCount: holeCountRonda,
          courseHoles: hoyosDeLaVuelta(ctx.holes, holeCountRonda),
          parTotal: parDeLaRondaDelTorneo(ctx.holes, holeCountRonda, course?.par_total),
          courseTees: ctx.tees,
          tournament: { ...tournament, hole_count: holeCountRonda, courses: course },
        })
      } catch (e) {
        // Sin contexto de ronda NO se scorea con la cancha equivocada: la
        // tarjeta queda en "Cargando" y el organizador reintenta. Un neto
        // calculado con el slope de otra cancha es peor que esperar.
        void captureError(e, {
          context: 'scoring.useScoringData.rondaActiva',
          meta: { slug, activeRoundNum },
        })
        if (!cancelled) {
          setRondaActiva(null)
          showError('Error', `No pudimos cargar la cancha de la ronda ${activeRoundNum}. Reintenta.`)
        }
      }
    }
    void resolver()
    return () => {
      cancelled = true
    }
  }, [tournament, activeRoundNum, catalogoBase, courseTees, slug, showError])

  const reloadRoster = useCallback(async () => {
    if (!tournament) return
    try {
      const supabase = createClient()
      const roster = await fetchScoringRoster(supabase, tournament.id)
      setPlayers(roster)
      // Refrescar conteos de hoyos junto con el roster.
      const allRoundIds = roster.flatMap((p) => (p.rounds ?? []).map((r) => r.id))
      const holeCounts = await fetchBulkRoundHoleCounts(supabase, allRoundIds)
      setRoundHoleCounts(holeCounts)
    } catch (e) {
      void captureError(e, { context: 'scoring.useScoringData.reloadRoster', meta: { slug } })
      showError('Error', 'No pudimos refrescar la lista de jugadores.')
    }
  }, [tournament, slug, showError])

  const refreshHoleCounts = useCallback(async () => {
    const allRoundIds = players.flatMap((p) => (p.rounds ?? []).map((r) => r.id))
    if (allRoundIds.length === 0) return
    try {
      const holeCounts = await fetchBulkRoundHoleCounts(createClient(), allRoundIds)
      setRoundHoleCounts(holeCounts)
    } catch (e) {
      void captureError(e, { context: 'scoring.useScoringData.refreshHoleCounts' })
    }
  }, [players])

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
  // Los hoyos de la ronda ACTIVA (pueden diferir de los de la ronda 1).
  const holeCount = rondaActiva?.holeCount ?? tournament?.hole_count ?? 18

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
    rondaActiva,
    loading,
    loadError,
    retryLoad,
    reloadRoster,
    getActiveRound,
    setPlayerHandicap,
    applyRoundTotals,
    roundHoleCounts,
    refreshHoleCounts,
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
