'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getScoreResult, SCORE_STYLES } from '@/golf/core/colors'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'
import { resolverCourseHandicap, cargarCourseData } from '@/golf/core/course-handicap'
import { parTotalEstandar } from '@/golf/core/round-score'

/* ── Types ── */
interface Jugador {
  id: string
  nombre: string
  user_id: string | null
  scores: Record<string, number>
  handicap?: number | null
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
  modo_juego: ModoJuego
  formato_juego: FormatoJuego
  admin_mode?: boolean
  admin_user_id?: string
  hoyo_inicio?: number | null
  recorridos?: string[] | null
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
  bg: '#ffffff',
  card: '#f8f9fa',
  text: '#1a1a2e',
  textMuted: '#4a5568',
  textFaint: '#94a3b8',
  border: '#e2e8f0',
  gold: '#C4992A',
  navBg: 'rgba(255,255,255,0.97)',
  headerBg: 'rgba(255,255,255,0.97)',
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
  const [playerHcp, setPlayerHcp] = useState<Record<string, number>>({})
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
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
        .select('id, codigo, course_name, course_id, tees, holes, fecha, estado, modo_juego, formato_juego, admin_mode, admin_user_id, hoyo_inicio, recorridos, ronda_libre_jugadores(id, nombre, user_id, scores, handicap)')
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
      let finalParTotal = parTotalEstandar(r.holes)  // se actualiza si hay course_holes

      if (r.course_id) {
        let query = supabase.from('course_holes')
          .select('numero, par, stroke_index, recorrido, yardaje_campeonato, yardaje_azul, yardaje_blanco, yardaje_rojo')
          .eq('course_id', r.course_id)
        // Multi-loop: filter by selected recorridos
        const recorridos = r.recorridos as string[] | null
        if (recorridos && recorridos.length > 0) {
          query = query.in('recorrido', recorridos)
        }
        const { data: holes } = await query.order('recorrido').order('numero')
        if (holes && holes.length > 0) {
          const pm2: Record<number, number> = {}
          const hdm2: Record<number, HoleData> = {}
          const teeCol = getTeeYardageColumn(r.tees || 'azul')
          // Renumber: loop 1 = 1-9, loop 2 = 10-18 (for multi-loop)
          const isMultiLoop = recorridos && recorridos.length > 1
          let holeNum = 1
          for (const h of holes) {
            const num = isMultiLoop ? holeNum : h.numero
            pm2[num] = h.par
            hdm2[num] = {
              numero: num,
              par: h.par,
              stroke_index: h.stroke_index,
              yardaje: (h as Record<string, unknown>)[teeCol] as number | null || h.yardaje_azul || h.yardaje_blanco || null,
            }
            holeNum++
          }
          setParMap(pm2)
          setHoleDataMap(hdm2)
          finalParTotal = Object.values(pm2).reduce((a, b) => a + b, 0)
        } else {
          setHoleDataMap(hdm)
        }
      } else {
        setHoleDataMap(hdm)
      }

      // Load handicaps: convertir índice → course handicap usando fórmula WHS
      const hcpMap: Record<string, number> = {}
      const courseData = await cargarCourseData(r.course_id ?? null, r.tees || 'azul', r.holes, finalParTotal)
      for (const j of r.ronda_libre_jugadores) {
        let index: number
        if (j.handicap != null) { index = j.handicap }
        else if (j.user_id) { const { data: p } = await supabase.from('profiles').select('indice').eq('id', j.user_id).single(); index = p?.indice ?? 0 }
        else { index = 0 }
        hcpMap[j.id] = resolverCourseHandicap(index, courseData)
      }
      setPlayerHcp(hcpMap)

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
  const saveAllScores = useCallback(async (overrideScores?: Record<string, Record<number, number>>) => {
    if (!ronda) return
    const toSave = overrideScores ?? scores
    setSaveStatus('saving')
    lsSave(codigo, toSave)

    const supabase = createClient()
    let allOk = true
    const savePromises = ronda.ronda_libre_jugadores.map(j => {
      const scoresObj: Record<string, number> = {}
      for (const [k, v] of Object.entries(toSave[j.id] ?? {})) scoresObj[String(k)] = v  // Explicit string keys for JSONB
      return supabase.from('ronda_libre_jugadores').update({ scores: scoresObj }).eq('id', j.id)
    })
    const results = await Promise.all(savePromises)
    if (results.some(r => r.error)) allOk = false

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
      const newScore = Math.max(1, Math.min(19, base + delta))
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

  /* ── Reset confirmation when changing holes ── */
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    setConfirmFinalize(false)
    if (confirmTimeoutRef.current) { clearTimeout(confirmTimeoutRef.current); confirmTimeoutRef.current = null }
  }, [currentHole])

  /* ── Finalize ── */
  const finalizeRound = async () => {
    if (!ronda || finalizing) return
    if (!confirmFinalize) {
      setConfirmFinalize(true)
      haptic([20, 50, 20])
      // Auto-reset after 5 seconds
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
      confirmTimeoutRef.current = setTimeout(() => setConfirmFinalize(false), 5000)
      return
    }
    if (confirmTimeoutRef.current) { clearTimeout(confirmTimeoutRef.current); confirmTimeoutRef.current = null }
    setFinalizing(true)
    haptic(30)
    // Guardar scores tal como están — hoyos sin marcar quedan como null/vacío
    const supabase = createClient()
    const savePromises = ronda.ronda_libre_jugadores.map(j => {
      const scoresObj: Record<string, number> = {}
      for (const [k, v] of Object.entries(scores[j.id] ?? {})) {
        if (v != null) scoresObj[String(k)] = v
      }
      return supabase.from('ronda_libre_jugadores').update({ scores: scoresObj }).eq('id', j.id)
    })
    await Promise.all(savePromises)
    // Finalizar ronda
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
  const modoJuego = ronda.modo_juego || 'gross'
  const formatoJuego = ronda.formato_juego || 'stroke_play'
  const modoLabel = formatoJuego === 'match_play' ? 'Match Play Neto'
    : formatoJuego === 'stableford' ? 'Stableford'
    : modoJuego === 'neto' ? 'Stroke Play Neto'
    : 'Stroke Play'
  const showNetStableford = modoJuego !== 'gross'

  // Calculate totals for thru indicator + canFinalize
  const holesWithScores = (jId: string) => {
    let count = 0
    for (let h = 1; h <= totalHoles; h++) {
      if ((scores[jId]?.[h] ?? scores[jId]?.[String(h) as unknown as number]) != null) count++
    }
    return count
  }
  const maxThru = Math.max(...jugadores.map(j => holesWithScores(j.id)), 0)
  const canFinalize = maxThru >= 9 || currentHoleIdx >= totalHoles - 1

  // Player totals with OUT/IN breakdown
  const getPlayerTotal = (jId: string) => {
    let gross = 0, parTotal = 0, out = 0, inn = 0
    for (let h = 1; h <= totalHoles; h++) {
      const s = scores[jId]?.[h] ?? scores[jId]?.[String(h) as unknown as number]  // Check BOTH key types
      if (s != null) {
        gross += s; parTotal += parMap[h] ?? 4
        if (h <= 9) out += s; else inn += s
      }
    }
    return { gross, vsPar: gross - parTotal, out, inn }
  }

  const goToNextHole = async () => {
    if (!ronda) return
    haptic(30)
    // Auto-fill ALL players who don't have a score for the current hole with par
    const updatedScores = { ...scores }
    for (const j of jugadores) {
      if (updatedScores[j.id]?.[currentHole] == null) {
        updatedScores[j.id] = { ...(updatedScores[j.id] ?? {}), [currentHole]: par }
      }
    }
    setScores(updatedScores)
    setHasUnsaved(true)
    lsSave(codigo, updatedScores)

    // Save ALL atomically BEFORE advancing
    await saveAllScores(updatedScores)

    // NOW advance
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: theme.gold, letterSpacing: '0.05em' }}>
              HOYO {currentHole}
            </div>
            <span style={{
              fontSize: '9px', fontWeight: 600, letterSpacing: '0.05em',
              padding: '2px 8px', borderRadius: '10px',
              background: 'rgba(196,153,42,0.15)', color: theme.gold,
              border: '1px solid rgba(196,153,42,0.25)',
              textTransform: 'uppercase' as const,
            }}>
              {modoLabel}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: theme.textFaint, marginTop: '1px' }}>{ronda.course_name}</div>
        </div>
        <div style={{ textAlign: 'right', minWidth: '60px' }}>
          <div style={{ fontSize: '10px', color: theme.textFaint, letterSpacing: '0.04em' }}>THRU</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: theme.gold }}>{maxThru}/{totalHoles}</div>
        </div>
      </header>

      {/* Progress bar */}
      <div style={{ height: '3px', background: '#e2e8f0', flexShrink: 0 }}>
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
                  background: allHaveScore ? 'rgba(196,153,42,0.12)' : isActive ? 'rgba(196,153,42,0.08)' : '#f3f4f6',
                  border: isActive ? '1.5px solid #C4992A' : allHaveScore ? '1px solid rgba(196,153,42,0.3)' : '1px solid #e2e8f0',
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
      <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, background: '#f8f9fa', flexShrink: 0 }}>
        {[
          { label: 'PAR', value: String(par) },
          { label: 'SI', value: String(holeData.stroke_index) },
          { label: 'YDS', value: holeData.yardaje ? String(holeData.yardaje) : '\u2014' },
        ].map((col, i, arr) => (
          <div key={col.label} style={{
            flex: 1, textAlign: 'center', padding: '6px 2px',
            borderRight: i < arr.length - 1 || showNetStableford ? `1px solid ${theme.border}` : 'none',
          }}>
            <div style={{ fontSize: '8px', fontWeight: 600, color: theme.textFaint, letterSpacing: '0.07em', textTransform: 'uppercase' as const, marginBottom: '1px' }}>{col.label}</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: theme.text }}>{col.value}</div>
          </div>
        ))}
        {showNetStableford && (() => {
          // Show max strokes received among players for context
          const maxStrokes = Math.max(...jugadores.map(j => strokesRecibidosEnHoyo(playerHcp[j.id] ?? 0, holeData.stroke_index)))
          return (
            <div style={{ flex: 1, textAlign: 'center', padding: '6px 2px' }}>
              <div style={{ fontSize: '8px', fontWeight: 600, color: theme.textFaint, letterSpacing: '0.07em', textTransform: 'uppercase' as const, marginBottom: '1px' }}>GOLPES</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#c4992a' }}>{maxStrokes > 0 ? `+${maxStrokes}` : '0'}</div>
            </div>
          )
        })()}
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
            const { gross, vsPar, out, inn } = getPlayerTotal(j.id)
            const played = holesWithScores(j.id)
            const scoreResult = playerScore != null ? getScoreResult(playerScore, par) : null
            const chipStyle = scoreResult ? SCORE_STYLES[scoreResult] : null
            const hcp = playerHcp[j.id] ?? 0
            const strokesThisHole = strokesRecibidosEnHoyo(hcp, holeData.stroke_index)
            const netScoreThisHole = playerScore != null ? playerScore - strokesThisHole : null
            const stablefordPts = playerScore != null ? puntosStablefordHoyo(playerScore, par, hcp, holeData.stroke_index) : null

            // Running net/stableford totals
            let runningStableford = 0
            let runningNetVsPar = 0
            if (showNetStableford) {
              for (let h = 1; h <= totalHoles; h++) {
                const s = scores[j.id]?.[h]
                if (s != null) {
                  const hd = holeDataMap[h]
                  if (hd) {
                    const si = hd.stroke_index
                    runningStableford += puntosStablefordHoyo(s, hd.par, hcp, si)
                    runningNetVsPar += (s - strokesRecibidosEnHoyo(hcp, si)) - hd.par
                  }
                }
              }
            }

            return (
              <div key={j.id} style={{
                background: theme.card,
                borderRadius: '14px',
                border: `1px solid ${theme.border}`,
                padding: '12px 14px',
              }}>
                {/* Player name + running total */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>{j.nombre}</div>
                    {showNetStableford && played > 0 && (
                      <div style={{ fontSize: '10px', color: theme.textFaint, marginTop: '1px' }}>
                        HCP {hcp}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', flexDirection: 'column', gap: '2px' }}>
                    {played > 0 && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '10px', color: theme.textFaint, fontFamily: '"DM Mono", monospace' }}>
                            {out > 0 ? `${out}` : ''}{out > 0 && inn > 0 ? '+' : ''}{inn > 0 ? `${inn}` : ''}={gross}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: getVsParColor(vsPar) }}>
                            {getVsParLabel(vsPar)}
                          </span>
                        </div>
                        {showNetStableford && (
                          <span style={{ fontSize: '10px', color: formatoJuego === 'stableford' ? '#c4992a' : '#60A5FA' }}>
                            {formatoJuego === 'stableford' ? `${runningStableford} pts` : `Net: ${runningNetVsPar >= 0 ? '+' : ''}${runningNetVsPar}`}
                          </span>
                        )}
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
                      background: '#f3f4f6', color: '#374151',
                      border: '1px solid #e2e8f0',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      touchAction: 'manipulation', userSelect: 'none',
                      opacity: playerScore != null && playerScore <= 1 ? 0.3 : 1,
                    }}
                  >
                    {'\u2212'}
                  </button>

                  {/* Score display */}
                  <div style={{ textAlign: 'center', minWidth: '80px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <div style={{
                        fontSize: '42px', fontWeight: 700, lineHeight: 1,
                        color: playerScore != null ? '#1a1a2e' : '#d1d5db',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {displayScore}
                      </div>
                      {ronda.modo_juego !== 'gross' && strokesThisHole > 0 && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '1px',
                          fontSize: '10px', fontWeight: 700, color: '#c4992a',
                          alignSelf: 'flex-start', marginTop: '4px',
                        }}>
                          {'●'.repeat(strokesThisHole)}
                        </span>
                      )}
                    </div>
                    {/* Chip */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                      {playerScore != null && chipStyle && (
                        <div style={{
                          padding: '2px 10px', borderRadius: '12px',
                          fontSize: '10px', fontWeight: 500,
                          background: chipStyle.bg, color: chipStyle.textColor,
                          border: `${chipStyle.borderWidth} solid ${chipStyle.border}`,
                          display: 'inline-block',
                        }}>
                          {diff <= -2 ? 'Eagle' : diff === -1 ? 'Birdie' : diff === 0 ? 'Par' : diff === 1 ? 'Bogey' : `+${diff}`}
                        </div>
                      )}
                      {showNetStableford && playerScore != null && (
                        <div style={{
                          padding: '2px 8px', borderRadius: '10px',
                          fontSize: '9px', fontWeight: 600,
                          background: formatoJuego === 'stableford' ? 'rgba(196,153,42,0.15)' : 'rgba(96,165,250,0.15)',
                          color: formatoJuego === 'stableford' ? '#c4992a' : '#60A5FA',
                          border: `1px solid ${formatoJuego === 'stableford' ? 'rgba(196,153,42,0.3)' : 'rgba(96,165,250,0.3)'}`,
                          display: 'inline-block',
                        }}>
                          {formatoJuego === 'stableford'
                            ? `${stablefordPts} pts`
                            : `Net: ${netScoreThisHole != null ? netScoreThisHole - par >= 0 ? '+' + (netScoreThisHole - par) : String(netScoreThisHole - par) : '—'}`}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Plus button */}
                  <button
                    onClick={() => handleScoreChange(j.id, currentHole, 1)}
                    disabled={playerScore != null && playerScore >= 15}
                    style={{
                      width: '52px', height: '52px', borderRadius: '14px',
                      fontSize: '24px', fontWeight: 600,
                      background: theme.gold, color: '#ffffff', border: 'none',
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
              color: theme.textMuted, border: '1px solid #e2e8f0',
              borderRadius: '12px', fontSize: '14px', fontWeight: 400,
              cursor: 'pointer', minHeight: '48px',
            }}
          >
            {'\u2190'} Anterior
          </button>
        )}
        {/* Primary: Siguiente (hidden on last hole) */}
        {!isLastHole && (
          <button
            onClick={goToNextHole}
            style={{
              flex: 2, padding: '14px',
              background: theme.gold, color: '#ffffff',
              border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600,
              cursor: 'pointer', minHeight: '48px',
              touchAction: 'manipulation', letterSpacing: '0.01em',
            }}
          >
            Siguiente {'\u2192'}
          </button>
        )}
        {/* Finalize: secondary from hole 9, primary on last hole */}
        {canFinalize && (
          <button
            onClick={finalizeRound}
            disabled={finalizing}
            style={{
              flex: isLastHole ? 2 : 1, padding: isLastHole ? '14px' : '12px',
              background: finalizing ? '#9ca3af' : confirmFinalize ? '#d97706' : isLastHole ? theme.gold : 'transparent',
              color: finalizing ? '#ffffff' : confirmFinalize ? '#ffffff' : isLastHole ? '#ffffff' : theme.gold,
              border: isLastHole ? 'none' : `1px solid rgba(196,153,42,0.4)`,
              borderRadius: '12px',
              fontSize: isLastHole ? '16px' : '13px',
              fontWeight: isLastHole ? 600 : 500,
              cursor: finalizing ? 'not-allowed' : 'pointer', minHeight: '48px',
              touchAction: 'manipulation', letterSpacing: '0.01em',
              transition: 'background 0.2s ease',
              opacity: finalizing ? 0.7 : 1,
            }}
          >
            {finalizing
              ? 'Finalizando...'
              : confirmFinalize ? '\u00bfFinalizar ronda?' : 'Finalizar ronda \u2713'}
          </button>
        )}
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
