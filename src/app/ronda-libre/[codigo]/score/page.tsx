'use client'

import { useEffect, useRef, useState, useCallback, useMemo, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
// trackEvent moved to useFinalizeRonda hook
import { Flame } from '@/components/icons'
import { calcularMatchPlay, displayDesdeJugador, colorResultadoHoyo, type MatchResult } from '@/golf/formats/match-play'
import type { ModoJuego, FormatoJuego, Jugador, RondaLibre, HoleData } from '@/types/ronda'
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
// calcularDiferencial, calcularNivel moved to useFinalizeRonda hook

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
} from '@/lib/ronda/helpers'
// getMissingHoles, fillMissingHolesWithPar moved to useFinalizeRonda hook
import { saveScores as lsSave, loadScores as lsLoad } from '@/lib/ronda/score-storage'
// clearScores (lsClear) moved to useFinalizeRonda hook
import { ShareMenu } from '@/components/ronda/ShareMenu'
import { useOnlineStatus } from '@/hooks/ronda/useOnlineStatus'
import { useScoreboardCalc } from './hooks/useScoreboardCalc'
import { useRondaScoreData } from './hooks/useRondaScoreData'
import { useScoreSave } from './hooks/useScoreSave'
import { useFinalizeRonda } from './hooks/useFinalizeRonda'
import { PlayerSelectorScreen } from './components/PlayerSelectorScreen'
import { FinishedRoundView } from './components/FinishedRoundView'
import { HoleControlBar } from './components/HoleControlBar'
import { MiniScorecardGrid } from './components/MiniScorecardGrid'
import { RankingSheet } from './components/RankingSheet'

/* ── Main ────────────────────────────────────────────────────────────── */
function ScorePageContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const codigo = params.codigo as string
  const jugadorParam = searchParams.get('j')

  const { ronda, setRonda, scores, setScores, parMap, setParMap,
          holeDataMap, setHoleDataMap, playerHcp, setPlayerHcp,
          activeJugadorId, setActiveJugadorId, selectedPlayer, setSelectedPlayer,
          currentHole, setCurrentHole, loading, adminRedirectMsg } = useRondaScoreData(codigo, jugadorParam)

  const isOnline = useOnlineStatus()
  const [scoreAnimating, setScoreAnimating] = useState(false)
  const [_showMiniCard, _setShowMiniCard] = useState(true) // kept for compat, mini scorecard always visible now
  const [historicalRoundId, setHistoricalRoundId] = useState<string | null>(null)
  const [saveCheckVisible, setSaveCheckVisible] = useState(false) // FIX #8: save feedback toast
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [holeInOneData, setHoleInOneData] = useState<{ playerName: string; hole: number } | null>(null)
  const [birdieData, setBirdieData] = useState<{ playerName: string; hole: number } | null>(null)
  const [eagleData, setEagleData] = useState<{ playerName: string; hole: number } | null>(null)
  const [streakMsg, setStreakMsg] = useState<string | null>(null)

  // Offline score sync — guarda localmente ANTES de enviar al servidor
  const scoreSync = useScoreSync(codigo, activeJugadorId)

  // useCallback estabiliza las refs para que useScoreSave no recree saveScores
  // en cada render (rompe el useCallback interno del hook).
  const onSaveSuccess = useCallback(() => {
    setSaveCheckVisible(true)
    haptic(20)
    setTimeout(() => setSaveCheckVisible(false), 1000)
  }, [])
  const onRondaFinalized = useCallback(() => {
    router.replace(`/ronda-libre/${codigo}`)
  }, [router, codigo])
  const onDiscardSuccess = useCallback(() => {
    router.push('/dashboard')
  }, [router])

  const { saveScores, saveStatus, setSaveStatus, hasUnsaved, setHasUnsaved } = useScoreSave({
    codigo,
    isOnline,
    scoreSync,
    onSaveSuccess,
    onRondaFinalized,
  })

  const [showRanking, setShowRanking] = useState(false)
  const [view, setView] = useState<'scorecard' | 'leaderboard'>('scorecard')
  const [gwiInputs, setGwiInputs] = useState<JugadorGWIInput[]>([])
  const [, setGwiResults] = useState<GWIResult[]>([])
  const {
    finalizeRound, discardRound,
    confirmFinalize, setConfirmFinalize,
    confirmDiscard, setConfirmDiscard,
    discarding, roundDone, setRoundDone, finalScore,
  } = useFinalizeRonda({
    ronda, activeJugadorId, scores, parMap, codigo,
    saveScores, setScores, setHasUnsaved,
    setHistoricalRoundId,
    onDiscardSuccess,
  })

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

  /* ── Pre-render data (null-safe defaults para rules-of-hooks) ── */
  // useScoreboardCalc DEBE llamarse en cada render — no después de early returns.
  // Usar defaults safe cuando ronda aún no cargó; outputs no se usan hasta
  // después de los early returns que filtran loading/null state.
  const totalHoles = ronda?.holes ?? 18
  const hoyoInicio = ronda?.hoyo_inicio ?? 1
  const jugadores = ronda?.ronda_libre_jugadores ?? []
  const ordenHoyos = generarOrdenHoyos(hoyoInicio, totalHoles)
  const currentHoleIdx = ordenHoyos.indexOf(currentHole)

  const calc = useScoreboardCalc({
    ronda: ronda ?? { holes: 18, modo_juego: 'gross', formato_juego: 'stroke_play', hoyo_inicio: 1 },
    activeJugadorId: activeJugadorId ?? '',
    jugadores, scores, parMap, holeDataMap, playerHcp, currentHole,
    currentHoleIdx,
  })
  const {
    mode: { modoJuego, formatoJuego, modoLabel, showNet, showStableford },
    current: {
      par, score, holeData, hcpForPlayer, strokesOnHole, strokeAdvantageOnHole,
      currentNetScore, currentNetDiff, currentStablefordPts,
      isLastHole,
    },
    totals: { totalGross, totalParPlayed, totalOverUnder, holesPlayed },
    nines: { f9Gross, f9Par, f9Count, b9Gross, b9Par, b9Count },
    neto: { totalNet, totalStableford, totalNetOverUnder },
    flags: { missingCount, canFinalize, isAboveDoubleBogey, showStrokeIndexWarning },
    display: { displayOverUnder, displayTotal },
    strokeAdvantageOn,
  } = calc

  /* ── Render ── */
  if (adminRedirectMsg) return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
      <div style={{ fontSize: '14px', color: 'var(--text-2)' }}>{adminRedirectMsg}</div>
    </div>
  )
  if (loading) return <div style={{ background: theme.bg, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textFaint }}>Cargando ronda...</div>
  if (!ronda || !activeJugadorId) return null

  /* ── Player selection screen (multi-player, no auto-match) ── */
  if (!selectedPlayer && jugadores.length > 1) {
    return (
      <PlayerSelectorScreen
        jugadores={jugadores}
        playerHcp={playerHcp}
        scores={scores}
        hoyoInicio={ronda.hoyo_inicio ?? 1}
        holes={ronda.holes}
        onSelect={(jugadorId, firstEmptyHole) => {
          setSelectedPlayer(jugadorId)
          setActiveJugadorId(jugadorId)
          setCurrentHole(firstEmptyHole)
        }}
      />
    )
  }
  const activePlayer = jugadores.find(p => p.id === activeJugadorId)

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

      <MiniScorecardGrid
        totalHoles={totalHoles}
        scores={scores}
        activeJugadorId={activeJugadorId}
        parMap={parMap}
        holeDataMap={holeDataMap}
        currentHole={currentHole}
        setCurrentHole={setCurrentHole}
        modoJuego={modoJuego}
        hasStrokeAdvantage={strokeAdvantageOn}
        totalGross={totalGross}
        totalNet={totalNet}
        showNet={showNet}
        progressRowRef={progressRowRef}
        theme={theme}
      />

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
            {modoJuego !== 'gross' && strokeAdvantageOnHole && (
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

      <HoleControlBar
        score={score}
        onDecrement={() => handleScoreChange(currentHole, (score ?? par) - 1)}
        onIncrement={() => handleScoreChange(currentHole, (score ?? par) + 1)}
        decrementBg={theme.buttonBg}
        decrementColor={theme.buttonText}
        decrementBorder={theme.buttonBorder}
      />
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
            modoJuego={modoJuego}
            formatoJuego={formatoJuego}
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
                modoJuego={modoJuego}
              />
            </div>
          )}
          <div style={{ fontSize: '9px', color: theme.textFaint, textAlign: 'center', marginTop: '8px' }}>
            Vuelve a Scorecard en 10s
          </div>
        </div>
      )}

      {/* ── Mini ranking / Match state (collapsible, multi-player only) ── */}
      {ranking.length > 1 && view === 'scorecard' && ronda && (
        <RankingSheet
          ranking={ranking}
          isMatchPlay={isMatchPlay}
          matchResult={matchResult}
          jugadores={ronda.ronda_libre_jugadores}
          activeJugadorId={activeJugadorId}
          showRanking={showRanking}
          setShowRanking={setShowRanking}
        />
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
      {roundDone && ronda && (
        <FinishedRoundView
          ronda={ronda}
          finalScore={finalScore}
          historicalRoundId={historicalRoundId}
          activeJugadorId={activeJugadorId}
          jugadores={jugadores}
          scores={scores}
          parMap={parMap}
          playerHcp={playerHcp}
          holeDataMap={holeDataMap}
          codigo={codigo}
          showStableford={showStableford}
          totalStableford={totalStableford}
          isMatchPlay={isMatchPlay}
          matchResult={matchResult}
          onContinueScoring={() => { setRoundDone(false); setCurrentHole(1) }}
        />
      )}

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
