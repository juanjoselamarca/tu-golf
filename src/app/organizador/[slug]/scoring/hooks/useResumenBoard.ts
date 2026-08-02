// El board del tab "Resumen" del organizador — EL MISMO MOTOR que la vista
// pública (`buildLeaderboardFromLegacy`), con el MISMO contexto que arman
// `/torneo`, `/tv` y `/en-vivo`. El Resumen no calcula nada: proyecta.
//
// Antes este tab recalculaba "quién va mejor" por su cuenta desde las columnas
// denormalizadas (`rounds.total_net`, `status === 'completed'`) y las dos
// tarjetas mentían en prod: "N completos" clavado en 0 (el status 'completed'
// no existe) y "Mejor Neto" en "--" (19/77 rondas con total_net=0). Detalle en
// `src/golf/leaderboard/resumen-cards.ts`.
//
// Se refetchea cada vez que el tab se ACTIVA (y vía `reload()` tras editar un
// handicap): el organizador siempre mira números frescos post-scoring.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import type { Player } from '@/lib/golf-data'
import type { TournamentLeaderboardContext } from '@/golf/leaderboard/types'
import {
  buildLeaderboardFromLegacy,
  computeResumenCards,
  type LegacyLeaderboardOutput,
  type ResumenCards,
} from '@/golf/leaderboard'
import { buildFallbackCourseHoles } from '@/lib/data/tournaments/leaderboard'
import { fetchResumenBoardInputs, type ScoringTournament } from '@/lib/data/tournaments/scoring'
import type { CourseHole } from '@/golf/leaderboard/types'

interface UseResumenBoardArgs {
  tournament: ScoringTournament | null
  /** Catálogo ya cargado por el scorer (mismo fetch ordenado por `numero`). */
  courseHoles: CourseHole[]
  /** El tab Resumen está visible — el fetch sólo corre cuando hace falta. */
  active: boolean
}

export interface UseResumenBoardReturn {
  loading: boolean
  error: boolean
  /** Ranking primario del motor — mismo orden que el board público. */
  rows: Player[]
  cards: ResumenCards | null
  reload: () => void
}

export function useResumenBoard({
  tournament,
  courseHoles,
  active,
}: UseResumenBoardArgs): UseResumenBoardReturn {
  const [out, setOut] = useState<LegacyLeaderboardOutput | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)

  const parTotal = tournament?.courses?.par_total ?? 72

  useEffect(() => {
    if (!active || !tournament) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(false)
      try {
        const { dbPlayers, hcp } = await fetchResumenBoardInputs(createClient(), tournament.id)
        if (cancelled) return
        const totalHoyos = tournament.hole_count || 18
        // Contexto IDÉNTICO al de la vista pública (`/torneo/[slug]/page.tsx`):
        // mismo fallback de catálogo, mismos defaults de modo/formato, mismo
        // contexto de handicap. Si esto divergiera, el organizador y el público
        // verían números distintos del mismo torneo.
        const ctx: TournamentLeaderboardContext = {
          parTotal,
          totalHoyos,
          modoJuego: tournament.modo_juego ?? 'gross',
          formatoJuego: tournament.formato_juego ?? 'stroke_play',
          courseHoles: courseHoles.length > 0 ? courseHoles : buildFallbackCourseHoles(totalHoyos),
          hcp,
        }
        const board = buildLeaderboardFromLegacy(dbPlayers, ctx, tournament.total_rounds ?? 1)
        if (!cancelled) setOut(board)
      } catch (e) {
        void captureError(e, {
          context: 'scoring.useResumenBoard',
          meta: { tournamentId: tournament.id },
        })
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [active, tournament, courseHoles, parTotal, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const cards = useMemo(
    () =>
      out
        ? computeResumenCards(out.players, out.playersByGross, out.playersByNeto, parTotal)
        : null,
    [out, parTotal],
  )

  return { loading, error, rows: out?.players ?? [], cards, reload }
}
