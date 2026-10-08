'use client'

// ─── Hook central de la vista live de ronda-libre ───────────────────────────
// Orquesta carga inicial, polling, refetch por visibilidad, contador
// "actualizado hace Ns" y notificaciones de eventos (líder/birdie).
//
// Sin Supabase Realtime (incidente torneo Los Leones 04-oct-2026): consulta cada
// INTERVALO_EN_VIVO_S la ruta `/api/ronda-libre/[codigo]/live`, que el CDN de
// Vercel cachea → M espectadores ≈ 1 consulta a la base por intervalo.
// `useLivePoll` pausa en segundo plano, nunca solapa consultas y consulta al volver.
//
// Las guardas "set solo si hay datos" mantienen que un hiccup de red NO borre
// pares ni equipos ya cargados.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadRondaLibre, loadHcpConSesion, aplicarHcpConSesion, type HcpConSesion } from '@/lib/data/ronda-libre-live-api'
import { getVsPar, getVsParNeto, getHolesPlayed } from '@/lib/ronda/helpers'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { notifyScoreEvent, getNotifPrefs } from '@/lib/push-notifications'
import { formatOverUnder } from '@/constants/golf'
import { useLivePoll } from '@/hooks/ronda/useLivePoll'
import { segundosDesdeElDato, textoActualizadoHace } from '@/lib/ronda/actualizado-hace'
import type { RondaLibre, Role } from '@/types/ronda'
import type { Equipo } from '@/app/ronda-libre/[codigo]/types'

const SS_KEY = (codigo: string) => `ronda-${codigo}-role`

/** Cada cuánto el espectador consulta la ronda (el CDN cachea 10 s: consultar más seguido no trae nada nuevo). */
export const INTERVALO_EN_VIVO_S = 10

export interface UseRondaLibreLiveResult {
  ronda: RondaLibre | null
  parMap: Record<number, number>
  siMap: Record<number, number>
  courseHcpMap: Record<string, number>
  sinIndice: string[]
  displayHcpMap: Record<string, number>
  equipos: Equipo[]
  loading: boolean
  notFound: boolean
  fetchError: boolean
  role: Role
  /** Segundos que faltan para la próxima consulta (barra "Actualiza en Ns"). */
  countdown: number
  timeSinceUpdate: string
  /** Consulta ya (botón "Actualizar" / "Reintentar"). */
  retry: () => void
}

/**
 * Huella de lo que cambia durante la ronda: golpes de cada jugador y de cada
 * equipo + estado. Si no cambió, no hay nada que notificar ni GWI que recalcular.
 */
function huellaDeLaRonda(ronda: RondaLibre, equipos: Equipo[]): string {
  return JSON.stringify([
    ronda.estado,
    ronda.ronda_libre_jugadores.map(j => [j.id, j.scores]),
    equipos.map(e => [e.id, e.scores]),
  ])
}

/**
 * @param codigo    código de la ronda
 * @param onRefresh callback disparado cuando cambian los golpes o el estado de
 *                  la ronda (la página lo usa para refetchear el GWI). NO se
 *                  dispara en cada consulta: el GWI depende de quién mira y no
 *                  se cachea en el CDN.
 */
export function useRondaLibreLive(codigo: string, onRefresh?: () => void): UseRondaLibreLiveResult {
  const [ronda, setRonda] = useState<RondaLibre | null>(null)
  const [parMap, setParMap] = useState<Record<number, number>>({})
  const [siMap, setSiMap] = useState<Record<number, number>>({})
  const [courseHcpMap, setCourseHcpMap] = useState<Record<string, number>>({})
  const [displayHcpMap, setDisplayHcpMap] = useState<Record<string, number>>({})
  const [sinIndice, setSinIndice] = useState<string[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [role, setRole] = useState<Role>(null)
  /** Cuándo llegó el dato mostrado (reloj local) y cuánto llevaba en el CDN (header Age). */
  const [llegada, setLlegada] = useState<{ ms: number; edadS: number } | null>(null)
  /** Reloj de la vista (tick 1 s): countdown y "actualizado hace Ns". */
  const [ahora, setAhora] = useState(0)
  /** Course handicap con el índice de perfil: sólo para un visor con sesión (ruta privada). */
  const [hcpSesion, setHcpSesion] = useState<HcpConSesion | null>(null)

  const huellaRef = useRef<string | null>(null)
  const prevLeaderRef = useRef<string | null>(null)
  const prevScoresRef = useRef<Record<string, number>>({})

  // onRefresh puede cambiar de identidad cada render; lo guardamos en ref.
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh })

  /**
   * Notificaciones de eventos (cambio de líder, birdie/eagle) con los datos
   * RECIÉN llegados. `avisar=false` sólo siembra el estado previo (primera
   * carga: lo que ya pasó no se notifica).
   */
  const revisarEventos = useCallback((
    r: RondaLibre, pares: Record<number, number>, sis: Record<number, number>,
    chs: Record<string, number>, avisar: boolean,
  ) => {
    const isNeto = r.modo_juego === 'neto'
    const hoyos = hoyosDeLaRonda(r.hoyo_inicio, r.holes)
    const lb = [...r.ronda_libre_jugadores]
      .map(j => {
        const ch = chs[j.id] ?? Math.round(j.handicap ?? 0)
        const vsPar = isNeto
          ? getVsParNeto(j.scores, r.holes, pares, sis, ch, hoyos)
          : getVsPar(j.scores, r.holes, pares, hoyos)
        return { nombre: j.nombre, vsPar, hp: getHolesPlayed(j.scores, r.holes, hoyos) }
      })
      .filter(j => j.hp > 0)
      .sort((a, b) => a.vsPar - b.vsPar)

    if (lb.length > 0) {
      const leader = lb[0]
      if (avisar && prevLeaderRef.current && prevLeaderRef.current !== leader.nombre) {
        notifyScoreEvent(leader.nombre, 'leader_change', `Toma el liderato con ${formatOverUnder(leader.vsPar)}`, `/ronda-libre/${codigo}`)
      }
      prevLeaderRef.current = leader.nombre
    }

    for (const j of r.ronda_libre_jugadores) {
      for (const h of hoyos) {
        const s = j.scores[String(h)] ?? (j.scores as Record<number, number>)[h]
        const prevKey = `${j.id}-${h}`
        if (s != null && !prevScoresRef.current[prevKey]) {
          if (avisar) {
            const diff = s - (pares[h] ?? 4)
            if (diff <= -2) notifyScoreEvent(j.nombre, 'eagle', `Eagle en hoyo ${h}`, `/ronda-libre/${codigo}`)
            else if (diff === -1) notifyScoreEvent(j.nombre, 'birdie', `Birdie en hoyo ${h}`, `/ronda-libre/${codigo}`)
          }
          prevScoresRef.current[prevKey] = s
        }
      }
    }
  }, [codigo])

  const reload = useCallback(async () => {
    const res = await loadRondaLibre(codigo)
    if (res.status === 'ok') {
      const t = Date.now()
      setFetchError(false)
      setAhora(t)
      setLlegada({ ms: t, edadS: res.edadSegundos ?? 0 })
      setRonda(res.ronda)
      // No borrar pares ante hiccup: solo actualizar si vinieron datos de cancha.
      if (Object.keys(res.parMap).length > 0) {
        setParMap(res.parMap)
        setSiMap(res.siMap)
      }
      setCourseHcpMap(res.courseHcpMap)
      setDisplayHcpMap(res.displayHcpMap)
      setSinIndice(res.sinIndice)
      // No borrar equipos ante hiccup: solo actualizar si vinieron.
      if (res.equipos.length > 0) setEquipos(res.equipos)

      const huella = huellaDeLaRonda(res.ronda, res.equipos)
      const primera = huellaRef.current === null
      if (huella !== huellaRef.current) {
        huellaRef.current = huella
        revisarEventos(res.ronda, res.parMap, res.siMap, res.courseHcpMap, !primera && getNotifPrefs().spectator)
        // El GWI ya se pidió al montar (useGWI); se recalcula sólo si cambió algo.
        if (!primera) onRefreshRef.current?.()
      }
    } else if (res.status === 'not_found') {
      setNotFound(true)
    } else if (res.status === 'error' || huellaRef.current === null) {
      // Sin nada que mostrar todavía, un corte es "reintentar", no "no encontrada".
      setFetchError(true)
    }
    // 'transient' con datos ya cargados: conservarlos, el próximo poll reintenta.
    setLoading(false)
  }, [codigo, revisarEventos])

  // Esta vista es siempre espectador (read-only).
  useEffect(() => {
    sessionStorage.setItem(SS_KEY(codigo), 'espectador')
    setRole('espectador')
  }, [codigo])

  // Polling: carga inicial + cada INTERVALO_EN_VIVO_S + al volver a primer plano.
  // Se detiene con la ronda finalizada (ya no cambia) o inexistente.
  const finalizada = ronda?.estado === 'finalizada'
  const { pollNow, nextPollAt } = useLivePoll(reload, {
    intervalMs: INTERVALO_EN_VIVO_S * 1000,
    enabled: !!codigo && !notFound && !finalizada,
  })

  // Reloj de la vista (1 s) mientras hay algo en vivo que contar.
  useEffect(() => {
    if (role !== 'espectador' || finalizada) return
    const tick = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [role, finalizada])

  const countdown = nextPollAt != null && ahora > 0
    ? Math.min(INTERVALO_EN_VIVO_S, Math.max(0, Math.ceil((nextPollAt - ahora) / 1000)))
    : INTERVALO_EN_VIVO_S

  // Privacidad (decisión de Juanjo 08-oct): la ruta pública no trae el course
  // handicap de jugadores con cuenta sin índice en la tarjeta. Si hay alguno, se
  // pide UNA vez (y si cambia esa lista) a la ruta privada; sin sesión responde
  // 401 y queda lo público (sinIndice, como lo ve hoy un anónimo).
  const conCuentaSinIndice = (ronda?.ronda_libre_jugadores ?? [])
    .filter(j => j.user_id && j.handicap == null)
    .map(j => j.id)
    .sort()
    .join(',')
  useEffect(() => {
    if (!conCuentaSinIndice) return
    let vigente = true
    loadHcpConSesion(codigo).then(r => { if (vigente) setHcpSesion(r) })
    return () => { vigente = false }
  }, [codigo, conCuentaSinIndice])
  const hcp = useMemo(
    () => aplicarHcpConSesion({ courseHcpMap, displayHcpMap, sinIndice }, conCuentaSinIndice ? hcpSesion : null),
    [courseHcpMap, displayHcpMap, sinIndice, hcpSesion, conCuentaSinIndice],
  )

  const timeSinceUpdate = textoActualizadoHace(segundosDesdeElDato(llegada?.ms ?? null, llegada?.edadS ?? 0, ahora))

  const retry = useCallback(() => {
    // Sólo la pantalla de error pasa a "cargando"; con datos en pantalla, el
    // botón "Actualizar" consulta sin taparla.
    if (huellaRef.current === null) {
      setFetchError(false)
      setLoading(true)
    }
    void pollNow()
  }, [pollNow])

  return {
    ronda, parMap, siMap,
    courseHcpMap: hcp.courseHcpMap, displayHcpMap: hcp.displayHcpMap, sinIndice: hcp.sinIndice,
    equipos,
    loading, notFound, fetchError, role,
    countdown, timeSinceUpdate,
    retry,
  }
}
