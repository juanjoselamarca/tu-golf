'use client'

// ─── Hook central de la vista live de ronda-libre ───────────────────────────
// Extraído del componente monolítico [codigo]/page.tsx (job "Resultados v2").
// Orquesta carga inicial, realtime, polling fallback, refetch por visibilidad,
// contador "actualizado hace Ns" y notificaciones de eventos (líder/birdie).
//
// Behavior-preserving respecto del antiguo fetchRonda + sus useEffects. Las
// guardas "set solo si hay datos" replican que un hiccup de red NO borre pares
// ni equipos ya cargados.

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadRondaLibre } from '@/lib/data/ronda-libre'
import { getVsPar, getVsParNeto, getHolesPlayed } from '@/lib/ronda/helpers'
import { notifyScoreEvent, getNotifPrefs } from '@/lib/push-notifications'
import { formatOverUnder } from '@/constants/golf'
import { useRondaRealtime } from '@/hooks/ronda/useRondaRealtime'
import { useCountdown } from '@/hooks/ronda/useCountdown'
import type { RondaLibre, Role } from '@/types/ronda'
import type { Equipo } from '@/app/ronda-libre/[codigo]/types'

const SS_KEY = (codigo: string) => `ronda-${codigo}-role`

export interface UseRondaLibreLiveResult {
  ronda: RondaLibre | null
  parMap: Record<number, number>
  siMap: Record<number, number>
  courseHcpMap: Record<string, number>
  equipos: Equipo[]
  loading: boolean
  notFound: boolean
  fetchError: boolean
  role: Role
  countdown: number
  isRealtimeConnected: boolean
  timeSinceUpdate: string
  /** Reintenta tras un error de carga (botón "Reintentar"). */
  retry: () => void
  /** Actualiza el score de un jugador en memoria (tras guardado admin). */
  applyLocalScore: (jugadorId: string, updatedScores: Record<string, number>) => void
}

/**
 * @param codigo    código de la ronda
 * @param onRefresh callback disparado en cada refresh de realtime/polling
 *                  (la página lo usa para refetchear GWI)
 */
export function useRondaLibreLive(codigo: string, onRefresh?: () => void): UseRondaLibreLiveResult {
  const [ronda, setRonda] = useState<RondaLibre | null>(null)
  const [parMap, setParMap] = useState<Record<number, number>>({})
  const [siMap, setSiMap] = useState<Record<number, number>>({})
  const [courseHcpMap, setCourseHcpMap] = useState<Record<string, number>>({})
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [role, setRole] = useState<Role>(null)
  const [secSinceUpdate, setSecSinceUpdate] = useState(0)

  const prevLeaderRef = useRef<string | null>(null)
  const prevScoresRef = useRef<Record<string, number>>({})

  // onRefresh puede cambiar de identidad cada render; lo guardamos en ref para
  // mantener estable `refresh` sin re-suscribir realtime en cada render.
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const reload = useCallback(async () => {
    const res = await loadRondaLibre(codigo)
    if (res.status === 'ok') {
      setFetchError(false)
      setSecSinceUpdate(0)
      setRonda(res.ronda)
      // No borrar pares ante hiccup: solo actualizar si vinieron datos de cancha.
      if (Object.keys(res.parMap).length > 0) {
        setParMap(res.parMap)
        setSiMap(res.siMap)
      }
      setCourseHcpMap(res.courseHcpMap)
      // No borrar equipos ante hiccup: solo actualizar si vinieron.
      if (res.equipos.length > 0) setEquipos(res.equipos)
    } else if (res.status === 'not_found') {
      setNotFound(true)
    } else if (res.status === 'error') {
      setFetchError(true)
    }
    // 'transient': conservar data previa, reintentar en el próximo poll.
    setLoading(false)
  }, [codigo])

  // Notificaciones de eventos (cambio de líder, birdie/eagle).
  const checkScoreEvents = useCallback(() => {
    if (!ronda || !getNotifPrefs().spectator) return
    const isNeto = ronda.modo_juego === 'neto'
    const lb = [...ronda.ronda_libre_jugadores]
      .map(j => {
        const ch = courseHcpMap[j.id] ?? Math.round(j.handicap ?? 0)
        const vsPar = isNeto
          ? getVsParNeto(j.scores, ronda.holes, parMap, siMap, ch)
          : getVsPar(j.scores, ronda.holes, parMap)
        return { nombre: j.nombre, vsPar, hp: getHolesPlayed(j.scores, ronda.holes) }
      })
      .filter(j => j.hp > 0)
      .sort((a, b) => a.vsPar - b.vsPar)

    if (lb.length === 0) return
    const leader = lb[0]

    if (prevLeaderRef.current && prevLeaderRef.current !== leader.nombre) {
      notifyScoreEvent(leader.nombre, 'leader_change', `Toma el liderato con ${formatOverUnder(leader.vsPar)}`, `/ronda-libre/${codigo}`)
    }
    prevLeaderRef.current = leader.nombre

    for (const j of ronda.ronda_libre_jugadores) {
      for (let h = 1; h <= ronda.holes; h++) {
        const s = j.scores[String(h)] ?? (j.scores as Record<number, number>)[h]
        const prevKey = `${j.id}-${h}`
        if (s != null && !prevScoresRef.current[prevKey]) {
          const p = parMap[h] ?? 4
          const diff = s - p
          if (diff <= -2) notifyScoreEvent(j.nombre, 'eagle', `Eagle en hoyo ${h}`, `/ronda-libre/${codigo}`)
          else if (diff === -1) notifyScoreEvent(j.nombre, 'birdie', `Birdie en hoyo ${h}`, `/ronda-libre/${codigo}`)
          prevScoresRef.current[prevKey] = s
        }
      }
    }
  }, [ronda, parMap, siMap, courseHcpMap, codigo])

  // Refresh compartido por realtime y polling fallback.
  const refresh = useCallback(() => {
    reload().then(() => checkScoreEvents())
    onRefreshRef.current?.()
  }, [reload, checkScoreEvents])

  // Carga inicial.
  useEffect(() => { reload() }, [reload])

  // Re-fetch al volver la pantalla (arregla "no encontrada" tras pantalla apagada).
  useEffect(() => {
    const handler = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [reload])

  // Esta vista es siempre espectador (read-only).
  useEffect(() => {
    sessionStorage.setItem(SS_KEY(codigo), 'espectador')
    setRole('espectador')
  }, [codigo])

  // Realtime primario.
  const { isConnected: isRealtimeConnected } = useRondaRealtime(codigo, refresh, role === 'espectador')

  // Polling fallback cada 15s solo cuando realtime no está conectado.
  const countdown = useCountdown(15, refresh, role === 'espectador' && !isRealtimeConnected)

  // Contador "actualizado hace Ns".
  useEffect(() => {
    if (role !== 'espectador') return
    const tick = setInterval(() => setSecSinceUpdate(s => s + 1), 1000)
    return () => clearInterval(tick)
  }, [role])

  const timeSinceUpdate = secSinceUpdate < 5
    ? 'Justo ahora'
    : secSinceUpdate < 60
      ? `Actualizado hace ${secSinceUpdate}s`
      : `Actualizado hace ${Math.floor(secSinceUpdate / 60)}m`

  const retry = useCallback(() => {
    setFetchError(false)
    setLoading(true)
    reload()
  }, [reload])

  const applyLocalScore = useCallback((jugadorId: string, updatedScores: Record<string, number>) => {
    setRonda(prev => {
      if (!prev) return prev
      return {
        ...prev,
        ronda_libre_jugadores: prev.ronda_libre_jugadores.map(j =>
          j.id === jugadorId ? { ...j, scores: updatedScores } : j,
        ),
      }
    })
  }, [])

  return {
    ronda, parMap, siMap, courseHcpMap, equipos,
    loading, notFound, fetchError, role,
    countdown, isRealtimeConnected, timeSinceUpdate,
    retry, applyLocalScore,
  }
}
