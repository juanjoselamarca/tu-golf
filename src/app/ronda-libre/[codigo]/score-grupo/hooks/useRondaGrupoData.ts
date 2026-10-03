'use client'

import { useEffect, useState } from 'react'
import type React from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { isTeamFormat } from '@/golf/formats'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import {
  fetchRondaLibreParaScorer,
  cargarHoyosDelScorer,
  resolverHandicapsDelScorer,
  fetchEquiposDelScorer,
  tarjetasDesdeLaRonda,
  type EquipoDelScorer,
} from '@/lib/data/ronda-libre-scorer'
import { loadGroupScores } from '@/lib/ronda/score-storage'
import type { HoleData, RondaLibre } from '@/types/ronda'
import { loginUrl } from '@/lib/auth/login-url'

export interface RondaGrupoData {
  ronda: RondaLibre | null
  loading: boolean
  loadError: string | null
  currentHole: number
  setCurrentHole: React.Dispatch<React.SetStateAction<number>>
  scores: Record<string, Record<number, number>>
  setScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>
  parMap: Record<number, number>
  holeDataMap: Record<number, HoleData>
  /** Course handicap que PUNTÚA (en 9h, la mitad). */
  playerHcp: Record<string, number>
  /** El HCP que se MUESTRA: siempre en escala de 18 hoyos, aunque se jueguen 9. */
  playerDisplayHcp: Record<string, number>
  teamEquipos: EquipoDelScorer[]
  setTeamEquipos: React.Dispatch<React.SetStateAction<EquipoDelScorer[]>>
  /** Quién anota: su nombre en la ronda, o el prefijo del email. */
  anotadorNombre: string
  /** Usuario autenticado que abrió el scorer. */
  authUserId: string | null
}

/**
 * Carga de la ronda para el scorer de GRUPO / admin: quién puede entrar
 * (formatos por equipo: cualquier jugador de la ronda; el resto: sólo el
 * admin), la ronda con tarjetas (BD + respaldo local del grupo), par/SI/
 * yardaje por hoyo, course handicaps y equipos — todo por la capa de datos
 * compartida con el scorer individual (`@/lib/data/ronda-libre-scorer`).
 */
export function useRondaGrupoData(codigo: string): RondaGrupoData {
  const router = useRouter()

  const [ronda, setRonda] = useState<RondaLibre | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currentHole, setCurrentHole] = useState(1)
  const [scores, setScores] = useState<Record<string, Record<number, number>>>({})
  const [parMap, setParMap] = useState<Record<number, number>>({})
  const [holeDataMap, setHoleDataMap] = useState<Record<number, HoleData>>({})
  const [playerHcp, setPlayerHcp] = useState<Record<string, number>>({})
  const [playerDisplayHcp, setPlayerDisplayHcp] = useState<Record<string, number>>({})
  const [teamEquipos, setTeamEquipos] = useState<EquipoDelScorer[]>([])
  const [anotadorNombre, setAnotadorNombre] = useState<string>('')
  const [authUserId, setAuthUserId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push(loginUrl(`/ronda-libre/${codigo}/score-grupo`)); return }
      setAuthUserId(user.id)

      const r = await fetchRondaLibreParaScorer(supabase, codigo)
      if (!r) { router.push('/dashboard'); return }

      // Team formats MUST use score-grupo (individual scoring doesn't support them).
      // Non-team rounds require admin_mode + matching admin user.
      if (!isTeamFormat(r.formato_juego) && (!r.admin_mode || r.admin_user_id !== user.id)) {
        router.replace(`/ronda-libre/${codigo}/score`)
        return
      }
      // For team formats without admin_mode, any player in the round can score
      if (isTeamFormat(r.formato_juego) && !r.admin_mode) {
        const isPlayer = r.ronda_libre_jugadores.some(j => j.user_id === user.id)
        if (!isPlayer) {
          router.replace(`/ronda-libre/${codigo}`)
          return
        }
      }

      // Demo rondas son spectator-only (misma regla que /score)
      if (r.es_demo) {
        router.replace(`/ronda-libre/${codigo}`)
        return
      }

      if (r.estado === 'finalizada') {
        router.replace(`/ronda-libre/${codigo}`)
        return
      }

      setRonda(r)

      // Identidad del anotador: primer intento es encontrarse en la lista
      // de jugadores de la ronda; fallback al email del usuario autenticado.
      const matchingPlayer = r.ronda_libre_jugadores.find(j => j.user_id === user.id)
      const derivedName = matchingPlayer?.nombre
        || (user.email ? user.email.split('@')[0] : '')
        || 'Anotador'
      setAnotadorNombre(derivedName)

      // Tarjetas: BD manda; el respaldo local del grupo aporta lo que la BD no tiene.
      const cached = loadGroupScores(codigo)
      const db = tarjetasDesdeLaRonda(r)
      const initialScores: Record<string, Record<number, number>> = {}
      for (const j of r.ronda_libre_jugadores) {
        initialScores[j.id] = { ...(cached[j.id] ?? {}), ...db[j.id] }
      }
      setScores(initialScores)

      const hoyos = await cargarHoyosDelScorer(supabase, r)
      setParMap(hoyos.parMap)
      setHoleDataMap(hoyos.holeDataMap)

      const { hcpMap, displayMap } = await resolverHandicapsDelScorer(supabase, r, hoyos.finalParTotal)
      setPlayerHcp(hcpMap)
      setPlayerDisplayHcp(displayMap)

      // scramble/foursome usan equipo.scores (compartido); best_ball lee la
      // membresía (jugadorIds) y agrupa los scores INDIVIDUALES por equipo
      // (BestBallTeamCard toma la mejor bola neta por hoyo).
      setTeamEquipos(await fetchEquiposDelScorer(supabase, r))

      // Primer hoyo sin anotar del primer jugador (en orden de juego).
      const orden = hoyosDeLaRonda(r.hoyo_inicio ?? 1, r.holes)
      const firstJ = r.ronda_libre_jugadores[0]
      if (firstJ) {
        const ex = initialScores[firstJ.id] ?? {}
        const firstEmpty = orden.find(h => ex[h] == null)
        if (firstEmpty != null) setCurrentHole(firstEmpty)
        else setCurrentHole(orden[0])
      }
      setLoading(false)
      } catch (err) {
        captureError(err instanceof Error ? err : new Error(String(err)), { context: 'score_grupo_load' })
        setLoadError('No se pudo cargar el scorer. Intenta recargar la página.')
        setLoading(false)
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable (Next.js App Router)
  }, [codigo])

  return {
    ronda, loading, loadError,
    currentHole, setCurrentHole,
    scores, setScores,
    parMap, holeDataMap, playerHcp, playerDisplayHcp,
    teamEquipos, setTeamEquipos,
    anotadorNombre, authUserId,
  }
}
