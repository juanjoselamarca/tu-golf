'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  MENSAJE_SCORER_SIN_CONEXION,
  REINTENTO_CARGA_MS,
  type EquipoDelScorer,
} from '@/lib/data/ronda-libre-scorer'
import { sesionDelScorer } from '@/lib/auth/sesion-del-scorer'
import {
  loadGroupScores,
  loadGroupTeamScores,
  leerPendientes,
  ID_PENDIENTE_EQUIPO,
  saveScorerGrupoSnapshot,
  loadScorerGrupoSnapshot,
  type ScorerGrupoSnapshot,
} from '@/lib/ronda/score-storage'
import { useRefreshOnResume } from '@/hooks/ronda/useRefreshOnResume'
import type { HoleData, RondaLibre } from '@/types/ronda'
import { loginUrl } from '@/lib/auth/login-url'

/**
 * Estado de la conexión del scorer con el servidor.
 * - `ok`           → datos frescos del servidor.
 * - `sin_conexion` → el servidor no responde: se anota desde la copia local y se reintenta solo.
 * - `sin_sesion`   → la sesión venció/no existe: se anota local; enviar requiere iniciar sesión.
 */
export type ConexionScorer = 'ok' | 'sin_conexion' | 'sin_sesion'


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
  /** ¿El scorer está hablando con el servidor? (caída 04-oct-2026) */
  conexion: ConexionScorer
  /** Hay golpes PENDIENTES de confirmar en el teléfono (p.ej. se recargó en plena caída): enviarlos. */
  golpesSinSubir: boolean
}

type Carga =
  | { tipo: 'ok'; ronda: RondaLibre; userId: string; email: string | null; snap: Omit<ScorerGrupoSnapshot, 'v'> }
  | { tipo: 'redirigir'; a: string; reemplazar: boolean }
  | { tipo: 'sin_conexion'; userId: string | null }
  | { tipo: 'sin_sesion' }

/** Pendientes vienen con claves string (JSON): a hoyo numérico. */
function numerico(golpes: Record<string, number> | undefined): Record<number, number> {
  return Object.fromEntries(Object.entries(golpes ?? {}).map(([h, v]) => [Number(h), v]))
}

/** Primer hoyo sin anotar del primer jugador, en orden de juego. */
function hoyoInicial(r: RondaLibre, scores: Record<string, Record<number, number>>): number {
  const orden = hoyosDeLaRonda(r.hoyo_inicio ?? 1, r.holes)
  const firstJ = r.ronda_libre_jugadores[0]
  if (!firstJ) return orden[0] ?? 1
  const ex = scores[firstJ.id] ?? {}
  return orden.find(h => ex[h] == null) ?? orden[0]
}

/**
 * Lee del servidor todo lo que el scorer necesita. Nunca lanza: una falla de red,
 * 5xx o timeout vuelve como `sin_conexion` (jamás como "la ronda no existe").
 */
async function cargarDelServidor(codigo: string): Promise<Carga> {
  const supabase = createClient()
  const sesion = await sesionDelScorer(supabase)
  if (sesion.estado === 'sin_sesion') return { tipo: 'sin_sesion' }
  if (sesion.estado === 'sin_conexion') return { tipo: 'sin_conexion', userId: null }
  const userId = sesion.userId

  const carga = await fetchRondaLibreParaScorer(supabase, codigo)
  if (carga.estado === 'no_existe') return { tipo: 'redirigir', a: '/dashboard', reemplazar: false }
  if (carga.estado === 'sin_conexion') return { tipo: 'sin_conexion', userId }
  const r = carga.ronda

  // Team formats MUST use score-grupo (individual scoring doesn't support them).
  // Non-team rounds require admin_mode + matching admin user.
  if (!isTeamFormat(r.formato_juego) && (!r.admin_mode || r.admin_user_id !== userId)) {
    return { tipo: 'redirigir', a: `/ronda-libre/${codigo}/score`, reemplazar: true }
  }
  // For team formats without admin_mode, any player in the round can score
  if (isTeamFormat(r.formato_juego) && !r.admin_mode && !r.ronda_libre_jugadores.some(j => j.user_id === userId)) {
    return { tipo: 'redirigir', a: `/ronda-libre/${codigo}`, reemplazar: true }
  }
  // Demo rondas son spectator-only (misma regla que /score); finalizada → vista de resultados.
  if (r.es_demo || r.estado === 'finalizada') {
    return { tipo: 'redirigir', a: `/ronda-libre/${codigo}`, reemplazar: true }
  }

  try {
    const hoyos = await cargarHoyosDelScorer(supabase, r)
    const { hcpMap, displayMap } = await resolverHandicapsDelScorer(supabase, r, hoyos.finalParTotal)
    // scramble/foursome usan equipo.scores (compartido); best_ball lee la
    // membresía (jugadorIds) y agrupa los scores INDIVIDUALES por equipo.
    const teamEquipos = await fetchEquiposDelScorer(supabase, r)
    // Identidad del anotador: su nombre en la ronda; si no juega, el prefijo del email.
    const anotadorNombre = r.ronda_libre_jugadores.find(j => j.user_id === userId)?.nombre
      || (sesion.email ? sesion.email.split('@')[0] : '')
      || 'Anotador'
    return {
      tipo: 'ok', ronda: r, userId, email: sesion.email,
      snap: {
        at: Date.now(), authUserId: userId, anotadorNombre, ronda: r,
        parMap: hoyos.parMap, holeDataMap: hoyos.holeDataMap,
        playerHcp: hcpMap, playerDisplayHcp: displayMap, teamEquipos,
      },
    }
  } catch (err) {
    captureError(err instanceof Error ? err : new Error(String(err)), { context: 'score_grupo_load', level: 'warning' })
    return { tipo: 'sin_conexion', userId }
  }
}

/**
 * Carga de la ronda para el scorer de GRUPO / admin: quién puede entrar
 * (formatos por equipo: cualquier jugador de la ronda; el resto: sólo el
 * admin), la ronda con tarjetas (BD + respaldo local del grupo), par/SI/
 * yardaje por hoyo, course handicaps y equipos — todo por la capa de datos
 * compartida con el scorer individual (`@/lib/data/ronda-libre-scorer`).
 *
 * Resiliencia (caída del 04-oct-2026, torneo Los Leones): una falla pasajera del
 * servidor NUNCA saca al marcador de su ronda. Si no responde, el scorer abre
 * desde la copia local (`saveScorerGrupoSnapshot`), anota en el teléfono y
 * reintenta solo cada 15 s y al volver a la app. Al reconectar se refrescan los
 * datos de la ronda SIN pisar los golpes locales (los envía useGrupoScoreSave).
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
  const [conexion, setConexion] = useState<ConexionScorer>('ok')
  const [golpesSinSubir, setGolpesSinSubir] = useState(false)

  /** ¿Ya hay una ronda en pantalla? (la recarga de fondo no toca golpes ni hoyo) */
  const cargadaRef = useRef(false)
  const enCursoRef = useRef(false)

  const aplicarMetadatos = useCallback((s: Omit<ScorerGrupoSnapshot, 'v'>) => {
    setRonda(s.ronda as RondaLibre)
    setParMap(s.parMap)
    setHoleDataMap(s.holeDataMap as Record<number, HoleData>)
    setPlayerHcp(s.playerHcp)
    setPlayerDisplayHcp(s.playerDisplayHcp)
    // Ya en pantalla (refresco de fondo): los golpes de equipo en pantalla NO se pisan.
    const equipos = s.teamEquipos as EquipoDelScorer[]
    if (cargadaRef.current) {
      setTeamEquipos(prev => {
        const enPantalla = new Map(prev.map(e => [e.id, e.scores]))
        return equipos.map(eq => ({ ...eq, scores: { ...eq.scores, ...(enPantalla.get(eq.id) ?? {}) } }))
      })
    } else {
      setTeamEquipos(equipos)
    }
    setAnotadorNombre(s.anotadorNombre)
    setAuthUserId(s.authUserId)
  }, [])

  /**
   * Primera pintura de los golpes: tarjetas de la ronda + respaldo local (`localGana`: abierto
   * sin servidor, lo local es lo más nuevo) y, SIEMPRE por encima, los golpes PENDIENTES de
   * confirmar — una corrección hecha sin señal nunca la pisa la BD (revisión Fable).
   */
  const pintarPrimeraVez = useCallback((r: RondaLibre, localGana: boolean) => {
    const cached = loadGroupScores(codigo)
    const pend = leerPendientes(codigo)
    const db = tarjetasDesdeLaRonda(r)
    const initialScores: Record<string, Record<number, number>> = {}
    for (const j of r.ronda_libre_jugadores) {
      const base = localGana
        ? { ...db[j.id], ...(cached[j.id] ?? {}) }
        : { ...(cached[j.id] ?? {}), ...db[j.id] } // online: BD manda; lo local aporta lo que falta
      initialScores[j.id] = { ...base, ...numerico(pend[j.id]) }
    }
    setScores(initialScores)
    // Equipos (scramble/foursome): respaldo local + pendientes por encima del servidor/copia.
    const cachedEq = loadGroupTeamScores(codigo)
    setTeamEquipos(prev => prev.map(eq => ({
      ...eq,
      scores: {
        ...eq.scores,
        ...(localGana ? cachedEq[eq.id] ?? {} : {}),
        ...(pend[ID_PENDIENTE_EQUIPO(eq.id)] ?? {}),
      },
    })))
    setGolpesSinSubir(Object.keys(pend).length > 0)
    setCurrentHole(hoyoInicial(r, initialScores))
    cargadaRef.current = true
    setLoadError(null)
    setLoading(false)
  }, [codigo])

  const cargar = useCallback(async () => {
    if (enCursoRef.current) return
    enCursoRef.current = true
    try {
      const c = await cargarDelServidor(codigo)
      if (c.tipo === 'redirigir') {
        if (c.reemplazar) router.replace(c.a)
        else router.push(c.a)
        return
      }
      if (c.tipo === 'ok') {
        saveScorerGrupoSnapshot(codigo, c.snap)
        aplicarMetadatos(c.snap)
        if (!cargadaRef.current) pintarPrimeraVez(c.ronda, false)
        setConexion('ok')
        return
      }
      // Sin servidor o sin sesión: nunca se expulsa a alguien que ya está anotando.
      setConexion(c.tipo)
      if (cargadaRef.current) return
      const snap = loadScorerGrupoSnapshot(codigo, c.tipo === 'sin_conexion' ? c.userId : null)
      if (snap) {
        aplicarMetadatos(snap)
        pintarPrimeraVez(snap.ronda as RondaLibre, true)
        return
      }
      if (c.tipo === 'sin_sesion') {
        router.push(loginUrl(`/ronda-libre/${codigo}/score-grupo`))
        return
      }
      setLoadError(MENSAJE_SCORER_SIN_CONEXION)
      setLoading(false)
    } finally {
      enCursoRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable (Next.js App Router)
  }, [codigo, aplicarMetadatos, pintarPrimeraVez])

  useEffect(() => { void cargar() }, [cargar])

  // Reintento solo mientras el servidor no responde (o la pantalla quedó en "sin conexión").
  const reintentando = conexion !== 'ok' || loadError === MENSAJE_SCORER_SIN_CONEXION
  useEffect(() => {
    if (!reintentando) return
    const id = setInterval(() => { void cargar() }, REINTENTO_CARGA_MS)
    const onOnline = () => { void cargar() }
    window.addEventListener('online', onOnline)
    return () => { clearInterval(id); window.removeEventListener('online', onOnline) }
  }, [reintentando, cargar])
  useRefreshOnResume(useCallback(() => { void cargar() }, [cargar]), reintentando)

  return {
    ronda, loading, loadError,
    currentHole, setCurrentHole,
    scores, setScores,
    parMap, holeDataMap, playerHcp, playerDisplayHcp,
    teamEquipos, setTeamEquipos,
    anotadorNombre, authUserId,
    conexion, golpesSinSubir,
  }
}
