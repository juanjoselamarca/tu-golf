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
import { resolveFormatoJuego } from '@/golf/formats'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { fetchResumenBoardInputs, type ScoringTournament } from '@/lib/data/tournaments/scoring'
import type { CourseHole } from '@/golf/leaderboard/types'

interface UseResumenBoardArgs {
  tournament: ScoringTournament | null
  /** Los hoyos de la RONDA, ya resueltos por `useScoringData`. */
  courseHoles: CourseHole[]
  /**
   * Par de la ronda, de la MISMA fuente que usa el board público
   * (`parDeLaRondaDelTorneo`). Antes se derivaba acá con
   * `courses.par_total ?? 72`: el par de UNA vuelta, que en una cancha de 9
   * hoyos jugada a 18 deja el vs-par de las tarjetas cargadas sólo por
   * totales corrido 35 golpes — y distinto del que muestra `/torneo`.
   */
  parTotal: number
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
  parTotal,
  active,
}: UseResumenBoardArgs): UseResumenBoardReturn {
  const [out, setOut] = useState<LegacyLeaderboardOutput | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)


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
          formatoJuego: resolveFormatoJuego(tournament) as TournamentLeaderboardContext['formatoJuego'],
          courseHoles: hoyosDeLaVuelta(courseHoles, totalHoyos),
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
