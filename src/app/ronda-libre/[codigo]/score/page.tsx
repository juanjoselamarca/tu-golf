'use client'

import { useEffect, useRef, useState, useCallback, useMemo, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { Flame } from '@/components/icons'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import { calcularMatchPlay, displayDesdeJugador, colorResultadoHoyo, type MatchResult } from '@/golf/formats/match-play'
import type { ModoJuego, FormatoJuego, Jugador, RondaLibre, HoleData } from '@/types/ronda'
import type { SaveStatus } from './types'
import { getYardajeForTee } from '@/types/ronda'
import { resolverCourseHandicap, cargarCourseData } from '@/golf/core/course-handicap'
import { parTotalEstandar } from '@/golf/core/round-score'
import { updatePlayerNotification, getNotifPrefs, sendPushViaServer } from '@/lib/push-notifications'
import HoleInOneCelebration from '@/components/HoleInOneCelebration'
import BirdieCelebration from '@/components/BirdieCelebration'
import EagleCelebration from '@/components/EagleCelebration'
import { useScoreSync } from '@/hooks/useScoreSync'
import { addToast } from '@/hooks/useToast'
import { shouldNotify } from '@/golf/notifications'
import { calcularDiferencial, calcularNivel } from '@/lib/indice-golfers'

/* ── Share menu component ──────────────────────────────────────────── */
// ShareMenu movido a src/components/ronda/ShareMenu.tsx — import más abajo.

/* ── Tee → yardage column mapping ──────────────────────────────────── */
/* ── Helpers ─────────────────────────────────────────────────────────── */
// Helpers puros movidos a src/lib/ronda/helpers.ts — import más abajo.
// Wrapper localStorage movido a src/lib/ronda/score-storage.ts — import más abajo.

// Chip colors from centralized score-colors system
import { SCORE_STYLES, SCORE_STYLES_LIGHT, getScoreResult, getHoleBoxStyle, getScoreNumberStyle } from '@/golf/core/colors'
import MiniLeaderboard from '@/components/MiniLeaderboard'
import GWILeaderboard from '@/components/GWILeaderboard'
import { calcularGWI } from '@/golf/stats/gwi'
import type { JugadorGWIInput, GWIResult } from '@/golf/stats/gwi'
import { compartirResultado } from '@/lib/share-card'
import type { ShareCardData } from '@/lib/share-card'
import {
  getTeeYardageColumn,
  generarOrdenHoyos,
  haptic,
  getChipStyle,
  getChipLabel,
  getMissingHoles,
  fillMissingHolesWithPar,
} from '@/lib/ronda/helpers'
import { saveScores as lsSave, loadScores as lsLoad, clearScores as lsClear } from '@/lib/ronda/score-storage'
import { ShareMenu } from '@/components/ronda/ShareMenu'
import { useOnlineStatus } from '@/hooks/ronda/useOnlineStatus'

/* ── Main ────────────────────────────────────────────────────────────── */
function ScorePageContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const codigo = params.codigo as string
  const jugadorParam = searchParams.get('j')

  const [ronda, setRonda] = useState<RondaLibre | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeJugadorId, setActiveJugadorId] = useState<string | null>(null)
  const [currentHole, setCurrentHole] = useState(1)
  const [scores, setScores] = useState<Record<string, Record<number, number>>>({})
  const [parMap, setParMap] = useState<Record<number, number>>({})
  const [holeDataMap, setHoleDataMap] = useState<Record<number, HoleData>>({})
  const [playerHcp, setPlayerHcp] = useState<Record<string, number>>({})

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const isOnline = useOnlineStatus()
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [scoreAnimating, setScoreAnimating] = useState(false)
  const [_showMiniCard, _setShowMiniCard] = useState(true) // kept for compat, mini scorecard always visible now
  const [historicalRoundId, setHistoricalRoundId] = useState<string | null>(null)
  const [saveCheckVisible, setSaveCheckVisible] = useState(false) // FIX #8: save feedback toast
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [adminRedirectMsg, setAdminRedirectMsg] = useState<string | null>(null)
  const [roundDone, setRoundDone] = useState(false)
  const [finalScore, setFinalScore] = useState({ gross: 0, totalPar: 0 })
  const [holeInOneData, setHoleInOneData] = useState<{ playerName: string; hole: number } | null>(null)
  const [birdieData, setBirdieData] = useState<{ playerName: string; hole: number } | null>(null)
  const [eagleData, setEagleData] = useState<{ playerName: string; hole: number } | null>(null)
  const [streakMsg, setStreakMsg] = useState<string | null>(null)

  // Offline score sync — guarda localmente ANTES de enviar al servidor
  const scoreSync = useScoreSync(codigo, activeJugadorId)
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [showRanking, setShowRanking] = useState(false)
  const [view, setView] = useState<'scorecard' | 'leaderboard'>('scorecard')
  const [gwiInputs, setGwiInputs] = useState<JugadorGWIInput[]>([])
  const [, setGwiResults] = useState<GWIResult[]>([])
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  // Auto-return to scorecard after 10s + fetch GWI
  useEffect(() => {
    if (view === 'leaderboard') {
      const t = setTimeout(() => setView('scorecard'), 10000)
      // Fetch GWI data
      fetch(`/api/gwi/ronda-libre/${codigo}`)
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (json?.inputs) {
            setGwiInputs(json.inputs)
            setGwiResults(calcularGWI(json.inputs, json.totalHoyos))
          }
        })
        .catch(() => {})
      return () => clearTimeout(t)
    }
  }, [view, codigo])

  // Dark theme permanent — consistent with all other scoring pages
  const theme = {
    bg: 'var(--bg)',
    card: 'var(--bg-surface)',
    text: 'var(--text)',
    textMuted: 'var(--text-2)',
    textFaint: 'var(--text-3)',
    border: 'var(--border)',
    badgeBg: 'var(--bg)',
    badgeBorder: 'var(--border)',
    badgeText: 'var(--text-2)',
    scoreText: 'var(--text)',
    scoreDimmed: 'var(--text-3)',
    buttonBg: 'var(--bg)',
    buttonBorder: 'var(--border)',
    buttonText: 'var(--text-2)',
    navBg: 'rgba(255,255,255,0.97)',
    headerBg: 'rgba(255,255,255,0.97)',
  }

  const retryCountRef = useRef(0)
  const swipeRef = useRef({ startX: 0, startY: 0 })
  const progressRowRef = useRef<HTMLDivElement>(null)

  /* ── Auto-sync al reconectar (dispara cuando isOnline pasa a true) ── */
  useEffect(() => {
    if (!isOnline) return
    if (!activeJugadorId) return
    if (!scoreSync.tienePendientes()) return
    if (scoreSync.syncInProgressRef.current) return

    scoreSync.syncInProgressRef.current = true
    const pendingScores = scoreSync.obtenerLocal()
    if (pendingScores) {
      const supabase = createClient()
      const scoresObj: Record<string, number> = {}
      for (const [k, v] of Object.entries(pendingScores)) scoresObj[k] = v
      supabase.from('ronda_libre_jugadores').update({ scores: scoresObj }).eq('id', activeJugadorId)
        .then(({ error }) => {
          if (!error) {
            scoreSync.marcarSincronizado()
            setSaveStatus('saved')
            setSaveCheckVisible(true)
            haptic(20)
            setTimeout(() => setSaveCheckVisible(false), 1000)
            setTimeout(() => setSaveStatus('idle'), 1500)
          }
          scoreSync.syncInProgressRef.current = false
        })
    } else {
      scoreSync.syncInProgressRef.current = false
    }
  }, [isOnline, activeJugadorId, scoreSync])

  /* ── Prevent accidental nav ── */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsaved])

  /* ── Load ronda ── */
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('rondas_libres')
        .select('id, codigo, course_name, course_id, tees, holes, fecha, estado, modo_juego, formato_juego, hoyo_inicio, admin_mode, admin_user_id, recorridos, ronda_libre_jugadores(id, nombre, user_id, scores, handicap, tees)')
        .eq('codigo', codigo)
        .single()
      if (!data) { router.push('/dashboard'); return }
      const r = data as unknown as RondaLibre
      // If ronda was closed (by admin or player), redirect to detail view (read-only)
      if (r.estado === 'finalizada') { router.replace(`/ronda-libre/${codigo}`); return }
      // Demo rondas son spectator-only: cualquier usuario es redirigido al leaderboard.
      // El scoring usa la UI real en /score, no queremos que toquen demo data.
      if (r.es_demo) { router.replace(`/ronda-libre/${codigo}`); return }
      // Team formats must use score-grupo (individual scoring doesn't support teams)
      const teamFormats = ['best_ball', 'scramble', 'foursome']
      if (teamFormats.includes(r.formato_juego)) {
        router.replace(`/ronda-libre/${codigo}/score-grupo`)
        return
      }
      // Admin mode: non-admin members cannot use individual scoring
      if (r.admin_mode) {
        const { data: { user: authUser } } = await supabase.auth.getUser()
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

      const initialScores: Record<string, Record<number, number>> = {}
      for (const j of r.ronda_libre_jugadores) {
        const db: Record<number, number> = {}
        if (j.scores) for (const [k, v] of Object.entries(j.scores)) db[parseInt(k)] = v as number
        initialScores[j.id] = { ...lsLoad(codigo, j.id), ...db }
      }
      setScores(initialScores)

      const pm: Record<number, number> = {}
      const hdm: Record<number, HoleData> = {}
      for (let i = 1; i <= r.holes; i++) { pm[i] = 4; hdm[i] = { numero: i, par: 4, stroke_index: i, yardaje: null } }
      setParMap(pm)
      let finalParTotal = parTotalEstandar(r.holes)  // se actualiza si hay course_holes

      if (r.course_id) {
        let holeQuery = supabase.from('course_holes')
          .select('numero, par, stroke_index, recorrido, yardaje_negras, yardaje_azul, yardaje_blanco, yardaje_rojo, yardaje_verificado_at')
          .eq('course_id', r.course_id)
        // Multi-loop: filter by selected recorridos
        const recorridos = r.recorridos as string[] | null
        if (recorridos && recorridos.length > 0) {
          holeQuery = holeQuery.in('recorrido', recorridos)
        }
        const { data: holes } = await holeQuery.order('recorrido').order('numero')
        if (holes && holes.length > 0) {
          const pm2: Record<number, number> = {}; const hdm2: Record<number, HoleData> = {}
          const teeCol = getTeeYardageColumn(r.tees || 'azul')
          const isMultiLoop = recorridos && recorridos.length > 1
          let holeNum = 1
          for (const h of holes) {
            const num = isMultiLoop ? holeNum : h.numero
            pm2[num] = h.par
            hdm2[num] = {
              numero: num,
              par: h.par,
              stroke_index: h.stroke_index,
              // Solo exponer yardajes auditados contra fuente primaria. Si no
              // está verificado, la UI muestra '—' en lugar de un metro sospechoso.
              yardaje: (h as Record<string, unknown>).yardaje_verificado_at
                ? ((h as Record<string, unknown>)[teeCol] as number | null) ?? null
                : null,
              yardajes: (h as Record<string, unknown>).yardaje_verificado_at ? {
                negras: (h as Record<string, unknown>).yardaje_negras as number | null ?? null,
                azul: h.yardaje_azul ?? null,
                blanco: h.yardaje_blanco ?? null,
                rojo: (h as Record<string, unknown>).yardaje_rojo as number | null ?? null,
              } : undefined,
            }
            holeNum++
          }
          setParMap(pm2); setHoleDataMap(hdm2)
          finalParTotal = Object.values(pm2).reduce((a, b) => a + b, 0)
        } else { setHoleDataMap(hdm) }
      } else { setHoleDataMap(hdm) }

      // Convertir índice → course handicap usando fórmula WHS (tee por jugador)
      const hcpMap: Record<string, number> = {}
      const courseDataByTee: Record<string, Awaited<ReturnType<typeof cargarCourseData>>> = {}
      for (const j of r.ronda_libre_jugadores) {
        let index: number
        if (j.handicap != null) { index = j.handicap }
        else if (j.user_id) { const { data: p } = await supabase.from('profiles').select('indice').eq('id', j.user_id).single(); index = p?.indice ?? 0 }
        else { index = 0 }
        const playerTee = (j.tees || r.tees || 'azul').toLowerCase()
        if (!courseDataByTee[playerTee]) {
          courseDataByTee[playerTee] = await cargarCourseData(r.course_id ?? null, playerTee, r.holes, finalParTotal, (r.recorridos as string[] | null) ?? null)
        }
        hcpMap[j.id] = resolverCourseHandicap(index, courseDataByTee[playerTee])
      }
      setPlayerHcp(hcpMap)

      // Auto-detect player: if user is logged in and matches a jugador, auto-select
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const matchedPlayer = authUser ? r.ronda_libre_jugadores.find(j => j.user_id === authUser.id) : null
      // If jugadorParam is set OR user matches a player, auto-select and lock
      const preselect = jugadorParam
        ? r.ronda_libre_jugadores.find(j => j.id === jugadorParam)?.id ?? r.ronda_libre_jugadores[0]?.id
        : matchedPlayer?.id ?? (r.ronda_libre_jugadores.length === 1 ? r.ronda_libre_jugadores[0]?.id : null)

      if (preselect) {
        setSelectedPlayer(preselect)
        setActiveJugadorId(preselect)
        const ex = initialScores[preselect] ?? {}
        const orden = generarOrdenHoyos(r.hoyo_inicio ?? 1, r.holes)
        const firstEmpty = orden.find(h => ex[h] == null)
        if (firstEmpty != null) setCurrentHole(firstEmpty)
        else setCurrentHole(orden[0])
      } else {
        // Multi-player, no auto-match: show player selection screen
        // Set activeJugadorId to first player so data is loaded, but don't lock
        setActiveJugadorId(r.ronda_libre_jugadores[0]?.id ?? null)
      }
      setLoading(false)
    }
    load()
  }, [codigo, jugadorParam, router])

  /* ── Save ── */
  const saveScores = useCallback(async (jugadorId: string, holeScores: Record<number, number>) => {
    setSaveStatus('saving')
    // Guardar localmente SIEMPRE primero (funciona sin internet)
    scoreSync.guardarLocal(holeScores)
    lsSave(codigo, jugadorId, holeScores)

    if (!isOnline) { setSaveStatus('offline'); return }

    // Validate ronda is still en_curso before saving (admin may have closed/deleted it)
    const supabaseCheck = createClient()
    const { data: rondaCheck } = await supabaseCheck.from('rondas_libres').select('estado').eq('codigo', codigo).single()
    if (!rondaCheck || rondaCheck.estado === 'finalizada') {
      setSaveStatus('error')
      addToast({ type: 'warning', title: 'Ronda finalizada', message: 'El administrador cerró esta ronda. Tus scores están guardados en tu dispositivo.', duration: 8000 })
      router.replace(`/ronda-libre/${codigo}`)
      return
    }

    const scoresObj: Record<string, number> = {}
    for (const [k, v] of Object.entries(holeScores)) scoresObj[String(k)] = v  // Explicit string keys for JSONB

    let success = false
    retryCountRef.current = 0
    while (!success && retryCountRef.current < 3) {
      const supabase = createClient()
      const { error } = await supabase.from('ronda_libre_jugadores').update({ scores: scoresObj }).eq('id', jugadorId)
      if (!error) { success = true; retryCountRef.current = 0 } else retryCountRef.current++
    }

    if (!success) {
      setSaveStatus('error')
      addToast({ type: 'error', title: 'Error al guardar', message: 'No se pudo conectar después de 3 intentos. Tus scores están guardados en tu dispositivo.', duration: 8000 })
    }
    else {
      setSaveStatus('saved'); setHasUnsaved(false)
      scoreSync.marcarSincronizado()
      // FIX #8: show save check and haptic on success
      setSaveCheckVisible(true)
      haptic(20)
      setTimeout(() => setSaveCheckVisible(false), 1000)
      setTimeout(() => setSaveStatus('idle'), 1500)
    }
  }, [codigo, isOnline, scoreSync, router])

  const handleScoreChange = useCallback((hole: number, value: number) => {
    if (!activeJugadorId) return
    const clamped = Math.max(1, Math.min(19, value))
    haptic(10)
    setScoreAnimating(true)
    setTimeout(() => setScoreAnimating(false), 150)

    setScores(prev => {
      const next = { ...prev, [activeJugadorId]: { ...(prev[activeJugadorId] ?? {}), [hole]: clamped } }
      setHasUnsaved(true)
      // Save to localStorage immediately for backup
      lsSave(codigo, activeJugadorId, next[activeJugadorId])
      const holePar = parMap[hole] ?? 4
      if (clamped - holePar <= -1) haptic([15, 30, 15])
      return next
    })
  }, [activeJugadorId, parMap, codigo])

  /* ── Swipe ── */
  const handleTouchStart = (e: React.TouchEvent) => { swipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY } }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - swipeRef.current.startX
    const dy = e.changedTouches[0].clientY - swipeRef.current.startY
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 40) { // FIX #4: 40px threshold
      if (dx < 0 && ronda && currentHole < ronda.holes) setCurrentHole(h => h + 1)
      else if (dx > 0 && currentHole > 1) setCurrentHole(h => h - 1)
    }
  }

  /* ── Navigate ── */
  const handleExit = () => router.push(`/ronda-libre/${codigo}`)
  const goToNextHole = async () => {
    if (!ronda || !activeJugadorId) return
    haptic(30)
    // If no score was entered, auto-fill with par (the ghost value shown)
    if (scores[activeJugadorId]?.[currentHole] == null) {
      const holePar = parMap[currentHole] ?? 4
      handleScoreChange(currentHole, holePar)
    }
    await saveScores(activeJugadorId, scores[activeJugadorId] ?? {})

    // Send server-side push for notable events (birdie, eagle, hole-in-one)
    const savedScore = scores[activeJugadorId]?.[currentHole]
    const holePar = parMap[currentHole] ?? 4
    if (savedScore != null && ronda) {
      const playerName = ronda.ronda_libre_jugadores.find(j => j.id === activeJugadorId)?.nombre ?? 'Jugador'

      // Celebrate & push AFTER confirming with Siguiente
      if (savedScore === 1) {
        const decision = shouldNotify({ type: 'hole_in_one', playerName, hole: currentHole, courseName: ronda.course_name })
        if (decision.notify) {
          setHoleInOneData({ playerName, hole: currentHole })
          haptic(decision.hapticPattern ?? [50, 100, 50, 100, 50])
        }
        sendPushViaServer({ title: 'HOLE IN ONE!', body: `${playerName} hizo hoyo en uno en el hoyo ${currentHole}!`, tag: `ace-${codigo}-${currentHole}`, url: `/ronda-libre/${codigo}` })
      } else {
        const diff = savedScore - holePar
        if (diff <= -2) {
          const decision = shouldNotify({ type: 'eagle', playerName, hole: currentHole, courseName: ronda.course_name })
          if (decision.notify) {
            setEagleData({ playerName, hole: currentHole })
            haptic(decision.hapticPattern ?? [30, 60, 30, 60])
          }
          sendPushViaServer({ title: `Eagle — ${playerName}`, body: `Eagle en hoyo ${currentHole} en ${ronda.course_name}`, tag: `eagle-${codigo}-${currentHole}`, url: `/ronda-libre/${codigo}` })
        } else if (diff === -1) {
          const decision = shouldNotify({ type: 'birdie', playerName, hole: currentHole, courseName: ronda.course_name })
          if (decision.notify) {
            setBirdieData({ playerName, hole: currentHole })
            haptic(decision.hapticPattern ?? [15, 30, 15])
          }
          sendPushViaServer({ title: `Birdie — ${playerName}`, body: `Birdie en hoyo ${currentHole} en ${ronda.course_name}`, tag: `birdie-${codigo}-${currentHole}`, url: `/ronda-libre/${codigo}` })
        }
      }
    }

    // Streak detection: 3+ consecutive pars or better
    if (savedScore != null && activeJugadorId) {
      const ps = scores[activeJugadorId] ?? {}
      let streak = 0
      for (let i = currentHoleIdx; i >= 0; i--) {
        const h = ordenHoyos[i]
        const s = ps[h]; const p = parMap[h] ?? 4
        if (s != null && s <= p) streak++
        else break
      }
      if (streak >= 3) {
        const msgs = [
          `${streak} hoyos en par o mejor`,
          `Racha de ${streak} — consistencia`,
          `${streak} seguidos — en la zona`,
        ]
        setStreakMsg(msgs[Math.min(streak - 3, msgs.length - 1)])
        setTimeout(() => setStreakMsg(null), 2500)
      }
    }

    // Use circular order for next hole
    const nextIdx = currentHoleIdx + 1
    if (nextIdx < ordenHoyos.length) {
      const nextHole = ordenHoyos[nextIdx]
      setCurrentHole(nextHole)
      // Player notification: update persistent notification
      if (ronda && getNotifPrefs().player) {
        const overUnder = totalOverUnder > 0 ? `+${totalOverUnder}` : totalOverUnder === 0 ? 'E' : String(totalOverUnder)
        updatePlayerNotification(ronda.course_name, nextHole, parMap[nextHole] ?? 4, overUnder, `/ronda-libre/${codigo}/score?hole=${nextHole}`)
      }
    }
  }
  const goToPrevHole = () => {
    const prevIdx = currentHoleIdx - 1
    if (prevIdx >= 0) setCurrentHole(ordenHoyos[prevIdx])
  }

  const discardRound = async () => {
    if (!ronda || discarding) return
    if (!confirmDiscard) {
      setConfirmDiscard(true)
      haptic([20, 40, 20])
      setTimeout(() => setConfirmDiscard(false), 5000)
      return
    }
    setDiscarding(true)
    haptic(30)
    const supabase = createClient()
    const { error: e1 } = await supabase.from('ronda_libre_jugadores').delete().eq('ronda_id', ronda.id)
    if (e1) { setDiscarding(false); addToast({ title: `Error al descartar: ${e1.message}`, type: 'error' }); return }
    const { error: e2 } = await supabase.from('rondas_libres').delete().eq('id', ronda.id)
    if (e2) { setDiscarding(false); addToast({ title: `Error al descartar: ${e2.message}`, type: 'error' }); return }
    // Limpia localStorage para esta ronda
    try {
      for (const j of ronda.ronda_libre_jugadores) lsClear(codigo, j.id)
    } catch { /* no bloquear */ }
    addToast({ title: 'Ronda descartada', type: 'info' })
    router.push('/dashboard')
  }

  const finalizeRound = async () => {
    if (!ronda || !activeJugadorId) return
    if (!confirmFinalize) {
      setConfirmFinalize(true)
      haptic(15)
      return
    }
    setConfirmFinalize(false)
    haptic(30)
    // Bug fix 30-abr-2026: el último hoyo en par no se persistía. La UI mostraba
    // par como placeholder visual (sensación de registrado), pero el state era
    // undefined porque sin tap +/- nunca se disparaba handleScoreChange. Y como
    // goToNextHole no corre en el último hoyo, el auto-fill no aplicaba.
    // Detectar todos los hoyos sin marcar y rellenarlos con par antes de guardar.
    const currentScores = scores[activeJugadorId] ?? {}
    const missing = getMissingHoles(currentScores, ronda.holes ?? 18)
    const playerScores = missing.length > 0
      ? fillMissingHolesWithPar(currentScores, missing, parMap)
      : currentScores
    if (missing.length > 0) {
      setScores(prev => ({ ...prev, [activeJugadorId]: playerScores }))
      lsSave(codigo, activeJugadorId, playerScores)
    }
    await saveScores(activeJugadorId, playerScores)
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await trackEvent(supabase, authUser?.id ?? null, 'ronda_completada', { codigo })

    // Save to historical_rounds — array de scores en orden de hoyo (1..N)
    const totalHolesForSave = ronda.holes ?? 18
    const scoresArray: (number | null)[] = Array.from({ length: totalHolesForSave }, (_, i) => {
      const h = i + 1
      return playerScores[h] ?? null
    })
    const grossTotal = scoresArray.filter((s): s is number => s != null).reduce((a, b) => a + b, 0)
    // holes_played = hoyos REALMENTE jugados (no el config de la ronda).
    // Sin esto, una ronda de 15/18 se guardaba como "18 hoyos" y el diferencial WHS salía mal.
    const actualHolesPlayed = scoresArray.filter((s): s is number => s != null).length
    if (actualHolesPlayed === 0) {
      // Sin scores = no tiene sentido crear historial. Usar "Descartar ronda".
      addToast({ title: 'Sin hoyos jugados', message: 'Usa "Descartar ronda" si no quieres guardarla.', type: 'info' })
      setRoundDone(true)
      setHasUnsaved(false)
      return
    }
    try {
      // Fetch slope/rating from courses for diferencial calculation
      // Usar el tee del jugador que está finalizando (fallback al tee global de la ronda)
      const activePlayer = ronda.ronda_libre_jugadores.find(p => p.id === activeJugadorId)
      const effectivePlayerTee = activePlayer?.tees || ronda.tees
      let slopeRating: number | null = null
      let courseRating: number | null = null
      let nineHoleRatings: { cr9h: number; slope9h: number } | null = null
      if (ronda.course_id) {
        // Try tee-specific CR/Slope first (más preciso)
        if (effectivePlayerTee) {
          const { data: teeData } = await supabase
            .from('course_tees')
            .select('rating, slope, front_course_rating, front_slope_rating, back_course_rating, back_slope_rating')
            .eq('course_id', ronda.course_id)
            .ilike('nombre', `${effectivePlayerTee}%`)
            .limit(1)
            .single()
          if (teeData?.rating && teeData?.slope) {
            courseRating = teeData.rating
            slopeRating = teeData.slope
          }
          // Extract 9h ratings if available (front 9 default, could be back based on recorrido)
          if (teeData?.front_course_rating && teeData?.front_slope_rating) {
            nineHoleRatings = { cr9h: teeData.front_course_rating, slope9h: teeData.front_slope_rating }
          }
        }
        // Fallback to course-level ratings
        if (!courseRating || !slopeRating) {
          const { data: courseData } = await supabase
            .from('courses')
            .select('slope_rating, course_rating')
            .eq('id', ronda.course_id)
            .single()
          slopeRating = slopeRating ?? courseData?.slope_rating ?? null
          courseRating = courseRating ?? courseData?.course_rating ?? null
        }
      }
      // Diferencial WHS: solo si jugó >= 9 hoyos. Con menos, WHS no permite calcular.
      const diferencial = (slopeRating && courseRating && actualHolesPlayed >= 9)
        ? calcularDiferencial(grossTotal, courseRating, slopeRating, actualHolesPlayed, nineHoleRatings)
        : null

      // El historial pertenece al JUGADOR, no al dueño del dispositivo. Si el jugador
      // activo tiene cuenta propia, usar su user_id; si no (invitado), usar la sesión actual.
      const historicalUserId = activePlayer?.user_id ?? authUser?.id
      if (!historicalUserId) throw new Error('no-user-id-for-historical')
      const { data: insertedRound } = await supabase.from('historical_rounds').insert({
        user_id: historicalUserId,
        course_name: ronda.course_name,
        course_id: ronda.course_id ?? null,
        played_at: ronda.fecha || new Date().toISOString().split('T')[0],
        total_gross: grossTotal,
        scores: scoresArray,
        holes_played: actualHolesPlayed,
        tee_color: effectivePlayerTee ?? null,
        privacy: 'private',
        slope_rating: slopeRating,
        course_rating: courseRating,
        diferencial,
        formato_juego: ronda.formato_juego ?? 'stroke_play',
        modo_juego: ronda.modo_juego ?? 'gross',
      }).select('id').single()

      if (insertedRound?.id) {
        setHistoricalRoundId(insertedRound.id)
      }

      // Recalcular Índice Golfers+ y nivel del dueño de la tarjeta (no del dispositivo)
      supabase.rpc('calcular_indice_golfers', { p_user_id: historicalUserId }).then(() => {})
      const hace90Dias = new Date()
      hace90Dias.setDate(hace90Dias.getDate() - 90)
      supabase
        .from('historical_rounds')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', historicalUserId)
        .gte('played_at', hace90Dias.toISOString())
        .then(({ count }) => {
          const nuevoNivel = calcularNivel(count ?? 0)
          const expira = new Date()
          expira.setDate(expira.getDate() + 60)
          supabase.from('profiles').update({
            nivel: nuevoNivel,
            nivel_updated_at: new Date().toISOString(),
            nivel_expires_at: expira.toISOString(),
          }).eq('id', historicalUserId).then(() => {})
        })

      // Detectar patrones del dueño de la sesión (tAIger+ patterns es del usuario logged-in)
      if (authUser?.id) {
        fetch('/api/taiger/patterns', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(() => {}).catch(() => {})
      }
    } catch { /* don't block finalization */ }

    // Check if ALL players have completed all holes → finalize round
    // Guard: verificar que la ronda no fue finalizada por otro jugador simultáneamente
    const holesCount = ronda.holes ?? 18
    const { data: freshRonda } = await supabase
      .from('rondas_libres')
      .select('estado, ronda_libre_jugadores(id, scores)')
      .eq('codigo', codigo)
      .single()
    if (freshRonda?.estado === 'finalizada') {
      // Otro jugador ya finalizó — no duplicar
      setRoundDone(true)
    } else {
      const allDone = (freshRonda?.ronda_libre_jugadores ?? []).every((j: { scores: Record<string, number> }) => {
        const count = Object.keys(j.scores ?? {}).filter(k => { const n = parseInt(k); return n >= 1 && n <= holesCount }).length
        return count >= holesCount
      })
      if (allDone) {
        // Usar update condicional para evitar race condition
        await supabase.from('rondas_libres')
          .update({ estado: 'finalizada' })
          .eq('codigo', codigo)
          .eq('estado', 'en_curso') // Solo actualiza si aún está en curso
        sendPushViaServer({
          title: 'Ronda finalizada',
          body: `Resultado final listo en ${ronda.course_name}`,
          tag: `round-finished-${codigo}`,
          url: `/ronda-libre/${codigo}?finished=true`,
        })
      }
    }

    // Calculate final score for modal
    const finalPlayerScores = scores[activeJugadorId] ?? {}
    const finalGross = Object.values(finalPlayerScores).reduce((a: number, b: number) => a + b, 0)
    let finalTotalPar = 0
    for (const [hStr] of Object.entries(finalPlayerScores)) {
      finalTotalPar += parMap[parseInt(hStr)] ?? 4
    }
    setFinalScore({ gross: finalGross, totalPar: finalTotalPar })
    setRoundDone(true)
    setHasUnsaved(false)
  }

  /* ── Scroll progress row to current hole ── */
  useEffect(() => {
    if (progressRowRef.current) {
      const cell = progressRowRef.current.children[currentHole - 1] as HTMLElement | undefined
      if (cell) cell.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }
  }, [currentHole])

  // Mini ranking calculation (must be before early returns for hook ordering)
  const ranking = useMemo(() => {
    if (!ronda) return []
    const jug = ronda.ronda_libre_jugadores
    const th = ronda.holes
    return jug.map(j => {
      let gross = 0, parTotal = 0, holesPlayed = 0
      for (let h = 1; h <= th; h++) {
        const s = scores[j.id]?.[h] ?? scores[j.id]?.[String(h) as unknown as number]
        if (s != null) { gross += s; parTotal += parMap[h] ?? 4; holesPlayed++ }
      }
      return { id: j.id, nombre: j.nombre, vsPar: gross - parTotal, holesPlayed, gross }
    })
    .filter(j => j.holesPlayed > 0)
    .sort((a, b) => a.vsPar - b.vsPar)
  }, [ronda, scores, parMap])

  // Match Play state calculation
  const isMatchPlay = ronda?.formato_juego === 'match_play'
  const matchResult: MatchResult | null = useMemo(() => {
    if (!isMatchPlay || !ronda) return null
    const jug = ronda.ronda_libre_jugadores
    if (jug.length !== 2) return null

    // Build scores records from state
    const scoresA: Record<string, number> = {}
    const scoresB: Record<string, number> = {}
    const playerScoresA = scores[jug[0].id] ?? {}
    const playerScoresB = scores[jug[1].id] ?? {}
    for (const [k, v] of Object.entries(playerScoresA)) {
      if (v != null && v > 0) scoresA[String(k)] = v
    }
    for (const [k, v] of Object.entries(playerScoresB)) {
      if (v != null && v > 0) scoresB[String(k)] = v
    }

    // Build holes array from holeDataMap
    const holes = Object.entries(holeDataMap).map(([num, data]) => ({
      numero: Number(num),
      par: data.par,
      stroke_index: data.stroke_index,
    }))
    if (holes.length === 0) return null

    return calcularMatchPlay(scoresA, scoresB, holes, {
      courseHandicapA: playerHcp[jug[0].id] ?? 0,
      courseHandicapB: playerHcp[jug[1].id] ?? 0,
      totalHoles: ronda.holes,
      modo: ronda.modo_juego,
    }, { nombreA: jug[0].nombre, nombreB: jug[1].nombre })
  }, [isMatchPlay, ronda, scores, holeDataMap, playerHcp])

  /* ── Render ── */
  if (adminRedirectMsg) return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
      <div style={{ fontSize: '14px', color: 'var(--text-2)' }}>{adminRedirectMsg}</div>
    </div>
  )
  if (loading) return <div style={{ background: theme.bg, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textFaint }}>Cargando ronda...</div>
  if (!ronda || !activeJugadorId) return null

  const jugadores = ronda.ronda_libre_jugadores
  const totalHoles = ronda.holes
  const hoyoInicio = ronda.hoyo_inicio ?? 1
  const ordenHoyos = generarOrdenHoyos(hoyoInicio, totalHoles)

  /* ── Player selection screen (multi-player, no auto-match) ── */
  if (!selectedPlayer && jugadores.length > 1) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
          Quien eres?
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '24px' }}>
          Selecciona tu nombre para marcar tu score
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '360px' }}>
          {jugadores.map(j => (
            <button key={j.id} onClick={() => {
              setSelectedPlayer(j.id)
              setActiveJugadorId(j.id)
              // Jump to first empty hole for this player
              const ex = scores[j.id] ?? {}
              const orden = generarOrdenHoyos(ronda.hoyo_inicio ?? 1, ronda.holes)
              const firstEmpty = orden.find(h => ex[h] == null)
              if (firstEmpty != null) setCurrentHole(firstEmpty)
              else setCurrentHole(orden[0])
            }} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: '12px', cursor: 'pointer', width: '100%', textAlign: 'left',
            }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>{j.nombre}</div>
                {playerHcp[j.id] != null && (
                  <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>HCP {playerHcp[j.id]}</div>
                )}
              </div>
              <span style={{ color: '#c4992a', fontSize: '20px' }}>{'\u2192'}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }
  const currentHoleIdx = ordenHoyos.indexOf(currentHole)
  const isLastHole = currentHoleIdx >= totalHoles - 1
  const par = parMap[currentHole] ?? 4
  const score = scores[activeJugadorId]?.[currentHole]
  const holeData = holeDataMap[currentHole] ?? { numero: currentHole, par, stroke_index: currentHole, yardaje: null }
  const activePlayer = jugadores.find(p => p.id === activeJugadorId)

  // Total score
  let totalGross = 0, totalParPlayed = 0
  for (let h = 1; h <= totalHoles; h++) {
    const s = scores[activeJugadorId]?.[h]
    if (s != null) { totalGross += s; totalParPlayed += parMap[h] ?? 4 }
  }
  const totalOverUnder = totalGross - totalParPlayed
  const holesPlayed = Object.keys(scores[activeJugadorId] ?? {}).length
  const canFinalize = holesPlayed >= 9 || currentHoleIdx >= totalHoles - 1
  // Hoyos del rango 1..totalHoles que aún no tienen score. El finalize hará
  // auto-fill con par; el botón anuncia cuántos son para evitar el bug del
  // último hoyo en par (Juanjo 30-abr-2026).
  const missingCount = activeJugadorId
    ? getMissingHoles(scores[activeJugadorId] ?? {}, totalHoles).length
    : 0

  // FIX #6: Front 9 / Back 9 totals
  let f9Gross = 0, f9Par = 0, f9Count = 0
  let b9Gross = 0, b9Par = 0, b9Count = 0
  for (let h = 1; h <= Math.min(9, totalHoles); h++) {
    const s = scores[activeJugadorId]?.[h]
    if (s != null) { f9Gross += s; f9Par += parMap[h] ?? 4; f9Count++ }
  }
  for (let h = 10; h <= totalHoles; h++) {
    const s = scores[activeJugadorId]?.[h]
    if (s != null) { b9Gross += s; b9Par += parMap[h] ?? 4; b9Count++ }
  }
  const formatNine = (gross: number, parN: number) => {
    const d = gross - parN
    return d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`
  }

  // Handicap strokes on this hole
  const hcpForPlayer = playerHcp[activeJugadorId] ?? 0
  const strokesOnHole = strokesRecibidosEnHoyo(hcpForPlayer, holeData.stroke_index)

  // Diferencia de strokes vs rival (para dots: solo mostrar donde HAY ventaja)
  // En match play o neto con 2 jugadores: dot solo donde jugador activo tiene
  // más strokes que el rival (es decir, donde hay ventaja real)
  const jug = ronda?.ronda_libre_jugadores ?? []
  const rivalId = jug.length === 2 ? jug.find(j => j.id !== activeJugadorId)?.id : null
  const rivalHcp = rivalId ? (playerHcp[rivalId] ?? 0) : 0
  // BUG (12-may-2026 Juanjo en cancha): hasStrokeAdvantage hace closure sobre
  // modoJuego/formatoJuego. Si los const están más abajo, la llamada inmediata
  // de hasStrokeAdvantage rompe por TDZ y el scorer queda en blanco. Mantener
  // ESTAS dos declaraciones por encima del callback siempre.
  const modoJuego = ronda.modo_juego ?? 'gross'
  const formatoJuego = ronda.formato_juego ?? 'stroke_play'
  const hasStrokeAdvantage = (si: number): boolean => {
    if (modoJuego === 'gross' || jug.length !== 2) return strokesRecibidosEnHoyo(hcpForPlayer, si) > 0
    const myStrokes = strokesRecibidosEnHoyo(hcpForPlayer, si)
    const theirStrokes = strokesRecibidosEnHoyo(rivalHcp, si)
    return myStrokes > theirStrokes
  }
  const strokeAdvantageOnHole = hasStrokeAdvantage(holeData.stroke_index)

  // Net score & Stableford for current hole
  const currentNetScore = score != null ? score - strokesOnHole : null
  const currentNetDiff = currentNetScore != null ? currentNetScore - par : null
  const currentStablefordPts = score != null ? puntosStablefordHoyo(score, par, hcpForPlayer, holeData.stroke_index) : null

  // Total net & stableford across all holes played
  let totalNet = 0, totalNetPar = 0, totalStableford = 0
  let missingStrokeIndex = false
  for (let h = 1; h <= totalHoles; h++) {
    const s = scores[activeJugadorId]?.[h]
    if (s != null) {
      const hd = holeDataMap[h]
      if (!hd?.stroke_index && (ronda.modo_juego === 'neto' || ronda.formato_juego === 'stableford')) missingStrokeIndex = true
      const si = hd?.stroke_index ?? h
      const strk = strokesRecibidosEnHoyo(hcpForPlayer, si)
      totalNet += s - strk
      totalNetPar += parMap[h] ?? 4
      totalStableford += puntosStablefordHoyo(s, parMap[h] ?? 4, hcpForPlayer, si)
    }
  }
  const totalNetOverUnder = totalNet - totalNetPar

  // What to display based on formato_juego + modo_juego (modoJuego/formatoJuego declarados arriba)
  const modoLabel = formatoJuego === 'match_play' ? 'Match Play Neto'
    : formatoJuego === 'stableford' ? 'Stableford'
    : modoJuego === 'neto' ? 'Stroke Play Neto'
    : 'Stroke Play'
  const showNet = modoJuego === 'neto' && formatoJuego !== 'stableford'
  const showStableford = formatoJuego === 'stableford'
  const displayOverUnder = showNet ? totalNetOverUnder : totalOverUnder
  const displayTotal = showStableford ? totalStableford : totalGross

  // Warning if stroke index is missing for neto/stableford modes
  const showStrokeIndexWarning = missingStrokeIndex && (showNet || showStableford)

  // Double bogey warning
  const isAboveDoubleBogey = score != null && score > par + 2

  // Score styles for mini scorecard (theme-aware)
  const currentScoreStyles = SCORE_STYLES

  return (
    <div style={{ background: theme.bg, height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>

      {/* ── Share menu modal ── */}
      {showShareMenu && <ShareMenu codigo={codigo} onClose={() => setShowShareMenu(false)} isAdminMode={!!ronda?.admin_mode} />}

      {/* ── Offline banner ── */}
      {!isOnline && (
        <div style={{ background: '#92400e', color: '#fef3c7', textAlign: 'center', padding: '4px', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>
          Sin conexión — guardado local
        </div>
      )}

      {/* ── Save indicator ── */}
      {saveStatus !== 'idle' && (
        <div style={{
          position: 'fixed', top: '4px', right: '12px', zIndex: 200,
          padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
          transition: 'opacity 0.3s',
          background: saveStatus === 'saving' ? 'rgba(196,153,42,0.9)'
            : saveStatus === 'saved' ? 'rgba(0,230,118,0.85)'
            : saveStatus === 'offline' ? 'rgba(252,211,77,0.9)'
            : 'rgba(255,68,68,0.9)',
          color: saveStatus === 'saved' ? '#1a1a2e' : saveStatus === 'offline' ? '#1a1a2e' : '#ffffff',
          animation: saveStatus === 'saving' ? 'savePulse 1s ease infinite' : 'none',
          pointerEvents: 'none',
        }}>
          {saveStatus === 'saving' ? 'Guardando...'
            : saveStatus === 'saved' ? '✓ Guardado'
            : saveStatus === 'offline' ? 'Offline — local'
            : 'Error al guardar'}
        </div>
      )}

      {/* ── Header 48px — theme aware ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', height: '48px', flexShrink: 0,
        borderBottom: `1px solid ${theme.border}`,
        background: theme.headerBg,
      }}>
        <button onClick={handleExit} aria-label="Salir de la ronda" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: theme.textMuted, fontSize: '14px',
          padding: '8px', minWidth: '44px', minHeight: '44px',
          display: 'flex', alignItems: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}>←</button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#C4992A', letterSpacing: '0.05em' }}>HOYO {currentHole}</div>
            <span style={{
              fontSize: '9px', fontWeight: 600, letterSpacing: '0.05em',
              padding: '2px 8px', borderRadius: '10px',
              background: 'rgba(196,153,42,0.15)', color: '#C4992A',
              border: '1px solid rgba(196,153,42,0.25)',
              textTransform: 'uppercase' as const,
            }}>
              {modoLabel}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: theme.textFaint }}>{ronda.course_name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ textAlign: 'right' }}>
            {isMatchPlay && matchResult ? (
              <>
                <div style={{
                  fontSize: '16px', fontWeight: 700,
                  color: matchResult.state === 0 ? theme.textMuted : matchResult.state > 0
                    ? (activeJugadorId === ronda.ronda_libre_jugadores[0]?.id ? '#16a34a' : '#dc2626')
                    : (activeJugadorId === ronda.ronda_libre_jugadores[0]?.id ? '#dc2626' : '#16a34a'),
                }}>
                  {matchResult.holesPlayed > 0
                    ? displayDesdeJugador(matchResult.state, activeJugadorId === ronda.ronda_libre_jugadores[0]?.id ? 'a' : 'b')
                    : '—'}
                </div>
                <div style={{ fontSize: '8px', color: theme.textFaint, letterSpacing: '0.04em', fontFamily: 'DM Mono, monospace' }}>
                  MATCH PLAY · {matchResult.holesPlayed}/{totalHoles}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '16px', fontWeight: 700, color: showStableford ? '#C4992A' : displayOverUnder < 0 ? '#93C5FD' : displayOverUnder === 0 ? theme.textMuted : '#FCD34D' }}>
                  {holesPlayed > 0 ? (showStableford ? `${totalStableford} pts` : displayOverUnder > 0 ? `+${displayOverUnder}` : displayOverUnder === 0 ? 'E' : displayOverUnder) : '—'}
                </div>
                <div style={{ fontSize: '8px', color: theme.textFaint, letterSpacing: '0.04em', fontFamily: 'DM Mono, monospace' }}>
                  {showNet && <span style={{ color: '#C4992A', marginRight: '4px' }}>HCP {hcpForPlayer}</span>}
                  THRU {holesPlayed}/{totalHoles}
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      {/* Progress bar */}
      <div style={{ height: '3px', background: '#e2e8f0', flexShrink: 0 }}>
        <div style={{ height: '3px', background: '#C4992A', width: `${(holesPlayed / totalHoles) * 100}%`, transition: 'width 0.3s ease' }} />
      </div>

      {/* ── Mini scorecard with PGA indicators + OUT/IN/TOT ── */}
      <div style={{
        borderBottom: `1px solid ${theme.border}`,
        flexShrink: 0, overflow: 'hidden',
      }}>
        <div ref={progressRowRef} style={{
          display: 'flex', overflowX: 'auto', padding: '5px 6px', gap: '2px',
          WebkitOverflowScrolling: 'touch',
        }}>
          {/* Front 9 */}
          {Array.from({ length: Math.min(9, totalHoles) }, (_, i) => i + 1).map(h => {
            const s = scores[activeJugadorId]?.[h]
            const p = parMap[h] ?? 4
            const isActive = h === currentHole
            const diff = s != null ? s - p : null
            const indicatorColor = s === 1 ? '#c4992a' : diff != null && diff <= -3 ? '#60A5FA' : diff != null && diff < 0 ? '#c4992a' : diff != null && diff > 0 ? '#EF4444' : 'transparent'
            const holeStrokeCount = modoJuego !== 'gross' && hasStrokeAdvantage(holeDataMap[h]?.stroke_index ?? h) ? 1 : 0
            return (
              <div key={h} onClick={() => setCurrentHole(h)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '22px', cursor: 'pointer', position: 'relative' }}>
                <div style={{ fontSize: '8px', color: isActive ? '#C4992A' : theme.textFaint, fontWeight: isActive ? 600 : 400, marginBottom: '2px' }}>{h}</div>
                {s != null ? (
                  <div style={{
                    width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 600, lineHeight: 1,
                    color: s === 1 ? '#c4992a' : diff != null && diff >= 3 ? '#fff' : theme.textMuted,
                    background: s === 1 ? '#c4992a' : diff != null && diff <= -3 ? '#60A5FA' : diff != null && diff >= 3 ? '#DC2626' : 'transparent',
                    border: indicatorColor !== 'transparent' && !((s === 1) || (diff != null && diff <= -3) || (diff != null && diff >= 3)) ? `1.5px solid ${indicatorColor}` : 'none',
                    borderRadius: diff != null && diff < 0 ? '50%' : '2px',
                    boxShadow: isActive ? '0 0 0 1.5px #C4992A' : 'none',
                  }}>
                    {s === 1 ? <span style={{ color: '#ffffff', fontWeight: 800 }}>1</span> : s}
                  </div>
                ) : (
                  <div style={{ width: '22px', height: '22px', borderRadius: '3px', background: isActive ? 'rgba(196,153,42,0.15)' : theme.badgeBg, border: isActive ? '1.5px solid #C4992A' : `1px solid ${theme.badgeBorder}` }} />
                )}
                {holeStrokeCount > 0 && (
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-1px', display: 'flex', gap: '1px' }}>
                    {Array.from({ length: holeStrokeCount }, (_, i) => (
                      <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c4992a', border: '0.5px solid rgba(255,255,255,0.8)' }} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* OUT */}
          {/* Separator entre front y back */}
          {totalHoles > 9 && <div style={{ width: '1px', background: theme.border, margin: '2px 1px', flexShrink: 0 }} />}

          {/* Back 9 */}
          {totalHoles > 9 && Array.from({ length: Math.min(9, totalHoles - 9) }, (_, i) => i + 10).map(h => {
            const s = scores[activeJugadorId]?.[h]
            const p = parMap[h] ?? 4
            const isActive = h === currentHole
            const diff = s != null ? s - p : null
            const indicatorColor = s === 1 ? '#c4992a' : diff != null && diff <= -3 ? '#60A5FA' : diff != null && diff < 0 ? '#c4992a' : diff != null && diff > 0 ? '#EF4444' : 'transparent'
            const holeStrokeCount = modoJuego !== 'gross' && hasStrokeAdvantage(holeDataMap[h]?.stroke_index ?? h) ? 1 : 0
            return (
              <div key={h} onClick={() => setCurrentHole(h)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '22px', cursor: 'pointer', position: 'relative' }}>
                <div style={{ fontSize: '8px', color: isActive ? '#C4992A' : theme.textFaint, fontWeight: isActive ? 600 : 400, marginBottom: '2px' }}>{h}</div>
                {s != null ? (
                  <div style={{
                    width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 600, lineHeight: 1,
                    color: s === 1 ? '#c4992a' : diff != null && diff >= 3 ? '#fff' : theme.textMuted,
                    background: s === 1 ? '#c4992a' : diff != null && diff <= -3 ? '#60A5FA' : diff != null && diff >= 3 ? '#DC2626' : 'transparent',
                    border: indicatorColor !== 'transparent' && !((s === 1) || (diff != null && diff <= -3) || (diff != null && diff >= 3)) ? `1.5px solid ${indicatorColor}` : 'none',
                    borderRadius: diff != null && diff < 0 ? '50%' : '2px',
                    boxShadow: isActive ? '0 0 0 1.5px #C4992A' : 'none',
                  }}>
                    {s === 1 ? <span style={{ color: '#ffffff', fontWeight: 800 }}>1</span> : s}
                  </div>
                ) : (
                  <div style={{ width: '22px', height: '22px', borderRadius: '3px', background: isActive ? 'rgba(196,153,42,0.15)' : theme.badgeBg, border: isActive ? '1.5px solid #C4992A' : `1px solid ${theme.badgeBorder}` }} />
                )}
                {holeStrokeCount > 0 && (
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-1px', display: 'flex', gap: '1px' }}>
                    {Array.from({ length: holeStrokeCount }, (_, i) => (
                      <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c4992a', border: '0.5px solid rgba(255,255,255,0.8)' }} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Score total: gross + neto */}
          <div style={{ width: '1px', background: theme.border, margin: '2px 1px', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '36px', padding: '0 4px', flexShrink: 0 }}>
            <div style={{ fontSize: '8px', fontWeight: 600, color: theme.textFaint, letterSpacing: '0.06em', marginBottom: '2px' }}>GROSS</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{totalGross > 0 ? totalGross : '—'}</div>
            {showNet && totalGross > 0 && (
              <>
                <div style={{ fontSize: '7px', fontWeight: 600, color: theme.textFaint, letterSpacing: '0.06em', marginTop: '3px' }}>NET</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#5a6370' }}>{totalNet > 0 ? totalNet : '—'}</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Hole info: 3-4 columns + share ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, background: 'var(--bg-surface)', flexShrink: 0 }}>
        {[
          { label: 'PAR', value: String(par) },
          { label: 'SI', value: String(holeData.stroke_index) },
          { label: 'YDS', value: (() => { const y = getYardajeForTee(holeData, activePlayer?.tees || ronda.tees); return y ? String(y) : '—' })() },
          ...((showNet || showStableford) ? [{ label: 'GOLPES', value: strokesOnHole > 0 ? `+${strokesOnHole}` : '0' }] : []),
        ].map((col, i) => (
          <div key={col.label} style={{
            flex: 1, textAlign: 'center', padding: '8px 2px',
            borderRight: `1px solid ${theme.border}`,
          }}>
            <div style={{ fontSize: '9px', fontWeight: 600, color: col.label === 'GOLPES' ? '#C4992A' : theme.textFaint, letterSpacing: '0.07em', textTransform: 'uppercase' as const, marginBottom: '2px' }}>{col.label}</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: col.label === 'GOLPES' && strokesOnHole > 0 ? '#C4992A' : theme.text }}>{col.value}</div>
          </div>
        ))}
        <button onClick={() => setShowShareMenu(true)} aria-label="Compartir" style={{
          padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        </button>
      </div>

      {/* ── Toggle Scorecard / Leaderboard (multi-player only) ── */}
      {jugadores.length > 1 && (
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '20px', padding: '2px', margin: '5px 16px', flexShrink: 0 }}>
          {(['scorecard', 'leaderboard'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              flex: 1, padding: '6px', borderRadius: '16px', fontSize: '12px', fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: view === v ? '#C4992A' : 'transparent',
              color: view === v ? '#ffffff' : theme.textFaint,
              transition: 'all 0.15s ease', WebkitTapHighlightColor: 'transparent',
            }}>
              {v === 'scorecard' ? 'Scorecard' : 'Leaderboard'}
            </button>
          ))}
        </div>
      )}

      {/* ── Player tabs (only if NO specific player is selected — legacy/admin) ── */}
      {!selectedPlayer && jugadores.length > 1 && view === 'scorecard' && (
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: `1px solid #e2e8f0`, WebkitOverflowScrolling: 'touch', flexShrink: 0, height: '36px' }}>
          {jugadores.map(j => {
            const active = j.id === activeJugadorId
            return (
              <button key={j.id} onClick={() => setActiveJugadorId(j.id)} style={{
                padding: '0 16px', height: '36px', border: 'none',
                borderBottom: active ? '2px solid #C4992A' : '2px solid transparent',
                background: 'transparent', color: active ? '#C4992A' : theme.textFaint,
                fontWeight: active ? 600 : 400, fontSize: '13px',
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, minHeight: 0, minWidth: 0,
              }}>{j.nombre}</button>
            )
          })}
        </div>
      )}

      {/* ── SCORECARD VIEW ── */}
      {view === 'scorecard' && <>
      {/* ── Central area — SCORE (flex:1, centered) ── */}
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', position: 'relative', minHeight: 0, paddingTop: '16px' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Score number */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <div
              className={scoreAnimating ? 'score-animating' : ''}
              style={{
                fontSize: 'clamp(72px, 20vw, 96px)', fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
                lineHeight: 1, color: score != null ? theme.scoreText : theme.scoreDimmed, letterSpacing: '-3px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >{score ?? par}</div>
            {ronda?.modo_juego !== 'gross' && strokeAdvantageOnHole && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px',
                alignSelf: 'flex-start', marginTop: '12px',
              }}>
                {Array.from({ length: strokesOnHole }, (_, i) => (
                  <span key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#c4992a' }} />
                ))}
              </span>
            )}
          </div>

          {/* Save check toast */}
          {saveCheckVisible && (
            <div style={{
              position: 'absolute', top: '-8px', right: '-24px',
              fontSize: '20px', color: '#00e676', fontWeight: 700,
              animation: 'fadeInOut 1s ease forwards',
            }}>{'\u2713'}</div>
          )}
        </div>

        {/* Chip */}
        {score != null && (
          <div style={{
            marginTop: '8px', padding: '4px 16px', borderRadius: '20px',
            fontSize: '13px', fontWeight: 500, letterSpacing: '0.01em',
            ...getChipStyle(score, par, true),
          }}>{getChipLabel(score, par)}</div>
        )}

        {/* Net / Stableford indicator */}
        {score != null && (showNet || showStableford) && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: theme.textMuted, fontFamily: '"DM Mono", monospace' }}>
            {showNet && currentNetDiff != null && (
              <span>Neto: {currentNetDiff > 0 ? `+${currentNetDiff}` : currentNetDiff === 0 ? 'E' : currentNetDiff}</span>
            )}
            {showStableford && currentStablefordPts != null && (
              <span>{currentStablefordPts} {currentStablefordPts === 1 ? 'punto' : 'puntos'}</span>
            )}
            {strokesOnHole > 0 && <span style={{ color: theme.textFaint }}> ({strokesOnHole} golpe{strokesOnHole > 1 ? 's' : ''})</span>}
          </div>
        )}

        {/* Stroke index warning */}
        {showStrokeIndexWarning && (
          <div style={{
            marginTop: '4px', fontSize: '11px', color: '#f59e0b',
            letterSpacing: '0.02em',
          }}>
            Neto aproximado — cancha sin stroke index
          </div>
        )}

        {/* Double bogey warning */}
        {isAboveDoubleBogey && (
          <div style={{
            marginTop: '4px', fontSize: '11px', color: theme.textFaint,
            letterSpacing: '0.02em',
          }}>
            Por encima de doble bogey
          </div>
        )}

        {/* ── Match Play: tarjeta head-to-head del hoyo actual ── */}
        {isMatchPlay && matchResult && ronda && (() => {
          const jug = ronda.ronda_libre_jugadores
          if (jug.length !== 2) return null
          const holeDetail = matchResult.holes.find(h => h.numero === currentHole)
          if (!holeDetail) return null
          const nombreA = jug[0].nombre
          const nombreB = jug[1].nombre
          const resultColors: Record<string, string> = {
            won_a: '#16a34a', won_b: '#dc2626', halved: '#6b7280',
            conceded_a: '#dc2626', conceded_b: '#16a34a', not_played: '#9ca3af',
          }
          const resultLabels: Record<string, string> = {
            won_a: `${nombreA} gana`, won_b: `${nombreB} gana`, halved: 'Empate',
            conceded_a: `${nombreA} concede`, conceded_b: `${nombreB} concede`, not_played: 'Pendiente',
          }
          return (
            <div style={{
              marginTop: '12px', padding: '12px 16px', width: '100%', maxWidth: '320px',
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${theme.border}`,
              borderRadius: '12px',
            }}>
              {/* Nombre vs Nombre */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: theme.text }}>{nombreA}</span>
                <span style={{ fontSize: '10px', color: theme.textFaint }}>VS</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: theme.text }}>{nombreB}</span>
              </div>
              {/* Scores lado a lado */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', alignItems: 'center' }}>
                {/* Jugador A */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: '"DM Mono", monospace', color: theme.text }}>
                    {holeDetail.grossA ?? '—'}
                  </div>
                  {holeDetail.strokesA > 0 && (
                    <div style={{ fontSize: '10px', color: '#c4992a', marginTop: '2px' }}>
                      -{holeDetail.strokesA} stroke{holeDetail.strokesA > 1 ? 's' : ''}
                    </div>
                  )}
                  {holeDetail.netoA != null && (
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}>
                      neto {holeDetail.netoA}
                    </div>
                  )}
                </div>
                {/* Resultado del hoyo */}
                <div style={{ textAlign: 'center' }}>
                  {holeDetail.result !== 'not_played' ? (
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: `${resultColors[holeDetail.result]}15`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', fontWeight: 700,
                      color: resultColors[holeDetail.result],
                    }}>
                      {holeDetail.result === 'halved' ? '=' : holeDetail.result === 'won_a' || holeDetail.result === 'conceded_b' ? nombreA[0] : nombreB[0]}
                    </div>
                  ) : (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: theme.badgeBg, border: `1px dashed ${theme.border}` }} />
                  )}
                </div>
                {/* Jugador B */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: '"DM Mono", monospace', color: theme.text }}>
                    {holeDetail.grossB ?? '—'}
                  </div>
                  {holeDetail.strokesB > 0 && (
                    <div style={{ fontSize: '10px', color: '#c4992a', marginTop: '2px' }}>
                      -{holeDetail.strokesB} stroke{holeDetail.strokesB > 1 ? 's' : ''}
                    </div>
                  )}
                  {holeDetail.netoB != null && (
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}>
                      neto {holeDetail.netoB}
                    </div>
                  )}
                </div>
              </div>
              {/* Label del resultado */}
              {holeDetail.result !== 'not_played' && (
                <div style={{
                  textAlign: 'center', marginTop: '8px', fontSize: '11px', fontWeight: 600,
                  color: resultColors[holeDetail.result],
                }}>
                  {resultLabels[holeDetail.result]}
                </div>
              )}
              {/* Estado running del match */}
              <div style={{
                textAlign: 'center', marginTop: '6px', paddingTop: '6px',
                borderTop: `1px solid ${theme.border}`,
                fontSize: '12px', fontWeight: 700, fontFamily: '"DM Mono", monospace',
                color: holeDetail.matchState === 0 ? theme.textMuted : '#c4992a',
              }}>
                {holeDetail.matchState === 0 ? 'ALL SQUARE'
                  : holeDetail.matchState > 0 ? `${nombreA} ${holeDetail.matchState} UP`
                  : `${nombreB} ${Math.abs(holeDetail.matchState)} UP`}
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── +/- Buttons (80px + padding) ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '8px 20px 12px', flexShrink: 0 }}>
        <button
          className="ctrl-btn"
          onTouchStart={() => {}}
          onClick={() => handleScoreChange(currentHole, (score ?? par) - 1)}
          disabled={score != null && score <= 1}
          aria-label="Disminuir score"
          style={{
            width: '80px', height: '80px', borderRadius: '20px',
            fontSize: '32px', fontWeight: 300,
            background: theme.buttonBg, color: theme.buttonText,
            border: `1px solid ${theme.buttonBorder}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            userSelect: 'none', transition: 'transform 0.08s ease-out',
            opacity: score != null && score <= 1 ? 0.3 : 1,
            minHeight: 0, minWidth: 0,
          }}
        >{'\u2212'}</button>
        <button
          className="ctrl-btn"
          onTouchStart={() => {}}
          onClick={() => handleScoreChange(currentHole, (score ?? par) + 1)}
          disabled={score != null && score >= 15}
          aria-label="Aumentar score"
          style={{
            width: '80px', height: '80px', borderRadius: '20px',
            fontSize: '32px', fontWeight: 600,
            background: '#C4992A', color: '#ffffff', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            userSelect: 'none', transition: 'transform 0.08s ease-out',
            opacity: score != null && score >= 15 ? 0.3 : 1,
            minHeight: 0, minWidth: 0,
          }}
        >+</button>
      </div>

      </>}

      {/* ── LEADERBOARD VIEW ── */}
      {view === 'leaderboard' && jugadores.length > 1 && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: theme.textFaint, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '8px' }}>
            En cancha · actualiza cada 15s
          </div>
          <MiniLeaderboard
            codigoRonda={codigo}
            parMap={parMap}
            currentUserId={ronda.ronda_libre_jugadores.find(j => j.id === activeJugadorId)?.user_id ?? null}
            totalHoles={ronda.holes}
            modoJuego={ronda.modo_juego ?? 'gross'}
            formatoJuego={ronda.formato_juego ?? 'stroke_play'}
            hcpMap={playerHcp}
            siMap={Object.fromEntries(Object.entries(holeDataMap).map(([k, v]) => [k, v.stroke_index]))}
          />
          {/* GWI — same as spectator view */}
          {gwiInputs.length >= 2 && gwiInputs.some(j => j.hoyosCompletados >= 3) && (
            <div style={{ marginTop: '12px' }}>
              <GWILeaderboard
                jugadores={gwiInputs}
                hoyosRestantes={ronda.holes - Math.max(...gwiInputs.map(j => j.hoyosCompletados), 0)}
                totalHoyos={ronda.holes}
                modoJuego={ronda.modo_juego || 'gross'}
              />
            </div>
          )}
          <div style={{ fontSize: '9px', color: theme.textFaint, textAlign: 'center', marginTop: '8px' }}>
            Vuelve a Scorecard en 10s
          </div>
        </div>
      )}

      {/* ── Mini ranking / Match state (collapsible, multi-player only) ── */}
      {ranking.length > 1 && view === 'scorecard' && (
        <div style={{ margin: '0 16px 8px', flexShrink: 0 }}>
          {isMatchPlay && matchResult ? (
            /* ── Match Play: show match state bar ── */
            <div style={{
              padding: '12px 16px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                  {ronda!.ronda_libre_jugadores[0]?.nombre}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                  {ronda!.ronda_libre_jugadores[1]?.nombre}
                </span>
              </div>
              <div style={{
                textAlign: 'center', padding: '8px 0',
                fontSize: '20px', fontWeight: 700, fontFamily: '"Playfair Display", serif',
                color: matchResult.state === 0 ? '#6b7280' : matchResult.state > 0 ? '#16a34a' : '#dc2626',
              }}>
                {matchResult.display}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-3)' }}>
                <span>{matchResult.holesWonA} ganados</span>
                <span>{matchResult.holesHalved} empates</span>
                <span>{matchResult.holesWonB} ganados</span>
              </div>
              {matchResult.isFinished && matchResult.winner && (
                <div style={{
                  marginTop: '8px', padding: '6px 12px', borderRadius: '8px',
                  background: 'rgba(196,153,42,0.1)', textAlign: 'center',
                  fontSize: '13px', fontWeight: 600, color: '#c4992a',
                }}>
                  {ronda!.ronda_libre_jugadores[matchResult.winner === 'a' ? 0 : 1]?.nombre} gana {matchResult.display}
                </div>
              )}
            </div>
          ) : (
            /* ── Stroke/Stableford: show ranking ── */
            <>
              <button
                onClick={() => setShowRanking(!showRanking)}
                style={{
                  width: '100%', padding: '8px 12px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-2)',
                }}
              >
                <span>Ranking</span>
                <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                  {showRanking ? '\u25B2' : '\u25BC'}
                </span>
              </button>
              {showRanking && (
                <div style={{ marginTop: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                  {ranking.map((r, idx) => {
                    const isMe = r.id === activeJugadorId
                    const vsParStr = r.vsPar > 0 ? `+${r.vsPar}` : r.vsPar === 0 ? 'E' : String(r.vsPar)
                    return (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: isMe ? 'rgba(196,153,42,0.08)' : 'transparent',
                        borderBottom: idx < ranking.length - 1 ? '1px solid #e2e8f0' : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', width: '20px' }}>{idx + 1}</span>
                          <span style={{ fontSize: '14px', fontWeight: isMe ? 700 : 500, color: isMe ? '#c4992a' : '#1a1a2e' }}>
                            {r.nombre}{isMe ? ' \u2190' : ''}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: r.vsPar < 0 ? '#16a34a' : r.vsPar > 0 ? '#dc2626' : '#1a1a2e' }}>
                            {vsParStr}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>({r.holesPlayed}h)</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Nav buttons (fixed bottom with safe area) ── */}
      <div style={{
        flexShrink: 0, background: theme.navBg,
        borderTop: `1px solid ${theme.border}`,
        padding: '8px 16px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
        display: 'flex', gap: '8px',
      }}>
        {currentHoleIdx > 0 && (
          <button
            onTouchStart={() => {}}
            onClick={goToPrevHole}
            aria-label="Hoyo anterior"
            style={{
              flex: 1, padding: '14px', background: 'transparent',
              color: theme.textMuted, border: `1px solid #e2e8f0`,
              borderRadius: '12px', fontSize: '14px', fontWeight: 400,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >{'\u2190'} Anterior</button>
        )}
        {/* Primary button: Siguiente or Finalizar (on last hole) */}
        {!isLastHole && (
          <button
            onTouchStart={() => {}}
            onClick={() => { setConfirmFinalize(false); goToNextHole() }}
            aria-label="Siguiente hoyo"
            style={{
              flex: 2, padding: '14px',
              background: '#C4992A', color: '#ffffff',
              border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation', letterSpacing: '0.01em',
            }}
          >Siguiente {'\u2192'}</button>
        )}
        {/* Finalize button: secondary from hole 9, primary on last hole */}
        {canFinalize && (
          <button
            onTouchStart={() => {}}
            onClick={finalizeRound}
            aria-label={confirmFinalize ? 'Confirmar finalizacion' : 'Finalizar ronda'}
            style={{
              flex: isLastHole ? 2 : 1, padding: isLastHole ? '14px' : '12px',
              background: confirmFinalize ? '#d97706' : isLastHole ? '#C4992A' : 'transparent',
              color: confirmFinalize ? '#ffffff' : isLastHole ? '#ffffff' : '#C4992A',
              border: isLastHole ? 'none' : '1px solid rgba(196,153,42,0.4)',
              borderRadius: '12px',
              fontSize: isLastHole ? '16px' : '13px',
              fontWeight: isLastHole ? 600 : 500,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation', letterSpacing: '0.01em',
              transition: 'background 0.3s ease',
            }}
          >{confirmFinalize
              ? missingCount > 0
                ? `\u00bfMarcar ${missingCount} hoyo${missingCount > 1 ? 's' : ''} como par y finalizar?`
                : holesPlayed < totalHoles
                  ? `\u00bfGuardar ronda parcial (${holesPlayed}/${totalHoles} hoyos)?`
                  : 'Confirmar finalizacion'
              : 'Finalizar ronda \u2713'}</button>
        )}
      </div>

      {/* Descartar ronda — opción siempre disponible, dos-pasos, destructivo sutil */}
      <div style={{ padding: '0 16px 12px', textAlign: 'center' }}>
        <button
          onClick={discardRound}
          disabled={discarding}
          aria-label={confirmDiscard ? 'Confirmar descarte' : 'Descartar ronda'}
          style={{
            background: confirmDiscard ? 'rgba(220,38,38,0.1)' : 'transparent',
            border: confirmDiscard ? '1px solid rgba(220,38,38,0.5)' : '1px solid transparent',
            color: confirmDiscard ? '#dc2626' : 'rgba(156,163,175,0.7)',
            fontSize: '14px', fontWeight: confirmDiscard ? 600 : 400,
            padding: '8px 14px', borderRadius: '8px',
            cursor: discarding ? 'not-allowed' : 'pointer',
            opacity: discarding ? 0.5 : 1,
            letterSpacing: '0.02em',
            WebkitTapHighlightColor: 'transparent',
            transition: 'all 0.2s ease',
          }}
        >{discarding ? 'Descartando…' : confirmDiscard ? 'Toca otra vez para borrar todo' : 'Descartar ronda'}</button>
      </div>


      {/* ── Post-round celebration modal ── */}
      {roundDone && (() => {
        const diff = finalScore.gross - finalScore.totalPar
        const diffLabel = diff === 0 ? 'Par' : diff > 0 ? `+${diff} sobre par` : `${diff} bajo par`
        const diffColor = diff < 0 ? '#4ade80' : diff === 0 ? '#c9a84c' : '#f87171'

        // Count birdies/eagles — usa scores netos cuando el modo es neto
        const playerScores = activeJugadorId ? (scores[activeJugadorId] ?? {}) : {}
        const isStableford = ronda?.formato_juego === 'stableford'
        const isNeto = ronda?.modo_juego === 'neto'
        const shareHcp = activeJugadorId ? (playerHcp[activeJugadorId] ?? 0) : 0
        let birdieCount = 0, eagleCount = 0
        Object.entries(playerScores).forEach(([h, s]) => {
          const p = parMap[parseInt(h)] ?? 4
          let scoreForStats = s
          if (isNeto && shareHcp != null) {
            const si = holeDataMap[parseInt(h)]?.stroke_index ?? parseInt(h)
            scoreForStats = s - strokesRecibidosEnHoyo(shareHcp, si, ronda?.holes ?? 18)
          }
          if (scoreForStats === p - 1) birdieCount++
          if (scoreForStats <= p - 2) eagleCount++
        })

        // Mini scorecard data
        const totalHoles = ronda?.holes ?? 18
        const holeNums = Array.from({ length: totalHoles }, (_, i) => i + 1)

        const handleShareCard = async () => {
          if (!ronda || !activeJugadorId) return
          const jugador = (ronda.ronda_libre_jugadores ?? []).find(j => j.id === activeJugadorId)
          const playerName = jugador?.nombre ?? 'Jugador'
          const vsParStr = diff === 0 ? 'Par' : diff > 0 ? `+${diff}` : String(diff)

          // Si tenemos el ID de la tarjeta, compartir link a /tarjeta/[id]
          if (historicalRoundId) {
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://golfersplus.vercel.app'
            const tarjetaUrl = `${siteUrl}/tarjeta/${historicalRoundId}`
            const text = isStableford
              ? `${playerName} hizo ${totalStableford} pts en ${ronda.course_name}`
              : `${playerName} jugó ${finalScore.gross} (${vsParStr}) en ${ronda.course_name}`

            if (navigator.share) {
              try { await navigator.share({ title: `${playerName} — Golfers+`, text, url: tarjetaUrl }); return } catch { /* cancelled */ }
            }
            await navigator.clipboard.writeText(`${text}\n${tarjetaUrl}`)
            return
          }

          // Fallback: compartir imagen canvas (si no hay ID de tarjeta)
          const shareData: ShareCardData = {
            tipo: 'ronda_libre',
            ganador: playerName,
            esEmpate: false,
            scoreGross: isStableford ? totalStableford : finalScore.gross,
            scoreDiff: isStableford ? 0 : diff,
            courseName: ronda.course_name,
            fecha: new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }),
            birdies: birdieCount,
            eagles: eagleCount,
            scoresByHole: playerScores,
            parsByHole: parMap,
            holesPlayed: totalHoles,
            formato_juego: ronda.formato_juego,
            modo_juego: ronda.modo_juego,
            // Match Play: pasar el display del resultado ("3&2", "All Square", etc.)
            // para que el share card muestre eso en vez de score + vs-par.
            matchResult: isMatchPlay && matchResult ? matchResult.display : undefined,
            stablefordPoints: isStableford ? totalStableford : undefined,
          }
          await compartirResultado(shareData)
        }

        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 200, overflow: 'auto',
            background: 'radial-gradient(ellipse at 50% 20%, rgba(10,31,18,0.97) 0%, rgba(8,12,16,0.99) 100%)',
          }}>
            {/* Confetti particles */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
              {Array.from({ length: 30 }, (_, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  left: `${Math.random() * 100}%`,
                  top: '-20px',
                  width: Math.random() > 0.5 ? `${6 + Math.random() * 6}px` : `${4 + Math.random() * 4}px`,
                  height: `${6 + Math.random() * 8}px`,
                  borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                  backgroundColor: ['#c9a84c', '#16a34a', '#ffffff', '#d97706', '#86efac'][Math.floor(Math.random() * 5)],
                  animation: `confettiFall ${2 + Math.random() * 2}s ${Math.random() * 2.5}s ease-in forwards`,
                }} />
              ))}
            </div>

            <div style={{ position: 'relative', maxWidth: '400px', margin: '0 auto', padding: '32px 20px', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              {/* Trophy */}
              <div style={{ fontSize: '72px', marginBottom: '8px', animation: 'trophyBounce 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>{'\uD83C\uDFC6'}</div>

              {/* Title */}
              <div style={{ fontSize: '12px', color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '4px' }}>Ronda completada</div>

              {/* Score big */}
              <div style={{ fontSize: '72px', fontWeight: 900, color: diffColor, lineHeight: 1, marginBottom: '4px', textShadow: `0 0 40px ${diffColor}40` }}>
                {finalScore.gross}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: diffColor, marginBottom: '4px' }}>{diffLabel}</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>{ronda?.course_name}</div>

              {/* Stats pills */}
              {(eagleCount > 0 || birdieCount > 0) && (
                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '14px' }}>
                  {eagleCount > 0 && <span style={{ color: '#c9a84c' }}>{eagleCount} eagle{eagleCount > 1 ? 's' : ''}</span>}
                  {birdieCount > 0 && <span style={{ color: '#4ade80' }}>{birdieCount} birdie{birdieCount > 1 ? 's' : ''}</span>}
                </div>
              )}

              {/* Mini-análisis inteligente post-ronda */}
              {(() => {
                const par3s: number[] = [], par4s: number[] = [], par5s: number[] = []
                holeNums.forEach(h => {
                  const s = playerScores[h]; const p = parMap[h] ?? 4
                  if (s == null) return
                  const d = s - p
                  if (p === 3) par3s.push(d)
                  else if (p === 4) par4s.push(d)
                  else if (p >= 5) par5s.push(d)
                })
                const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
                const best = [
                  { label: 'Par 3', avg: avg(par3s), count: par3s.length },
                  { label: 'Par 4', avg: avg(par4s), count: par4s.length },
                  { label: 'Par 5', avg: avg(par5s), count: par5s.length },
                ].filter(x => x.count > 0).sort((a, b) => a.avg - b.avg)

                const front9Diff = holeNums.slice(0, 9).reduce((sum, h) => sum + ((playerScores[h] ?? parMap[h] ?? 4) - (parMap[h] ?? 4)), 0)
                const back9Diff = totalHoles > 9 ? holeNums.slice(9, 18).reduce((sum, h) => sum + ((playerScores[h] ?? parMap[h] ?? 4) - (parMap[h] ?? 4)), 0) : null

                if (best.length === 0) return null
                return (
                  <div style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>Análisis rápido</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {best[0] && (
                        <div style={{ fontSize: '13px', color: '#4ade80' }}>
                          Tu fortaleza: {best[0].label} ({best[0].avg <= 0 ? `${best[0].avg.toFixed(1)} vs par` : `+${best[0].avg.toFixed(1)} vs par`})
                        </div>
                      )}
                      {best.length > 1 && best[best.length - 1].avg > 0.5 && (
                        <div style={{ fontSize: '13px', color: '#fbbf24' }}>
                          A mejorar: {best[best.length - 1].label} (+{best[best.length - 1].avg.toFixed(1)} vs par)
                        </div>
                      )}
                      {back9Diff !== null && Math.abs(front9Diff - back9Diff) >= 3 && (
                        <div style={{ fontSize: '13px', color: front9Diff < back9Diff ? '#4ade80' : '#f87171' }}>
                          {front9Diff < back9Diff ? `Ida más fuerte que vuelta (${front9Diff >= 0 ? '+' : ''}${front9Diff} vs ${back9Diff >= 0 ? '+' : ''}${back9Diff})` : `Vuelta más fuerte que ida (${back9Diff >= 0 ? '+' : ''}${back9Diff} vs ${front9Diff >= 0 ? '+' : ''}${front9Diff})`}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Scorecard table with OUT/IN/TOTAL */}
              {(() => {
                const front9 = holeNums.slice(0, 9).reduce((sum, h) => sum + (playerScores[h] ?? 0), 0)
                const back9 = holeNums.slice(9, 18).reduce((sum, h) => sum + (playerScores[h] ?? 0), 0)
                const cColor = (h: number) => {
                  const s = playerScores[h]; const p = parMap[h] ?? 4
                  if (s == null) return '#d1d5db'
                  const d = s - p
                  if (d <= -2) return '#c4992a'
                  if (d === -1) return '#4ade80'
                  if (d === 0) return '#4a5568'
                  if (d === 1) return '#fbbf24'
                  return '#f87171'
                }
                return (
                  <div style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px', marginBottom: '20px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table style={{ width: '100%', minWidth: '300px', borderCollapse: 'collapse' }}>
                      <tbody>
                        {/* Front 9 */}
                        <tr>
                          {holeNums.slice(0, 9).map(h => (
                            <td key={h} style={{ padding: '2px 1px', textAlign: 'center', fontSize: '8px', color: 'var(--text-3)' }}>{h}</td>
                          ))}
                          <td style={{ padding: '2px 3px', textAlign: 'center', fontSize: '8px', color: 'var(--text-2)', fontWeight: 700, borderLeft: '1px solid #e2e8f0' }}>OUT</td>
                        </tr>
                        <tr>
                          {holeNums.slice(0, 9).map(h => (
                            <td key={h} style={{ padding: '2px 1px', textAlign: 'center' }}>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: cColor(h) }}>{playerScores[h] ?? '·'}</span>
                            </td>
                          ))}
                          <td style={{ padding: '2px 3px', textAlign: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--text)', borderLeft: '1px solid #e2e8f0' }}>{front9}</td>
                        </tr>
                        {/* Back 9 */}
                        {totalHoles > 9 && (
                          <>
                            <tr><td colSpan={10} style={{ padding: '3px' }} /></tr>
                            <tr>
                              {holeNums.slice(9, 18).map(h => (
                                <td key={h} style={{ padding: '2px 1px', textAlign: 'center', fontSize: '8px', color: 'var(--text-3)' }}>{h}</td>
                              ))}
                              <td style={{ padding: '2px 3px', textAlign: 'center', fontSize: '8px', color: 'var(--text-2)', fontWeight: 700, borderLeft: '1px solid #e2e8f0' }}>IN</td>
                            </tr>
                            <tr>
                              {holeNums.slice(9, 18).map(h => (
                                <td key={h} style={{ padding: '2px 1px', textAlign: 'center' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 700, color: cColor(h) }}>{playerScores[h] ?? '·'}</span>
                                </td>
                              ))}
                              <td style={{ padding: '2px 3px', textAlign: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--text)', borderLeft: '1px solid #e2e8f0' }}>{back9}</td>
                            </tr>
                            {/* Total */}
                            <tr>
                              <td colSpan={9} style={{ borderTop: '1px solid #e2e8f0', padding: '4px 0 0' }} />
                              <td style={{ borderTop: '1px solid #e2e8f0', padding: '4px 3px 0', textAlign: 'center', fontSize: '15px', fontWeight: 900, color: 'var(--text)' }}>{finalScore.gross}</td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                )
              })()}

              {/* CTAs — different for solo vs multi-player */}
              {(() => {
                const isMultiPlayer = (ronda?.ronda_libre_jugadores ?? []).length > 1
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                    {isMultiPlayer ? (
                      <>
                        <Link href={`/ronda-libre/${codigo}?finished=true`} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: '100%', padding: '16px', background: 'linear-gradient(135deg, #c9a84c 0%, #d4a843 50%, #b8972f 100%)',
                          color: '#0a1419', fontWeight: 700, fontSize: '16px', borderRadius: '14px', textDecoration: 'none',
                          boxShadow: '0 4px 20px rgba(201,168,76,0.4)',
                        }}>
                          Ver leaderboard en vivo
                        </Link>
                        <button onClick={handleShareCard} style={{
                          width: '100%', padding: '14px', background: '#f3f4f6',
                          border: '1px solid var(--border)', color: 'var(--text)',
                          fontWeight: 600, fontSize: '14px', borderRadius: '12px', cursor: 'pointer',
                        }}>
                          Compartir mi score
                        </button>
                      </>
                    ) : (
                      <button onClick={handleShareCard} style={{
                        width: '100%', padding: '16px', background: 'linear-gradient(135deg, #c9a84c 0%, #d4a843 50%, #b8972f 100%)',
                        color: '#0a1419', fontWeight: 700, fontSize: '16px', border: 'none', borderRadius: '14px', cursor: 'pointer',
                        boxShadow: '0 4px 20px rgba(201,168,76,0.4)',
                      }}>
                        Compartir resultado
                      </button>
                    )}
                    <Link href="/coach" style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)',
                      color: '#c9a84c', fontWeight: 600, fontSize: '14px',
                      height: '52px', borderRadius: '12px', textDecoration: 'none',
                    }}>
                      Analizar con tAIger+
                    </Link>
                    <button
                      onClick={() => { setRoundDone(false); setCurrentHole(1) }}
                      style={{
                        width: '100%', padding: '12px',
                        background: 'none', border: 'none',
                        color: 'var(--text-3)', fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      Editar scores
                    </button>
                  </div>
                )
              })()}

              <p style={{ color: '#d1d5db', fontSize: '11px', marginTop: '16px' }}>Golfers+ · El golf amateur en español</p>
            </div>

            {/* Confetti + trophy animations */}
            <style>{`
              @keyframes confettiFall {
                0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
                80% { opacity: 1; }
                100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
              }
              @keyframes trophyBounce {
                0% { transform: scale(0) rotate(-10deg); opacity: 0; }
                60% { transform: scale(1.2) rotate(5deg); opacity: 1; }
                80% { transform: scale(0.95) rotate(-2deg); }
                100% { transform: scale(1) rotate(0deg); opacity: 1; }
              }
            `}</style>
          </div>
        )
      })()}

      {/* ── CSS animations ── */}
      <style>{`
        @keyframes fadeInOut {
          0% { opacity: 0; transform: scale(0.8); }
          20% { opacity: 1; transform: scale(1.1); }
          40% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1) translateY(-4px); }
        }
        @keyframes pendingPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.75; }
        }
      `}</style>

      {/* Celebrations — escalated by importance */}
      {birdieData && (
        <BirdieCelebration
          playerName={birdieData.playerName}
          holeNumber={birdieData.hole}
          onClose={() => setBirdieData(null)}
        />
      )}
      {eagleData && (
        <EagleCelebration
          playerName={eagleData.playerName}
          holeNumber={eagleData.hole}
          onClose={() => setEagleData(null)}
        />
      )}
      {holeInOneData && (
        <HoleInOneCelebration
          playerName={holeInOneData.playerName}
          holeNumber={holeInOneData.hole}
          onClose={() => setHoleInOneData(null)}
        />
      )}
      {/* Streak toast */}
      {streakMsg && (
        <div style={{
          position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(22,163,74,0.95)', color: '#ffffff', padding: '10px 20px',
          borderRadius: '24px', fontSize: '14px', fontWeight: 600, zIndex: 180,
          animation: 'fadeInOut 2.5s ease-in-out forwards', whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(22,163,74,0.3)',
        }}>
          <Flame size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> {streakMsg}
        </div>
      )}
    </div>
  )
}

export default function ScorePage() {
  return (
    <Suspense fallback={<div style={{ background: 'var(--bg-surface)', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>Cargando...</div>}>
      <ScorePageContent />
    </Suspense>
  )
}
