'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/lib/scoring'
import type { ModoJuego } from '@/lib/scoring'
import { updatePlayerNotification, getNotifPrefs } from '@/lib/push-notifications'

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
interface RondaLibre { id: string; codigo: string; course_name: string; course_id: string | null; tees: string; holes: number; fecha: string; estado: string; modo_juego: ModoJuego; ronda_libre_jugadores: Jugador[] }
interface HoleData { numero: number; par: number; stroke_index: number }

/* ── Helpers ─────────────────────────────────────────────────────────── */
function lsKey(c: string, j: string) { return `ronda_${c}_${j}` }
function lsSave(c: string, j: string, s: Record<number, number>) { try { localStorage.setItem(lsKey(c, j), JSON.stringify(s)) } catch {} }
function lsLoad(c: string, j: string): Record<number, number> { try { return JSON.parse(localStorage.getItem(lsKey(c, j)) ?? '{}') } catch { return {} } }
function haptic(p: number | number[]) { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(p) }

function getChipStyle(gross: number, par: number): React.CSSProperties {
  const d = gross - par
  if (d <= -2) return { background: 'rgba(196,153,42,0.2)', color: '#c4992a', border: '1px solid rgba(196,153,42,0.3)' }
  if (d === -1) return { background: 'rgba(22,163,74,0.15)', color: '#4ade80', border: '1px solid rgba(22,163,74,0.2)' }
  if (d === 0) return { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }
  if (d === 1) return { background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }
  if (d === 2) return { background: 'rgba(220,38,38,0.12)', color: '#f87171', border: '1px solid rgba(220,38,38,0.18)' }
  return { background: 'rgba(153,27,27,0.4)', color: '#FCA5A5', border: '1px solid rgba(153,27,27,0.5)' }
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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
        .select('id, codigo, course_name, course_id, tees, holes, fecha, estado, modo_juego, ronda_libre_jugadores(id, nombre, user_id, scores)')
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
      for (let i = 1; i <= r.holes; i++) { pm[i] = 4; hdm[i] = { numero: i, par: 4, stroke_index: i } }
      setParMap(pm)

      if (r.course_id) {
        const { data: holes } = await supabase.from('course_holes').select('numero, par, stroke_index').eq('course_id', r.course_id).order('numero')
        if (holes && holes.length > 0) {
          const pm2: Record<number, number> = {}; const hdm2: Record<number, HoleData> = {}
          for (const h of holes as HoleData[]) { pm2[h.numero] = h.par; hdm2[h.numero] = h }
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
      if (preselect) { const ex = initialScores[preselect] ?? {}; for (let h = 1; h <= r.holes; h++) { if (ex[h] == null) { setCurrentHole(h); break } } }
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
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => saveScores(activeJugadorId, next[activeJugadorId]), 600)
      const holePar = parMap[hole] ?? 4
      if (clamped - holePar <= -1) haptic([15, 30, 15])
      return next
    })
  }, [activeJugadorId, saveScores, parMap])

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
    if (debounceRef.current) clearTimeout(debounceRef.current)
    await saveScores(activeJugadorId, scores[activeJugadorId] ?? {})
    const nextHole = currentHole + 1
    setCurrentHole(nextHole)
    // Player notification: update persistent notification
    if (ronda && getNotifPrefs().player) {
      const overUnder = totalOverUnder > 0 ? `+${totalOverUnder}` : totalOverUnder === 0 ? 'E' : String(totalOverUnder)
      updatePlayerNotification(ronda.course_name, nextHole, parMap[nextHole] ?? 4, overUnder, `/ronda-libre/${codigo}/score?hole=${nextHole}`)
    }
  }
  const goToPrevHole = () => { if (currentHole > 1) setCurrentHole(h => h - 1) }
  const finalizeRound = async () => {
    if (!ronda || !activeJugadorId) return
    haptic(30)
    // Auto-fill last hole with par if not entered
    if (scores[activeJugadorId]?.[currentHole] == null) {
      const holePar = parMap[currentHole] ?? 4
      handleScoreChange(currentHole, holePar)
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
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
  if (loading) return <div style={{ background: '#070d18', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)' }}>Cargando ronda...</div>
  if (!ronda || !activeJugadorId) return null

  const jugadores = ronda.ronda_libre_jugadores
  const totalHoles = ronda.holes
  const par = parMap[currentHole] ?? 4
  const score = scores[activeJugadorId]?.[currentHole]
  const holeData = holeDataMap[currentHole] ?? { numero: currentHole, par, stroke_index: currentHole }
  const activePlayer = jugadores.find(p => p.id === activeJugadorId)
  const isLastHole = currentHole >= totalHoles

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

  return (
    <div style={{ background: '#070d18', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>

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
        borderBottom: '1px solid rgba(196,153,42,0.12)',
        background: 'rgba(7,13,24,0.95)',
      }}>
        <button onClick={handleExit} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.7)', fontSize: '14px',
          padding: '8px', minWidth: '44px', minHeight: '44px',
          display: 'flex', alignItems: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}>← Salir</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#C4992A', letterSpacing: '0.05em' }}>HOYO {currentHole}</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>
            {ronda.course_name}
          </div>
        </div>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', minWidth: '28px', textAlign: 'right' }}>
          {currentHole}/{totalHoles}
        </span>
      </header>

      {/* ── Mini scorecard strip (36px) ── */}
      <div style={{
        background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)',
        padding: '2px 8px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexShrink: 0, height: '36px',
      }}>
        <div ref={progressRowRef} style={{ display: 'flex', gap: '2px', minWidth: 'max-content', justifyContent: 'center', height: '100%', alignItems: 'center' }}>
          {Array.from({ length: totalHoles }, (_, i) => i + 1).map(h => {
            const s = scores[activeJugadorId]?.[h]
            const p = parMap[h] ?? 4
            const isActive = h === currentHole
            const diff = s != null ? s - p : null

            let bg = 'rgba(255,255,255,0.04)'
            let color = 'rgba(255,255,255,0.2)'
            if (isActive) { bg = 'rgba(196,153,42,0.2)'; color = '#C4992A' }
            else if (diff != null) {
              if (diff <= -2) { bg = 'rgba(196,153,42,0.2)'; color = '#c4992a' }
              else if (diff === -1) { bg = 'rgba(22,163,74,0.15)'; color = '#4ade80' }
              else if (diff === 0) { bg = 'rgba(255,255,255,0.08)'; color = 'rgba(255,255,255,0.6)' }
              else if (diff === 1) { bg = 'rgba(245,158,11,0.15)'; color = '#fbbf24' }
              else { bg = 'rgba(220,38,38,0.15)'; color = '#f87171' }
            }

            return (
              <button key={h} onClick={() => setCurrentHole(h)} style={{
                width: '26px', height: '30px', borderRadius: '5px',
                background: bg, border: isActive ? '1px solid #C4992A' : '1px solid transparent',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, padding: 0,
                WebkitTapHighlightColor: 'transparent',
              }}>
                <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>{h}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color, lineHeight: 1.2 }}>
                  {s ?? '·'}
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
          background: 'rgba(255,255,255,0.02)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          fontSize: '12px', color: 'rgba(255,255,255,0.45)', alignItems: 'center',
        }}>
          {f9Count > 0 && <span>F9: <span style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{formatNine(f9Gross, f9Par)}</span></span>}
          {f9Count > 0 && b9Count > 0 && <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>}
          {b9Count > 0 && <span>B9: <span style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{formatNine(b9Gross, b9Par)}</span></span>}
        </div>
      )}

      {/* ── Hole info bar (32px) with share ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
        padding: '4px 16px', height: '32px', flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          Par {par}
          {strokesOnHole > 0 && (
            <span style={{ color: '#C4992A', fontSize: '9px' }}>
              {strokesOnHole === 1 ? '●' : '●●'}
            </span>
          )}
        </span>
        <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '12px', background: 'rgba(196,153,42,0.1)', border: '1px solid rgba(196,153,42,0.2)', color: 'rgba(255,255,255,0.7)' }}>
          HDCP {holeData.stroke_index}
        </span>
        {holesPlayed > 0 && (
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
            {totalOverUnder > 0 ? `+${totalOverUnder}` : totalOverUnder === 0 ? 'E' : totalOverUnder}
          </span>
        )}
        <button onClick={() => setShowShareMenu(true)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.45)', padding: '2px 4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
        }} aria-label="Compartir">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        </button>
      </div>

      {/* ── Player tabs (multi-player only) ── */}
      {jugadores.length > 1 && (
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.06)', WebkitOverflowScrolling: 'touch', flexShrink: 0, height: '36px' }}>
          {jugadores.map(j => {
            const active = j.id === activeJugadorId
            return (
              <button key={j.id} onClick={() => setActiveJugadorId(j.id)} style={{
                padding: '0 16px', height: '36px', border: 'none',
                borderBottom: active ? '2px solid #C4992A' : '2px solid transparent',
                background: 'transparent', color: active ? '#C4992A' : 'rgba(255,255,255,0.35)',
                fontWeight: active ? 600 : 400, fontSize: '13px',
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, minHeight: 0, minWidth: 0,
              }}>{j.nombre}</button>
            )
          })}
        </div>
      )}

      {/* ── Central area — SCORE (flex:1, centered) ── */}
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 0 }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Score number */}
        <div style={{ position: 'relative' }}>
          <div
            className={scoreAnimating ? 'score-animating' : ''}
            style={{
              fontSize: 'clamp(72px, 20vw, 96px)', fontWeight: 700, fontFamily: 'Inter, sans-serif',
              lineHeight: 1, color: score != null ? '#FFFFFF' : 'rgba(255,255,255,0.25)', letterSpacing: '-3px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >{score ?? par}</div>

          {/* Save check toast */}
          {saveCheckVisible && (
            <div style={{
              position: 'absolute', top: '-8px', right: '-24px',
              fontSize: '20px', color: '#00e676', fontWeight: 700,
              animation: 'fadeInOut 1s ease forwards',
            }}>✓</div>
          )}
        </div>

        {/* Chip */}
        {score != null && (
          <div style={{
            marginTop: '8px', padding: '4px 16px', borderRadius: '20px',
            fontSize: '13px', fontWeight: 500, letterSpacing: '0.01em',
            ...getChipStyle(score, par),
          }}>{getChipLabel(score, par)}</div>
        )}

        {/* Double bogey warning */}
        {isAboveDoubleBogey && (
          <div style={{
            marginTop: '4px', fontSize: '11px', color: 'rgba(255,255,255,0.3)',
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
          style={{
            width: '80px', height: '80px', borderRadius: '20px',
            fontSize: '32px', fontWeight: 300,
            background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)',
            border: '1px solid rgba(255,255,255,0.1)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            userSelect: 'none', transition: 'transform 0.08s ease-out',
            opacity: score != null && score <= 1 ? 0.3 : 1,
            minHeight: 0, minWidth: 0,
          }}
        >−</button>
        <button
          className="ctrl-btn"
          onTouchStart={() => {}}
          onClick={() => handleScoreChange(currentHole, (score ?? par) + 1)}
          disabled={score != null && score >= 15}
          style={{
            width: '80px', height: '80px', borderRadius: '20px',
            fontSize: '32px', fontWeight: 600,
            background: '#C4992A', color: '#070D18', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            userSelect: 'none', transition: 'transform 0.08s ease-out',
            opacity: score != null && score >= 15 ? 0.3 : 1,
            minHeight: 0, minWidth: 0,
          }}
        >+</button>
      </div>

      {/* ── Nav buttons (fixed bottom with safe area) ── */}
      <div style={{
        flexShrink: 0, background: 'rgba(7,13,24,0.97)',
        borderTop: '1px solid rgba(196,153,42,0.12)',
        padding: '8px 16px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
        display: 'flex', gap: '8px',
      }}>
        {currentHole > 1 && (
          <button
            onTouchStart={() => {}}
            onClick={goToPrevHole}
            style={{
              flex: 1, padding: '14px', background: 'transparent',
              color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px', fontSize: '14px', fontWeight: 400,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >← Anterior</button>
        )}
        <button
          onTouchStart={() => {}}
          onClick={isLastHole ? finalizeRound : goToNextHole}
          style={{
            flex: 2, padding: '14px', background: '#C4992A', color: '#070D18',
            border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation', letterSpacing: '0.01em',
          }}
        >{isLastHole ? 'Finalizar ronda ✓' : 'Siguiente →'}</button>
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
            <Link href={taigerSessionId ? `/coach/sesion/${taigerSessionId}` : '/coach'} style={{ background: '#c4992a', color: '#070d18', padding: '12px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '15px', textDecoration: 'none' }}>Ver analisis →</Link>
            <Link href={`/ronda-libre/${codigo}?finished=true`} style={{ background: 'transparent', border: '1px solid rgba(196,153,42,0.3)', color: '#c4992a', padding: '12px 24px', borderRadius: '10px', fontWeight: 600, fontSize: '15px', textDecoration: 'none' }}>Ver scorecard</Link>
          </div>
        </div>
      )}

      {/* ── Post-round modal ── */}
      {roundDone && (() => {
        const diff = finalScore.gross - finalScore.totalPar
        const diffLabel = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
        const diffColor = diff < 0 ? '#4ade80' : diff > 0 ? '#f87171' : 'rgba(255,255,255,0.5)'
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(7,13,24,0.97)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '360px', padding: '0 24px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏆</div>
              <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: '#edeae4', margin: '0 0 6px', textAlign: 'center' }}>
                Ronda completada
              </h2>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: '0 0 24px', textAlign: 'center' }}>
                Tu score quedó guardado
              </p>

              {/* Score card */}
              <div style={{
                background: '#0e1c2f', borderRadius: '16px', padding: '20px', width: '100%',
                display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '28px',
              }}>
                <div style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                  SCORE FINAL
                </div>
                <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '48px', fontWeight: 700, color: diffColor, lineHeight: 1 }}>
                  {diffLabel}
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginTop: '6px' }}>
                  {finalScore.gross} golpes
                </div>
              </div>

              {/* CTAs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                <Link href={taigerSessionId ? `/coach/sesion/${taigerSessionId}` : '/coach'} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '15px',
                  height: '52px', borderRadius: '12px', textDecoration: 'none',
                }}>
                  🐯 Análisis de tu ronda →
                </Link>
                <Link href="/perfil/stats" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                  color: '#edeae4', fontWeight: 600, fontSize: '14px',
                  height: '52px', borderRadius: '12px', textDecoration: 'none',
                }}>
                  Ver mi GWI™ actualizado
                </Link>
                <Link href="/dashboard" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: 'none',
                  color: 'rgba(255,255,255,0.4)', fontSize: '14px',
                  height: '44px', borderRadius: '12px', textDecoration: 'none',
                }}>
                  Volver al inicio
                </Link>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── CSS animation for save check ── */}
      <style>{`
        @keyframes fadeInOut {
          0% { opacity: 0; transform: scale(0.8); }
          20% { opacity: 1; transform: scale(1.1); }
          40% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1) translateY(-4px); }
        }
      `}</style>
    </div>
  )
}

export default function ScorePage() {
  return (
    <Suspense fallback={<div style={{ background: '#070d18', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)' }}>Cargando...</div>}>
      <ScorePageContent />
    </Suspense>
  )
}
