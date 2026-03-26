'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getScoreResult, SCORE_STYLES } from '@/lib/score-colors'

/* ── Types ── */
interface Jugador {
  id: string
  nombre: string
  user_id: string | null
  scores: Record<string, number>
}

interface RondaLibre {
  id: string
  codigo: string
  course_name: string
  course_id: string | null
  tees: string
  holes: number
  fecha: string
  estado: string
  admin_mode?: boolean
  admin_user_id?: string
  hoyo_inicio?: number | null
  ronda_libre_jugadores: Jugador[]
}

interface HoleData {
  numero: number
  par: number
  stroke_index: number
  yardaje: number | null
}

/* ── Helpers ── */
function getTeeYardageColumn(tee: string): string {
  const t = tee.toLowerCase()
  if (t === 'black' || t === 'campeonato' || t === 'negro') return 'yardaje_campeonato'
  if (t === 'blue' || t === 'azul') return 'yardaje_azul'
  if (t === 'white' || t === 'blanco') return 'yardaje_blanco'
  if (t === 'red' || t === 'rojo') return 'yardaje_rojo'
  return 'yardaje_azul'
}

function generarOrdenHoyos(hoyoInicio: number, totalHoles: number): number[] {
  const orden: number[] = []
  for (let i = 0; i < totalHoles; i++) {
    orden.push(((hoyoInicio - 1 + i) % totalHoles) + 1)
  }
  return orden
}

function lsKey(c: string) { return `ronda_grupo_${c}` }
function lsSave(c: string, s: Record<string, Record<number, number>>) { try { localStorage.setItem(lsKey(c), JSON.stringify(s)) } catch {} }
function lsLoad(c: string): Record<string, Record<number, number>> { try { return JSON.parse(localStorage.getItem(lsKey(c)) ?? '{}') } catch { return {} } }
function haptic(p: number | number[]) { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(p) }

/* ── Theme ── */
const theme = {
  bg: '#070d18',
  card: '#0e1c2f',
  text: '#edeae4',
  textMuted: 'rgba(255,255,255,0.55)',
  textFaint: 'rgba(255,255,255,0.3)',
  border: 'rgba(196,153,42,0.12)',
  gold: '#C4992A',
  navBg: 'rgba(7,13,24,0.95)',
  headerBg: 'rgba(7,13,24,0.95)',
}

/* ── Score color chip ── */
function getVsParColor(diff: number): string {
  if (diff <= -2) return '#60A5FA'
  if (diff === -1) return '#4ade80'
  if (diff === 0) return theme.textMuted
  if (diff === 1) return '#FCD34D'
  return '#EF4444'
}

function getVsParLabel(diff: number): string {
  if (diff <= -2) return `${diff}`
  if (diff === -1) return '-1'
  if (diff === 0) return 'E'
  return `+${diff}`
}

/* ── Main ── */
export default function ScoreGrupoPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string

  const [ronda, setRonda] = useState<RondaLibre | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentHole, setCurrentHole] = useState(1)
  const [scores, setScores] = useState<Record<string, Record<number, number>>>({})
  const [parMap, setParMap] = useState<Record<number, number>>({})
  const [holeDataMap, setHoleDataMap] = useState<Record<number, HoleData>>({})
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const swipeRef = useRef({ startX: 0, startY: 0 })
  const progressRef = useRef<HTMLDivElement>(null)

  /* ── Load ronda ── */
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push(`/login?redirect=/ronda-libre/${codigo}/score-grupo`); return }

      const { data } = await supabase
        .from('rondas_libres')
        .select('id, codigo, course_name, course_id, tees, holes, fecha, estado, admin_mode, admin_user_id, hoyo_inicio, ronda_libre_jugadores(id, nombre, user_id, scores)')
        .eq('codigo', codigo)
        .single()

      if (!data) { router.push('/dashboard'); return }
      const r = data as unknown as RondaLibre

      // Only admin can access this page
      if (!r.admin_mode || r.admin_user_id !== user.id) {
        router.replace(`/ronda-libre/${codigo}/score`)
        return
      }

      if (r.estado === 'finalizada') {
        router.replace(`/ronda-libre/${codigo}`)
        return
      }

      setRonda(r)

      // Initialize scores from DB + localStorage backup
      const cached = lsLoad(codigo)
      const initialScores: Record<string, Record<number, number>> = {}
      for (const j of r.ronda_libre_jugadores) {
        const db: Record<number, number> = {}
        if (j.scores) for (const [k, v] of Object.entries(j.scores)) db[parseInt(k)] = v as number
        initialScores[j.id] = { ...(cached[j.id] ?? {}), ...db }
      }
      setScores(initialScores)

      // Par map
      const pm: Record<number, number> = {}
      const hdm: Record<number, HoleData> = {}
      for (let i = 1; i <= r.holes; i++) { pm[i] = 4; hdm[i] = { numero: i, par: 4, stroke_index: i, yardaje: null } }
      setParMap(pm)

      if (r.course_id) {
        const { data: holes } = await supabase.from('course_holes')
          .select('numero, par, stroke_index, yardaje_campeonato, yardaje_azul, yardaje_blanco, yardaje_rojo')
          .eq('course_id', r.course_id).order('numero')
        if (holes && holes.length > 0) {
          const pm2: Record<number, number> = {}
          const hdm2: Record<number, HoleData> = {}
          const teeCol = getTeeYardageColumn(r.tees || 'azul')
          for (const h of holes) {
            pm2[h.numero] = h.par
            hdm2[h.numero] = {
              numero: h.numero,
              par: h.par,
              stroke_index: h.stroke_index,
              yardaje: (h as Record<string, unknown>)[teeCol] as number | null || h.yardaje_azul || h.yardaje_blanco || null,
            }
          }
          setParMap(pm2)
          setHoleDataMap(hdm2)
        } else {
          setHoleDataMap(hdm)
        }
      } else {
        setHoleDataMap(hdm)
      }

      // Find first empty hole
      const orden = generarOrdenHoyos(r.hoyo_inicio ?? 1, r.holes)
      const firstJ = r.ronda_libre_jugadores[0]
      if (firstJ) {
        const ex = initialScores[firstJ.id] ?? {}
        const firstEmpty = orden.find(h => ex[h] == null)
        if (firstEmpty != null) setCurrentHole(firstEmpty)
        else setCurrentHole(orden[0])
      }
      setLoading(false)
    }
    load()
  }, [codigo, router])

  /* ── Prevent accidental nav ── */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsaved])

  /* ── Save all players ── */
  const saveAllScores = useCallback(async () => {
    if (!ronda) return
    setSaveStatus('saving')
    lsSave(codigo, scores)

    const supabase = createClient()
    let allOk = true
    for (const j of ronda.ronda_libre_jugadores) {
      const scoresObj: Record<string, number> = {}
      for (const [k, v] of Object.entries(scores[j.id] ?? {})) scoresObj[k] = v
      const { error } = await supabase.from('ronda_libre_jugadores').update({ scores: scoresObj }).eq('id', j.id)
      if (error) allOk = false
    }

    if (allOk) {
      setSaveStatus('saved')
      setHasUnsaved(false)
      haptic(20)
      setTimeout(() => setSaveStatus('idle'), 1500)
    } else {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }, [ronda, scores, codigo])

  /* ── Score change ── */
  const handleScoreChange = useCallback((jugadorId: string, hole: number, delta: number) => {
    setScores(prev => {
      const currentScore = prev[jugadorId]?.[hole]
      const par = parMap[hole] ?? 4
      const base = currentScore ?? par
      const newScore = Math.max(1, Math.min(15, base + delta))
      const next = { ...prev, [jugadorId]: { ...(prev[jugadorId] ?? {}), [hole]: newScore } }
      setHasUnsaved(true)
      lsSave(codigo, next)
      haptic(10)
      return next
    })
  }, [parMap, codigo])

  /* ── Swipe ── */
  const handleTouchStart = (e: React.TouchEvent) => { swipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY } }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!ronda) return
    const dx = e.changedTouches[0].clientX - swipeRef.current.startX
    const dy = e.changedTouches[0].clientY - swipeRef.current.startY
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 40) {
      const orden = generarOrdenHoyos(ronda.hoyo_inicio ?? 1, ronda.holes)
      const idx = orden.indexOf(currentHole)
      if (dx < 0 && idx < orden.length - 1) setCurrentHole(orden[idx + 1])
      else if (dx > 0 && idx > 0) setCurrentHole(orden[idx - 1])
    }
  }

  /* ── Scroll progress ── */
  useEffect(() => {
    if (progressRef.current) {
      const cell = progressRef.current.children[currentHole - 1] as HTMLElement | undefined
      if (cell) cell.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }
  }, [currentHole])

  /* ── Finalize ── */
  const finalizeRound = async () => {
    if (!ronda) return
    haptic(30)
    // Auto-fill missing holes with par for all players
    const updatedScores = { ...scores }
    for (const j of ronda.ronda_libre_jugadores) {
      const ps = { ...(updatedScores[j.id] ?? {}) }
      for (let h = 1; h <= ronda.holes; h++) {
        if (ps[h] == null) ps[h] = parMap[h] ?? 4
      }
      updatedScores[j.id] = ps
    }
    setScores(updatedScores)

    // Save all
    const supabase = createClient()
    for (const j of ronda.ronda_libre_jugadores) {
      const scoresObj: Record<string, number> = {}
      for (const [k, v] of Object.entries(updatedScores[j.id] ?? {})) scoresObj[k] = v
      await supabase.from('ronda_libre_jugadores').update({ scores: scoresObj }).eq('id', j.id)
    }

    // Finalize round
    await supabase.from('rondas_libres').update({ estado: 'finalizada' }).eq('codigo', codigo)
    router.push(`/ronda-libre/${codigo}?finished=true`)
  }

  /* ── Render ── */
  if (loading) {
    return (
      <div style={{ background: theme.bg, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textFaint }}>
        Cargando ronda de grupo...
      </div>
    )
  }

  if (!ronda) return null

  const jugadores = ronda.ronda_libre_jugadores
  const totalHoles = ronda.holes
  const hoyoInicio = ronda.hoyo_inicio ?? 1
  const ordenHoyos = generarOrdenHoyos(hoyoInicio, totalHoles)
  const currentHoleIdx = ordenHoyos.indexOf(currentHole)
  const isLastHole = currentHoleIdx >= totalHoles - 1
  const par = parMap[currentHole] ?? 4
  const holeData = holeDataMap[currentHole] ?? { numero: currentHole, par, stroke_index: currentHole, yardaje: null }

  // Calculate totals for thru indicator
  const holesWithScores = (jId: string) => {
    let count = 0
    for (let h = 1; h <= totalHoles; h++) {
      if (scores[jId]?.[h] != null) count++
    }
    return count
  }
  const maxThru = Math.max(...jugadores.map(j => holesWithScores(j.id)), 0)

  // Player totals
  const getPlayerTotal = (jId: string) => {
    let gross = 0, parTotal = 0
    for (let h = 1; h <= totalHoles; h++) {
      const s = scores[jId]?.[h]
      if (s != null) { gross += s; parTotal += parMap[h] ?? 4 }
    }
    return { gross, vsPar: gross - parTotal }
  }

  const goToNextHole = async () => {
    if (!ronda) return
    haptic(30)
    // Auto-fill missing scores with par for all players on current hole
    for (const j of jugadores) {
      if (scores[j.id]?.[currentHole] == null) {
        handleScoreChange(j.id, currentHole, 0) // sets to par
      }
    }
    await saveAllScores()
    const nextIdx = currentHoleIdx + 1
    if (nextIdx < ordenHoyos.length) {
      setCurrentHole(ordenHoyos[nextIdx])
    }
  }

  const goToPrevHole = () => {
    const prevIdx = currentHoleIdx - 1
    if (prevIdx >= 0) setCurrentHole(ordenHoyos[prevIdx])
  }

  return (
    <div style={{ background: theme.bg, height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>

      {/* Save indicator */}
      {saveStatus !== 'idle' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20,
          height: '3px', transition: 'opacity 0.3s',
          background: saveStatus === 'saving' ? '#C4992A' : saveStatus === 'saved' ? '#00e676' : '#ff4444',
          opacity: saveStatus === 'saved' ? 0.6 : 1,
          animation: saveStatus === 'saving' ? 'savePulse 1s ease infinite' : 'none',
        }} />
      )}

      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', height: '48px', flexShrink: 0,
        borderBottom: `1px solid ${theme.border}`,
        background: theme.headerBg,
      }}>
        <button onClick={() => router.push(`/ronda-libre/${codigo}`)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: theme.textMuted, fontSize: '14px',
          padding: '8px', minWidth: '44px', minHeight: '44px',
          display: 'flex', alignItems: 'center',
        }}>
          {'\u2190'}
        </button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: theme.gold, letterSpacing: '0.05em' }}>
            HOYO {currentHole}
          </div>
          <div style={{ fontSize: '10px', color: theme.textFaint }}>{ronda.course_name}</div>
        </div>
        <div style={{ textAlign: 'right', minWidth: '60px' }}>
          <div style={{ fontSize: '10px', color: theme.textFaint, letterSpacing: '0.04em' }}>THRU</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: theme.gold }}>{maxThru}/{totalHoles}</div>
        </div>
      </header>

      {/* Progress bar */}
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ height: '3px', background: theme.gold, width: `${(maxThru / totalHoles) * 100}%`, transition: 'width 0.3s ease' }} />
      </div>

      {/* Hole progress row */}
      <div style={{ borderBottom: `1px solid ${theme.border}`, flexShrink: 0, overflow: 'hidden' }}>
        <div ref={progressRef} style={{ display: 'flex', overflowX: 'auto', padding: '5px 6px', gap: '2px', WebkitOverflowScrolling: 'touch' }}>
          {Array.from({ length: totalHoles }, (_, i) => i + 1).map(h => {
            const isActive = h === currentHole
            const allHaveScore = jugadores.every(j => scores[j.id]?.[h] != null)
            return (
              <div key={h} onClick={() => setCurrentHole(h)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '22px', cursor: 'pointer',
              }}>
                <div style={{ fontSize: '8px', color: isActive ? theme.gold : theme.textFaint, fontWeight: isActive ? 600 : 400, marginBottom: '2px' }}>{h}</div>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '3px',
                  background: allHaveScore ? 'rgba(196,153,42,0.2)' : isActive ? 'rgba(196,153,42,0.15)' : 'rgba(255,255,255,0.06)',
                  border: isActive ? '1.5px solid #C4992A' : allHaveScore ? '1px solid rgba(196,153,42,0.3)' : '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', color: allHaveScore ? theme.gold : 'transparent', fontWeight: 600,
                }}>
                  {allHaveScore ? '\u2713' : ''}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Hole info row */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
        {[
          { label: 'PAR', value: String(par) },
          { label: 'HDCP', value: String(holeData.stroke_index) },
          { label: 'YDS', value: holeData.yardaje ? String(holeData.yardaje) : '\u2014' },
        ].map(col => (
          <div key={col.label} style={{
            flex: 1, textAlign: 'center', padding: '8px 2px',
            borderRight: `1px solid ${theme.border}`,
          }}>
            <div style={{ fontSize: '9px', fontWeight: 600, color: theme.textFaint, letterSpacing: '0.07em', textTransform: 'uppercase' as const, marginBottom: '2px' }}>{col.label}</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: theme.text }}>{col.value}</div>
          </div>
        ))}
      </div>

      {/* Player columns — scrollable main area */}
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', minHeight: 0 }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {jugadores.map(j => {
            const playerScore = scores[j.id]?.[currentHole]
            const displayScore = playerScore ?? par
            const diff = playerScore != null ? playerScore - par : 0
            const { gross, vsPar } = getPlayerTotal(j.id)
            const played = holesWithScores(j.id)
            const scoreResult = playerScore != null ? getScoreResult(playerScore, par) : null
            const chipStyle = scoreResult ? SCORE_STYLES[scoreResult] : null

            return (
              <div key={j.id} style={{
                background: theme.card,
                borderRadius: '14px',
                border: `1px solid ${theme.border}`,
                padding: '12px 14px',
              }}>
                {/* Player name + running total */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>{j.nombre}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {played > 0 && (
                      <>
                        <span style={{ fontSize: '12px', color: theme.textFaint }}>{gross} ({played}h)</span>
                        <span style={{
                          fontSize: '13px', fontWeight: 700,
                          color: getVsParColor(vsPar),
                        }}>
                          {getVsParLabel(vsPar)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Score + controls */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                  {/* Minus button */}
                  <button
                    onClick={() => handleScoreChange(j.id, currentHole, -1)}
                    disabled={playerScore != null && playerScore <= 1}
                    style={{
                      width: '52px', height: '52px', borderRadius: '14px',
                      fontSize: '24px', fontWeight: 300,
                      background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      touchAction: 'manipulation', userSelect: 'none',
                      opacity: playerScore != null && playerScore <= 1 ? 0.3 : 1,
                    }}
                  >
                    {'\u2212'}
                  </button>

                  {/* Score display */}
                  <div style={{ textAlign: 'center', minWidth: '70px' }}>
                    <div style={{
                      fontSize: '42px', fontWeight: 700, lineHeight: 1,
                      color: playerScore != null ? '#FFFFFF' : 'rgba(255,255,255,0.25)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {displayScore}
                    </div>
                    {/* Chip */}
                    {playerScore != null && chipStyle && (
                      <div style={{
                        marginTop: '4px', padding: '2px 10px', borderRadius: '12px',
                        fontSize: '10px', fontWeight: 500,
                        background: chipStyle.bg, color: chipStyle.textColor,
                        border: `${chipStyle.borderWidth} solid ${chipStyle.border}`,
                        display: 'inline-block',
                      }}>
                        {diff <= -2 ? 'Eagle' : diff === -1 ? 'Birdie' : diff === 0 ? 'Par' : diff === 1 ? 'Bogey' : `+${diff}`}
                      </div>
                    )}
                  </div>

                  {/* Plus button */}
                  <button
                    onClick={() => handleScoreChange(j.id, currentHole, 1)}
                    disabled={playerScore != null && playerScore >= 15}
                    style={{
                      width: '52px', height: '52px', borderRadius: '14px',
                      fontSize: '24px', fontWeight: 600,
                      background: theme.gold, color: '#070D18', border: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      touchAction: 'manipulation', userSelect: 'none',
                      opacity: playerScore != null && playerScore >= 15 ? 0.3 : 1,
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Nav buttons */}
      <div style={{
        flexShrink: 0, background: theme.navBg,
        borderTop: `1px solid ${theme.border}`,
        padding: '8px 16px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
        display: 'flex', gap: '8px',
      }}>
        {currentHoleIdx > 0 && (
          <button
            onClick={goToPrevHole}
            style={{
              flex: 1, padding: '14px', background: 'transparent',
              color: theme.textMuted, border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px', fontSize: '14px', fontWeight: 400,
              cursor: 'pointer', minHeight: '48px',
            }}
          >
            {'\u2190'} Anterior
          </button>
        )}
        <button
          onClick={isLastHole ? finalizeRound : goToNextHole}
          style={{
            flex: 2, padding: '14px',
            background: theme.gold,
            color: '#070D18',
            border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600,
            cursor: 'pointer', minHeight: '48px',
            touchAction: 'manipulation', letterSpacing: '0.01em',
          }}
        >
          {isLastHole ? 'Finalizar ronda \u2713' : 'Siguiente \u2192'}
        </button>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes savePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
