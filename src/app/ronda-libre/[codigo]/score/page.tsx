'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/lib/scoring'
import type { ModoJuego } from '@/lib/scoring'
import { updatePlayerNotification, getNotifPrefs, sendPushViaServer } from '@/lib/push-notifications'

/* ── Share menu component ──────────────────────────────────────────── */
function ShareMenu({ codigo, onClose }: { codigo: string; onClose: () => void }) {
  const scoreUrl = typeof window !== 'undefined' ? `${window.location.origin}/ronda-libre/${codigo}/score` : ''
  const liveUrl = typeof window !== 'undefined' ? `${window.location.origin}/ronda-libre/${codigo}` : ''

  const doShare = async (url: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: 'Golfers+', text, url }) } catch {}
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank')
    }
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '480px', background: '#0e1c2f', borderRadius: '16px 16px 0 0', padding: '20px 16px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.15)', borderRadius: '2px', margin: '0 auto 16px' }} />
        <button onClick={() => doShare(scoreUrl, 'Unete a jugar en Golfers+')} style={{
          width: '100%', padding: '16px', marginBottom: '8px', background: 'rgba(196,153,42,0.1)', border: '1px solid rgba(196,153,42,0.25)', borderRadius: '12px', color: '#EDE9E4', fontSize: '15px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span style={{ fontSize: '20px' }}>🏌️</span> Invitar a jugar
        </button>
        <button onClick={() => doShare(liveUrl, 'Sigue mi ronda en vivo en Golfers+')} style={{
          width: '100%', padding: '16px', background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: '12px', color: '#EDE9E4', fontSize: '15px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span style={{ fontSize: '20px' }}>👁</span> Seguir en vivo
        </button>
        <button onClick={onClose} style={{ width: '100%', padding: '14px', marginTop: '8px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
      </div>
    </div>
  )
}

/* ── Types ──────────────────────────────────────────────────────────── */
interface Jugador { id: string; nombre: string; user_id: string | null; scores: Record<string, number> }
interface RondaLibre { id: string; codigo: string; course_name: string; course_id: string | null; tees: string; holes: number; fecha: string; estado: string; modo_juego: ModoJuego; hoyo_inicio?: number | null; ronda_libre_jugadores: Jugador[] }
interface HoleData { numero: number; par: number; stroke_index: number; yardaje: number | null }

/* ── Tee → yardage column mapping ──────────────────────────────────── */
function getTeeYardageColumn(tee: string): string {
  const t = tee.toLowerCase()
  if (t === 'black' || t === 'campeonato' || t === 'negro') return 'yardaje_campeonato'
  if (t === 'blue' || t === 'azul') return 'yardaje_azul'
  if (t === 'white' || t === 'blanco') return 'yardaje_blanco'
  if (t === 'red' || t === 'rojo') return 'yardaje_rojo'
  return 'yardaje_azul' // default
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
/** Genera orden circular de hoyos. hoyoInicio=4, holes=18 → [4,5,...,18,1,2,3] */
function generarOrdenHoyos(hoyoInicio: number, totalHoles: number): number[] {
  const orden: number[] = []
  for (let i = 0; i < totalHoles; i++) {
    orden.push(((hoyoInicio - 1 + i) % totalHoles) + 1)
  }
  return orden
}

function lsKey(c: string, j: string) { return `ronda_${c}_${j}` }
function lsSave(c: string, j: string, s: Record<number, number>) { try { localStorage.setItem(lsKey(c, j), JSON.stringify(s)) } catch {} }
function lsLoad(c: string, j: string): Record<number, number> { try { return JSON.parse(localStorage.getItem(lsKey(c, j)) ?? '{}') } catch { return {} } }
function haptic(p: number | number[]) { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(p) }

// Chip colors from centralized score-colors system
import { SCORE_STYLES, SCORE_STYLES_LIGHT, getScoreResult, getHoleBoxStyle, getScoreNumberStyle } from '@/lib/score-colors'
import MiniLeaderboard from '@/components/MiniLeaderboard'
import { compartirResultado } from '@/lib/share-card'
import type { ShareCardData } from '@/lib/share-card'

function getChipStyle(gross: number, par: number, isDark: boolean): React.CSSProperties {
  const result = getScoreResult(gross, par)
  const styles = isDark ? SCORE_STYLES : SCORE_STYLES_LIGHT
  const s = styles[result]
  return { background: s.bg, color: s.textColor, border: `${s.borderWidth} solid ${s.border}` }
}
function getChipLabel(gross: number, par: number): string {
  const d = gross - par
  if (d <= -2) return `Eagle  ${d}`
  if (d === -1) return 'Birdie  −1'
  if (d === 0) return 'Par'
  if (d === 1) return 'Bogey  +1'
  if (d === 2) return 'Doble  +2'
  return `+${d}`
}

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

  type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error'
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [isOnline, setIsOnline] = useState(true)
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [scoreAnimating, setScoreAnimating] = useState(false)
  const [_showMiniCard, _setShowMiniCard] = useState(true) // kept for compat, mini scorecard always visible now
  const [taigerStatus, setTaigerStatus] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle')
  const [taigerSessionId, setTaigerSessionId] = useState<string | null>(null)
  const [saveCheckVisible, setSaveCheckVisible] = useState(false) // FIX #8: save feedback toast
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [roundDone, setRoundDone] = useState(false)
  const [finalScore, setFinalScore] = useState({ gross: 0, totalPar: 0 })

  // Theme: white by default, dark mode toggle with localStorage persistence
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('scorecard-theme') === 'dark' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem('scorecard-theme', darkMode ? 'dark' : 'light') } catch {}
  }, [darkMode])

  const theme = darkMode ? {
    bg: '#070d18',
    card: '#0e1c2f',
    text: '#edeae4',
    textMuted: 'rgba(255,255,255,0.55)',
    textFaint: 'rgba(255,255,255,0.3)',
    border: 'rgba(196,153,42,0.12)',
    badgeBg: 'rgba(255,255,255,0.06)',
    badgeBorder: 'rgba(255,255,255,0.1)',
    badgeText: 'rgba(255,255,255,0.7)',
    scoreText: '#FFFFFF',
    scoreDimmed: 'rgba(255,255,255,0.25)',
    buttonBg: 'rgba(255,255,255,0.06)',
    buttonBorder: 'rgba(255,255,255,0.1)',
    buttonText: 'rgba(255,255,255,0.7)',
    navBg: 'rgba(7,13,24,0.95)',
    headerBg: 'rgba(7,13,24,0.95)',
  } : {
    bg: '#ffffff',
    card: '#f9fafb',
    text: '#111827',
    textMuted: '#6b7280',
    textFaint: '#9ca3af',
    border: '#e5e7eb',
    badgeBg: '#f3f4f6',
    badgeBorder: '#e5e7eb',
    badgeText: '#374151',
    scoreText: '#111827',
    scoreDimmed: '#d1d5db',
    buttonBg: '#f3f4f6',
    buttonBorder: '#e5e7eb',
    buttonText: '#374151',
    navBg: 'rgba(255,255,255,0.95)',
    headerBg: 'rgba(255,255,255,0.97)',
  }

  const retryCountRef = useRef(0)
  const swipeRef = useRef({ startX: 0, startY: 0 })
  const progressRowRef = useRef<HTMLDivElement>(null)

  /* ── Mark body as scorecard ── */
  useEffect(() => {
    document.body.setAttribute('data-page', 'scorecard')
    return () => document.body.removeAttribute('data-page')
  }, [])

  /* ── Online/offline ── */
  useEffect(() => {
    const up = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

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
        .select('id, codigo, course_name, course_id, tees, holes, fecha, estado, modo_juego, hoyo_inicio, ronda_libre_jugadores(id, nombre, user_id, scores)')
        .eq('codigo', codigo)
        .single()
      if (!data) { router.push('/dashboard'); return }
      const r = data as unknown as RondaLibre
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

      if (r.course_id) {
        const { data: holes } = await supabase.from('course_holes')
          .select('numero, par, stroke_index, yardaje_campeonato, yardaje_azul, yardaje_blanco, yardaje_rojo')
          .eq('course_id', r.course_id).order('numero')
        if (holes && holes.length > 0) {
          const pm2: Record<number, number> = {}; const hdm2: Record<number, HoleData> = {}
          const teeCol = getTeeYardageColumn(r.tees || 'azul')
          for (const h of holes) {
            pm2[h.numero] = h.par
            hdm2[h.numero] = {
              numero: h.numero,
              par: h.par,
              stroke_index: h.stroke_index,
              yardaje: (h as Record<string, unknown>)[teeCol] as number | null || h.yardaje_azul || h.yardaje_blanco || null
            }
          }
          setParMap(pm2); setHoleDataMap(hdm2)
        } else { setHoleDataMap(hdm) }
      } else { setHoleDataMap(hdm) }

      const hcpMap: Record<string, number> = {}
      for (const j of r.ronda_libre_jugadores) {
        if (j.user_id) { const { data: p } = await supabase.from('profiles').select('indice').eq('id', j.user_id).single(); hcpMap[j.id] = p?.indice ?? 18 }
        else hcpMap[j.id] = 18
      }
      setPlayerHcp(hcpMap)

      const preselect = jugadorParam ? r.ronda_libre_jugadores.find(j => j.id === jugadorParam)?.id ?? r.ronda_libre_jugadores[0]?.id : r.ronda_libre_jugadores[0]?.id
      setActiveJugadorId(preselect ?? null)
      if (preselect) {
        const ex = initialScores[preselect] ?? {}
        const orden = generarOrdenHoyos(r.hoyo_inicio ?? 1, r.holes)
        const firstEmpty = orden.find(h => ex[h] == null)
        if (firstEmpty != null) setCurrentHole(firstEmpty)
        else setCurrentHole(orden[0])
      }
      setLoading(false)
    }
    load()
  }, [codigo, jugadorParam, router])

  /* ── Save ── */
  const saveScores = useCallback(async (jugadorId: string, holeScores: Record<number, number>) => {
    setSaveStatus('saving')
    lsSave(codigo, jugadorId, holeScores)
    if (!isOnline) { setSaveStatus('offline'); return }

    const scoresObj: Record<string, number> = {}
    for (const [k, v] of Object.entries(holeScores)) scoresObj[k] = v

    let success = false
    retryCountRef.current = 0
    while (!success && retryCountRef.current < 3) {
      const supabase = createClient()
      const { error } = await supabase.from('ronda_libre_jugadores').update({ scores: scoresObj }).eq('id', jugadorId)
      if (!error) { success = true; retryCountRef.current = 0 } else retryCountRef.current++
    }

    if (!success) { setSaveStatus('error') }
    else {
      setSaveStatus('saved'); setHasUnsaved(false)
      // FIX #8: show save check and haptic on success
      setSaveCheckVisible(true)
      haptic(20)
      setTimeout(() => setSaveCheckVisible(false), 1000)
      setTimeout(() => setSaveStatus('idle'), 1500)
    }
  }, [codigo, isOnline])

  const handleScoreChange = useCallback((hole: number, value: number) => {
    if (!activeJugadorId) return
    const clamped = Math.max(1, Math.min(15, value)) // FIX #5: max 15 instead of 12
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

    // Send server-side push for notable events (birdie, eagle)
    const savedScore = scores[activeJugadorId]?.[currentHole]
    const holePar = parMap[currentHole] ?? 4
    if (savedScore != null && ronda) {
      const diff = savedScore - holePar
      const playerName = ronda.ronda_libre_jugadores.find(j => j.id === activeJugadorId)?.nombre ?? 'Jugador'
      if (diff <= -2) {
        sendPushViaServer({ title: `Eagle — ${playerName}`, body: `Eagle en hoyo ${currentHole} en ${ronda.course_name}`, tag: `eagle-${codigo}-${currentHole}`, url: `/ronda-libre/${codigo}` })
      } else if (diff === -1) {
        sendPushViaServer({ title: `Birdie — ${playerName}`, body: `Birdie en hoyo ${currentHole} en ${ronda.course_name}`, tag: `birdie-${codigo}-${currentHole}`, url: `/ronda-libre/${codigo}` })
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
  const finalizeRound = async () => {
    if (!ronda || !activeJugadorId) return
    haptic(30)
    // Auto-fill last hole with par if not entered
    if (scores[activeJugadorId]?.[currentHole] == null) {
      const holePar = parMap[currentHole] ?? 4
      handleScoreChange(currentHole, holePar)
    }
    await saveScores(activeJugadorId, scores[activeJugadorId] ?? {})
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await trackEvent(supabase, authUser?.id ?? null, 'ronda_completada', { codigo })

    // Save to historical_rounds
    const playerScores = scores[activeJugadorId] ?? {}
    const grossTotal = Object.values(playerScores).reduce((a: number, b: number) => a + b, 0)
    try {
      await supabase.from('historical_rounds').insert({
        user_id: authUser?.id,
        course_name: ronda.course_name,
        played_at: new Date().toISOString().split('T')[0],
        total_gross: grossTotal,
        scores: Object.entries(playerScores).sort(([a],[b]) => parseInt(a) - parseInt(b)).map(([,v]) => v),
        privacy: 'private',
      })
    } catch { /* don't block finalization */ }

    // Check if ALL players have completed all holes → finalize round
    const holesCount = ronda.holes ?? 18
    const { data: freshRonda } = await supabase
      .from('rondas_libres')
      .select('ronda_libre_jugadores(id, scores)')
      .eq('codigo', codigo)
      .single()
    const allDone = (freshRonda?.ronda_libre_jugadores ?? []).every((j: { scores: Record<string, number> }) => {
      const count = Object.keys(j.scores ?? {}).filter(k => { const n = parseInt(k); return n >= 1 && n <= holesCount }).length
      return count >= holesCount
    })
    if (allDone) {
      await supabase.from('rondas_libres').update({ estado: 'finalizada' }).eq('codigo', codigo)
      // Push to all subscribers: round finished
      sendPushViaServer({
        title: 'Ronda finalizada',
        body: `Resultado final listo en ${ronda.course_name}`,
        tag: `round-finished-${codigo}`,
        url: `/ronda-libre/${codigo}?finished=true`,
      })
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

    // Fire tAIger analysis in background (don't redirect)
    setTaigerStatus('analyzing')
    fetch('/api/taiger/analyze-round', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ronda_libre_id: codigo }) })
      .then(r => r.json()).then(data => { if (data.session_id) { setTaigerStatus('ready'); setTaigerSessionId(data.session_id) } })
      .catch(() => { /* silently fail, modal handles navigation */ })
  }

  /* ── Scroll progress row to current hole ── */
  useEffect(() => {
    if (progressRowRef.current) {
      const cell = progressRowRef.current.children[currentHole - 1] as HTMLElement | undefined
      if (cell) cell.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }
  }, [currentHole])

  /* ── Render ── */
  if (loading) return <div style={{ background: theme.bg, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textFaint }}>Cargando ronda...</div>
  if (!ronda || !activeJugadorId) return null

  const jugadores = ronda.ronda_libre_jugadores
  const totalHoles = ronda.holes
  const hoyoInicio = ronda.hoyo_inicio ?? 1
  const ordenHoyos = generarOrdenHoyos(hoyoInicio, totalHoles)
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

  // FIX #7: Handicap strokes on this hole
  const hcpForPlayer = playerHcp[activeJugadorId] ?? 18
  const strokesOnHole = strokesRecibidosEnHoyo(hcpForPlayer, holeData.stroke_index)

  // FIX #5: double bogey warning
  const isAboveDoubleBogey = score != null && score > par + 2

  // Score styles for mini scorecard (theme-aware)
  const currentScoreStyles = darkMode ? SCORE_STYLES : SCORE_STYLES_LIGHT

  return (
    <div style={{ background: theme.bg, height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>

      {/* ── Share menu modal ── */}
      {showShareMenu && <ShareMenu codigo={codigo} onClose={() => setShowShareMenu(false)} />}

      {/* ── Offline banner ── */}
      {!isOnline && (
        <div style={{ background: '#92400e', color: '#fef3c7', textAlign: 'center', padding: '4px', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>
          Sin conexion — guardado local
        </div>
      )}

      {/* ── Save indicator bar ── */}
      {saveStatus !== 'idle' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20,
          height: '3px', transition: 'opacity 0.3s',
          background: saveStatus === 'saving' ? '#C4992A'
            : saveStatus === 'saved' ? '#00e676'
            : saveStatus === 'offline' ? '#FCD34D'
            : '#ff4444',
          opacity: saveStatus === 'saved' ? 0.6 : 1,
          animation: saveStatus === 'saving' ? 'savePulse 1s ease infinite' : 'none',
        }} />
      )}

      {/* ── Header 48px ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: '48px', flexShrink: 0,
        borderBottom: `1px solid ${theme.border}`,
        background: theme.headerBg,
      }}>
        <button onClick={handleExit} aria-label="Salir de la ronda" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: theme.buttonText, fontSize: '14px',
          padding: '8px', minWidth: '44px', minHeight: '44px',
          display: 'flex', alignItems: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}>← Salir</button>
        <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#C4992A', letterSpacing: '0.05em' }}>HOYO {currentHole}</div>
            <div style={{ fontSize: '11px', color: theme.textMuted }}>
              {ronda.course_name}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0px' }}>
          <button onClick={() => setDarkMode(!darkMode)} aria-label="Cambiar tema" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: theme.textMuted, fontSize: '18px', padding: '8px',
            minWidth: '44px', minHeight: '44px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {darkMode ? '\u2600\uFE0F' : '\uD83C\uDF19'}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px', minWidth: '36px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#c4992a' }}>
              H.{currentHole}
            </span>
            <span style={{ fontSize: '10px', color: theme.textMuted }}>
              Thru {holesPlayed}/{totalHoles}
            </span>
          </div>
        </div>
      </header>

      {/* ── Mini scorecard strip (36px) ── */}
      <div style={{
        background: darkMode ? 'rgba(14,28,47,0.97)' : 'rgba(249,250,251,0.97)', borderBottom: `1px solid ${theme.border}`,
        padding: '2px 8px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexShrink: 0, height: '36px',
      }}>
        <div ref={progressRowRef} style={{ display: 'flex', gap: '2px', minWidth: 'max-content', justifyContent: 'center', height: '100%', alignItems: 'center' }}>
          {Array.from({ length: totalHoles }, (_, i) => i + 1).map(h => {
            const s = scores[activeJugadorId]?.[h]
            const p = parMap[h] ?? 4
            const isActive = h === currentHole

            const scoreResult = getScoreResult(s, p)
            const scoreStyle = currentScoreStyles[scoreResult]
            let bg = scoreStyle.bg
            let color = scoreStyle.textColor
            if (isActive) { bg = 'rgba(196,153,42,0.2)'; color = '#C4992A' }

            return (
              <button key={h} onClick={() => setCurrentHole(h)} style={{
                width: '26px', height: '30px', borderRadius: '5px',
                background: bg, border: isActive ? '1px solid #C4992A' : '1px solid transparent',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, padding: 0,
                WebkitTapHighlightColor: 'transparent',
              }}>
                <span style={{ fontSize: '7px', color: theme.textFaint, lineHeight: 1 }}>{h}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color, lineHeight: 1.2 }}>
                  {s ?? '\u00B7'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Pacing bar (24px) ── */}
      {totalHoles >= 18 && (f9Count > 0 || b9Count > 0) && (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '16px',
          padding: '3px 16px', height: '24px', flexShrink: 0,
          background: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
          borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
          fontSize: '12px', color: theme.textFaint, alignItems: 'center',
        }}>
          {f9Count > 0 && <span>F9: <span style={{ color: theme.textMuted, fontWeight: 600 }}>{formatNine(f9Gross, f9Par)}</span></span>}
          {f9Count > 0 && b9Count > 0 && <span style={{ color: theme.textFaint }}>|</span>}
          {b9Count > 0 && <span>B9: <span style={{ color: theme.textMuted, fontWeight: 600 }}>{formatNine(b9Gross, b9Par)}</span></span>}
        </div>
      )}

      {/* ── Hole info bar (32px) with share ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
        padding: '4px 16px', height: '32px', flexShrink: 0,
        borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
      }}>
        <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '12px', background: theme.badgeBg, border: `1px solid ${theme.badgeBorder}`, color: theme.badgeText, display: 'flex', alignItems: 'center', gap: '4px' }}>
          Par {par}
          {strokesOnHole > 0 && (
            <span style={{ color: '#C4992A', fontSize: '9px' }}>
              {strokesOnHole === 1 ? '\u25CF' : '\u25CF\u25CF'}
            </span>
          )}
        </span>
        {holeData.yardaje && (
          <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '12px', background: theme.badgeBg, border: `1px solid ${theme.badgeBorder}`, color: theme.badgeText }}>
            {holeData.yardaje} yds
          </span>
        )}
        <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '12px', background: 'rgba(196,153,42,0.1)', border: '1px solid rgba(196,153,42,0.2)', color: theme.badgeText }}>
          HDCP {holeData.stroke_index}
        </span>
        {holesPlayed > 0 && (
          <span style={{ fontSize: '12px', color: theme.textMuted, fontWeight: 600 }}>
            {totalOverUnder > 0 ? `+${totalOverUnder}` : totalOverUnder === 0 ? 'E' : totalOverUnder}
          </span>
        )}
        <button onClick={() => setShowShareMenu(true)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: theme.textFaint, padding: '2px 4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
        }} aria-label="Compartir">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        </button>
      </div>

      {/* ── Player tabs (multi-player only) ── */}
      {jugadores.length > 1 && (
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`, WebkitOverflowScrolling: 'touch', flexShrink: 0, height: '36px' }}>
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

      {/* ── Central area — SCORE (flex:1, centered) ── */}
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', position: 'relative', minHeight: 0, paddingTop: '16px' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Score number */}
        <div style={{ position: 'relative' }}>
          <div
            className={scoreAnimating ? 'score-animating' : ''}
            style={{
              fontSize: 'clamp(72px, 20vw, 96px)', fontWeight: 700, fontFamily: 'Inter, sans-serif',
              lineHeight: 1, color: score != null ? theme.scoreText : theme.scoreDimmed, letterSpacing: '-3px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >{score ?? par}</div>

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
            ...getChipStyle(score, par, darkMode),
          }}>{getChipLabel(score, par)}</div>
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
            background: '#C4992A', color: darkMode ? '#070D18' : '#070D18', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            userSelect: 'none', transition: 'transform 0.08s ease-out',
            opacity: score != null && score >= 15 ? 0.3 : 1,
            minHeight: 0, minWidth: 0,
          }}
        >+</button>
      </div>

      {/* Spacer */}
      <div style={{ flexGrow: 1, minHeight: '12px' }} />

      {/* Mini leaderboard — visible scrolling down */}
      {(ronda.ronda_libre_jugadores ?? []).length > 1 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 16px 4px' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>En cancha</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <MiniLeaderboard
            codigoRonda={codigo}
            parMap={parMap}
            currentUserId={ronda.ronda_libre_jugadores.find(j => j.id === activeJugadorId)?.user_id ?? null}
            totalHoles={ronda.holes}
          />
        </>
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
              color: theme.textMuted, border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
              borderRadius: '12px', fontSize: '14px', fontWeight: 400,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >{'\u2190'} Anterior</button>
        )}
        <button
          onTouchStart={() => {}}
          onClick={isLastHole ? finalizeRound : goToNextHole}
          aria-label={isLastHole ? 'Finalizar ronda' : 'Siguiente hoyo'}
          style={{
            flex: 2, padding: '14px', background: '#C4992A', color: '#070D18',
            border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation', letterSpacing: '0.01em',
            animation: hasUnsaved && !isLastHole ? 'pendingPulse 2s ease-in-out infinite' : 'none',
          }}
        >{isLastHole ? 'Finalizar ronda \u2713' : 'Siguiente \u2192'}</button>
      </div>

      {/* ── tAIger banners ── */}
      {taigerStatus === 'analyzing' && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90, background: 'rgba(14,28,47,0.97)', borderTop: '1px solid rgba(196,153,42,0.3)', padding: '20px 16px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', textAlign: 'center' }}>
          <div style={{ color: '#c4992a', fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>tAIger+ esta analizando tu ronda...</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Esto toma unos segundos</div>
        </div>
      )}
      {taigerStatus === 'ready' && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90, background: 'rgba(14,28,47,0.97)', borderTop: '1px solid rgba(196,153,42,0.3)', padding: '20px 16px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', textAlign: 'center' }}>
          <div style={{ color: '#c4992a', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Tu analisis esta listo</div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link href={taigerSessionId ? `/coach/sesion/${taigerSessionId}` : '/coach'} style={{ background: '#c4992a', color: '#070d18', padding: '12px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '15px', textDecoration: 'none' }}>Ver analisis {'\u2192'}</Link>
            <Link href={`/ronda-libre/${codigo}?finished=true`} style={{ background: 'transparent', border: '1px solid rgba(196,153,42,0.3)', color: '#c4992a', padding: '12px 24px', borderRadius: '10px', fontWeight: 600, fontSize: '15px', textDecoration: 'none' }}>Ver scorecard</Link>
          </div>
        </div>
      )}

      {/* ── Post-round celebration modal ── */}
      {roundDone && (() => {
        const diff = finalScore.gross - finalScore.totalPar
        const diffLabel = diff === 0 ? 'Par' : diff > 0 ? `+${diff} sobre par` : `${diff} bajo par`
        const diffColor = diff < 0 ? '#4ade80' : diff === 0 ? '#c9a84c' : '#f87171'

        // Count birdies/eagles
        const playerScores = activeJugadorId ? (scores[activeJugadorId] ?? {}) : {}
        let birdieCount = 0, eagleCount = 0
        Object.entries(playerScores).forEach(([h, s]) => {
          const p = parMap[parseInt(h)] ?? 4
          if (s === p - 1) birdieCount++
          if (s <= p - 2) eagleCount++
        })

        // Mini scorecard data
        const totalHoles = ronda?.holes ?? 18
        const holeNums = Array.from({ length: totalHoles }, (_, i) => i + 1)

        const handleShareCard = async () => {
          if (!ronda || !activeJugadorId) return
          const jugador = (ronda.ronda_libre_jugadores ?? []).find(j => j.id === activeJugadorId)
          const shareData: ShareCardData = {
            tipo: 'ronda_libre',
            ganador: jugador?.nombre ?? 'Jugador',
            esEmpate: false,
            scoreGross: finalScore.gross,
            scoreDiff: diff,
            courseName: ronda.course_name,
            fecha: new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }),
            birdies: birdieCount,
            eagles: eagleCount,
            scoresByHole: playerScores,
            parsByHole: parMap,
            holesPlayed: totalHoles,
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

              {/* Scorecard table with OUT/IN/TOTAL */}
              {(() => {
                const front9 = holeNums.slice(0, 9).reduce((sum, h) => sum + (playerScores[h] ?? 0), 0)
                const back9 = holeNums.slice(9, 18).reduce((sum, h) => sum + (playerScores[h] ?? 0), 0)
                const cColor = (h: number) => {
                  const s = playerScores[h]; const p = parMap[h] ?? 4
                  if (s == null) return 'rgba(255,255,255,0.2)'
                  const d = s - p
                  if (d <= -2) return '#c4992a'
                  if (d === -1) return '#4ade80'
                  if (d === 0) return 'rgba(255,255,255,0.7)'
                  if (d === 1) return '#fbbf24'
                  return '#f87171'
                }
                return (
                  <div style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '10px', marginBottom: '20px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table style={{ width: '100%', minWidth: '300px', borderCollapse: 'collapse' }}>
                      <tbody>
                        {/* Front 9 */}
                        <tr>
                          {holeNums.slice(0, 9).map(h => (
                            <td key={h} style={{ padding: '2px 1px', textAlign: 'center', fontSize: '8px', color: 'rgba(255,255,255,0.25)' }}>{h}</td>
                          ))}
                          <td style={{ padding: '2px 3px', textAlign: 'center', fontSize: '8px', color: 'rgba(255,255,255,0.4)', fontWeight: 700, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>OUT</td>
                        </tr>
                        <tr>
                          {holeNums.slice(0, 9).map(h => (
                            <td key={h} style={{ padding: '2px 1px', textAlign: 'center' }}>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: cColor(h) }}>{playerScores[h] ?? '·'}</span>
                            </td>
                          ))}
                          <td style={{ padding: '2px 3px', textAlign: 'center', fontSize: '13px', fontWeight: 800, color: '#edeae4', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>{front9}</td>
                        </tr>
                        {/* Back 9 */}
                        {totalHoles > 9 && (
                          <>
                            <tr><td colSpan={10} style={{ padding: '3px' }} /></tr>
                            <tr>
                              {holeNums.slice(9, 18).map(h => (
                                <td key={h} style={{ padding: '2px 1px', textAlign: 'center', fontSize: '8px', color: 'rgba(255,255,255,0.25)' }}>{h}</td>
                              ))}
                              <td style={{ padding: '2px 3px', textAlign: 'center', fontSize: '8px', color: 'rgba(255,255,255,0.4)', fontWeight: 700, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>IN</td>
                            </tr>
                            <tr>
                              {holeNums.slice(9, 18).map(h => (
                                <td key={h} style={{ padding: '2px 1px', textAlign: 'center' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 700, color: cColor(h) }}>{playerScores[h] ?? '·'}</span>
                                </td>
                              ))}
                              <td style={{ padding: '2px 3px', textAlign: 'center', fontSize: '13px', fontWeight: 800, color: '#edeae4', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>{back9}</td>
                            </tr>
                            {/* Total */}
                            <tr>
                              <td colSpan={9} style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '4px 0 0' }} />
                              <td style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '4px 3px 0', textAlign: 'center', fontSize: '15px', fontWeight: 900, color: '#ffffff' }}>{finalScore.gross}</td>
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
                          width: '100%', padding: '14px', background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.12)', color: '#edeae4',
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
                    <Link href={taigerSessionId ? `/coach/sesion/${taigerSessionId}` : '/coach'} style={{
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
                        color: 'rgba(255,255,255,0.35)', fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      Editar scores
                    </button>
                  </div>
                )
              })()}

              <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: '11px', marginTop: '16px' }}>Golfers+ · El golf amateur en español</p>
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
    </div>
  )
}

export default function ScorePage() {
  return (
    <Suspense fallback={<div style={{ background: '#ffffff', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>Cargando...</div>}>
      <ScorePageContent />
    </Suspense>
  )
}
