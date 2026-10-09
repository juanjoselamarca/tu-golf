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
import { loadRondaLibre, loadHcpConSesion, aplicarHcpConSesion, rehidratarHandicaps, type HcpConSesion } from '@/lib/data/ronda-libre-live-api'
import type { VistaPublica } from '@/lib/data/tournaments/vista-publica'
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
  /**
   * Qué puede ver este visor (regla canónica `vistaPublica`): null = todo (tiene
   * sesión); si no, la vista pública: `sinNeto` (nada neto) y `soloBruto` (ronda
   * neto: clasificación bruta en `modo`/`formato`).
   */
  vistaVisor: VistaPublica | null
  /** El visor tiene sesión pero el neto no cargó (se reintenta solo). */
  errorNeto: boolean
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
  /** Handicaps que sólo ve un visor con sesión (ruta privada) y en qué quedó pedirlos. */
  const [hcpSesion, setHcpSesion] = useState<HcpConSesion | null>(null)
  const [estadoSesion, setEstadoSesion] = useState<'pendiente' | 'ok' | 'sin-sesion' | 'error'>('pendiente')
  /** Reintentos de la ruta privada tras un error, con backoff (no en cada poll). */
  const [intentoHcp, setIntentoHcp] = useState(0)
  const fallasHcpRef = useRef(0)
  const hcpSesionRef = useRef<HcpConSesion | null>(null)
  /** Qué trae la respuesta pública (la de un visor sin sesión). */
  const [vistaPublicaResp, setVistaPublicaResp] = useState<VistaPublica | null>(null)

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
    /** false = no se calcula el líder (ronda neto vista en gross: el líder bruto no es el de la ronda). */
    conLider = true,
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

    if (conLider && lb.length > 0) {
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
      setVistaPublicaResp(res.vista ?? null)
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
        // Ronda neto sin handicaps en la respuesta pública: con sesión (handicaps ya
        // traídos) el líder se calcula en NETO; sin ellos, no se avisa de líder (el
        // bruto no es el de la ronda). Birdies/eagles son contra el par: siempre.
        const sesion = hcpSesionRef.current
        const avisar = !primera && getNotifPrefs().spectator
        if (res.vista?.soloBruto && sesion) {
          const { ronda: r } = rehidratarHandicaps(res.ronda, res.equipos, sesion)
          const chs = aplicarHcpConSesion({ courseHcpMap: res.courseHcpMap, displayHcpMap: res.displayHcpMap, sinIndice: res.sinIndice }, sesion).courseHcpMap
          revisarEventos(r, res.parMap, res.siMap, chs, avisar)
        } else if (res.vista?.soloBruto) {
          revisarEventos({ ...res.ronda, modo_juego: 'gross' }, res.parMap, res.siMap, res.courseHcpMap, avisar, false)
        } else {
          revisarEventos(res.ronda, res.parMap, res.siMap, res.courseHcpMap, avisar)
        }
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

  // Privacidad (decisiones de Juanjo 08-oct; regla canónica `vistaPublica`,
  // src/lib/data/tournaments/vista-publica.ts). La respuesta pública es la de un
  // visor SIN sesión (`vistaPublicaResp`): sin neto, y en una ronda neto sólo bruto.
  // Una vez por carga (y si cambia la lista de jugadores) se pide la ruta privada:
  // con sesión trae los handicaps y este visor ve todo; sin sesión responde 401 y
  // queda la vista pública. Si falla, se reintenta con backoff.
  const jugadores = ronda?.ronda_libre_jugadores ?? []
  // `|| '-'`: una ronda sin jugadores igual resuelve el estado (si no, spinner eterno).
  const claveJugadores = ronda ? jugadores.map(j => j.id).sort().join(',') || '-' : ''
  useEffect(() => {
    if (!claveJugadores) return
    let vigente = true
    let reintento: ReturnType<typeof setTimeout> | null = null
    loadHcpConSesion(codigo).then(r => {
      if (!vigente) return
      setEstadoSesion(r.status)
      if (r.status === 'ok') {
        fallasHcpRef.current = 0
        hcpSesionRef.current = r.data
        setHcpSesion(r.data)
      } else if (r.status === 'error') {
        // Backoff: 10 s, 20 s, 40 s… tope 2 min.
        const espera = Math.min(120_000, 10_000 * 2 ** fallasHcpRef.current)
        fallasHcpRef.current += 1
        reintento = setTimeout(() => setIntentoHcp(n => n + 1), espera)
      }
    })
    return () => {
      vigente = false
      if (reintento) clearTimeout(reintento)
    }
  }, [codigo, claveJugadores, intentoHcp])

  const conSesion = claveJugadores && estadoSesion === 'ok' ? hcpSesion : null
  const hcp = useMemo(
    () => aplicarHcpConSesion({ courseHcpMap, displayHcpMap, sinIndice }, conSesion),
    [courseHcpMap, displayHcpMap, sinIndice, conSesion],
  )
  const soloBrutoPublico = !!vistaPublicaResp?.soloBruto
  const datos = useMemo(
    () => (ronda && soloBrutoPublico && conSesion ? rehidratarHandicaps(ronda, equipos, conSesion) : { ronda, equipos }),
    [ronda, equipos, soloBrutoPublico, conSesion],
  )
  // Lo que ve ESTE visor: con sesión, todo; si no (o mientras no se sabe), la pública.
  const vistaVisor: VistaPublica | null = conSesion || !vistaPublicaResp ? null : vistaPublicaResp
  const errorNeto = !!vistaVisor?.sinNeto && estadoSesion === 'error'
  // Ronda neto: mientras se resuelve si este visor ve el neto, sigue "cargando"
  // (sin parpadear la clasificación bruta a quien sí tiene sesión).
  const esperandoNeto = soloBrutoPublico && estadoSesion === 'pendiente'

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
    ronda: datos.ronda, parMap, siMap,
    courseHcpMap: hcp.courseHcpMap, displayHcpMap: hcp.displayHcpMap, sinIndice: hcp.sinIndice,
    equipos: datos.equipos,
    loading: loading || esperandoNeto, notFound, fetchError, role,
    countdown, timeSinceUpdate,
    retry,
    vistaVisor, errorNeto,
  }
}
