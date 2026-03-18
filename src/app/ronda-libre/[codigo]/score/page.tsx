'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/lib/scoring'
import type { ModoJuego } from '@/lib/scoring'

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
  if (d <= -2) return { background: 'rgba(59,130,246,0.15)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.2)' }
  if (d === -1) return { background: 'rgba(239,68,68,0.12)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.18)' }
  if (d === 0) return { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }
  if (d === 1) return { background: 'rgba(196,153,42,0.15)', color: '#FCD34D', border: '1px solid rgba(196,153,42,0.25)' }
  if (d === 2) return { background: 'rgba(220,38,38,0.12)', color: '#FCA5A5', border: '1px solid rgba(220,38,38,0.18)' }
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
  const [showMiniCard, setShowMiniCard] = useState(false)
  const [taigerStatus, setTaigerStatus] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle')
  const [taigerSessionId, setTaigerSessionId] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const swipeRef = useRef({ startX: 0, startY: 0 })

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
    else { setSaveStatus('saved'); setHasUnsaved(false); setTimeout(() => setSaveStatus('idle'), 1500) }
  }, [codigo, isOnline])

  const handleScoreChange = useCallback((hole: number, value: number) => {
    if (!activeJugadorId) return
    const clamped = Math.max(1, Math.min(12, value))
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
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 60) {
      if (dx < 0 && ronda && currentHole < ronda.holes) setCurrentHole(h => h + 1)
      else if (dx > 0 && currentHole > 1) setCurrentHole(h => h - 1)
    }
  }

  /* ── Navigate ── */
  const handleExit = () => router.push(`/ronda-libre/${codigo}`)
  const goToNextHole = async () => {
    if (!ronda || !activeJugadorId) return
    haptic(30)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    await saveScores(activeJugadorId, scores[activeJugadorId] ?? {})
    setCurrentHole(h => h + 1)
  }
  const goToPrevHole = () => { if (currentHole > 1) setCurrentHole(h => h - 1) }
  const finalizeRound = async () => {
    if (!ronda || !activeJugadorId) return
    haptic(30)
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

    setHasUnsaved(false)
    setTaigerStatus('analyzing')
    fetch('/api/taiger/analyze-round', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ronda_libre_id: codigo }) })
      .then(r => r.json()).then(data => { if (data.session_id) { setTaigerStatus('ready'); setTaigerSessionId(data.session_id) } else router.push(`/ronda-libre/${codigo}`) })
      .catch(() => router.push(`/ronda-libre/${codigo}`))
  }

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

  return (
    <div style={{ background: '#070d18', minHeight: '100dvh', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>

      {/* ── Offline banner ── */}
      {!isOnline && (
        <div style={{ background: '#92400e', color: '#fef3c7', textAlign: 'center', padding: '6px', fontSize: '12px', fontWeight: 600 }}>
          Sin conexión — guardado local
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
        padding: '0 16px', height: '48px',
        borderBottom: '1px solid rgba(196,153,42,0.12)',
        background: 'rgba(7,13,24,0.95)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={handleExit} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.6)', fontSize: '14px',
          padding: '8px', minWidth: '44px', minHeight: '44px',
          display: 'flex', alignItems: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}>← Salir</button>
        <button onClick={() => setShowMiniCard(!showMiniCard)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'center', padding: '4px 8px', minHeight: '44px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#C4992A', letterSpacing: '0.05em' }}>HOYO {currentHole}</div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)' }}>
            {ronda.course_name} {showMiniCard ? '▲' : '▼'}
          </div>
        </button>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', minWidth: '44px', textAlign: 'right' }}>
          {currentHole}/{totalHoles}
        </div>
      </header>

      {/* ── Mini scorecard (collapsible) ── */}
      {showMiniCard && (
        <div style={{
          background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)',
          padding: '10px 8px', overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          <div style={{ display: 'flex', gap: '2px', minWidth: 'max-content', justifyContent: 'center' }}>
            {Array.from({ length: totalHoles }, (_, i) => i + 1).map(h => {
              const s = scores[activeJugadorId]?.[h]
              const p = parMap[h] ?? 4
              const isActive = h === currentHole
              const diff = s != null ? s - p : null

              let bg = 'rgba(255,255,255,0.04)'
              let color = 'rgba(255,255,255,0.2)'
              if (isActive) { bg = 'rgba(196,153,42,0.2)'; color = '#C4992A' }
              else if (diff != null) {
                if (diff <= -2) { bg = 'rgba(59,130,246,0.15)'; color = '#93C5FD' }
                else if (diff === -1) { bg = 'rgba(34,197,94,0.15)'; color = '#6EE7B7' }
                else if (diff === 0) { bg = 'rgba(255,255,255,0.08)'; color = 'rgba(255,255,255,0.6)' }
                else if (diff === 1) { bg = 'rgba(196,153,42,0.15)'; color = '#FCD34D' }
                else { bg = 'rgba(220,38,38,0.15)'; color = '#FCA5A5' }
              }

              return (
                <button key={h} onClick={() => { setCurrentHole(h); setShowMiniCard(false) }} style={{
                  width: '28px', height: '36px', borderRadius: '6px',
                  background: bg, border: isActive ? '1px solid #C4992A' : '1px solid transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, padding: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}>
                  <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>{h}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color, lineHeight: 1.2 }}>
                    {s ?? '·'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Player tabs (multi-player only) ── */}
      {jugadores.length > 1 && (
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.06)', WebkitOverflowScrolling: 'touch' }}>
          {jugadores.map(j => {
            const active = j.id === activeJugadorId
            return (
              <button key={j.id} onClick={() => setActiveJugadorId(j.id)} style={{
                padding: '0 16px', height: '40px', border: 'none',
                borderBottom: active ? '2px solid #C4992A' : '2px solid transparent',
                background: 'transparent', color: active ? '#C4992A' : 'rgba(255,255,255,0.35)',
                fontWeight: active ? 600 : 400, fontSize: '13px',
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, minHeight: 0, minWidth: 0,
              }}>{j.nombre}</button>
            )
          })}
        </div>
      )}

      {/* ── Player band ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', background: 'rgba(196,153,42,0.07)',
        borderBottom: '1px solid rgba(196,153,42,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: '#C4992A', color: '#070D18',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700, flexShrink: 0,
          }}>{activePlayer?.nombre?.charAt(0).toUpperCase()}</div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#EDE9E4' }}>{activePlayer?.nombre}</span>
        </div>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
          {holesPlayed > 0 ? <>Total: <span style={{ color: '#EDE9E4', fontWeight: 600 }}>{totalOverUnder > 0 ? `+${totalOverUnder}` : totalOverUnder === 0 ? 'E' : totalOverUnder}</span></> : `${holesPlayed}/${totalHoles}`}
        </span>
      </div>

      {/* ── Central area (swipeable) ── */}
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 20px 8px' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Par + SI badges */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <span style={{ padding: '4px 14px', borderRadius: '20px', fontSize: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
            Par {par}
          </span>
          <span style={{ padding: '4px 14px', borderRadius: '20px', fontSize: '12px', background: 'rgba(196,153,42,0.1)', border: '1px solid rgba(196,153,42,0.2)', color: '#C4992A' }}>
            SI {holeData.stroke_index}
          </span>
        </div>

        {/* Score number */}
        <div
          className={scoreAnimating ? 'score-animating' : ''}
          style={{
            fontSize: '96px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
            lineHeight: 1, color: '#FFFFFF', letterSpacing: '-3px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >{score ?? '—'}</div>

        {/* Chip */}
        {score != null && (
          <div style={{
            marginTop: '12px', padding: '5px 18px', borderRadius: '20px',
            fontSize: '13px', fontWeight: 500, letterSpacing: '0.01em',
            ...getChipStyle(score, par),
          }}>{getChipLabel(score, par)}</div>
        )}
      </div>

      {/* ── +/- Buttons ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '40px', padding: '8px 20px 16px' }}>
        <button
          className="ctrl-btn"
          onTouchStart={() => {}}
          onClick={() => handleScoreChange(currentHole, (score ?? par) - 1)}
          disabled={score != null && score <= 1}
          style={{
            width: '72px', height: '72px', borderRadius: '20px',
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
          onClick={() => handleScoreChange(currentHole, (score ?? par - 1) + 1)}
          disabled={score != null && score >= 12}
          style={{
            width: '72px', height: '72px', borderRadius: '20px',
            fontSize: '32px', fontWeight: 600,
            background: '#C4992A', color: '#070D18', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            userSelect: 'none', transition: 'transform 0.08s ease-out',
            opacity: score != null && score >= 12 ? 0.3 : 1,
            minHeight: 0, minWidth: 0,
          }}
        >+</button>
      </div>

      {/* ── Progress dots (enlarged for outdoor visibility) ── */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', padding: '6px 12px 12px', flexWrap: 'wrap' }}>
        {Array.from({ length: totalHoles }, (_, i) => i + 1).map(h => {
          const s = scores[activeJugadorId]?.[h]
          const p = parMap[h] ?? 4
          const isActive = h === currentHole
          const isDone = s != null

          let bg = 'rgba(255,255,255,0.12)'
          let size = '14px'
          let border = '1.5px solid rgba(255,255,255,0.2)'
          let shadow = 'none'

          if (isActive) { bg = '#C4992A'; size = '18px'; border = 'none'; shadow = '0 0 8px rgba(196,153,42,0.4)' }
          else if (isDone) {
            const d = s - p
            if (d <= -2) bg = '#60A5FA'
            else if (d === -1) bg = '#4ADE80'
            else if (d === 0) bg = '#A1A1AA'
            else if (d === 1) bg = '#FBBF24'
            else bg = '#F87171'
            border = 'none'
          }

          return (
            <div key={h} onClick={() => setCurrentHole(h)} style={{
              width: size, height: size, borderRadius: '50%',
              background: bg, border, cursor: 'pointer', boxShadow: shadow,
              transition: 'all 0.18s ease', flexShrink: 0,
            }} />
          )
        })}
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: '0 16px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          onTouchStart={() => {}}
          onClick={isLastHole ? finalizeRound : goToNextHole}
          style={{
            width: '100%', padding: '16px', background: '#C4992A', color: '#070D18',
            border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: 600,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation', letterSpacing: '0.01em',
          }}
        >{isLastHole ? 'Finalizar ronda ✓' : 'Hoyo siguiente →'}</button>

        {currentHole > 1 && (
          <button
            onTouchStart={() => {}}
            onClick={goToPrevHole}
            style={{
              width: '100%', padding: '12px', background: 'transparent',
              color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '14px', fontSize: '14px', fontWeight: 400,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >← Hoyo anterior</button>
        )}
      </div>

      {/* ── tAIger banners ── */}
      {taigerStatus === 'analyzing' && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90, background: 'rgba(14,28,47,0.97)', borderTop: '1px solid rgba(196,153,42,0.3)', padding: '20px 16px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', textAlign: 'center' }}>
          <div style={{ color: '#c4992a', fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>tAIger+ está analizando tu ronda...</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Esto toma unos segundos</div>
        </div>
      )}
      {taigerStatus === 'ready' && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90, background: 'rgba(14,28,47,0.97)', borderTop: '1px solid rgba(196,153,42,0.3)', padding: '20px 16px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', textAlign: 'center' }}>
          <div style={{ color: '#c4992a', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Tu análisis está listo</div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link href={taigerSessionId ? `/coach/sesion/${taigerSessionId}` : '/coach'} style={{ background: '#c4992a', color: '#070d18', padding: '12px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '15px', textDecoration: 'none' }}>Ver análisis →</Link>
            <Link href={`/ronda-libre/${codigo}`} style={{ background: 'transparent', border: '1px solid rgba(196,153,42,0.3)', color: '#c4992a', padding: '12px 24px', borderRadius: '10px', fontWeight: 600, fontSize: '15px', textDecoration: 'none' }}>Ver scorecard</Link>
          </div>
        </div>
      )}
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
