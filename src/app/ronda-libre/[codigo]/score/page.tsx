'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import { getScoreColor, getScoreLabel, formatOverUnder } from '@/constants/golf'

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
  tees:                   string
  holes:                  number
  fecha:                  string
  estado:                 string
  ronda_libre_jugadores:  Jugador[]
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

  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [isOnline,  setIsOnline]  = useState(true)
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [showQR,    setShowQR]    = useState(false)

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
        .select('id, codigo, course_name, tees, holes, fecha, estado, ronda_libre_jugadores(id, nombre, user_id, scores)')
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
        // Merge localStorage backup (prefer DB scores)
        const ls = lsLoad(codigo, j.id)
        initialScores[j.id] = { ...ls, ...dbScores }
      }
      setScores(initialScores)

      // Default par = 4 for all holes
      const pm: Record<number, number> = {}
      for (let i = 1; i <= r.holes; i++) pm[i] = 4
      setParMap(pm)

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

    setScores((prev) => {
      const next = { ...prev, [activeJugadorId]: { ...(prev[activeJugadorId] ?? {}), [hole]: clamped } }
      setHasUnsaved(true)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => saveScores(activeJugadorId, next[activeJugadorId]), 600)
      return next
    })
    setSaved(false)
  }, [activeJugadorId, saveScores])

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
    // Force-save current state
    if (debounceRef.current) clearTimeout(debounceRef.current)
    await saveScores(activeJugadorId, scores[activeJugadorId] ?? {})

    if (currentHole < ronda.holes) {
      setCurrentHole((h) => h + 1)
    } else {
      // Finalize: redirect to spectator view
      setHasUnsaved(false)
      router.push(`/ronda-libre/${codigo}`)
    }
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
  const par          = parMap[currentHole] ?? 4
  const score        = scores[activeJugadorId]?.[currentHole]
  const diff         = score !== undefined ? score - par : undefined
  const scoreCol     = diff !== undefined ? getScoreColor(score!, par) : '#edeae4'
  const label        = diff !== undefined ? getScoreLabel(score!, par) : ''
  const chips        = quickScores(par)

  const qrUrl        = typeof window !== 'undefined'
    ? `${window.location.origin}/ronda-libre/${codigo}`
    : `https://tu-golf.vercel.app/ronda-libre/${codigo}`

  const fechaDisplay = ronda.fecha
    ? new Date(ronda.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

  // Totals for active player
  let outGross = 0, outPar = 0, inGross = 0, inPar = 0, totalGross = 0, totalParPlayed = 0
  for (let h = 1; h <= holes; h++) {
    const s = scores[activeJugadorId]?.[h]
    const p = parMap[h] ?? 4
    if (s != null) {
      totalGross += s; totalParPlayed += p
      if (h <= 9)  { outGross += s; outPar += p }
      else         { inGross  += s; inPar  += p }
    }
  }
  const holesPlayed = Object.keys(scores[activeJugadorId] ?? {}).length

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

      {/* ── Player tabs ────────────────────────────────────────────────────── */}
      {jugadores.length > 1 && (
        <div style={{ background: '#0e1c2f', borderBottom: '1px solid rgba(196,153,42,0.1)' }}>
          <div style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', overflowX: 'auto' }}>
            {jugadores.map((j) => {
              const active    = j.id === activeJugadorId
              const filled    = scores[j.id]?.[currentHole] != null
              return (
                <button
                  key={j.id}
                  onClick={() => setActiveJugadorId(j.id)}
                  style={{
                    padding: '10px 18px', border: 'none',
                    borderBottom: active ? '2px solid #c4992a' : '2px solid transparent',
                    background: 'transparent',
                    color: active ? '#c4992a' : '#7a8fa8',
                    fontWeight: active ? 700 : 400,
                    fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
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

        {/* Hole number */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '6rem', color: '#c4992a', lineHeight: 1, fontWeight: 900 }}>
            {currentHole}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '14px', color: '#7a8fa8', marginTop: '4px' }}>
            <span>PAR {par}</span>
            <span>·</span>
            <span>SI {currentHole}</span>
          </div>
        </div>

        {/* Result label */}
        <div style={{ textAlign: 'center', minHeight: '28px' }}>
          {diff !== undefined && (
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: scoreCol, letterSpacing: '0.06em' }}>
              {label}
            </span>
          )}
        </div>

        {/* Score controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
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
              width: '64px', height: '64px', borderRadius: '50%',
              border: '2px solid rgba(122,143,168,0.4)',
              background: 'rgba(122,143,168,0.08)',
              color: '#edeae4', fontSize: '2rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: score !== undefined && score <= 1 ? 0.3 : 1,
              transition: 'all 0.1s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            −
          </button>

          {/* Score display */}
          <div style={{ textAlign: 'center', minWidth: '80px' }}>
            <div style={{ fontSize: '3.5rem', fontWeight: 900, color: scoreCol, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {score ?? '—'}
            </div>
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
              width: '64px', height: '64px', borderRadius: '50%',
              border: '2px solid rgba(122,143,168,0.4)',
              background: 'rgba(122,143,168,0.08)',
              color: '#edeae4', fontSize: '2rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: score !== undefined && score >= 12 ? 0.3 : 1,
              transition: 'all 0.1s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            +
          </button>
        </div>

        {/* Quick-pick chips */}
        <div style={{ overflowX: 'auto', display: 'flex', gap: '8px', padding: '4px 0', WebkitOverflowScrolling: 'touch' }}>
          {chips.map((c) => {
            const isActive = score === c.value
            const cDiff    = c.value - par
            const cColor   = getScoreColor(c.value, par)
            return (
              <button
                key={c.label}
                onClick={() => handleScoreChange(currentHole, c.value)}
                style={{
                  flexShrink: 0,
                  padding: '8px 16px', borderRadius: '20px',
                  border: `1px solid ${isActive ? cColor : 'rgba(122,143,168,0.25)'}`,
                  background: isActive ? `${cColor}22` : 'transparent',
                  color: isActive ? cColor : '#7a8fa8',
                  fontWeight: isActive ? 700 : 400,
                  fontSize: '13px', cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                {c.label}
                <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.7 }}>
                  ({cDiff >= 0 ? '+' : ''}{cDiff === 0 ? 'E' : cDiff})
                </span>
              </button>
            )
          })}
        </div>

        {/* Progress mini-grid */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ display: 'flex', gap: '4px', minWidth: 'max-content', padding: '4px 2px' }}>
            {Array.from({ length: holes }, (_, i) => i + 1).map((h) => {
              const s    = scores[activeJugadorId]?.[h]
              const p    = parMap[h] ?? 4
              const d    = s !== undefined ? s - p : null
              const isCurrent = h === currentHole

              let bg = 'rgba(122,143,168,0.1)'
              let border = '1px solid rgba(122,143,168,0.2)'
              let textColor = '#3a4a5a'

              if (d !== null) {
                bg     = `${getScoreColor(s!, p)}22`
                border = `1px solid ${getScoreColor(s!, p)}55`
                textColor = getScoreColor(s!, p)
              }

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
                  <span style={{ fontSize: '11px', fontWeight: 700, color: isCurrent ? '#c4992a' : textColor, lineHeight: 1 }}>
                    {s != null ? (d === 0 ? 'E' : d! > 0 ? `+${d}` : d) : '·'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Running totals */}
        {holesPlayed > 0 && (
          <div style={{ background: '#0e1c2f', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-around', border: '1px solid rgba(196,153,42,0.1)' }}>
            {holes === 18 && outGross > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#7a8fa8', marginBottom: '2px' }}>Out</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#edeae4' }}>{outGross}</div>
                <div style={{ fontSize: '11px', color: getScoreColor(outGross, outPar) }}>{formatOverUnder(outGross - outPar)}</div>
              </div>
            )}
            {holes === 18 && inGross > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#7a8fa8', marginBottom: '2px' }}>In</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#edeae4' }}>{inGross}</div>
                <div style={{ fontSize: '11px', color: getScoreColor(inGross, inPar) }}>{formatOverUnder(inGross - inPar)}</div>
              </div>
            )}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#7a8fa8', marginBottom: '2px' }}>Total ({holesPlayed}/{holes})</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#edeae4' }}>{totalGross}</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: getScoreColor(totalGross, totalParPlayed) }}>{formatOverUnder(totalGross - totalParPlayed)}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Siguiente / Finalizar button ────────────────────────────────────── */}
      <div style={{ position: 'sticky', bottom: 0, padding: '12px 16px', background: 'rgba(7,13,24,0.97)', borderTop: '1px solid rgba(196,153,42,0.1)' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <button
            onClick={handleNext}
            disabled={saving}
            style={{
              width: '100%', height: '56px',
              background: '#c4992a', color: '#070d18',
              fontWeight: 700, fontSize: '16px',
              borderRadius: '12px', border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              transition: 'opacity 0.15s',
              WebkitTapHighlightColor: 'transparent',
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
