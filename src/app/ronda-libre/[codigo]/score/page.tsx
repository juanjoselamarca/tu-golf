'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { QRCodeSVG } from 'qrcode.react'
import { getScoreColor, getScoreLabel, formatOverUnder } from '@/constants/golf'
import {
  strokesRecibidosEnHoyo,
  puntosStablefordHoyo,
  labelResultado,
} from '@/lib/scoring'
import type { ModoJuego } from '@/lib/scoring'

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface Jugador {
  id:      string
  nombre:  string
  user_id: string | null
  scores:  Record<string, number>
}

interface RondaLibre {
  id:                     string
  codigo:                 string
  course_name:            string
  course_id:              string | null
  tees:                   string
  holes:                  number
  fecha:                  string
  estado:                 string
  modo_juego:             ModoJuego
  ronda_libre_jugadores:  Jugador[]
}

interface HoleData {
  numero:       number
  par:          number
  stroke_index: number
}

/* ── LS backup ─────────────────────────────────────────────────────────────── */
function lsKey(codigo: string, jugadorId: string) {
  return `ronda_${codigo}_${jugadorId}`
}
function lsSave(codigo: string, jugadorId: string, scores: Record<number, number>) {
  try { localStorage.setItem(lsKey(codigo, jugadorId), JSON.stringify(scores)) } catch {}
}
function lsLoad(codigo: string, jugadorId: string): Record<number, number> {
  try { return JSON.parse(localStorage.getItem(lsKey(codigo, jugadorId)) ?? '{}') } catch { return {} }
}

/* ── Haptic helper ─────────────────────────────────────────────────────────── */
function haptic(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern)
  }
}

/* ── Quick-pick chips ──────────────────────────────────────────────────────── */
function quickScores(par: number): { label: string; value: number }[] {
  const chips = []
  if (par >= 3) chips.push({ label: 'Eagle', value: par - 2 })
  chips.push({ label: 'Birdie', value: par - 1 })
  chips.push({ label: 'Par',    value: par })
  chips.push({ label: 'Bogey',  value: par + 1 })
  chips.push({ label: '+2',     value: par + 2 })
  chips.push({ label: '+3',     value: par + 3 })
  return chips.filter((c) => c.value >= 1)
}

/* ── Stableford helpers ─────────────────────────────────────────────────────── */
function stablefordColor(pts: number): string {
  if (pts >= 4) return '#60a5fa'  // blue  — eagle neto
  if (pts === 3) return '#4ade80' // green — birdie neto
  if (pts === 2) return '#94a3b8' // gray  — par neto
  if (pts === 1) return '#c4992a' // gold  — bogey neto
  return '#ef4444'                // red   — 0 pts
}

function stablefordChips(par: number, strokesRec: number): { label: string; value: number; pts: number; color: string }[] {
  const base = par + strokesRec
  return [
    { label: '4 pts', value: Math.max(1, base - 2), pts: 4, color: '#60a5fa' },
    { label: '3 pts', value: Math.max(1, base - 1), pts: 3, color: '#4ade80' },
    { label: '2 pts', value: base,                  pts: 2, color: '#94a3b8' },
    { label: '1 pt',  value: base + 1,               pts: 1, color: '#c4992a' },
    { label: '0 pts', value: base + 2,               pts: 0, color: '#ef4444' },
  ]
}

/* ── Main component ────────────────────────────────────────────────────────── */
function ScorePageContent() {
  const params       = useParams()
  const searchParams = useSearchParams()
  const router       = useRouter()
  const codigo       = params.codigo as string
  const jugadorParam = searchParams.get('j')

  const [ronda,            setRonda]            = useState<RondaLibre | null>(null)
  const [loading,          setLoading]          = useState(true)
  const [activeJugadorId,  setActiveJugadorId]  = useState<string | null>(null)
  const [currentHole,      setCurrentHole]      = useState(1)
  const [scores,           setScores]           = useState<Record<string, Record<number, number>>>({})
  const [parMap,           setParMap]           = useState<Record<number, number>>({})
  const [holeDataMap,      setHoleDataMap]      = useState<Record<number, HoleData>>({})
  const [playerHcp,        setPlayerHcp]        = useState<Record<string, number>>({})

  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [saveError,    setSaveError]    = useState(false)
  const [isOnline,     setIsOnline]     = useState(true)
  const [hasUnsaved,   setHasUnsaved]   = useState(false)
  const [showQR,       setShowQR]       = useState(false)
  const [scoreAnimKey, setScoreAnimKey] = useState(0)

  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const touchStartX   = useRef(0)
  const touchStartY   = useRef(0)
  const holdTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ── Online/offline ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const up   = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online',  up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  /* ── Prevent accidental navigation ──────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) { e.preventDefault(); e.returnValue = '¿Seguro? Tienes scores sin guardar.' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsaved])

  /* ── Load ronda ──────────────────────────────────────────────────────────── */
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

      // Build initial scores (DB + localStorage backup)
      const initialScores: Record<string, Record<number, number>> = {}
      for (const j of r.ronda_libre_jugadores) {
        const dbScores: Record<number, number> = {}
        if (j.scores) {
          for (const [k, v] of Object.entries(j.scores)) dbScores[parseInt(k)] = v as number
        }
        const ls = lsLoad(codigo, j.id)
        initialScores[j.id] = { ...ls, ...dbScores }
      }
      setScores(initialScores)

      // Default par = 4 for all holes
      const pm: Record<number, number> = {}
      const hdm: Record<number, HoleData> = {}
      for (let i = 1; i <= r.holes; i++) {
        pm[i] = 4
        hdm[i] = { numero: i, par: 4, stroke_index: i }
      }
      setParMap(pm)

      // Fetch course holes if linked
      if (r.course_id) {
        const { data: holes } = await supabase
          .from('course_holes')
          .select('numero, par, stroke_index')
          .eq('course_id', r.course_id)
          .order('numero')
        if (holes && holes.length > 0) {
          const pm2: Record<number, number> = {}
          const hdm2: Record<number, HoleData> = {}
          for (const h of holes as HoleData[]) {
            pm2[h.numero]  = h.par
            hdm2[h.numero] = h
          }
          setParMap(pm2)
          setHoleDataMap(hdm2)
        } else {
          console.warn(`[Score] course_id=${r.course_id} no tiene course_holes en BD — usando par 4 como fallback`)
          setHoleDataMap(hdm)
        }
      } else {
        console.warn('[Score] course_id es null — usando par 4 como fallback para todos los hoyos')
        setHoleDataMap(hdm)
      }

      // Fetch handicaps for linked players
      const hcpMap: Record<string, number> = {}
      for (const j of r.ronda_libre_jugadores) {
        if (j.user_id) {
          const { data: prof } = await supabase.from('profiles').select('indice').eq('id', j.user_id).single()
          hcpMap[j.id] = prof?.indice ?? 18
        } else {
          hcpMap[j.id] = 18
        }
      }
      setPlayerHcp(hcpMap)

      // Pre-select player from URL param or first
      const preselect = jugadorParam
        ? r.ronda_libre_jugadores.find((j) => j.id === jugadorParam)?.id ?? r.ronda_libre_jugadores[0]?.id
        : r.ronda_libre_jugadores[0]?.id
      setActiveJugadorId(preselect ?? null)

      // Jump to first unfilled hole for the preselected player
      if (preselect) {
        const existing = initialScores[preselect] ?? {}
        for (let h = 1; h <= r.holes; h++) {
          if (existing[h] == null) { setCurrentHole(h); break }
        }
      }

      setLoading(false)
    }
    load()
  }, [codigo, jugadorParam, router])

  /* ── Save ────────────────────────────────────────────────────────────────── */
  const saveScores = useCallback(async (jugadorId: string, holeScores: Record<number, number>) => {
    setSaving(true)
    setSaveError(false)
    lsSave(codigo, jugadorId, holeScores)  // always save locally first

    if (!isOnline) { setSaving(false); return }

    const scoresObj: Record<string, number> = {}
    for (const [k, v] of Object.entries(holeScores)) scoresObj[k] = v

    let success = false
    while (!success && retryCountRef.current < 3) {
      const supabase = createClient()
      const { error } = await supabase
        .from('ronda_libre_jugadores')
        .update({ scores: scoresObj })
        .eq('id', jugadorId)

      if (!error) { success = true; retryCountRef.current = 0 }
      else        { retryCountRef.current++ }
    }

    if (!success) setSaveError(true)
    setSaving(false)
    setSaved(true)
    setHasUnsaved(false)
    setTimeout(() => setSaved(false), 2000)
  }, [codigo, isOnline])

  const handleScoreChange = useCallback((hole: number, value: number) => {
    if (!activeJugadorId) return
    const clamped = Math.max(1, Math.min(12, value))

    // M11: light haptic on every tap
    haptic(10)

    setScores((prev) => {
      const next = { ...prev, [activeJugadorId]: { ...(prev[activeJugadorId] ?? {}), [hole]: clamped } }
      setHasUnsaved(true)
      setScoreAnimKey((k) => k + 1)  // trigger score pop animation
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => saveScores(activeJugadorId, next[activeJugadorId]), 600)

      // M11: success haptic for birdie or better
      const holePar = next[activeJugadorId] ? (parMap[hole] ?? 4) : 4
      if (clamped - holePar <= -1) haptic([15, 30, 15])

      return next
    })
    setSaved(false)
  }, [activeJugadorId, saveScores, parMap])

  /* ── Hold to increment ───────────────────────────────────────────────────── */
  const startHold = (direction: 1 | -1) => {
    holdTimerRef.current = setInterval(() => {
      if (!activeJugadorId) return
      setScores((prev) => {
        const cur     = prev[activeJugadorId]?.[currentHole] ?? (parMap[currentHole] ?? 4)
        const clamped = Math.max(1, Math.min(12, cur + direction))
        const next    = { ...prev, [activeJugadorId]: { ...(prev[activeJugadorId] ?? {}), [currentHole]: clamped } }
        setHasUnsaved(true)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => saveScores(activeJugadorId, next[activeJugadorId]), 600)
        return next
      })
    }, 400)
  }
  const stopHold = () => {
    if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null }
  }

  /* ── Swipe ───────────────────────────────────────────────────────────────── */
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  const handleTouchEnd = (e: React.TouchEvent, maxHoles: number) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current)
    if (Math.abs(dx) > 60 && dy < 100) {
      if (dx < 0 && currentHole < maxHoles) setCurrentHole((h) => h + 1)
      if (dx > 0 && currentHole > 1)       setCurrentHole((h) => h - 1)
    }
  }

  /* ── Go next / finalize ──────────────────────────────────────────────────── */
  const handleNext = async () => {
    if (!ronda || !activeJugadorId) return
    // M11: medium haptic on hole change
    haptic(30)
    // Force-save current state
    if (debounceRef.current) clearTimeout(debounceRef.current)
    await saveScores(activeJugadorId, scores[activeJugadorId] ?? {})

    if (currentHole < ronda.holes) {
      setCurrentHole((h) => h + 1)
    } else {
      // Finalize: redirect to spectator view
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      await trackEvent(supabase, authUser?.id ?? null, 'ronda_completada', { codigo })
      setHasUnsaved(false)
      router.push(`/ronda-libre/${codigo}`)
    }
  }

  const handlePrev = () => {
    if (currentHole > 1) setCurrentHole((h) => h - 1)
  }

  /* ── Render ──────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ background: '#070d18', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a8fa8' }}>
        Cargando ronda...
      </div>
    )
  }
  if (!ronda || !activeJugadorId) return null

  const jugadores    = ronda.ronda_libre_jugadores
  const holes        = ronda.holes
  const modo         = ronda.modo_juego
  const par          = parMap[currentHole] ?? 4
  const score        = scores[activeJugadorId]?.[currentHole]
  const diff         = score !== undefined ? score - par : undefined

  // Mode-aware scoring
  const holeData        = holeDataMap[currentHole] ?? { numero: currentHole, par, stroke_index: currentHole }
  const hcp             = playerHcp[activeJugadorId] ?? 18
  const strokesRec      = strokesRecibidosEnHoyo(hcp, holeData.stroke_index)
  const netoScore       = score !== undefined ? score - strokesRec : undefined
  const netoOverUnder   = netoScore !== undefined ? netoScore - par : undefined
  const stablefordPts   = score !== undefined ? puntosStablefordHoyo(score, par, hcp, holeData.stroke_index) : undefined

  const scoreCol = modo === 'stableford' && stablefordPts !== undefined
    ? stablefordColor(stablefordPts)
    : modo === 'neto' && netoOverUnder !== undefined
    ? getScoreColor(netoScore!, par)
    : diff !== undefined ? getScoreColor(score!, par) : '#edeae4'

  const label = modo === 'stableford' && stablefordPts !== undefined
    ? `${stablefordPts} PTS`
    : modo === 'neto' && netoOverUnder !== undefined
    ? getScoreLabel(netoScore!, par)
    : diff !== undefined ? getScoreLabel(score!, par) : ''

  const chips        = quickScores(par)
  const sfChips      = stablefordChips(par, strokesRec)

  const qrUrl        = typeof window !== 'undefined'
    ? `${window.location.origin}/ronda-libre/${codigo}`
    : `https://tu-golf.vercel.app/ronda-libre/${codigo}`

  const fechaDisplay = ronda.fecha
    ? new Date(ronda.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

  // Totals for active player
  let outGross = 0, outPar = 0, inGross = 0, inPar = 0, totalGross = 0, totalParPlayed = 0
  let totalNeto = 0, totalStableford = 0
  for (let h = 1; h <= holes; h++) {
    const s  = scores[activeJugadorId]?.[h]
    const p  = parMap[h] ?? 4
    const hd2 = holeDataMap[h] ?? { numero: h, par: p, stroke_index: h }
    if (s != null) {
      totalGross     += s
      totalParPlayed += p
      const sr  = strokesRecibidosEnHoyo(playerHcp[activeJugadorId] ?? 18, hd2.stroke_index)
      totalNeto      += (s - sr) - p
      totalStableford += puntosStablefordHoyo(s, p, playerHcp[activeJugadorId] ?? 18, hd2.stroke_index)
      if (h <= 9)  { outGross += s; outPar += p }
      else         { inGross  += s; inPar  += p }
    }
  }
  const holesPlayed = Object.keys(scores[activeJugadorId] ?? {}).length
  const activePlayer = jugadores.find((player) => player.id === activeJugadorId) ?? null

  return (
    <div
      style={{ background: '#070d18', minHeight: '100dvh', display: 'flex', flexDirection: 'column', userSelect: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={(e) => handleTouchEnd(e, holes)}
    >
      {/* ── Offline banner ─────────────────────────────────────────────────── */}
      {!isOnline && (
        <div style={{ background: '#92400e', color: '#fef3c7', textAlign: 'center', padding: '8px', fontSize: '13px', fontWeight: 600 }}>
          📵 Sin conexión — scores guardados localmente
        </div>
      )}

      {/* ── Save indicator (top right) ─────────────────────────────────────── */}
      <div style={{ position: 'fixed', top: '10px', right: '12px', zIndex: 60, fontSize: '12px', transition: 'opacity 0.3s', opacity: saving || saved || saveError ? 1 : 0 }}>
        {saving    && <span style={{ color: '#7a8fa8' }}>● guardando</span>}
        {saved     && <span style={{ color: '#22c55e' }}>✓ guardado</span>}
        {saveError && <span style={{ color: '#dc2626' }}>✗ error al guardar</span>}
      </div>

      {/* ── Fixed Header ───────────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '12px 16px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href={`/ronda-libre/${codigo}`} style={{ color: '#7a8fa8', fontSize: '13px', textDecoration: 'none' }}>
            ← Volver
          </Link>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '14px', color: '#edeae4', fontWeight: 600 }}>
              {ronda.course_name}
            </div>
            <div style={{ fontSize: '11px', color: '#7a8fa8' }}>
              {fechaDisplay} · <span style={{ fontFamily: 'monospace', color: '#c4992a' }}>{codigo}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <Link
              href={`/ronda-libre/${codigo}`}
              style={{ background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.3)', color: '#c4992a', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', textDecoration: 'none' }}
            >
              👁 Ver
            </Link>
            <button
              onClick={() => setShowQR(true)}
              style={{ background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.3)', color: '#c4992a', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
            >
              QR
            </button>
          </div>
        </div>
      </div>

      {/* ── Player tabs — M3: 52px height, 16px font, scroll horizontal ──── */}
      {jugadores.length > 1 && (
        <div style={{ background: '#0e1c2f', borderBottom: '1px solid rgba(196,153,42,0.1)' }}>
          <div className="scroll-container" style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {jugadores.map((j) => {
              const active = j.id === activeJugadorId
              const filled = scores[j.id]?.[currentHole] != null
              return (
                <button
                  key={j.id}
                  onClick={() => setActiveJugadorId(j.id)}
                  style={{
                    padding: '0 20px', height: '52px', border: 'none',
                    borderBottom: active ? '3px solid #c4992a' : '3px solid transparent',
                    background: 'transparent',
                    color: active ? '#c4992a' : '#7a8fa8',
                    fontWeight: active ? 700 : 400,
                    fontSize: '16px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    minHeight: 0, minWidth: 0,
                  }}
                >
                  {j.nombre} {filled ? '✓' : ''}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, maxWidth: '480px', margin: '0 auto', width: '100%', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(23,49,41,0.95) 0%, rgba(14,28,47,0.92) 100%)',
            border: '1px solid rgba(196,153,42,0.16)',
            borderRadius: '14px',
            padding: '14px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#7a8fa8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Jugador activo</div>
              <div style={{ fontSize: '18px', color: '#edeae4', fontWeight: 700 }}>{activePlayer?.nombre ?? 'Jugador'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#7a8fa8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Progreso</div>
              <div style={{ fontSize: '18px', color: '#c4992a', fontWeight: 700 }}>{holesPlayed}/{holes}</div>
            </div>
          </div>
        </div>

        {/* Hole number — M3 */}
        <div style={{ textAlign: 'center' }}>
          <div className="hole-number" style={{ fontFamily: '"Playfair Display", serif', fontSize: '6rem', color: '#c4992a', lineHeight: 1, fontWeight: 900 }}>
            {currentHole}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '18px', color: '#7a8fa8', marginTop: '6px' }}>
            <span>PAR {par}</span>
            <span>·</span>
            <span>SI {holeData.stroke_index}</span>
            {modo !== 'gross' && strokesRec > 0 && (
              <span style={{ fontSize: '14px', color: '#c4992a' }}>{'•'.repeat(strokesRec)}</span>
            )}
          </div>
        </div>

        {/* Result label */}
        <div style={{ textAlign: 'center', minHeight: '32px' }}>
          {diff !== undefined && (
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: scoreCol, letterSpacing: '0.08em' }}>
              {label}
            </span>
          )}
        </div>

        {/* Score controls — M3: 72px buttons, gold+ / red- */}
        <div className="score-controls-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '32px' }}>
          {/* Minus */}
          <button
            onClick={() => handleScoreChange(currentHole, (score ?? par) - 1)}
            onMouseDown={() => startHold(-1)}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
            onTouchStart={(e) => { e.stopPropagation(); startHold(-1) }}
            onTouchEnd={(e) => { e.stopPropagation(); stopHold() }}
            disabled={score !== undefined && score <= 1}
            style={{
              width: '72px', height: '72px', borderRadius: '50%',
              border: '2px solid rgba(220,38,38,0.5)',
              background: 'rgba(220,38,38,0.12)',
              color: '#f87171', fontSize: '2.2rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: score !== undefined && score <= 1 ? 0.3 : 1,
              transition: 'all 0.1s',
              WebkitTapHighlightColor: 'transparent',
              minHeight: 0, minWidth: 0,
            }}
          >
            −
          </button>

          {/* Score display — M3: 80px font, pop animation */}
          <div className="score-display" style={{ textAlign: 'center', minWidth: '90px' }}>
            <div
              key={scoreAnimKey}
              className="score-pop"
              style={{ fontSize: '5rem', fontWeight: 900, color: scoreCol, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
            >
              {score ?? '—'}
            </div>
            {/* Neto sub-label */}
            {modo === 'neto' && score !== undefined && netoScore !== undefined && (
              <div style={{ fontSize: '13px', color: '#c4992a', marginTop: '4px' }}>
                Neto: {netoScore} {netoOverUnder !== undefined ? `(${netoOverUnder >= 0 ? '+' : ''}${netoOverUnder === 0 ? 'E' : netoOverUnder})` : ''}
              </div>
            )}
            {/* Stableford PTS sub-label */}
            {modo === 'stableford' && score !== undefined && stablefordPts !== undefined && (
              <div style={{ fontSize: '13px', color: stablefordColor(stablefordPts), marginTop: '4px', fontWeight: 700 }}>
                {stablefordPts} {stablefordPts === 1 ? 'punto' : 'puntos'}
              </div>
            )}
          </div>

          {/* Plus */}
          <button
            onClick={() => handleScoreChange(currentHole, (score ?? par - 1) + 1)}
            onMouseDown={() => startHold(1)}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
            onTouchStart={(e) => { e.stopPropagation(); startHold(1) }}
            onTouchEnd={(e) => { e.stopPropagation(); stopHold() }}
            disabled={score !== undefined && score >= 12}
            style={{
              width: '72px', height: '72px', borderRadius: '50%',
              border: '2px solid rgba(196,153,42,0.6)',
              background: 'rgba(196,153,42,0.15)',
              color: '#c4992a', fontSize: '2.2rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: score !== undefined && score >= 12 ? 0.3 : 1,
              transition: 'all 0.1s',
              WebkitTapHighlightColor: 'transparent',
              minHeight: 0, minWidth: 0,
            }}
          >
            +
          </button>
        </div>

        {/* Quick-pick chips — M3: 44px height, 16px font, scroll horizontal */}
        <div className="scroll-container" style={{ overflowX: 'auto', display: 'flex', gap: '10px', padding: '4px 2px', WebkitOverflowScrolling: 'touch' }}>
          {modo === 'stableford'
            ? sfChips.map((c) => {
                const isActive = score === c.value
                return (
                  <button
                    key={c.label}
                    onClick={() => handleScoreChange(currentHole, c.value)}
                    style={{
                      flexShrink: 0, minHeight: '44px',
                      padding: '10px 16px', borderRadius: '24px',
                      border: `1px solid ${isActive ? c.color : 'rgba(122,143,168,0.25)'}`,
                      background: isActive ? `${c.color}22` : 'transparent',
                      color: isActive ? c.color : '#7a8fa8',
                      fontWeight: isActive ? 700 : 500,
                      fontSize: '14px', cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                      transition: 'all 0.15s', minWidth: 0,
                    }}
                  >
                    {c.label}
                    <span style={{ marginLeft: '5px', fontSize: '11px', opacity: 0.7 }}>({c.value})</span>
                  </button>
                )
              })
            : chips.map((c) => {
                const isActive = score === c.value
                const cDiff    = c.value - par
                const cColor   = getScoreColor(c.value, par)
                return (
                  <button
                    key={c.label}
                    onClick={() => handleScoreChange(currentHole, c.value)}
                    style={{
                      flexShrink: 0, minHeight: '44px',
                      padding: '10px 20px', borderRadius: '24px',
                      border: `1px solid ${isActive ? cColor : 'rgba(122,143,168,0.25)'}`,
                      background: isActive ? `${cColor}22` : 'transparent',
                      color: isActive ? cColor : '#7a8fa8',
                      fontWeight: isActive ? 700 : 500,
                      fontSize: '15px', cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                      transition: 'all 0.15s', minWidth: 0,
                    }}
                  >
                    {c.label}
                    <span style={{ marginLeft: '5px', fontSize: '12px', opacity: 0.7 }}>
                      ({cDiff >= 0 ? '+' : ''}{cDiff === 0 ? 'E' : cDiff})
                    </span>
                  </button>
                )
              })
          }
        </div>

        {/* Progress mini-grid */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ display: 'flex', gap: '4px', minWidth: 'max-content', padding: '4px 2px' }}>
            {Array.from({ length: holes }, (_, i) => i + 1).map((h) => {
              const s    = scores[activeJugadorId]?.[h]
              const p    = parMap[h] ?? 4
              const d    = s !== undefined ? s - p : null
              const isCurrent = h === currentHole
              const hd   = holeDataMap[h] ?? { numero: h, par: p, stroke_index: h }

              let cellColor = '#3a4a5a'
              let displayVal: string | number = '·'

              if (s != null) {
                if (modo === 'stableford') {
                  const pts = puntosStablefordHoyo(s, p, hcp, hd.stroke_index)
                  cellColor = stablefordColor(pts)
                  displayVal = pts
                } else if (modo === 'neto') {
                  const sr  = strokesRecibidosEnHoyo(hcp, hd.stroke_index)
                  const nOu = (s - sr) - p
                  cellColor = getScoreColor(s - sr, p)
                  displayVal = nOu === 0 ? 'E' : nOu > 0 ? `+${nOu}` : nOu
                } else {
                  cellColor = getScoreColor(s, p)
                  displayVal = d === 0 ? 'E' : d! > 0 ? `+${d}` : d!
                }
              }

              const bg     = s != null ? `${cellColor}22` : 'rgba(122,143,168,0.1)'
              const border = s != null ? `1px solid ${cellColor}55` : '1px solid rgba(122,143,168,0.2)'

              return (
                <button
                  key={h}
                  onClick={() => setCurrentHole(h)}
                  style={{
                    width: '28px', height: '36px', borderRadius: '6px',
                    background: isCurrent ? 'rgba(196,153,42,0.2)' : bg,
                    border: isCurrent ? '2px solid #c4992a' : border,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px',
                    cursor: 'pointer', padding: 0,
                    animation: isCurrent ? 'pulse-border 1.5s ease-in-out infinite' : 'none',
                  }}
                >
                  <span style={{ fontSize: '9px', color: isCurrent ? '#c4992a' : '#7a8fa8', lineHeight: 1 }}>{h}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: isCurrent ? '#c4992a' : cellColor, lineHeight: 1 }}>
                    {displayVal}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Running totals */}
        {holesPlayed > 0 && (
          <div style={{ background: '#0e1c2f', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-around', border: '1px solid rgba(196,153,42,0.1)' }}>
            {modo !== 'stableford' && holes === 18 && outGross > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#7a8fa8', marginBottom: '2px' }}>Out</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#edeae4' }}>{outGross}</div>
                <div style={{ fontSize: '11px', color: getScoreColor(outGross, outPar) }}>{formatOverUnder(outGross - outPar)}</div>
              </div>
            )}
            {modo !== 'stableford' && holes === 18 && inGross > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#7a8fa8', marginBottom: '2px' }}>In</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#edeae4' }}>{inGross}</div>
                <div style={{ fontSize: '11px', color: getScoreColor(inGross, inPar) }}>{formatOverUnder(inGross - inPar)}</div>
              </div>
            )}
            {/* Gross total always visible */}
            {modo !== 'stableford' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#7a8fa8', marginBottom: '2px' }}>Total ({holesPlayed}/{holes})</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#edeae4' }}>{totalGross}</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: getScoreColor(totalGross, totalParPlayed) }}>{formatOverUnder(totalGross - totalParPlayed)}</div>
              </div>
            )}
            {/* Neto total */}
            {modo === 'neto' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#c4992a', marginBottom: '2px' }}>Neto</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#c4992a' }}>{formatOverUnder(totalNeto)}</div>
              </div>
            )}
            {/* Stableford total */}
            {modo === 'stableford' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#7a8fa8', marginBottom: '2px' }}>Gross</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#edeae4' }}>{totalGross}</div>
              </div>
            )}
            {modo === 'stableford' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#c4992a', marginBottom: '2px' }}>Stableford</div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: totalStableford >= holesPlayed * 2 ? '#4ade80' : '#c4992a' }}>{totalStableford} pts</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Siguiente / Finalizar button — M3: 64px, safe-area ─────────────── */}
      <div style={{ position: 'sticky', bottom: 0, padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', background: 'rgba(7,13,24,0.97)', borderTop: '1px solid rgba(196,153,42,0.1)' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          {currentHole > 1 && (
            <button
              onClick={handlePrev}
              disabled={saving}
              style={{
                width: '100%',
                height: '46px',
                background: 'rgba(196,153,42,0.08)',
                color: '#c4992a',
                fontWeight: 700,
                fontSize: '14px',
                borderRadius: '12px',
                border: '1px solid rgba(196,153,42,0.24)',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                marginBottom: '8px',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              ← Volver al hoyo anterior
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={saving}
            style={{
              width: '100%', height: '64px',
              background: '#c4992a', color: '#070d18',
              fontWeight: 700, fontSize: '20px',
              borderRadius: '12px', border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              transition: 'opacity 0.15s',
              WebkitTapHighlightColor: 'transparent',
              minHeight: 0,
            }}
          >
            {saving ? 'Guardando...' : currentHole < (ronda?.holes ?? 18) ? `Hoyo siguiente →` : '✓ Finalizar ronda'}
          </button>
          <p style={{ textAlign: 'center', fontSize: '11px', color: '#3a4a5a', marginTop: '6px' }}>
            ← desliza para cambiar hoyo →
          </p>
        </div>
      </div>

      {/* ── QR Modal ─────────────────────────────────────────────────────────── */}
      {showQR && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setShowQR(false)}
        >
          <div style={{ background: '#0e1c2f', borderRadius: '16px', padding: '32px', textAlign: 'center', border: '1px solid rgba(196,153,42,0.3)', maxWidth: '320px', width: '100%' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', display: 'inline-block', marginBottom: '16px' }}>
              <QRCodeSVG value={qrUrl} size={200} />
            </div>
            <p style={{ color: '#edeae4', fontSize: '14px', margin: '0 0 6px' }}>Escanea para unirte</p>
            <p style={{ color: '#7a8fa8', fontSize: '12px', marginBottom: '16px', wordBreak: 'break-all' }}>{qrUrl}</p>
            <button onClick={() => setShowQR(false)}
              style={{ background: '#c4992a', color: '#070d18', border: 'none', borderRadius: '8px', padding: '10px 28px', fontWeight: 700, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ScorePage() {
  return (
    <Suspense fallback={<div style={{ background: '#070d18', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a8fa8' }}>Cargando...</div>}>
      <ScorePageContent />
    </Suspense>
  )
}
