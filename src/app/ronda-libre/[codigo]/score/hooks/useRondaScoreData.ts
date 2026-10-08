'use client'

import { useEffect, useState } from 'react'
import { sesionDelScorer } from '@/lib/auth/sesion-del-scorer'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { RondaLibre, HoleData } from '@/types/ronda'
import { isTeamFormat } from '@/golf/formats'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import {
  fetchRondaLibreParaScorer,
  cargarHoyosDelScorer,
  resolverHandicapsDelScorer,
  tarjetasDesdeLaRonda,
  MENSAJE_SCORER_SIN_CONEXION,
  REINTENTO_CARGA_MS,
} from '@/lib/data/ronda-libre-scorer'
import { loadScores as lsLoad } from '@/lib/ronda/score-storage'
import { captureError } from '@/lib/error-tracking'

export interface RondaScoreData {
  ronda: RondaLibre | null
  setRonda: React.Dispatch<React.SetStateAction<RondaLibre | null>>
  scores: Record<string, Record<number, number>>
  setScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>
  parMap: Record<number, number>
  setParMap: React.Dispatch<React.SetStateAction<Record<number, number>>>
  holeDataMap: Record<number, HoleData>
  setHoleDataMap: React.Dispatch<React.SetStateAction<Record<number, HoleData>>>
  playerHcp: Record<string, number>
  setPlayerHcp: React.Dispatch<React.SetStateAction<Record<string, number>>>
  /** Course handicap COMPLETO (18h) por jugador — para MOSTRAR en badges (no para scoring). */
  playerDisplayHcp: Record<string, number>
  activeJugadorId: string | null
  setActiveJugadorId: React.Dispatch<React.SetStateAction<string | null>>
  selectedPlayer: string | null
  setSelectedPlayer: React.Dispatch<React.SetStateAction<string | null>>
  currentHole: number
  setCurrentHole: React.Dispatch<React.SetStateAction<number>>
  loading: boolean
  loadError: string | null
  adminRedirectMsg: string | null
  /** Usuario autenticado que abrió el scorer (`null` si no hay sesión). */
  authUserId: string | null
}

/**
 * Carga de la ronda para el scorer INDIVIDUAL: la ronda, las tarjetas (BD +
 * respaldo local), par/SI/yardaje por hoyo y course handicap por jugador —
 * todo por la capa de datos `@/lib/data/ronda-libre-scorer` (compartida con
 * el scorer de grupo). Acá quedan las decisiones propias de esta pantalla:
 * a quién redirigir (ronda cerrada, demo, formato por equipos, admin mode) y
 * qué jugador queda seleccionado.
 */
export function useRondaScoreData(codigo: string, jugadorParam: string | null): RondaScoreData {
  const router = useRouter()

  const [ronda, setRonda] = useState<RondaLibre | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeJugadorId, setActiveJugadorId] = useState<string | null>(null)
  const [currentHole, setCurrentHole] = useState(1)
  const [scores, setScores] = useState<Record<string, Record<number, number>>>({})
  const [parMap, setParMap] = useState<Record<number, number>>({})
  const [holeDataMap, setHoleDataMap] = useState<Record<number, HoleData>>({})
  const [playerHcp, setPlayerHcp] = useState<Record<string, number>>({})
  const [playerDisplayHcp, setPlayerDisplayHcp] = useState<Record<string, number>>({})
  const [adminRedirectMsg, setAdminRedirectMsg] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Sube para reintentar la carga cuando el servidor no respondió (caída 04-oct). */
  const [intento, setIntento] = useState(0)
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [authUserId, setAuthUserId] = useState<string | null>(null)

  /* ── Load ronda ── */
  useEffect(() => {
    let reintento: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
      const supabase = createClient()
      // Caída del 04-oct-2026: un timeout devolvía "no existe" y el scorer mandaba
      // al jugador al dashboard. Sin servidor: pantalla de espera que reintenta sola.
      const sinConexion = () => {
        setLoadError(MENSAJE_SCORER_SIN_CONEXION)
        setLoading(false)
        reintento = setTimeout(() => setIntento(i => i + 1), REINTENTO_CARGA_MS)
      }
      const carga = await fetchRondaLibreParaScorer(supabase, codigo)
      if (carga.estado === 'no_existe') { router.push('/dashboard'); return }
      if (carga.estado === 'sin_conexion') { sinConexion(); return }
      const r = carga.ronda
      // Quién anota: la sesión del teléfono, no el servidor de login (puede estar caído).
      const sesion = await sesionDelScorer(supabase)
      if (sesion.estado === 'sin_conexion') { sinConexion(); return }
      const authUser = sesion.estado === 'ok' ? { id: sesion.userId } : null
      // If ronda was closed (by admin or player), redirect to detail view (read-only)
      if (r.estado === 'finalizada') { router.replace(`/ronda-libre/${codigo}`); return }
      // Demo rondas son spectator-only: cualquier usuario es redirigido al leaderboard.
      // El scoring usa la UI real en /score, no queremos que toquen demo data.
      if (r.es_demo) { router.replace(`/ronda-libre/${codigo}`); return }
      // Team formats must use score-grupo (individual scoring doesn't support teams)
      if (isTeamFormat(r.formato_juego)) {
        router.replace(`/ronda-libre/${codigo}/score-grupo`)
        return
      }
      // Admin mode: non-admin members cannot use individual scoring
      if (r.admin_mode) {
        if (r.admin_user_id === authUser?.id) {
          router.replace(`/ronda-libre/${codigo}/score-grupo`)
          return
        }
        if (r.admin_user_id !== authUser?.id) {
          // Show message before redirecting
          setAdminRedirectMsg('El admin de grupo lleva tu score. Redirigiendo al leaderboard...')
          setTimeout(() => router.replace(`/ronda-libre/${codigo}`), 1500)
          return
        }
      }
      setRonda(r)

      // BD manda; el respaldo local sólo aporta lo que la BD no tiene.
      const db = tarjetasDesdeLaRonda(r)
      const initialScores: Record<string, Record<number, number>> = {}
      for (const j of r.ronda_libre_jugadores) {
        initialScores[j.id] = { ...lsLoad(codigo, j.id), ...db[j.id] }
      }
      setScores(initialScores)

      const hoyos = await cargarHoyosDelScorer(supabase, r)
      setParMap(hoyos.parMap)
      setHoleDataMap(hoyos.holeDataMap)

      const { hcpMap, displayMap } = await resolverHandicapsDelScorer(supabase, r, hoyos.finalParTotal)
      setPlayerHcp(hcpMap)
      setPlayerDisplayHcp(displayMap)

      // Auto-detect player: if user is logged in and matches a jugador, auto-select
      setAuthUserId(authUser?.id ?? null)
      const matchedPlayer = authUser ? r.ronda_libre_jugadores.find(j => j.user_id === authUser.id) : null
      // If jugadorParam is set OR user matches a player, auto-select and lock
      const preselect = jugadorParam
        ? r.ronda_libre_jugadores.find(j => j.id === jugadorParam)?.id ?? r.ronda_libre_jugadores[0]?.id
        : matchedPlayer?.id ?? (r.ronda_libre_jugadores.length === 1 ? r.ronda_libre_jugadores[0]?.id : null)

      if (preselect) {
        setSelectedPlayer(preselect)
        setActiveJugadorId(preselect)
        const ex = initialScores[preselect] ?? {}
        const orden = hoyosDeLaRonda(r.hoyo_inicio ?? 1, r.holes)
        const firstEmpty = orden.find(h => ex[h] == null)
        if (firstEmpty != null) setCurrentHole(firstEmpty)
        else setCurrentHole(orden[0])
      } else {
        // Multi-player, no auto-match: show player selection screen
        // Set activeJugadorId to first player so data is loaded, but don't lock
        setActiveJugadorId(r.ronda_libre_jugadores[0]?.id ?? null)
      }
      setLoadError(null)
      setLoading(false)
      } catch (err) {
        captureError(err instanceof Error ? err : new Error(String(err)), { context: 'score_load', level: 'warning' })
        setLoadError(MENSAJE_SCORER_SIN_CONEXION)
        setLoading(false)
        reintento = setTimeout(() => setIntento(i => i + 1), REINTENTO_CARGA_MS)
      }
    }
    load()
    return () => { if (reintento) clearTimeout(reintento) }
  }, [codigo, jugadorParam, router, intento])

  return {
    ronda,
    setRonda,
    scores,
    setScores,
    parMap,
    setParMap,
    holeDataMap,
    setHoleDataMap,
    playerHcp,
    setPlayerHcp,
    playerDisplayHcp,
    activeJugadorId,
    setActiveJugadorId,
    selectedPlayer,
    setSelectedPlayer,
    currentHole,
    setCurrentHole,
    loading,
    loadError,
    adminRedirectMsg,
    authUserId,
  }
}
