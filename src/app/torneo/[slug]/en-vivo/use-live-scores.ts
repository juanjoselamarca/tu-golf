'use client'

// src/app/torneo/[slug]/en-vivo/use-live-scores.ts
// Hook client-side que polea la tabla hole_scores cada 30s.
// Realtime via supabase channels queda como follow-up (Wave 3 tanda 2).
//
// Estrategia: hole_scores NO tiene tournament_id directo; se relaciona via rounds.tournament_id.
// Primero resolvemos los round_ids del torneo, luego consultamos hole_scores por esos ids.
// Si el torneo no tiene rondas todavia, devolvemos [] sin error.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { LiveScore } from './types'

export type LiveSource = 'polling' | 'realtime'

export interface UseLiveScoresResult {
  scores: LiveScore[]
  lastUpdate: number
  source: LiveSource
}

const POLL_INTERVAL_MS = 30_000

export function useLiveScores(tournamentId: string): UseLiveScoresResult {
  const [scores, setScores] = useState<LiveScore[]>([])
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now())

  useEffect(() => {
    if (!tournamentId) return
    const supabase = createClient()
    let cancelled = false

    async function fetchScores() {
      try {
        // 1) Resolver rondas del torneo (via players -> rounds, ya que rounds.player_id -> players.tournament_id).
        const { data: playerRows, error: playersErr } = await supabase
          .from('players')
          .select('id')
          .eq('tournament_id', tournamentId)
        if (playersErr || !playerRows || playerRows.length === 0) {
          if (!cancelled) {
            setScores([])
            setLastUpdate(Date.now())
          }
          return
        }
        const playerIds = playerRows.map((p: { id: string }) => p.id)

        const { data: roundRows, error: roundsErr } = await supabase
          .from('rounds')
          .select('id')
          .in('player_id', playerIds)
        if (roundsErr || !roundRows || roundRows.length === 0) {
          if (!cancelled) {
            setScores([])
            setLastUpdate(Date.now())
          }
          return
        }
        const roundIds = roundRows.map((r: { id: string }) => r.id)

        // 2) Traer hole_scores de esas rondas.
        const { data: scoreRows, error: scoresErr } = await supabase
          .from('hole_scores')
          .select('id, round_id, hole_number, gross_score, status, source, updated_at')
          .in('round_id', roundIds)
        if (scoresErr) {
          // Silencioso: errores transitorios no deben romper la UI; el siguiente poll reintenta.
          return
        }

        if (!cancelled) {
          setScores((scoreRows ?? []) as LiveScore[])
          setLastUpdate(Date.now())
        }
      } catch {
        // Idem: no propagar; el polling se autoreparara.
      }
    }

    fetchScores()
    const intervalId = setInterval(fetchScores, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [tournamentId])

  return { scores, lastUpdate, source: 'polling' }
}
