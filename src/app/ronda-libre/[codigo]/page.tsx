'use client'

import { useEffect, useState, useCallback, useRef, useReducer } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Flag, ClipboardList, Trophy, Handshake, PersonStanding } from '@/components/icons'
import { createClient } from '@/lib/supabase'
import { getScoreColor, formatOverUnder } from '@/constants/golf'
import { getScoreColorLight } from '@/golf/core/colors'
import { calcularMatchPlay, displayDesdeJugador, colorResultadoHoyo, type MatchResult, type MatchHoleDetail } from '@/golf/formats/match-play'
import { calcularGWIMatch } from '@/golf/stats/gwi-match'
import { notifyScoreEvent, getNotifPrefs, setNotifPrefs, isPushSupported, requestPermission } from '@/lib/push-notifications'
import { setActiveRondaSession, clearActiveRondaSession } from '@/components/LiveRoundIndicator'
import { Avatar } from '@/components/ui/Avatar'
import { compartirLeaderboard } from '@/lib/share-card'
import type { LeaderboardShareData } from '@/lib/share-card'
import { addToast } from '@/hooks/useToast'
import { calcularBestBall, ordenarEquiposBestBall, calcularScramble, ordenarEquiposScramble, calcularFoursome, ordenarEquiposFoursome } from '@/golf/formats'
import type { BestBallPlayer, ScrambleTeam, FoursomeTeam } from '@/golf/formats'
import TeamLeaderboard from '@/components/TeamLeaderboard'
import { NotifBanner } from '@/components/ronda/NotifBanner'
import { AuthModal } from '@/components/ronda/AuthModal'
import { rankTeams } from '@/lib/ronda/team-ranking'
import { computeHighlights } from '@/lib/ronda/round-highlights'
import { RoundHighlights } from '@/components/ronda/RoundHighlights'
import { useCountdown } from '@/hooks/ronda/useCountdown'
import { useRondaRealtime } from '@/hooks/ronda/useRondaRealtime'

// NotifBanner movido a src/components/ronda/NotifBanner.tsx — import más abajo.
import Scorecard from '@/components/Scorecard'
import type { ScorecardProps } from '@/components/Scorecard'
import GWILeaderboard from '@/components/GWILeaderboard'
import { calcularGWI } from '@/golf/stats/gwi'
import type { JugadorGWIInput, GWIResult } from '@/golf/stats/gwi'
import type { ModoJuego, FormatoJuego, Jugador, CourseHole, RondaLibre, Role, TimelineEvent } from '@/types/ronda'
import { resolverCourseHandicap, cargarCourseData } from '@/golf/core/course-handicap'
import { puntosStablefordHoyo } from '@/golf/core/scoring'
import { parTotalEstandar } from '@/golf/core/round-score'
import { Suspense } from 'react'

/* ── Helpers ────────────────────────────────────────────────────────────── */
const SS_KEY = (codigo: string) => `ronda-${codigo}-role`

// Helpers puros movidos a src/lib/ronda/helpers.ts
import {
  getVsPar,
  getVsParNeto,
  getHolesPlayed,
  buildTimelineEvents,
} from '@/lib/ronda/helpers'

/* ── Auth Modal Component ──────────────────────────────────────────────── */
// AuthModal movido a src/components/ronda/AuthModal.tsx — import más abajo.

/* ── Main Component ─────────────────────────────────────────────────────── */
function RondaLibrePageContent() {
  const params  = useParams()
  const router  = useRouter()
  const searchParams = useSearchParams()
  const codigo  = params.codigo as string
  const finishedParam = searchParams.get('finished') === 'true'

  const [ronda,       setRonda]       = useState<RondaLibre | null>(null)
  const [parMap,      setParMap]      = useState<Record<number, number>>({})
  const [siMap,       setSiMap]       = useState<Record<number, number>>({})
  const [courseHcpMap, setCourseHcpMap] = useState<Record<string, number>>({})
  const [loading,     setLoading]     = useState(true)
  const [notFound,    setNotFound]    = useState(false)
  const [fetchError,  setFetchError]  = useState(false)
  const [role,        setRole]        = useState<Role>(null)
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const prevLeaderRef = useRef<string | null>(null)
  const prevScoresRef = useRef<Record<string, number>>({})
  const [, forceRender] = useReducer((x: number) => x + 1, 0)
  const [copied,      setCopied]      = useState(false)
  const [gwiInputs,   setGwiInputs]   = useState<JugadorGWIInput[]>([])
  const [_gwiResults, setGwiResults]  = useState<GWIResult[]>([])
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showBanner,  setShowBanner]  = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authModalAction, setAuthModalAction] = useState('')
  const [secSinceUpdate, setSecSinceUpdate] = useState(0)
  // Admin score editing
  const [equipos, setEquipos] = useState<Array<{ id: string; nombre: string; handicap_equipo: number | null; jugadorIds: string[]; scores: Record<string, number> }>>([])
  const [editingScore, setEditingScore] = useState<{ jugadorId: string; hole: number; currentScore: number } | null>(null)
  const [editScoreValue, setEditScoreValue] = useState<number>(0)

  /* ── Fetch GWI ── */
  const fetchGWI = useCallback(async () => {
    try {
      const res = await fetch(`/api/gwi/ronda-libre/${codigo}`)
      if (!res.ok) return
      const json = await res.json()
      if (json.inputs) {
        setGwiInputs(json.inputs)
        setGwiResults(calcularGWI(json.inputs, json.totalHoyos))
      }
    } catch (err) {
      console.error('[GWI fetch error]', err)
    }
  }, [codigo])

  /* ── Fetch ronda ── */
  const fetchRonda = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('rondas_libres')
        .select('id, codigo, course_name, course_id, tees, holes, fecha, estado, modo_juego, formato_juego, admin_mode, admin_user_id, creador_id, recorridos, ronda_libre_jugadores(id, nombre, user_id, scores, handicap, tees)')
        .eq('codigo', codigo)
        .single()

      if (!data) {
        // Only set notFound on actual 404, not on network/auth errors
        if (error?.code === 'PGRST116' || (!error && !data)) {
          setNotFound(true)
        }
        // On transient errors (network, auth), silently retry on next poll
      } else {
        setFetchError(false)
        setSecSinceUpdate(0)
        setRonda(data as unknown as RondaLibre)
        const r = data as unknown as RondaLibre
        let finalParTotal = parTotalEstandar(r.holes)
        // Fetch hole pars if course linked
        if (r.course_id) {
          let holeQuery = supabase
            .from('course_holes')
            .select('numero, par, stroke_index, recorrido')
            .eq('course_id', r.course_id!)
          // Multi-loop: filter by selected recorridos
          const recorridos = r.recorridos as string[] | null
          if (recorridos && recorridos.length > 0) {
            holeQuery = holeQuery.in('recorrido', recorridos)
          }
          const { data: holes } = await holeQuery.order('recorrido').order('numero')
          if (holes) {
            const pm: Record<number, number> = {}
            const sm: Record<number, number> = {}
            const isMultiLoop = recorridos && recorridos.length > 1
            let holeNum = 1
            ;(holes as CourseHole[]).forEach(h => {
              const num = isMultiLoop ? holeNum : h.numero
              pm[num] = h.par
              sm[num] = h.stroke_index
              holeNum++
            })
            setParMap(pm)
            setSiMap(sm)
            finalParTotal = Object.values(pm).reduce((a, b) => a + b, 0)
          }
        }

        // Convertir índice → course handicap usando fórmula WHS (tee por jugador)
        const courseDataByTee: Record<string, Awaited<ReturnType<typeof cargarCourseData>>> = {}
        const chMap: Record<string, number> = {}
        const supabaseForProfiles = createClient()
        for (const j of r.ronda_libre_jugadores) {
          let index: number
          if (j.handicap != null) {
            index = j.handicap
          } else if (j.user_id) {
            const { data: p } = await supabaseForProfiles.from('profiles').select('indice').eq('id', j.user_id).single()
            index = p?.indice ?? 0
          } else {
            index = 18
          }
          const playerTee = (j.tees || r.tees || 'azul').toLowerCase()
          if (!courseDataByTee[playerTee]) {
            courseDataByTee[playerTee] = await cargarCourseData(r.course_id, playerTee, r.holes, finalParTotal, (r.recorridos as string[] | null) ?? null)
          }
          chMap[j.id] = resolverCourseHandicap(index, courseDataByTee[playerTee])
        }
        setCourseHcpMap(chMap)

        // Fetch team data for team formats (inside fetchRonda so polling refreshes it)
        if (['best_ball', 'scramble', 'foursome'].includes(r.formato_juego)) {
          const { data: eqData } = await supabase
            .from('ronda_equipos')
            .select('id, nombre, handicap_equipo, scores, ronda_equipo_jugadores(jugador_id, orden)')
            .eq('ronda_id', r.id)
            .order('created_at')
          if (eqData) {
            setEquipos(eqData.map(e => ({
              id: e.id,
              nombre: e.nombre,
              handicap_equipo: e.handicap_equipo,
              scores: (e.scores as Record<string, number>) || {},
              jugadorIds: ((e.ronda_equipo_jugadores || []) as Array<{ jugador_id: string; orden: number }>)
                .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
                .map(m => m.jugador_id),
            })))
          }
        }
      }
    } catch (err) {
      console.error('[fetchRonda error]', err)
      setFetchError(true)
    }
    setLoading(false)
  }, [codigo])

  useEffect(() => { fetchRonda() }, [fetchRonda])

  // Check if user has an active session
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAnonymous(!user)
      setCurrentUserId(user?.id ?? null)
    })
  }, [])

  // Show registration banner after 30s for anonymous users (welcome screen or spectator view)
  useEffect(() => {
    if (!isAnonymous || bannerDismissed) return
    const dismissed = sessionStorage.getItem(`banner-dismissed-${codigo}`)
    if (dismissed) { setBannerDismissed(true); return }
    const timer = setTimeout(() => setShowBanner(true), 8000)
    const handleScroll = () => { setShowBanner(true); window.removeEventListener('scroll', handleScroll) }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => { clearTimeout(timer); window.removeEventListener('scroll', handleScroll) }
  }, [isAnonymous, bannerDismissed, role, codigo])

  // Re-fetch when screen turns back on (fixes "ronda no encontrada" after screen off)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        fetchRonda()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [fetchRonda])

  // Always spectator — this page is read-only leaderboard
  useEffect(() => {
    sessionStorage.setItem(SS_KEY(codigo), 'espectador')
    setRole('espectador')
  }, [codigo])

  // Polling every 15s (spectator only)
  // Spectator: detect score events and send notifications
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

    // Detect leader change
    if (prevLeaderRef.current && prevLeaderRef.current !== leader.nombre) {
      notifyScoreEvent(leader.nombre, 'leader_change', `Toma el liderato con ${formatOverUnder(leader.vsPar)}`, `/ronda-libre/${codigo}`)
    }
    prevLeaderRef.current = leader.nombre

    // Detect birdies/eagles (compare with previous scores)
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

  // Fetch GWI inmediato al pasar a rol espectador
  useEffect(() => {
    if (role !== 'espectador') return
    fetchGWI()
  }, [role, fetchGWI])

  // Callback de refresh compartido por realtime y polling fallback
  const refreshSpectator = useCallback(() => {
    fetchRonda().then(() => checkScoreEvents())
    fetchGWI()
  }, [fetchRonda, fetchGWI, checkScoreEvents])

  // Primary: Supabase Realtime — dispara refresh en cualquier cambio de ronda_libre_jugadores
  const { isConnected: isRealtimeConnected } = useRondaRealtime(
    codigo,
    refreshSpectator,
    role === 'espectador'
  )

  // Fallback: polling cada 15s solo cuando Realtime no está conectado
  const countdown = useCountdown(
    15,
    refreshSpectator,
    role === 'espectador' && !isRealtimeConnected
  )

  // secSinceUpdate sube 1 por segundo mientras seamos espectadores
  useEffect(() => {
    if (role !== 'espectador') return
    const tick = setInterval(() => setSecSinceUpdate(s => s + 1), 1000)
    return () => clearInterval(tick)
  }, [role])

  // Derived label from counter (no client clock needed)
  const timeSinceUpdate = secSinceUpdate < 5 ? 'Justo ahora' : secSinceUpdate < 60 ? `Actualizado hace ${secSinceUpdate}s` : `Actualizado hace ${Math.floor(secSinceUpdate / 60)}m`

  /* ── Handlers ── */
  const dismissBanner = () => {
    setBannerDismissed(true)
    setShowBanner(false)
    sessionStorage.setItem(`banner-dismissed-${codigo}`, '1')
  }

  const requireAuth = (action: string) => {
    if (isAnonymous) {
      setAuthModalAction(action)
      setShowAuthModal(true)
      return true
    }
    return false
  }


  // Track active ronda for live indicator on role set
  useEffect(() => {
    if (role === 'espectador' && ronda && ronda.estado === 'en_curso' && !isAnonymous) {
      setActiveRondaSession(codigo, ronda.course_name)
    }
  }, [role, ronda, isAnonymous, codigo])

  const siteUrl = 'https://golfersplus.vercel.app'
  const shareUrl = `${siteUrl}/ronda-libre/${codigo}`
  const shareText = (() => {
    if (!ronda) return 'Sigue la ronda en vivo en Golfers+'
    const jugadores = ronda.ronda_libre_jugadores
    if (jugadores.length === 0) return `Ronda en ${ronda.course_name} — Golfers+`

    // Match Play — calculate result inline
    if (ronda.formato_juego === 'match_play' && jugadores.length === 2) {
      const holesArr = Object.entries(parMap).map(([num, par]) => ({
        numero: Number(num), par, stroke_index: siMap[Number(num)] ?? Number(num),
      }))
      if (holesArr.length > 0) {
        const scA: Record<string, number> = {}
        const scB: Record<string, number> = {}
        for (const [k, v] of Object.entries(jugadores[0].scores)) { if (v > 0) scA[k] = v }
        for (const [k, v] of Object.entries(jugadores[1].scores)) { if (v > 0) scB[k] = v }
        const mr = calcularMatchPlay(scA, scB, holesArr, {
          courseHandicapA: courseHcpMap[jugadores[0].id] ?? 0,
          courseHandicapB: courseHcpMap[jugadores[1].id] ?? 0,
          totalHoles: ronda.holes,
          modo: ronda.modo_juego,
        }, { nombreA: jugadores[0].nombre, nombreB: jugadores[1].nombre })
        if (mr.isFinished && mr.winner) {
          const ganador = mr.winner === 'a' ? jugadores[0].nombre : jugadores[1].nombre
          const modoLabel = ronda.modo_juego === 'neto' ? 'Match Play Neto' : 'Match Play Gross'
          return `${ganador} ganó ${mr.display} en ${ronda.course_name} — ${modoLabel}`
        }
        return `Match Play en vivo: ${mr.display} en ${ronda.course_name} — Seguila en vivo`
      }
    }

    const isStab = ronda.formato_juego === 'stableford'
    const leader = [...jugadores]
      .map(j => {
        let gross = 0, parTotal = 0, holesPlayed = 0, stabPts = 0
        const ch = courseHcpMap[j.id] ?? Math.round(j.handicap ?? 0)
        for (let h = 1; h <= ronda.holes; h++) {
          const s = j.scores?.[String(h)] ?? j.scores?.[h]
          if (s != null) {
            gross += s; parTotal += parMap[h] ?? 4; holesPlayed++
            if (isStab) stabPts += puntosStablefordHoyo(s, parMap[h] ?? 4, ch, siMap[h] ?? h, ronda.holes)
          }
        }
        const vsPar = gross - parTotal
        return { nombre: j.nombre, gross, vsPar, holesPlayed, stabPts }
      })
      .filter(j => j.holesPlayed > 0)
      .sort((a, b) => isStab ? b.stabPts - a.stabPts : a.vsPar - b.vsPar)[0]

    if (!leader) return `Ronda en vivo en ${ronda.course_name} — Golfers+`
    if (isStab) {
      return `${leader.nombre} lleva ${leader.stabPts} pts en ${ronda.course_name} — Seguila en vivo`
    }
    const vsParStr = leader.vsPar > 0 ? `+${leader.vsPar}` : leader.vsPar === 0 ? 'E' : String(leader.vsPar)
    return `${leader.nombre} va ${leader.gross} (${vsParStr}) en ${ronda.course_name} — Seguila en vivo`
  })()

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Golfers+ — Ronda en vivo', text: shareText, url: shareUrl })
      } catch { /* user cancelled */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, '_blank')
    }
  }

  // Admin score editing — save updated score to supabase
  const handleAdminScoreSave = useCallback(async () => {
    if (!editingScore || !ronda) return
    const { jugadorId, hole } = editingScore
    const newScore = Math.max(1, Math.min(19, editScoreValue))
    const jugador = ronda.ronda_libre_jugadores.find(j => j.id === jugadorId)
    if (!jugador) return

    const updatedScores = { ...jugador.scores, [String(hole)]: newScore }
    const supabase = createClient()
    // Audit 2026-05-17 P0 #1: merge server-side vía RPC; el delta es solo el hoyo editado.
    const { error } = await supabase.rpc('upsert_ronda_libre_scores', {
      p_jugador_id: jugadorId,
      p_codigo: codigo,
      p_delta: { [String(hole)]: newScore },
    })
    if (error) {
      addToast({ type: 'error', title: 'Error', message: 'No se pudo actualizar el score', duration: 4000 })
    } else {
      addToast({ type: 'success', title: 'Score actualizado', message: `Hoyo ${hole}: ${newScore} golpes`, duration: 3000 })
      // Update local state
      setRonda(prev => {
        if (!prev) return prev
        return {
          ...prev,
          ronda_libre_jugadores: prev.ronda_libre_jugadores.map(j =>
            j.id === jugadorId ? { ...j, scores: updatedScores } : j
          ),
        }
      })
    }
    setEditingScore(null)
  }, [editingScore, editScoreValue, ronda])

  /* ── Loading ── */
  if (loading) {
    return (
      <div style={{ background: 'var(--bg-surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', fontFamily: 'DM Sans, sans-serif' }}>
        Cargando ronda...
      </div>
    )
  }

  /* ── Fetch error — show retry UI instead of blank screen ── */
  if (fetchError && !ronda) {
    return (
      <div style={{ background: 'var(--bg-surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'DM Sans, sans-serif', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}><Flag size={48} strokeWidth={1.5} /></div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: 'var(--text)', textAlign: 'center' }}>
          Error al cargar la ronda
        </h1>
        <p style={{ color: 'var(--text-2)', textAlign: 'center', maxWidth: '320px', fontSize: '14px' }}>
          No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.
        </p>
        <button
          onClick={() => { setFetchError(false); setLoading(true); fetchRonda() }}
          style={{
            background: '#c4992a', color: 'var(--brand-dark)', fontWeight: 700,
            fontSize: '14px', padding: '12px 24px', borderRadius: '10px',
            border: 'none', cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
        <Link href="/" style={{ color: '#c4992a', textDecoration: 'none', fontSize: '13px' }}>
          Ir al inicio
        </Link>
      </div>
    )
  }

  /* ── Not found ── */
  if (notFound || !ronda) {
    return (
      <div style={{ background: 'var(--bg-surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'DM Sans, sans-serif', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}><PersonStanding size={64} strokeWidth={1.5} /></div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: 'var(--text)', textAlign: 'center' }}>
          Ronda no encontrada
        </h1>
        <p style={{ color: 'var(--text-2)', textAlign: 'center', maxWidth: '320px', lineHeight: 1.5 }}>
          El código <strong style={{ color: '#c4992a' }}>{codigo}</strong> no existe o fue eliminado.
          Verifica que el código sea exacto (mayúsculas y minúsculas importan).
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
          <Link href="/ronda-libre/nueva" style={{
            background: '#c4992a', color: 'var(--brand-dark)', textDecoration: 'none',
            fontWeight: 600, fontSize: '15px', padding: '12px 24px', borderRadius: '10px',
            display: 'inline-block',
          }}>
            Crear nueva ronda
          </Link>
          <Link href="/" style={{ color: 'var(--text-2)', textDecoration: 'none', fontSize: '14px' }}>← Ir al inicio</Link>
        </div>
      </div>
    )
  }

  const fechaDisplay = ronda.fecha
    ? new Date(ronda.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

  const isEnCurso = ronda.estado === 'en_curso'
  const hasCourse = Object.keys(parMap).length > 0
  const timelineEvents = buildTimelineEvents(ronda.ronda_libre_jugadores, ronda.holes, parMap)

  // Sorted leaderboard — calcula gross Y neto, usa el correcto según modo_juego
  const isNetoMode = ronda.modo_juego === 'neto'
  const leaderboard = [...ronda.ronda_libre_jugadores]
    .map(j => {
      const vsParGross = getVsPar(j.scores, ronda.holes, parMap)
      const courseHcp = courseHcpMap[j.id] ?? Math.round(j.handicap ?? 0)
      const vsParNeto = getVsParNeto(j.scores, ronda.holes, parMap, siMap, courseHcp)
      // vsPar es el valor que se usa para ordenar y mostrar en la columna principal
      const vsPar = isNetoMode ? vsParNeto : vsParGross
      const holesPlayed = getHolesPlayed(j.scores, ronda.holes)
      let stablefordPts = 0
      if (ronda.formato_juego === 'stableford') {
        for (let h = 1; h <= ronda.holes; h++) {
          const s = j.scores[String(h)] ?? (j.scores as Record<number, number>)[h]
          if (s != null) {
            const si = siMap[h] ?? h
            const par = parMap[h] ?? 4
            stablefordPts += puntosStablefordHoyo(s, par, courseHcp, si, ronda.holes)
          }
        }
      }
      return { ...j, vsPar, vsParGross, vsParNeto, courseHcp, holesPlayed, stablefordPts }
    })
    .sort((a, b) => {
      if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0
      if (a.holesPlayed === 0) return 1
      if (b.holesPlayed === 0) return -1
      if (ronda.formato_juego === 'stableford') return b.stablefordPts - a.stablefordPts
      return a.vsPar - b.vsPar
    })

  /* ─────────────────────────────────────────────────────────────────────── */
  /* ── FINISHED ROUND — auto-set role to espectador, skip welcome ────── */
  /* ─────────────────────────────────────────────────────────────────────── */
  // Handled in the useEffect above — finishedParam or estado=finalizada
  // automatically sets role='espectador', so no separate screen needed.
  const isFinished = finishedParam || ronda.estado === 'finalizada'

  /* ─────────────────────────────────────────────────────────────────────── */
  /* ── WELCOME SCREEN — removed, page is always spectator ─────────────── */
  /* ─────────────────────────────────────────────────────────────────────── */

  /* ─────────────────────────────────────────────────────────────────────── */
  /* ── SPECTATOR VIEW ─────────────────────────────────────────────────── */
  /* ─────────────────────────────────────────────────────────────────────── */
  const isCreator = !!(currentUserId && ronda.creador_id === currentUserId)
  const isAdmin = ronda.admin_mode && ronda.admin_user_id === currentUserId
  const isAdminRound = !!ronda.admin_mode
  const adminPlayerName = isAdminRound
    ? ronda.ronda_libre_jugadores.find(j => j.user_id === ronda.admin_user_id)?.nombre ?? 'El admin'
    : null

  if (role === 'espectador') {
    // White theme score colors — paleta Garmin canónica (light variant).
    const whiteThemeScoreColor = (vsPar: number, played: number) => {
      if (played === 0) return '#9ca3af'
      return getScoreColorLight(vsPar)
    }

    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
        {/* Header — dark bar at top */}
        <div style={{ background: '#111827', borderBottom: '1px solid var(--border)', padding: '16px' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#ffffff', margin: '0 0 4px' }}>
                  {isFinished ? 'Resultado final' : 'Marcador en vivo'}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                    {ronda.course_name} · {fechaDisplay}
                  </div>
                  {/* Badge defensivo "9/18 HOYOS" */}
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 9px',
                    background: ronda.holes <= 9 ? 'rgba(196,153,42,0.25)' : 'rgba(196,153,42,0.12)',
                    color: '#c4992a',
                    border: ronda.holes <= 9 ? '1px solid rgba(196,153,42,0.6)' : '1px solid rgba(196,153,42,0.3)',
                    borderRadius: '999px',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    fontFamily: 'DM Mono, monospace',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}>{ronda.holes} HOYOS</span>
                </div>
                {/* 9.2 — Last update timestamp */}
                {!isFinished && timeSinceUpdate && (
                  <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '2px' }}>
                    {timeSinceUpdate}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                {/* 9.1 — Live indicator badge */}
                {isEnCurso ? (
                  <span className="live-badge-pulse" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: 'rgba(34,197,94,0.15)',
                    color: '#22c55e',
                    border: '1px solid rgba(34,197,94,0.4)',
                    padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                    letterSpacing: '0.05em',
                  }}>
                    <span className="live-dot" style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: '#22c55e', display: 'inline-block', flexShrink: 0,
                    }} />
                    EN VIVO
                  </span>
                ) : (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    background: 'rgba(196,153,42,0.12)',
                    color: '#c4992a',
                    border: '1px solid rgba(196,153,42,0.35)',
                    padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                    letterSpacing: '0.05em',
                  }}>
                    FINALIZADA
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px' }}>

          {/* ── Admin mode info banner for non-admin members ── */}
          {isAdminRound && !isAdmin && currentUserId && adminPlayerName && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.2)',
              borderRadius: '12px', padding: '12px 16px', marginBottom: '16px',
            }}>
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}><ClipboardList size={18} /></span>
              <span style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.4 }}>
                <strong style={{ color: 'var(--text)' }}>{adminPlayerName}</strong> lleva el score del grupo
              </span>
            </div>
          )}

          {/* ── Match Play Winner celebration (finished rounds) ── */}
          {isFinished && ronda.formato_juego === 'match_play' && ronda.ronda_libre_jugadores.length === 2 && (() => {
            const jug = ronda.ronda_libre_jugadores
            const holesArr = Object.entries(parMap).map(([num, par]) => ({
              numero: Number(num), par, stroke_index: siMap[Number(num)] ?? Number(num),
            }))
            if (holesArr.length === 0) return null
            const scA: Record<string, number> = {}
            const scB: Record<string, number> = {}
            for (const [k, v] of Object.entries(jug[0].scores)) { if (v > 0) scA[k] = v }
            for (const [k, v] of Object.entries(jug[1].scores)) { if (v > 0) scB[k] = v }
            const mr = calcularMatchPlay(scA, scB, holesArr, {
              courseHandicapA: courseHcpMap[jug[0].id] ?? 0,
              courseHandicapB: courseHcpMap[jug[1].id] ?? 0,
              totalHoles: ronda.holes,
              modo: ronda.modo_juego,
            }, { nombreA: jug[0].nombre, nombreB: jug[1].nombre })

            const ganador = mr.winner === 'a' ? jug[0] : mr.winner === 'b' ? jug[1] : null
            const isAllSquare = mr.state === 0

            return (
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  background: 'var(--bg-surface)', borderRadius: '16px',
                  border: '2px solid #c4992a', overflow: 'hidden',
                  boxShadow: '0 4px 24px rgba(196,153,42,0.15)',
                }}>
                  <div style={{ height: '4px', background: 'linear-gradient(90deg, #c4992a, #d4a843, #c4992a)' }} />
                  <div style={{ padding: '28px 20px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '8px' }}>{isAllSquare ? <Handshake size={48} /> : <Trophy size={48} />}</div>
                    <div style={{
                      fontSize: '11px', fontWeight: 700, color: '#c4992a',
                      textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px',
                    }}>
                      {isAllSquare ? 'All Square' : 'Ganador'}
                    </div>
                    {ganador && (
                      <div style={{
                        fontFamily: '"Playfair Display", serif', fontSize: '28px',
                        fontWeight: 700, color: 'var(--text)', marginBottom: '12px',
                      }}>
                        {ganador.nombre}
                      </div>
                    )}
                    <div style={{
                      fontSize: '40px', fontWeight: 900, color: '#c4992a', lineHeight: 1,
                      fontFamily: '"Playfair Display", serif',
                    }}>
                      {mr.display}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '10px' }}>
                      {ronda.modo_juego === 'neto' ? 'Match Play Neto' : 'Match Play Gross'} &middot; {ronda.course_name}
                    </div>
                  </div>

                  {/* VS card */}
                  <div style={{ padding: '0 20px 16px' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '14px 16px', background: 'var(--bg)', borderRadius: '10px',
                    }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{jug[0].nombre}</div>
                        {ronda.modo_juego === 'neto' && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>HCP {courseHcpMap[jug[0].id] ?? '--'}</div>}
                      </div>
                      <div style={{ fontSize: '11px', color: '#c4992a', fontWeight: 700 }}>VS</div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{jug[1].nombre}</div>
                        {ronda.modo_juego === 'neto' && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>HCP {courseHcpMap[jug[1].id] ?? '--'}</div>}
                      </div>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div style={{ padding: '0 20px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '22px', fontWeight: 700, color: mr.holesWonA > mr.holesWonB ? '#16a34a' : '#374151' }}>
                          {mr.holesWonA}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Ganados</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-2)' }}>{mr.holesHalved}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Empates</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '22px', fontWeight: 700, color: mr.holesWonB > mr.holesWonA ? '#16a34a' : '#374151' }}>
                          {mr.holesWonB}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Ganados</div>
                      </div>
                    </div>
                  </div>

                  {/* Share button */}
                  <div style={{ padding: '0 20px 20px' }}>
                    <button onClick={handleShare} style={{
                      width: '100%', padding: '16px',
                      background: 'linear-gradient(135deg, #c4992a 0%, #d4a843 50%, #b8972f 100%)',
                      color: 'var(--brand-dark)', fontWeight: 700, fontSize: '16px',
                      border: 'none', borderRadius: '12px', cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(196,153,42,0.35)',
                    }}>
                      Compartir resultado
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── RoundHighlights (Sprint 4 F · V6) — solo para el jugador autenticado ── */}
          {isFinished && currentUserId && (() => {
            const myPlayer = ronda.ronda_libre_jugadores.find(j => j.user_id === currentUserId)
            if (!myPlayer) return null
            const myScores: Record<number, number> = {}
            if (myPlayer.scores) {
              for (const [k, v] of Object.entries(myPlayer.scores)) {
                const n = typeof v === 'number' ? v : Number(v)
                if (n > 0) myScores[parseInt(k)] = n
              }
            }
            const hData = computeHighlights(myScores, parMap, ronda.holes)
            if (hData.holesPlayed === 0) return null
            return (
              <RoundHighlights
                data={hData}
                scores={myScores}
                parMap={parMap}
                totalHoles={ronda.holes}
              />
            )
          })()}

          {/* ── Winner celebration + podium + share CTA (finished rounds, non-match-play) ── */}
          {isFinished && ronda.formato_juego !== 'match_play' && leaderboard.length > 0 && leaderboard[0].holesPlayed > 0 && (() => {
            const isStab = ronda.formato_juego === 'stableford'
            const isTie = leaderboard.length > 1 && (isStab
              ? leaderboard[0].stablefordPts === leaderboard[1].stablefordPts
              : leaderboard[0].vsPar === leaderboard[1].vsPar)
            const winnerScore = leaderboard[0].vsPar
            const scoreColor = isStab ? '#c4992a' : getScoreColorLight(winnerScore)
            const playedPlayers = leaderboard.filter(j => j.holesPlayed > 0)
            return (
              <div style={{ marginBottom: '16px' }}>
                {/* Winner card — white, gold border */}
                <div style={{
                  background: 'var(--bg-surface)', borderRadius: '16px',
                  border: '2px solid #c4992a',
                  overflow: 'hidden',
                  boxShadow: '0 4px 24px rgba(196,153,42,0.15)',
                }}>
                  {/* Gold accent bar */}
                  <div style={{ height: '4px', background: 'linear-gradient(90deg, #c4992a, #d4a843, #c4992a)' }} />
                  <div style={{ padding: '24px 20px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '4px' }}>{isTie ? <Handshake size={48} /> : <Trophy size={48} />}</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px' }}>
                      {isTie ? 'Empate' : 'Ganador'}
                    </div>
                    <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '26px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                      {isTie
                        ? leaderboard.filter(j => isStab ? j.stablefordPts === leaderboard[0].stablefordPts : j.vsPar === winnerScore).map(j => j.nombre.split(' ')[0]).join(' y ')
                        : leaderboard[0].nombre}
                    </div>
                    <div style={{ fontSize: '36px', fontWeight: 900, color: scoreColor, lineHeight: 1 }}>
                      {isStab ? `${leaderboard[0].stablefordPts} pts` : formatOverUnder(winnerScore)}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '6px' }}>{ronda.course_name} · {fechaDisplay}</div>
                  </div>

                  {/* Final leaderboard with positions */}
                  {playedPlayers.length > 1 && (
                    <div style={{ padding: '0 20px 16px' }}>
                      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                        {playedPlayers.map((j, idx) => {
                          const posLabel = idx === 0 ? '1°' : idx === 1 ? '2°' : idx === 2 ? '3°' : `${idx + 1}°`
                          const posColor = idx === 0 ? '#c4992a' : idx === 1 ? '#94a8c0' : idx === 2 ? '#b87333' : '#9ca3af'
                          const isWinner = idx === 0
                          const jScoreColor = isStab ? '#c4992a' : getScoreColorLight(j.vsPar)
                          return (
                            <div key={j.id} style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '8px 0',
                              borderBottom: idx < playedPlayers.length - 1 ? '1px solid #f3f4f6' : 'none',
                            }}>
                              <span style={{
                                fontSize: '15px', fontWeight: 800, color: posColor,
                                minWidth: '28px', textAlign: 'center',
                              }}>{posLabel}</span>
                              <span style={{
                                flex: 1, fontSize: '14px', color: 'var(--text)',
                                fontWeight: isWinner ? 700 : 500,
                              }}>{j.nombre}</span>
                              <span style={{
                                fontSize: '15px', fontWeight: 700, color: jScoreColor,
                              }}>{isStab ? `${j.stablefordPts} pts` : formatOverUnder(j.vsPar)}</span>
                              <span style={{ fontSize: '12px', color: 'var(--text-3)', minWidth: '40px', textAlign: 'right' }}>
                                {j.holesPlayed}/{ronda.holes}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Share button — "Compartir resultados" CTA */}
                  <div style={{ padding: '0 20px 20px' }}>
                    <button
                      onClick={async () => {
                        const shareData: LeaderboardShareData = {
                          players: playedPlayers.map(j => ({
                            nombre: j.nombre,
                            vsPar: ronda.formato_juego === 'stableford' ? j.stablefordPts : j.vsPar,
                            holesPlayed: j.holesPlayed,
                            totalHoles: ronda.holes,
                          })),
                          courseName: ronda.course_name, fecha: fechaDisplay, rondaCodigo: codigo, isFinished: true,
                          formato_juego: ronda.formato_juego,
                          modo_juego: ronda.modo_juego,
                        }

                        // Match Play: calcular display ("3&2", "1 UP", "All Square") para la card
                        if (ronda.formato_juego === 'match_play' && ronda.ronda_libre_jugadores.length >= 2) {
                          const jug = ronda.ronda_libre_jugadores
                          const holesArr = Object.entries(parMap).map(([num, par]) => ({
                            numero: Number(num), par, stroke_index: siMap[Number(num)] ?? Number(num),
                          }))
                          if (holesArr.length > 0) {
                            const scA: Record<string, number> = {}
                            const scB: Record<string, number> = {}
                            for (const [k, v] of Object.entries(jug[0].scores)) { if (v > 0) scA[k] = v }
                            for (const [k, v] of Object.entries(jug[1].scores)) { if (v > 0) scB[k] = v }
                            const mr = calcularMatchPlay(scA, scB, holesArr, {
                              courseHandicapA: courseHcpMap[jug[0].id] ?? 0,
                              courseHandicapB: courseHcpMap[jug[1].id] ?? 0,
                              totalHoles: ronda.holes,
                              modo: ronda.modo_juego,
                            }, { nombreA: jug[0].nombre, nombreB: jug[1].nombre })
                            shareData.matchResult = mr.display
                            shareData.matchWinner = mr.winner === 'a' ? jug[0].nombre : mr.winner === 'b' ? jug[1].nombre : undefined
                          }
                        }

                        // Team formats: calcular ranking de equipos para la share card
                        if (['best_ball', 'scramble', 'foursome'].includes(ronda.formato_juego) && equipos.length > 0 && Object.keys(parMap).length > 0) {
                          shareData.teams = rankTeams({
                            equipos,
                            jugadores: ronda.ronda_libre_jugadores,
                            parMap, siMap,
                            holes: ronda.holes,
                            formato: ronda.formato_juego,
                            modo: ronda.modo_juego,
                          })
                        }

                        await compartirLeaderboard(shareData)
                      }}
                      style={{
                        width: '100%', padding: '16px',
                        background: 'linear-gradient(135deg, #c4992a 0%, #d4a843 50%, #b8972f 100%)',
                        color: 'var(--brand-dark)', fontWeight: 700, fontSize: '16px',
                        border: 'none', borderRadius: '12px', cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(196,153,42,0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      }}
                    >
                      Compartir resultados
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Descubrir Golfers+ — only for non-finished */}
          {!isFinished && (
            <Link href="/" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '10px 16px', borderRadius: '10px', marginBottom: '12px',
              background: 'rgba(196,153,42,0.06)', border: '1px solid rgba(196,153,42,0.12)',
              textDecoration: 'none',
            }}>
              <span style={{ fontSize: '13px', color: '#c4992a', fontWeight: 600 }}>Descubrir Golfers+</span>
              <span style={{ color: '#c4992a', fontSize: '12px' }}>→</span>
            </Link>
          )}

          {/* Notification banner for spectators */}
          {isEnCurso && !getNotifPrefs().spectator && (
            <NotifBanner onEnable={async () => {
              if (requireAuth('Activa alertas en vivo')) return
              if (!isPushSupported()) {
                // Fallback: still save preference, notifications just won't show
                setNotifPrefs({ spectator: true })
                forceRender()
                return
              }
              try {
                const granted = await requestPermission()
                if (granted) {
                  setNotifPrefs({ spectator: true })
                  forceRender()
                }
              } catch {
                // Permission request failed — save pref anyway for polling-based alerts
                setNotifPrefs({ spectator: true })
                forceRender()
              }
            }} />
          )}

          {/* Match Play state card — only for match_play_neto with 2 players */}
          {ronda.formato_juego === 'match_play' && leaderboard.length === 2 && (() => {
            const jug = ronda.ronda_libre_jugadores
            const holesArr = Object.entries(parMap).map(([num, par]) => ({
              numero: Number(num), par, stroke_index: siMap[Number(num)] ?? Number(num),
            }))
            if (holesArr.length === 0) return null
            const scA: Record<string, number> = {}
            const scB: Record<string, number> = {}
            for (const [k, v] of Object.entries(jug[0].scores)) { if (v > 0) scA[k] = v }
            for (const [k, v] of Object.entries(jug[1].scores)) { if (v > 0) scB[k] = v }
            const mr = calcularMatchPlay(scA, scB, holesArr, {
              courseHandicapA: courseHcpMap[jug[0].id] ?? 0,
              courseHandicapB: courseHcpMap[jug[1].id] ?? 0,
              totalHoles: ronda.holes,
              modo: ronda.modo_juego,
            }, { nombreA: jug[0].nombre, nombreB: jug[1].nombre })
            return (
              <div style={{
                background: 'var(--bg-surface)', border: '1px solid #e5e7eb', borderRadius: '12px',
                padding: '20px', marginBottom: '12px',
              }}>
                {/* Player names */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{jug[0].nombre}</div>
                    {ronda.modo_juego === 'neto' && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>HCP {courseHcpMap[jug[0].id] ?? '--'}</div>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 600 }}>VS</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{jug[1].nombre}</div>
                    {ronda.modo_juego === 'neto' && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>HCP {courseHcpMap[jug[1].id] ?? '--'}</div>}
                  </div>
                </div>

                {/* Match state */}
                <div style={{
                  textAlign: 'center', padding: '16px 0',
                  background: 'var(--bg)', borderRadius: '10px', marginBottom: '12px',
                }}>
                  <div style={{
                    fontSize: '28px', fontWeight: 700, fontFamily: '"Playfair Display", serif',
                    color: mr.state === 0 ? '#6b7280' : '#c4992a',
                  }}>
                    {mr.holesPlayed > 0 ? mr.display : 'All Square'}
                  </div>
                  {mr.isFinished && mr.winner && (
                    <div style={{ fontSize: '13px', color: '#16a34a', fontWeight: 600, marginTop: '4px' }}>
                      {jug[mr.winner === 'a' ? 0 : 1].nombre} gana
                    </div>
                  )}
                  {!mr.isFinished && mr.holesPlayed > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>
                      {mr.holesPlayed} de {ronda.holes} hoyos jugados
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: mr.holesWonA > mr.holesWonB ? '#16a34a' : '#374151' }}>
                      {mr.holesWonA}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Ganados</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-2)' }}>{mr.holesHalved}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Empates</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: mr.holesWonB > mr.holesWonA ? '#16a34a' : '#374151' }}>
                      {mr.holesWonB}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Ganados</div>
                  </div>
                </div>

                {/* Strip compacto hoyo a hoyo — siempre visible en mobile (Ryder Cup style) */}
                {mr.holesPlayed > 0 && (() => {
                  const playedHoles = mr.holes.filter(h => !h.afterMatchEnd && h.result !== 'not_played')
                  const firstName = jug[0].nombre.split(' ')[0]
                  const secondName = jug[1].nombre.split(' ')[0]
                  const renderCell = (h: MatchHoleDetail) => {
                    const winA = h.result === 'won_a' || h.result === 'conceded_b'
                    const winB = h.result === 'won_b' || h.result === 'conceded_a'
                    const bg = winA ? '#16a34a' : winB ? '#dc2626' : '#94a8c0'
                    const color = '#ffffff'
                    const label = winA ? firstName[0]?.toUpperCase() ?? 'A' : winB ? secondName[0]?.toUpperCase() ?? 'B' : '='
                    return (
                      <div
                        key={h.numero}
                        title={`Hoyo ${h.numero} · Par ${h.par} · ${winA ? `${firstName} gana` : winB ? `${secondName} gana` : 'Empate'}`}
                        style={{
                          flex: '0 0 auto',
                          minWidth: '30px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <div style={{ fontSize: '9px', color: 'var(--text-3)', fontWeight: 600, lineHeight: 1 }}>{h.numero}</div>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          background: bg,
                          color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 800,
                          letterSpacing: '0.02em',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                        }}>
                          {label}
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div style={{ marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px',
                      }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>
                          Hoyo a hoyo
                        </div>
                        <div style={{ display: 'flex', gap: '10px', fontSize: '9px', color: 'var(--text-2)', fontWeight: 600 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#16a34a' }} />
                            {firstName}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#94a8c0' }} />
                            Empate
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#dc2626' }} />
                            {secondName}
                          </span>
                        </div>
                      </div>
                      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '4px' }}>
                        <div style={{ display: 'flex', gap: '6px', minWidth: 'min-content' }}>
                          {playedHoles.slice(0, 9).map(renderCell)}
                          {playedHoles.length > 9 && (
                            <div style={{ width: '1px', background: '#e5e7eb', margin: '8px 2px' }} />
                          )}
                          {playedHoles.slice(9).map(renderCell)}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Tabla detallada hoyo a hoyo — scroll horizontal */}
                {mr.holesPlayed > 0 && (
                  <div style={{ overflowX: 'auto', marginTop: '12px', paddingTop: '8px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 600 }}>
                      Detalle
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#111827', color: '#ffffff' }}>
                          <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 600, fontSize: '10px', width: '44px' }}>HOYO</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600, fontSize: '10px' }}>{jug[0].nombre.split(' ')[0]}</th>
                          <th style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 600, fontSize: '10px', width: '52px' }}>ESTADO</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600, fontSize: '10px' }}>{jug[1].nombre.split(' ')[0]}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mr.holes.filter(h => !h.afterMatchEnd && h.result !== 'not_played').map(h => {
                          const winA = h.result === 'won_a' || h.result === 'conceded_b'
                          const winB = h.result === 'won_b' || h.result === 'conceded_a'
                          const stateColor = h.matchState > 0 ? '#16a34a' : h.matchState < 0 ? '#dc2626' : '#6b7280'
                          const stateLabel = h.matchState === 0 ? 'AS' : `${Math.abs(h.matchState)}UP`

                          return (
                            <tr key={h.numero} style={{
                              borderBottom: '1px solid #f3f4f6',
                            }}>
                              <td style={{ padding: '7px 6px', fontWeight: 600, color: 'var(--text)', fontSize: '11px' }}>
                                {h.numero}
                                <span style={{ fontSize: '9px', color: 'var(--text-3)', marginLeft: '3px' }}>P{h.par}</span>
                              </td>
                              <td style={{
                                padding: '7px 6px', textAlign: 'center', fontWeight: 700, fontSize: '13px',
                                color: winA ? '#16a34a' : '#374151',
                                background: winA ? 'rgba(22,163,74,0.06)' : 'transparent',
                                fontFamily: '"DM Mono", monospace',
                              }}>
                                {h.grossA ?? '—'}
                                {h.strokesA > 0 && <span style={{ color: '#c4992a', marginLeft: '2px', fontSize: '9px' }}>{'●'.repeat(h.strokesA)}</span>}
                                {h.netoA != null && h.netoA !== h.grossA && (
                                  <span style={{ fontSize: '9px', color: 'var(--text-2)', marginLeft: '2px' }}>({h.netoA})</span>
                                )}
                              </td>
                              <td style={{ padding: '4px 2px', textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                                  fontSize: '9px', fontWeight: 800, color: '#ffffff',
                                  background: stateColor, letterSpacing: '0.02em',
                                  minWidth: '32px',
                                }}>
                                  {stateLabel}
                                </span>
                              </td>
                              <td style={{
                                padding: '7px 6px', textAlign: 'center', fontWeight: 700, fontSize: '13px',
                                color: winB ? '#16a34a' : '#374151',
                                background: winB ? 'rgba(22,163,74,0.06)' : 'transparent',
                                fontFamily: '"DM Mono", monospace',
                              }}>
                                {h.grossB ?? '—'}
                                {h.strokesB > 0 && <span style={{ color: '#c4992a', marginLeft: '2px', fontSize: '9px' }}>{'●'.repeat(h.strokesB)}</span>}
                                {h.netoB != null && h.netoB !== h.grossB && (
                                  <span style={{ fontSize: '9px', color: 'var(--text-2)', marginLeft: '2px' }}>({h.netoB})</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* GWI Match Play — probabilidad de ganar */}
                {!mr.isFinished && mr.holesPlayed >= 2 && mr.holesRemaining > 0 && (() => {
                  const gwi = calcularGWIMatch({
                    nombreA: jug[0].nombre,
                    nombreB: jug[1].nombre,
                    handicapA: courseHcpMap[jug[0].id] ?? 0,
                    handicapB: courseHcpMap[jug[1].id] ?? 0,
                    holesUp: mr.state,
                    holesRemaining: mr.holesRemaining,
                    roundsCountA: 10,
                    roundsCountB: 10,
                  })
                  return (
                    <div style={{ marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', fontFamily: '"DM Mono", monospace', letterSpacing: '0.08em' }}>GWI&trade;</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>Probabilidad de ganar el match</span>
                      </div>
                      {/* Probability bar */}
                      <div style={{ display: 'flex', height: '28px', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg)' }}>
                        {gwi.probA > 0 && (
                          <div style={{
                            width: `${gwi.probA}%`, background: 'rgba(22,163,74,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '11px', fontWeight: 700, color: '#16a34a',
                            transition: 'width 0.5s ease',
                          }}>
                            {gwi.probA >= 15 ? `${gwi.probA}%` : ''}
                          </div>
                        )}
                        {gwi.probTie > 0 && (
                          <div style={{
                            width: `${gwi.probTie}%`, background: 'rgba(107,114,128,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '10px', fontWeight: 600, color: 'var(--text-2)',
                            transition: 'width 0.5s ease',
                          }}>
                            {gwi.probTie >= 10 ? `${gwi.probTie}%` : ''}
                          </div>
                        )}
                        {gwi.probB > 0 && (
                          <div style={{
                            width: `${gwi.probB}%`, background: 'rgba(220,38,38,0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '11px', fontWeight: 700, color: '#dc2626',
                            transition: 'width 0.5s ease',
                          }}>
                            {gwi.probB >= 15 ? `${gwi.probB}%` : ''}
                          </div>
                        )}
                      </div>
                      {/* Labels */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                        <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>{jug[0].nombre.split(' ')[0]}</span>
                        {gwi.probTie > 5 && <span style={{ fontSize: '10px', color: 'var(--text-2)' }}>Empate</span>}
                        <span style={{ fontSize: '10px', color: '#dc2626', fontWeight: 600 }}>{jug[1].nombre.split(' ')[0]}</span>
                      </div>
                      {/* Narrative */}
                      <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '6px', textAlign: 'center', fontStyle: 'italic' }}>
                        {gwi.narrativa}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {/* Course info card — white */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid #e5e7eb',
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Club</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 700 }}>{ronda.course_name}</div>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    background: ronda.holes <= 9 ? 'rgba(196,153,42,0.22)' : 'rgba(196,153,42,0.1)',
                    color: '#c4992a',
                    border: ronda.holes <= 9 ? '1px solid rgba(196,153,42,0.55)' : '1px solid rgba(196,153,42,0.28)',
                    borderRadius: '999px',
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    fontFamily: 'DM Mono, monospace',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}>{ronda.holes}H</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fecha</div>
                <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 700 }}>{fechaDisplay}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Jugadores</div>
                <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 700 }}>{ronda.ronda_libre_jugadores.length}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Formato</div>
                <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 700 }}>
                  {(() => {
                    if (ronda.formato_juego === 'stableford') return 'Stableford'
                    const modoSuffix = ronda.modo_juego === 'neto' ? 'Neto' : 'Gross'
                    if (ronda.formato_juego === 'match_play') return `Match Play ${modoSuffix}`
                    if (ronda.formato_juego === 'best_ball') return `Best Ball ${modoSuffix}`
                    if (ronda.formato_juego === 'scramble') return `Scramble ${modoSuffix}`
                    if (ronda.formato_juego === 'foursome') return `Foursome ${modoSuffix}`
                    return `Stroke Play ${modoSuffix} · ${ronda.holes}h`
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Team Leaderboard — Best Ball */}
          {ronda.formato_juego === 'best_ball' && equipos.length > 0 && Object.keys(parMap).length > 0 && (() => {
            const holeData = Array.from({ length: ronda.holes }, (_, i) => ({
              numero: i + 1,
              par: parMap[i + 1] ?? 4,
              stroke_index: siMap[i + 1] ?? (i + 1),
            }))
            const parTotal = holeData.reduce((s, h) => s + h.par, 0)

            const teams = equipos.map(eq => ({
              id: eq.id,
              nombre: eq.nombre,
              jugadores: eq.jugadorIds
                .map(jid => {
                  const j = ronda.ronda_libre_jugadores.find(jj => jj.id === jid)
                  if (!j) return null
                  return {
                    id: j.id,
                    nombre: j.nombre,
                    handicapIndex: j.handicap ?? 0,
                    scores: j.scores || {},
                  } as BestBallPlayer
                })
                .filter(Boolean) as BestBallPlayer[],
            }))
            const results = teams.map(t => calcularBestBall(t, holeData, parTotal))
            const sorted = ordenarEquiposBestBall(results, ronda.formato_juego, ronda.modo_juego)

            return (
              <TeamLeaderboard
                teams={sorted.map(r => ({
                  teamId: r.teamId,
                  teamNombre: r.teamNombre,
                  totalGross: r.totalGross,
                  totalNeto: r.totalNeto,
                  totalStableford: r.totalStableford,
                  overUnderGross: r.overUnderGross,
                  overUnderNeto: r.overUnderNeto,
                  holesPlayed: r.holesPlayed,
                  jugadores: equipos.find(e => e.id === r.teamId)?.jugadorIds
                    .map(jid => ronda.ronda_libre_jugadores.find(j => j.id === jid)?.nombre || '')
                    .filter(Boolean) || [],
                }))}
                modoJuego={ronda.modo_juego}
                formatoJuego={ronda.formato_juego}
                totalHoles={ronda.holes}
                formato="best_ball"
              />
            )
          })()}

          {/* Team Leaderboard — Scramble */}
          {ronda.formato_juego === 'scramble' && equipos.length > 0 && Object.keys(parMap).length > 0 && (() => {
            const holeData = Array.from({ length: ronda.holes }, (_, i) => ({
              numero: i + 1,
              par: parMap[i + 1] ?? 4,
              stroke_index: siMap[i + 1] ?? (i + 1),
            }))
            const parTotal = holeData.reduce((s, h) => s + h.par, 0)

            const teams: ScrambleTeam[] = equipos.map(eq => ({
              id: eq.id,
              nombre: eq.nombre,
              handicaps: eq.jugadorIds.map(jid => {
                const j = ronda.ronda_libre_jugadores.find(jj => jj.id === jid)
                return j?.handicap ?? 0
              }),
              scores: eq.scores,
            }))
            const results = teams.map(t => calcularScramble(t, holeData, parTotal))
            const sorted = ordenarEquiposScramble(results, ronda.formato_juego, ronda.modo_juego)

            return (
              <TeamLeaderboard
                teams={sorted.map(r => ({
                  teamId: r.teamId,
                  teamNombre: r.teamNombre,
                  totalGross: r.totalGross,
                  totalNeto: r.totalNeto,
                  totalStableford: r.totalStableford,
                  overUnderGross: r.overUnderGross,
                  overUnderNeto: r.overUnderNeto,
                  holesPlayed: r.holesPlayed,
                  jugadores: equipos.find(e => e.id === r.teamId)?.jugadorIds
                    .map(jid => ronda.ronda_libre_jugadores.find(j => j.id === jid)?.nombre || '')
                    .filter(Boolean) || [],
                  teamHandicap: r.teamHandicap,
                }))}
                modoJuego={ronda.modo_juego}
                formatoJuego={ronda.formato_juego}
                totalHoles={ronda.holes}
                formato="scramble"
              />
            )
          })()}

          {/* Team Leaderboard — Foursome */}
          {ronda.formato_juego === 'foursome' && equipos.length > 0 && Object.keys(parMap).length > 0 && (() => {
            const holeData = Array.from({ length: ronda.holes }, (_, i) => ({
              numero: i + 1,
              par: parMap[i + 1] ?? 4,
              stroke_index: siMap[i + 1] ?? (i + 1),
            }))
            const parTotal = holeData.reduce((s, h) => s + h.par, 0)

            const teams: FoursomeTeam[] = equipos.map(eq => {
              const members = eq.jugadorIds.map(jid => ronda.ronda_libre_jugadores.find(j => j.id === jid))
              return {
                id: eq.id,
                nombre: eq.nombre,
                handicapA: members[0]?.handicap ?? 0,
                handicapB: members[1]?.handicap ?? 0,
                nombreA: members[0]?.nombre ?? '?',
                nombreB: members[1]?.nombre ?? '?',
                scores: eq.scores,
              }
            })
            const results = teams.map(t => calcularFoursome(t, holeData, parTotal))
            const sorted = ordenarEquiposFoursome(results, ronda.formato_juego, ronda.modo_juego)

            return (
              <TeamLeaderboard
                teams={sorted.map(r => ({
                  teamId: r.teamId,
                  teamNombre: r.teamNombre,
                  totalGross: r.totalGross,
                  totalNeto: r.totalNeto,
                  totalStableford: r.totalStableford,
                  overUnderGross: r.overUnderGross,
                  overUnderNeto: r.overUnderNeto,
                  holesPlayed: r.holesPlayed,
                  jugadores: [r.nombreA, r.nombreB],
                  teamHandicap: r.teamHandicap,
                }))}
                modoJuego={ronda.modo_juego}
                formatoJuego={ronda.formato_juego}
                totalHoles={ronda.holes}
                formato="foursome"
              />
            )
          })()}

          {/* Leaderboard — white theme (hidden for match play, shown for stroke/stableford) */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px',
            display: ronda.formato_juego === 'match_play' ? 'none' : 'block',
          }}>

            {/* Table header — incluye columna HCP cuando modo = neto */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isNetoMode && ronda.formato_juego !== 'stableford'
                ? '28px 1fr 40px 64px 52px'
                : '32px 1fr 72px 60px',
              padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', gap: '4px',
            }}>
              <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase' }}>#</span>
              <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Jugador</span>
              {isNetoMode && ronda.formato_juego !== 'stableford' && (
                <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'center' }}>HCP</span>
              )}
              <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'center' }}>
                {ronda.formato_juego === 'stableford' ? 'PTS' : hasCourse ? (isNetoMode ? 'Neto' : 'Gross') : 'Score'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'right' }}>Hoyos</span>
            </div>

            {leaderboard.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: '14px' }}>
                Aún no hay jugadores en esta ronda
              </div>
            )}

            {leaderboard.map((j, idx) => {
              const isExpanded = expanded === j.id
              const isStableford = ronda.formato_juego === 'stableford'
              const scoreColor = isStableford
                ? (j.holesPlayed === 0 ? '#9ca3af' : '#c4992a')
                : whiteThemeScoreColor(j.vsPar, j.holesPlayed)
              const vsParStr = isStableford
                ? (j.holesPlayed > 0 ? String(j.stablefordPts) : '—')
                : (j.holesPlayed > 0 ? formatOverUnder(j.vsPar) : '—')
              const holeNums = Array.from({ length: ronda.holes }, (_, i) => i + 1)

              return (
                <div key={j.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {/* Row */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : j.id)}
                    aria-label={isExpanded ? `Colapsar scorecard de ${j.nombre}` : `Expandir scorecard de ${j.nombre}`}
                    style={{
                      width: '100%', background: 'var(--bg-surface)', border: 'none', cursor: 'pointer',
                      display: 'grid',
                      gridTemplateColumns: isNetoMode && !isStableford
                        ? '28px 1fr 40px 64px 52px'
                        : '32px 1fr 72px 60px',
                      padding: '13px 16px', alignItems: 'center', textAlign: 'left', gap: '4px',
                    }}
                  >
                    <span style={{ fontSize: '14px', color: 'var(--text-3)', fontWeight: 600 }}>{idx + 1}</span>
                    <span style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {j.nombre}
                      {j.holesPlayed > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 400, marginLeft: '6px' }}>
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      )}
                    </span>
                    {isNetoMode && !isStableford && (
                      <span style={{ fontSize: '13px', color: '#c4992a', fontWeight: 700, textAlign: 'center', fontFamily: '"DM Mono", monospace' }}>
                        {j.courseHcp}
                      </span>
                    )}
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: '17px', fontWeight: 700, color: scoreColor, fontFamily: '"DM Mono", monospace' }}>
                        {vsParStr}
                      </span>
                      {isNetoMode && !isStableford && j.holesPlayed > 0 && (
                        <div style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: '"DM Mono", monospace' }}>
                          Gross {formatOverUnder(j.vsParGross)}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '13px', color: 'var(--text-3)', textAlign: 'right' }}>
                      {j.holesPlayed}/{ronda.holes}
                    </span>
                  </button>

                  {/* Expandable scorecard — Componente Scorecard premium */}
                  {isExpanded && j.holesPlayed > 0 && (
                    <Scorecard
                      holes={holeNums.map(h => ({
                        numero: h,
                        par: parMap[h] ?? 4,
                        stroke_index: siMap[h] ?? h,
                      }))}
                      scores={j.scores}
                      courseHandicap={courseHcpMap[j.id] ?? Math.round(j.handicap ?? 0)}
                      modo={ronda.modo_juego as 'gross' | 'neto'}
                      formato={ronda.formato_juego as ScorecardProps['formato']}
                      playerName={j.nombre}
                      courseName={ronda.course_name}
                      date={fechaDisplay}
                      formatLabel={(() => {
                        if (ronda.formato_juego === 'stableford') return 'Stableford'
                        const modoSuffix = ronda.modo_juego === 'neto' ? 'Neto' : 'Gross'
                        if (ronda.formato_juego === 'match_play') return `Match Play ${modoSuffix}`
                        return `Stroke Play ${modoSuffix}`
                      })()}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* GWI — solo para formatos individuales (stroke/stableford), NO match play ni equipos */}
          {ronda.formato_juego !== 'match_play' && gwiInputs.length >= 2 && gwiInputs.some(j => j.hoyosCompletados >= 3) && (
            <div style={{ padding: '8px 12px', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', fontFamily: '"DM Mono", monospace', letterSpacing: '0.08em' }}>GWI&trade;</span>
                <span style={{ fontSize: '11px', color: 'var(--text-2)' }}>Probabilidad de ganar en tiempo real</span>
                <a href="/indices" style={{ fontSize: '10px', color: 'rgba(196,153,42,0.6)', textDecoration: 'none', marginLeft: 'auto' }}>Saber m&aacute;s</a>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-2)', marginTop: '4px', lineHeight: 1.4 }}>
                El Golf Win Index calcula la probabilidad de victoria de cada jugador usando su score actual, historial y patrones de juego. Se actualiza hoyo a hoyo.
              </div>
            </div>
          )}
          {ronda.formato_juego !== 'match_play' && gwiInputs.length >= 2 && gwiInputs.some(j => j.hoyosCompletados >= 3) && (
            <GWILeaderboard
              jugadores={gwiInputs}
              hoyosRestantes={ronda.holes - Math.max(...gwiInputs.map(j => j.hoyosCompletados), 0)}
              totalHoyos={ronda.holes}
              modoJuego={ronda.modo_juego || 'gross'}
            />
          )}

          {timelineEvents.length > 0 && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Momentos recientes</span>
                {!isFinished && timeSinceUpdate && (
                  <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{timeSinceUpdate}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {timelineEvents.map((event, idx) => {
                  const label = event.diff <= -2 ? 'Eagle' : event.diff === -1 ? 'Birdie' : event.diff === 0 ? 'Par' : event.diff === 1 ? 'Bogey' : `+${event.diff}`
                  const color = getScoreColorLight(event.diff)
                  const bgColor = event.diff <= -2 ? 'rgba(200,165,90,0.08)' : event.diff === -1 ? 'rgba(22,163,74,0.06)' : event.diff >= 2 ? 'rgba(220,38,38,0.04)' : 'transparent'
                  const approxMinAgo = idx === 0 ? 0 : idx
                  const timeLabel = approxMinAgo === 0 ? 'ahora' : approxMinAgo === 1 ? 'hace 1 min' : `hace ${approxMinAgo} min`

                  // Match play context: find the match hole detail for this event
                  let matchContext: string | null = null
                  if (ronda.formato_juego === 'match_play' && ronda.ronda_libre_jugadores.length === 2) {
                    const jugMP = ronda.ronda_libre_jugadores
                    const holesArr = Object.entries(parMap).map(([num, par]) => ({
                      numero: Number(num), par, stroke_index: siMap[Number(num)] ?? Number(num),
                    }))
                    if (holesArr.length > 0) {
                      const scA: Record<string, number> = {}
                      const scB: Record<string, number> = {}
                      for (const [k, v] of Object.entries(jugMP[0].scores)) { if (v > 0) scA[k] = v }
                      for (const [k, v] of Object.entries(jugMP[1].scores)) { if (v > 0) scB[k] = v }
                      const mrTL = calcularMatchPlay(scA, scB, holesArr, {
                        courseHandicapA: courseHcpMap[jugMP[0].id] ?? 0,
                        courseHandicapB: courseHcpMap[jugMP[1].id] ?? 0,
                        totalHoles: ronda.holes,
                        modo: ronda.modo_juego,
                      }, { nombreA: jugMP[0].nombre, nombreB: jugMP[1].nombre })
                      const holeDetail = mrTL.holes.find(h => h.numero === event.hole)
                      if (holeDetail && holeDetail.result !== 'not_played') {
                        const winnerName = (holeDetail.result === 'won_a' || holeDetail.result === 'conceded_b') ? jugMP[0].nombre
                          : (holeDetail.result === 'won_b' || holeDetail.result === 'conceded_a') ? jugMP[1].nombre : null
                        const stateText = holeDetail.matchState === 0 ? 'All Square'
                          : holeDetail.matchState > 0 ? `${jugMP[0].nombre.split(' ')[0]} ${holeDetail.matchState} UP`
                          : `${jugMP[1].nombre.split(' ')[0]} ${Math.abs(holeDetail.matchState)} UP`
                        matchContext = winnerName
                          ? `${winnerName.split(' ')[0]} gana hoyo → ${stateText}`
                          : `Empate → ${stateText}`
                      }
                    }
                  }

                  return (
                    <div key={`${event.jugador}-${event.hole}`} style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '8px 10px', borderRadius: '8px',
                      background: bgColor,
                    }}>
                      <Avatar name={event.jugador} size="md" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 700 }}>{event.jugador}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>Hoyo {event.hole} · {event.score} golpes</span>
                          <span style={{ color: '#d1d5db' }}>·</span>
                          <span style={{ fontStyle: 'italic' }}>{timeLabel}</span>
                        </div>
                        {/* Match play context line */}
                        {matchContext && (
                          <div style={{ fontSize: '11px', color: '#c4992a', fontWeight: 600, marginTop: '2px' }}>
                            {matchContext}
                          </div>
                        )}
                      </div>
                      <span style={{
                        color, fontSize: '13px', fontWeight: 700,
                        padding: '2px 8px', borderRadius: '6px',
                        background: event.diff <= -1 ? `${color}12` : event.diff >= 1 ? `${color}12` : 'transparent',
                        flexShrink: 0,
                      }}>
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Realtime status / polling fallback countdown — only if not finished */}
          {!isFinished && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{
                  color: isRealtimeConnected ? '#16a34a' : '#6b7280',
                  fontSize: '13px', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  {isRealtimeConnected ? (
                    <>
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: '#16a34a', display: 'inline-block',
                        animation: 'livePulse 1.8s ease-in-out infinite',
                      }} />
                      En vivo
                    </>
                  ) : `Actualiza en ${countdown}s`}
                </span>
                <span style={{ color: '#c4992a', fontSize: '11px' }}>
                  {isRealtimeConnected ? 'Tiempo real' : 'Auto-refresh'}
                </span>
              </div>
              {!isRealtimeConnected && (
                <div style={{
                  width: '100%', height: '4px',
                  background: '#e5e7eb',
                  borderRadius: '2px', overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${(countdown / 15) * 100}%`,
                    height: '100%',
                    background: countdown <= 3 ? '#16a34a' : '#c4992a',
                    borderRadius: '2px',
                    transition: 'width 1s linear, background 0.3s',
                  }} />
                </div>
              )}
            </div>
          )}

          {/* Share + Copy */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={handleShare}
              aria-label="Compartir ronda"
              style={{ flex: 1, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366', fontSize: '13px', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, minHeight: '44px' }}
            >
              Compartir
            </button>
            <button
              onClick={handleCopy}
              aria-label="Copiar enlace de la ronda"
              style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid #e5e7eb', color: 'var(--text)', fontSize: '13px', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, minHeight: '44px' }}
            >
              {copied ? '✓ Copiado' : 'Copiar link'}
            </button>
          </div>

          {/* Share leaderboard (only when in progress — finished has prominent button above) */}
          {!isFinished && leaderboard.length > 0 && leaderboard.some(j => j.holesPlayed > 0) && (
            <button
              onClick={async () => {
                const shareData: LeaderboardShareData = {
                  players: leaderboard.filter(j => j.holesPlayed > 0).map(j => ({
                    nombre: j.nombre,
                    vsPar: ronda.formato_juego === 'stableford' ? j.stablefordPts : j.vsPar,
                    holesPlayed: j.holesPlayed,
                    totalHoles: ronda.holes,
                  })),
                  courseName: ronda.course_name,
                  fecha: fechaDisplay,
                  rondaCodigo: codigo,
                  isFinished,
                  formato_juego: ronda.formato_juego,
                  modo_juego: ronda.modo_juego,
                }

                // Match Play: calcular display del match para la card
                if (ronda.formato_juego === 'match_play' && ronda.ronda_libre_jugadores.length >= 2) {
                  const jug = ronda.ronda_libre_jugadores
                  const holesArr = Object.entries(parMap).map(([num, par]) => ({
                    numero: Number(num), par, stroke_index: siMap[Number(num)] ?? Number(num),
                  }))
                  if (holesArr.length > 0) {
                    const scA: Record<string, number> = {}
                    const scB: Record<string, number> = {}
                    for (const [k, v] of Object.entries(jug[0].scores)) { if (v > 0) scA[k] = v }
                    for (const [k, v] of Object.entries(jug[1].scores)) { if (v > 0) scB[k] = v }
                    const mr = calcularMatchPlay(scA, scB, holesArr, {
                      courseHandicapA: courseHcpMap[jug[0].id] ?? 0,
                      courseHandicapB: courseHcpMap[jug[1].id] ?? 0,
                      totalHoles: ronda.holes,
                      modo: ronda.modo_juego,
                    }, { nombreA: jug[0].nombre, nombreB: jug[1].nombre })
                    shareData.matchResult = mr.display
                    shareData.matchWinner = mr.winner === 'a' ? jug[0].nombre : mr.winner === 'b' ? jug[1].nombre : undefined
                  }
                }

                // Team formats: calcular ranking de equipos para la share card
                if (['best_ball', 'scramble', 'foursome'].includes(ronda.formato_juego) && equipos.length > 0 && Object.keys(parMap).length > 0) {
                  shareData.teams = rankTeams({
                    equipos,
                    jugadores: ronda.ronda_libre_jugadores,
                    parMap, siMap,
                    holes: ronda.holes,
                    formato: ronda.formato_juego,
                    modo: ronda.modo_juego,
                  })
                }

                await compartirLeaderboard(shareData)
              }}
              style={{
                width: '100%',
                background: isFinished ? 'linear-gradient(135deg, #c9a84c 0%, #b8972f 100%)' : '#ffffff',
                border: isFinished ? 'none' : '1px solid #e5e7eb',
                color: isFinished ? '#0a1419' : '#374151',
                fontSize: isFinished ? '15px' : '13px',
                fontWeight: isFinished ? 700 : 600,
                padding: isFinished ? '14px 16px' : '10px 16px',
                borderRadius: isFinished ? '14px' : '10px',
                cursor: 'pointer',
                minHeight: '44px',
                marginBottom: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                boxShadow: isFinished ? '0 4px 20px rgba(201,168,76,0.4)' : 'none',
              }}
            >
              {isFinished ? 'Compartir leaderboard' : 'Compartir resultado actual'}
            </button>
          )}

          {/* Post-ronda links — only for finished rounds */}
          {isFinished && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginTop: '8px', paddingBottom: '24px' }}>
              {isAnonymous ? (
                <button
                  onClick={() => requireAuth('Ve tus estadísticas de golf')}
                  style={{
                    background: 'none', border: 'none',
                    color: '#c4992a', textDecoration: 'none', fontSize: '15px',
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Ver mis estadísticas →
                </button>
              ) : (
                <Link
                  href="/perfil/stats"
                  style={{
                    color: '#c4992a', textDecoration: 'none', fontSize: '15px',
                    fontWeight: 600,
                  }}
                >
                  Ver mis estadísticas →
                </Link>
              )}
            </div>
          )}

          {/* Explorar link is at the top of spectator view */}
        </div>

        {/* ── Admin: return to scoring bar ── */}
        {isAdmin && ronda.estado === 'en_curso' && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
            background: 'var(--bg-surface)', borderTop: '1px solid #e2e8f0',
            padding: '12px 20px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
            display: 'flex', justifyContent: 'center',
          }}>
            <Link href={`/ronda-libre/${codigo}/score-grupo`} style={{
              background: '#c4992a', color: '#ffffff', fontWeight: 700,
              fontSize: '15px', padding: '14px 32px', borderRadius: '12px',
              textDecoration: 'none', textAlign: 'center', width: '100%', maxWidth: '400px',
              display: 'block',
            }}>
              Volver a scorear
            </Link>
          </div>
        )}

        {/* ── Registration Banner (anonymous spectators, after 30s or scroll) ── */}
        {showBanner && isAnonymous && !bannerDismissed && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            borderTop: '1px solid #e2e8f0',
            padding: '14px 16px',
            animation: 'slideUpBanner 0.4s ease-out',
          }}>
            <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                  Registra tu propio score
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                  Crea tu cuenta gratis y juega con Golfers+
                </div>
              </div>
              <Link
                href={`/register?next=/ronda-libre/${codigo}`}
                style={{
                  background: '#c4992a', color: 'var(--brand-dark)', fontWeight: 700,
                  fontSize: '13px', padding: '10px 18px', borderRadius: '8px',
                  textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                Unirme gratis
              </Link>
              <button
                onClick={dismissBanner}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-2)',
                  fontSize: '20px', cursor: 'pointer', padding: '4px 8px',
                  flexShrink: 0, minHeight: '44px', minWidth: '44px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* ── Auth Modal (contextual registration prompt) ── */}
        {showAuthModal && (
          <AuthModal action={authModalAction} codigo={codigo} onClose={() => setShowAuthModal(false)} />
        )}

        {/* ── Admin score edit modal ── */}
        {editingScore && isCreator && (
          <div
            onClick={() => setEditingScore(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '24px',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--bg-surface)', borderRadius: '16px',
                padding: '24px', maxWidth: '320px', width: '100%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                Editar score — Hoyo {editingScore.hole}
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600, marginBottom: '16px' }}>
                {ronda.ronda_libre_jugadores.find(j => j.id === editingScore.jugadorId)?.nombre ?? 'Jugador'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '20px' }}>
                <button
                  onClick={() => setEditScoreValue(v => Math.max(1, v - 1))}
                  style={{
                    width: '48px', height: '48px', borderRadius: '12px',
                    background: 'var(--bg)', border: '1px solid #e5e7eb',
                    fontSize: '24px', fontWeight: 300, color: 'var(--text)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >{'−'}</button>
                <div style={{ fontSize: '40px', fontWeight: 700, color: 'var(--text)', minWidth: '60px', textAlign: 'center' }}>
                  {editScoreValue}
                </div>
                <button
                  onClick={() => setEditScoreValue(v => Math.min(19, v + 1))}
                  style={{
                    width: '48px', height: '48px', borderRadius: '12px',
                    background: '#c4992a', border: 'none',
                    fontSize: '24px', fontWeight: 600, color: 'var(--text)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >+</button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setEditingScore(null)}
                  style={{
                    flex: 1, padding: '12px', background: 'var(--bg)',
                    border: '1px solid #e5e7eb', borderRadius: '10px',
                    fontSize: '14px', fontWeight: 600, color: 'var(--text)', cursor: 'pointer',
                  }}
                >Cancelar</button>
                <button
                  onClick={handleAdminScoreSave}
                  style={{
                    flex: 1, padding: '12px', background: '#c4992a',
                    border: 'none', borderRadius: '10px',
                    fontSize: '14px', fontWeight: 700, color: 'var(--text)', cursor: 'pointer',
                  }}
                >Guardar</button>
              </div>
            </div>
          </div>
        )}

        {/* Banner animation + live badge pulse */}
        <style>{`
          @keyframes slideUpBanner {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes livePulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          .live-dot {
            animation: livePulse 1.5s ease-in-out infinite;
          }
          .live-badge-pulse {
            animation: liveBadgePulse 3s ease-in-out infinite;
          }
          @keyframes liveBadgePulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.3); }
            50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
          }
        `}</style>
      </div>
    )
  }

  // Unreachable — role is always 'espectador', handled above
  return null
}

export default function RondaLibrePage() {
  return (
    <Suspense fallback={<div style={{ background: 'var(--bg-surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', fontFamily: 'DM Sans, sans-serif' }}>Cargando ronda...</div>}>
      <RondaLibrePageContent />
    </Suspense>
  )
}
