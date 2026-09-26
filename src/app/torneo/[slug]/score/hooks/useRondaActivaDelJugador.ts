// src/app/torneo/[slug]/score/hooks/useRondaActivaDelJugador.ts
//
// La ronda ACTIVA del jugador seleccionado y el contexto de la cancha en que
// SE JUEGA esa ronda (hoyos, par, tees, ratings).
//
// Antes el scorer del jugador tomaba `rounds[0]` —el orden en que PostgREST
// devolvió las tarjetas— y la cancha de la ronda 1 para todo: en un torneo
// multi-ronda podía escribir sobre la tarjeta ya cerrada de la ronda 1, o
// puntuar la ronda 2 con el par y el slope de otra cancha, y persistir
// `net_score`/`points` mal. Fuentes únicas: `activeRoundOf` (qué ronda) y
// `fetchRoundScoringContext` (qué cancha), las mismas del organizador.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { activeRoundOf } from '@/golf/tournament-rounds'
import type { CourseHole } from '@/golf/leaderboard/types'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import {
  fetchRoundScoringContext,
  type RoundScoringContext,
  type ScoringPlayer,
  type ScoringRound,
  type ScoringTournament,
} from '@/lib/data/tournaments/scoring'

interface Args {
  slug: string
  tournament: ScoringTournament | null
  player: ScoringPlayer | undefined
  /** Catálogo CRUDO + tees de la cancha del torneo (ronda 1), ya cargados. */
  base: { holes: CourseHole[]; tees: CourseTeeRow[] }
}

export interface RondaActivaDelJugador {
  /** La tarjeta sobre la que se escribe. undefined si el jugador no tiene rondas. */
  round: ScoringRound | undefined
  /** Contexto de la cancha de esa ronda; null hasta que resuelve o si falló. */
  ctx: RoundScoringContext | null
  error: boolean
  retry: () => void
}

export function useRondaActivaDelJugador({ slug, tournament, player, base }: Args): RondaActivaDelJugador {
  const round = activeRoundOf(player?.rounds)
  const roundNumber = round?.round_number ?? 1
  // Una cancha por ronda: el contexto se resuelve una vez por número de ronda
  // y se DERIVA en render (nada de setState síncrono dentro del efecto).
  const [porRonda, setPorRonda] = useState<ReadonlyMap<number, RoundScoringContext>>(new Map())
  const [errores, setErrores] = useState<ReadonlySet<number>>(new Set())
  const [nonce, setNonce] = useState(0)

  const ctx = player && tournament ? (porRonda.get(roundNumber) ?? null) : null
  const error = errores.has(roundNumber)

  useEffect(() => {
    if (!tournament || !player || porRonda.has(roundNumber)) return
    let cancelled = false
    ;(async () => {
      try {
        const resolved = await fetchRoundScoringContext(createClient(), tournament, roundNumber, base)
        if (cancelled) return
        setPorRonda((prev) => new Map(prev).set(roundNumber, resolved))
        setErrores((prev) => {
          if (!prev.has(roundNumber)) return prev
          const next = new Set(prev)
          next.delete(roundNumber)
          return next
        })
      } catch (e) {
        // Sin la cancha de la ronda NO se scorea: un neto calculado con el
        // slope de otra cancha queda persistido. La pantalla ofrece reintentar.
        void captureError(e, { context: 'torneo.score.rondaActiva', meta: { slug, roundNumber } })
        if (!cancelled) setErrores((prev) => new Set(prev).add(roundNumber))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tournament, player, roundNumber, base, slug, nonce, porRonda])

  // Sin useCallback: el React Compiler no preserva la memo de un closure que
  // construye un Set, y para un `onClick` una función nueva por render es gratis.
  const retry = () => {
    setErrores(new Set<number>())
    setNonce((n) => n + 1)
  }

  return { round, ctx, error, retry }
}
