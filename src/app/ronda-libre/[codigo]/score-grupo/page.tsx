'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { addToast } from '@/hooks/useToast'
import { getScoreResult, SCORE_STYLES } from '@/golf/core/colors'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import type { ModoJuego, FormatoJuego, Jugador, RondaLibre, HoleData } from '@/types/ronda'
import { getYardajeForTee } from '@/types/ronda'
import { resolverCourseHandicap, cargarCourseData } from '@/golf/core/course-handicap'
import { parTotalEstandar } from '@/golf/core/round-score'
import { calcularDiferencial, calcularNivel } from '@/lib/indice-golfers'
import { calcularScramble, calcularFoursome, teePlayerEnHoyo } from '@/golf/formats'
import type { ScrambleTeam, FoursomeTeam } from '@/golf/formats'
import TeamLeaderboard from '@/components/TeamLeaderboard'

/* ── Helpers ── */
function getTeeYardageColumn(tee: string): string {
  const t = tee.toLowerCase()
  // Aliases defensivos para datos externos / snapshots viejos.
  if (t === 'negras' || t === 'black' || t === 'campeonato' || t === 'negro') return 'yardaje_negras'
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
  bg: 'var(--bg)',
  card: 'var(--bg-surface)',
  text: 'var(--text)',
  textMuted: 'var(--text-2)',
  textFaint: 'var(--text-3)',
  border: 'var(--border)',
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
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [anotadorNombre, setAnotadorNombre] = useState<string>('')
  // A1 anti-toque: pedir 2 taps para cambiar un score ya existente.
  const [pendingScoreConfirm, setPendingScoreConfirm] = useState<{ jugadorId: string; hole: number } | null>(null)
  const pendingScoreConfirmRef = useRef<{ jugadorId: string; hole: number } | null>(null)
  const pendingConfirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A3 edit window: tras una confirmación, dejar 3s de ediciones libres sobre el mismo jugador/hoyo.
  const editWindowRef = useRef<{ jugadorId: string; hole: number } | null>(null)
  const editWindowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A2 save debounce: un save-por-jugador 500ms después del último tap.
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    if (e1) { setDiscarding(false); alert('Error descartando ronda: ' + e1.message); return }
    const { error: e2 } = await supabase.from('rondas_libres').delete().eq('id', ronda.id)
    if (e2) { setDiscarding(false); alert('Error descartando ronda: ' + e2.message); return }
    router.push('/dashboard?discarded=1')
  }
  const [finalizing, setFinalizing] = useState(false)
  const [teamEquipos, setTeamEquipos] = useState<Array<{
    id: string; nombre: string; handicap_equipo: number | null;
    scores: Record<string, number>;
    jugadorIds: string[];
    jugadorNombres: string[];
  }>>([])
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
        .select('id, codigo, course_name, course_id, tees, holes, fecha, estado, modo_juego, formato_juego, admin_mode, admin_user_id, hoyo_inicio, recorridos, es_demo, ronda_libre_jugadores(id, nombre, user_id, scores, handicap, tees)')
        .eq('codigo', codigo)
        .single()

      if (!data) { router.push('/dashboard'); return }
      const r = data as unknown as RondaLibre

      // Only admin can access this page
      if (!r.admin_mode || r.admin_user_id !== user.id) {
        router.replace(`/ronda-libre/${codigo}/score`)
        return
      }

      // Demo rondas son spectator-only (misma regla que /score)
      if (r.es_demo) {
        router.replace(`/ronda-libre/${codigo}`)
        return
      }

      if (r.estado === 'finalizada') {
        router.replace(`/ronda-libre/${codigo}`)
        return
      }

      setRonda(r)

      // Identidad del anotador: primer intento es encontrarse en la lista
      // de jugadores de la ronda; fallback al email del usuario autenticado.
      const matchingPlayer = r.ronda_libre_jugadores.find(j => j.user_id === user.id)
      const derivedName = matchingPlayer?.nombre
        || (user.email ? user.email.split('@')[0] : '')
        || 'Anotador'
      setAnotadorNombre(derivedName)

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
          .select('numero, par, stroke_index, recorrido, yardaje_negras, yardaje_azul, yardaje_blanco, yardaje_rojo, yardaje_verificado_at')
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
              // Solo exponer yardajes auditados contra fuente primaria.
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

      // Fetch team data for team formats
      if (['scramble', 'foursome'].includes(r.formato_juego)) {
        const { data: eqData } = await supabase
          .from('ronda_equipos')
          .select('id, nombre, handicap_equipo, scores, ronda_equipo_jugadores(jugador_id, orden)')
          .eq('ronda_id', r.id)
          .order('created_at')
        if (eqData) {
          setTeamEquipos(eqData.map(e => {
            const members = ((e.ronda_equipo_jugadores || []) as Array<{ jugador_id: string; orden: number }>)
              .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
            return {
              id: e.id,
              nombre: e.nombre,
              handicap_equipo: e.handicap_equipo,
              scores: (e.scores as Record<string, number>) || {},
              jugadorIds: members.map(m => m.jugador_id),
              jugadorNombres: members.map(m => {
                const j = r.ronda_libre_jugadores.find(jj => jj.id === m.jugador_id)
                return j?.nombre || '?'
              }),
            }
          }))
        }
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

  /* ── Cleanup de timers al desmontar (A1 pending + A2 save debounce + A3 edit window) ── */
  useEffect(() => {
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
      if (pendingConfirmTimeoutRef.current) clearTimeout(pendingConfirmTimeoutRef.current)
      if (editWindowTimeoutRef.current) clearTimeout(editWindowTimeoutRef.current)
    }
  }, [])

  /* ── Save all players ── */
  const saveAllScores = useCallback(async (overrideScores?: Record<string, Record<number, number>>) => {
    if (!ronda) return
    const toSave = overrideScores ?? scores
    // Backup local SIEMPRE primero — sobrevive offline y reload
    lsSave(codigo, toSave)

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSaveStatus('error')
      return
    }

    setSaveStatus('saving')
    const supabase = createClient()
    let allOk = false
    let attempts = 0
    while (!allOk && attempts < 3) {
      const savePromises = ronda.ronda_libre_jugadores.map(j => {
        const scoresObj: Record<string, number> = {}
        for (const [k, v] of Object.entries(toSave[j.id] ?? {})) scoresObj[String(k)] = v
        return supabase.from('ronda_libre_jugadores').update({ scores: scoresObj }).eq('id', j.id)
      })
      const results = await Promise.all(savePromises)
      allOk = !results.some(r => r.error)
      attempts++
      if (!allOk && attempts < 3) await new Promise(r => setTimeout(r, 400 * attempts))
    }

    if (allOk) {
      setSaveStatus('saved')
      setHasUnsaved(false)
      haptic(20)
      setTimeout(() => setSaveStatus('idle'), 1500)
    } else {
      setSaveStatus('error')
      addToast({
        type: 'error',
        title: 'No se pudieron guardar los scores',
        message: 'Quedaron respaldados localmente. Se reintentará al recuperar la conexión.',
        duration: 6000,
      })
    }
  }, [ronda, scores, codigo])

  /* ── A2: debounced single-player save a DB con 3 retries ── */
  const saveSinglePlayer = useCallback(async (jugadorId: string, playerScores: Record<number, number>) => {
    setSaveStatus('saving')
    const supabase = createClient()
    const scoresObj: Record<string, number> = {}
    for (const [k, v] of Object.entries(playerScores)) scoresObj[k] = v
    let ok = false
    let attempts = 0
    while (!ok && attempts < 3) {
      const { error } = await supabase.from('ronda_libre_jugadores').update({ scores: scoresObj }).eq('id', jugadorId)
      if (!error) ok = true
      else {
        attempts++
        if (attempts < 3) await new Promise(r => setTimeout(r, 400 * attempts))
      }
    }
    if (ok) {
      setSaveStatus('saved')
      setHasUnsaved(false)
      setTimeout(() => setSaveStatus('idle'), 1200)
    } else {
      setSaveStatus('error')
      addToast({
        type: 'error',
        title: 'No se pudo guardar el score',
        message: 'Está guardado localmente — se reintentará al volver la conexión.',
        duration: 5000,
      })
    }
  }, [])

  /* ── Score change ── */
  const handleScoreChange = useCallback((jugadorId: string, hole: number, delta: number) => {
    setScores(prev => {
      const existingScore = prev[jugadorId]?.[hole]
      const hasExisting = existingScore != null && existingScore > 0

      // A3 edit window: si acabamos de confirmar un cambio en este mismo
      // jugador/hoyo y estamos dentro de los 3s, saltamos la confirmación
      // — permite correcciones iterativas (9→4) sin re-confirmar cada paso.
      const editWin = editWindowRef.current
      const inEditWindow = editWin?.jugadorId === jugadorId && editWin?.hole === hole

      // A1 anti-toque: si ya hay un score y NO estamos en edit window, exigir 2º tap.
      if (hasExisting && !inEditWindow) {
        const ref = pendingScoreConfirmRef.current
        const isConfirmed = ref?.jugadorId === jugadorId && ref?.hole === hole
        if (!isConfirmed) {
          // 1er tap → mostrar confirmación, NO cambiar nada
          const pending = { jugadorId, hole }
          setPendingScoreConfirm(pending)
          pendingScoreConfirmRef.current = pending
          haptic([15, 40, 15])
          if (pendingConfirmTimeoutRef.current) clearTimeout(pendingConfirmTimeoutRef.current)
          pendingConfirmTimeoutRef.current = setTimeout(() => {
            setPendingScoreConfirm(null)
            pendingScoreConfirmRef.current = null
          }, 2000)
          return prev
        }
        // 2º tap → limpiar pending y proceder
        setPendingScoreConfirm(null)
        pendingScoreConfirmRef.current = null
        if (pendingConfirmTimeoutRef.current) {
          clearTimeout(pendingConfirmTimeoutRef.current)
          pendingConfirmTimeoutRef.current = null
        }
      }

      // A3: abrir/renovar edit window de 3s tras cada cambio commiteado.
      editWindowRef.current = { jugadorId, hole }
      if (editWindowTimeoutRef.current) clearTimeout(editWindowTimeoutRef.current)
      editWindowTimeoutRef.current = setTimeout(() => {
        editWindowRef.current = null
      }, 3000)

      // Aplicar el cambio
      const par = parMap[hole] ?? 4
      const base = existingScore ?? par
      const newScore = Math.max(1, Math.min(19, base + delta))
      const next = { ...prev, [jugadorId]: { ...(prev[jugadorId] ?? {}), [hole]: newScore } }
      setHasUnsaved(true)
      lsSave(codigo, next)
      haptic(10)

      // A2: agendar save debounced (500ms) — rebatable por taps sucesivos
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
      const scoresSnapshot = next[jugadorId]
      saveDebounceRef.current = setTimeout(() => {
        saveSinglePlayer(jugadorId, scoresSnapshot)
      }, 500)

      return next
    })
  }, [parMap, codigo, saveSinglePlayer])

  /* ── Team score change ── */
  const handleTeamScoreChange = useCallback((equipoId: string, hole: number, delta: number) => {
    setTeamEquipos(prev => prev.map(eq => {
      if (eq.id !== equipoId) return eq
      const key = String(hole)
      const current = eq.scores[key]
      const base = current ?? (parMap[hole] ?? 4)
      const newScore = Math.max(1, Math.min(19, base + delta))
      const newScores = { ...eq.scores, [key]: newScore }
      // Persist to DB with retry and visible status (no more silent failures)
      setSaveStatus('saving')
      ;(async () => {
        const supabase = createClient()
        let ok = false
        let attempts = 0
        while (!ok && attempts < 3) {
          const { error } = await supabase.from('ronda_equipos').update({ scores: newScores }).eq('id', equipoId)
          if (!error) ok = true
          else {
            attempts++
            if (attempts < 3) await new Promise(r => setTimeout(r, 400 * attempts))
          }
        }
        if (ok) {
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 1500)
        } else {
          setSaveStatus('error')
          addToast({
            type: 'error',
            title: `Error guardando equipo en hoyo ${hole}`,
            message: 'Tu cambio quedó en la pantalla pero no pudo guardarse. Revisa tu conexión.',
            duration: 6000,
          })
        }
      })()
      setHasUnsaved(true)
      haptic(10)
      return { ...eq, scores: newScores }
    }))
  }, [parMap])

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

  /* ── Reset confirmations when changing holes ── */
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    setConfirmFinalize(false)
    if (confirmTimeoutRef.current) { clearTimeout(confirmTimeoutRef.current); confirmTimeoutRef.current = null }
    // También limpiar pending score confirm + edit window al cambiar de hoyo
    setPendingScoreConfirm(null)
    pendingScoreConfirmRef.current = null
    if (pendingConfirmTimeoutRef.current) { clearTimeout(pendingConfirmTimeoutRef.current); pendingConfirmTimeoutRef.current = null }
    editWindowRef.current = null
    if (editWindowTimeoutRef.current) { clearTimeout(editWindowTimeoutRef.current); editWindowTimeoutRef.current = null }
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

    // Guardar historical_rounds para cada jugador con cuenta registrada
    // (sin esto, los jugadores de rondas admin-mode no ven su ronda en "Mis rondas")
    const totalHolesForSave = ronda.holes ?? 18
    const teeSlopeCRCache: Record<string, { slope: number | null; cr: number | null; nineHole: { cr9h: number; slope9h: number } | null }> = {}
    for (const j of ronda.ronda_libre_jugadores) {
      if (!j.user_id) continue // invitados sin cuenta: no tienen historial
      try {
        // Para Scramble/Foursome: usar score del equipo (es el score real de la ronda)
        const isTeamSharedScore = ['scramble', 'foursome'].includes(ronda.formato_juego)
        let playerScores: Record<string | number, number> = scores[j.id] ?? {}
        if (isTeamSharedScore) {
          const equipoDelJugador = teamEquipos.find(eq => eq.jugadorIds.includes(j.id))
          if (equipoDelJugador) playerScores = equipoDelJugador.scores
        }
        const scoresArray: (number | null)[] = Array.from({ length: totalHolesForSave }, (_, i) => {
          const h = i + 1; const v = playerScores[h]
          return typeof v === 'number' ? v : null
        })
        const grossTotal = scoresArray.filter((s): s is number => s != null).reduce((a, b) => a + b, 0)
        const actualHolesPlayed = scoresArray.filter((s): s is number => s != null).length
        if (actualHolesPlayed === 0) continue // no jugó ningún hoyo

        const playerTee = (j.tees || ronda.tees || 'azul').toLowerCase()
        if (!teeSlopeCRCache[playerTee]) {
          let slope: number | null = null, cr: number | null = null
          let nineHole: { cr9h: number; slope9h: number } | null = null
          if (ronda.course_id) {
            const { data: teeData } = await supabase.from('course_tees')
              .select('rating, slope, front_course_rating, front_slope_rating')
              .eq('course_id', ronda.course_id).ilike('nombre', `${playerTee}%`).limit(1).single()
            if (teeData?.rating && teeData?.slope) { cr = teeData.rating; slope = teeData.slope }
            if (teeData?.front_course_rating && teeData?.front_slope_rating) {
              nineHole = { cr9h: teeData.front_course_rating, slope9h: teeData.front_slope_rating }
            }
            if (!slope || !cr) {
              const { data: cd } = await supabase.from('courses').select('slope_rating, course_rating').eq('id', ronda.course_id).single()
              slope = slope ?? cd?.slope_rating ?? null; cr = cr ?? cd?.course_rating ?? null
            }
          }
          teeSlopeCRCache[playerTee] = { slope, cr, nineHole }
        }
        const { slope, cr, nineHole } = teeSlopeCRCache[playerTee]
        // Rondas Scramble/Foursome no ajustan handicap individual (USGA/R&A)
        const diferencial = isTeamSharedScore ? null
          : (slope && cr && actualHolesPlayed >= 9)
            ? calcularDiferencial(grossTotal, cr, slope, actualHolesPlayed, nineHole)
            : null

        await supabase.from('historical_rounds').insert({
          user_id: j.user_id,
          course_name: ronda.course_name,
          course_id: ronda.course_id ?? null,
          played_at: ronda.fecha || new Date().toISOString().split('T')[0],
          total_gross: grossTotal,
          scores: scoresArray,
          holes_played: actualHolesPlayed,
          tee_color: playerTee,
          privacy: 'private',
          slope_rating: slope,
          course_rating: cr,
          diferencial,
          formato_juego: ronda.formato_juego ?? 'stroke_play',
          modo_juego: ronda.modo_juego ?? 'gross',
        })

        // Recalcular índice y nivel del jugador (non-blocking)
        supabase.rpc('calcular_indice_golfers', { p_user_id: j.user_id }).then(() => {})
        const hace90 = new Date(); hace90.setDate(hace90.getDate() - 90)
        supabase.from('historical_rounds').select('*', { count: 'exact', head: true })
          .eq('user_id', j.user_id).gte('played_at', hace90.toISOString())
          .then(({ count }) => {
            const nivel = calcularNivel(count ?? 0)
            const expira = new Date(); expira.setDate(expira.getDate() + 60)
            supabase.from('profiles').update({
              nivel, nivel_updated_at: new Date().toISOString(), nivel_expires_at: expira.toISOString(),
            }).eq('id', j.user_id!).then(() => {})
          })
      } catch { /* no bloquear finalización si falla un jugador */ }
    }

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

  // En Match Play Neto los dots representan la DIFERENCIA NETA de strokes
  // entre jugadores (el de menor HCP juega scratch). En stroke play / stableford
  // cada jugador usa su HCP absoluto.
  const isMatchPlay = formatoJuego === 'match_play'
  const getDotHcp = (playerId: string): number => {
    const absHcp = playerHcp[playerId] ?? 0
    if (!isMatchPlay) return absHcp
    const hcps = jugadores.map(p => playerHcp[p.id] ?? 0)
    const minHcp = hcps.length > 0 ? Math.min(...hcps) : 0
    return Math.max(0, absHcp - minHcp)
  }

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

    const isTeamScoring = ['scramble', 'foursome'].includes(formatoJuego)

    if (isTeamScoring) {
      // Auto-fill teams without scores with par
      const supabase = createClient()
      for (const eq of teamEquipos) {
        if (eq.scores[String(currentHole)] == null) {
          const newScores = { ...eq.scores, [String(currentHole)]: par }
          setTeamEquipos(prev => prev.map(e => e.id === eq.id ? { ...e, scores: newScores } : e))
          await supabase.from('ronda_equipos').update({ scores: newScores }).eq('id', eq.id)
        }
      }
    } else {
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
    }

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
          <div style={{ fontSize: '10px', color: theme.textFaint, marginTop: '1px' }}>
            {ronda.course_name}
            {anotadorNombre && (
              <>
                {' \u00B7 '}
                <span style={{ color: theme.gold, fontWeight: 600 }} aria-label="Anotador de la ronda">
                  {'\u270F\uFE0F '}{anotadorNombre}
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: '60px' }}>
          <div style={{ fontSize: '10px', color: theme.textFaint, letterSpacing: '0.04em' }}>THRU</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: theme.gold }}>{maxThru}/{totalHoles}</div>
        </div>
      </header>

      {/* Progress bar */}
      <div style={{ height: '3px', background: 'var(--border)', flexShrink: 0 }}>
        <div style={{ height: '3px', background: theme.gold, width: `${(maxThru / totalHoles) * 100}%`, transition: 'width 0.3s ease' }} />
      </div>

      {/* Hole progress row */}
      <div style={{ borderBottom: `1px solid ${theme.border}`, flexShrink: 0, overflow: 'hidden' }}>
        <div ref={progressRef} style={{ display: 'flex', overflowX: 'auto', padding: '5px 6px', gap: '2px', WebkitOverflowScrolling: 'touch' }}>
          {Array.from({ length: totalHoles }, (_, i) => i + 1).map(h => {
            const isActive = h === currentHole
            const allHaveScore = jugadores.every(j => scores[j.id]?.[h] != null)
            const anyPlayerGetsStroke = showNetStableford && jugadores.some(j => strokesRecibidosEnHoyo(getDotHcp(j.id), holeDataMap[h]?.stroke_index ?? h) > 0)
            return (
              <div key={h} onClick={() => setCurrentHole(h)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '22px', cursor: 'pointer', position: 'relative',
              }}>
                <div style={{ fontSize: '8px', color: isActive ? theme.gold : theme.textFaint, fontWeight: isActive ? 600 : 400, marginBottom: '2px' }}>{h}</div>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '3px',
                  background: allHaveScore ? 'rgba(196,153,42,0.12)' : isActive ? 'rgba(196,153,42,0.08)' : 'var(--bg)',
                  border: isActive ? '1.5px solid #C4992A' : allHaveScore ? '1px solid rgba(196,153,42,0.3)' : '1px solid #e2e8f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', color: allHaveScore ? theme.gold : 'transparent', fontWeight: 600,
                }}>
                  {allHaveScore ? '\u2713' : ''}
                </div>
                {anyPlayerGetsStroke && (
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-1px', width: '6px', height: '6px', borderRadius: '50%', background: '#c4992a', border: '0.5px solid rgba(255,255,255,0.8)' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Hole info row */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, background: 'var(--bg-surface)', flexShrink: 0 }}>
        {[
          { label: 'PAR', value: String(par) },
          { label: 'SI', value: String(holeData.stroke_index) },
          { label: 'YDS', value: (() => {
            // Admin es quien opera la UI. Si admin es jugador de la ronda, usar su tee.
            // Sino fallback al tee default de la ronda (r.tees).
            const adminPlayer = ronda.ronda_libre_jugadores?.find(p => p.user_id === ronda.admin_user_id)
            const refTee = adminPlayer?.tees || ronda.tees
            const y = getYardajeForTee(holeData, refTee)
            return y ? String(y) : '\u2014'
          })() },
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
          const maxStrokes = Math.max(...jugadores.map(j => strokesRecibidosEnHoyo(getDotHcp(j.id), holeData.stroke_index)))
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
          {/* Team scoring for Scramble/Foursome */}
          {['scramble', 'foursome'].includes(formatoJuego) && teamEquipos.length > 0 && teamEquipos.map(equipo => {
            const teamScore = equipo.scores[String(currentHole)]
            const displayTeamScore = teamScore ?? par
            const teamDiff = teamScore != null ? teamScore - par : 0
            const scoreResult = teamScore != null ? getScoreResult(teamScore, par) : null
            const chipStyle = scoreResult ? SCORE_STYLES[scoreResult] : null
            // Team total
            let teamGross = 0, teamParTotal = 0
            for (let h = 1; h <= totalHoles; h++) {
              const s = equipo.scores[String(h)]
              if (s != null) { teamGross += s; teamParTotal += parMap[h] ?? 4 }
            }
            const teamVsPar = teamGross - teamParTotal
            const teamPlayed = Object.keys(equipo.scores).filter(k => equipo.scores[k] != null).length

            return (
              <div key={equipo.id} style={{
                background: theme.card, borderRadius: '14px',
                border: `1px solid ${theme.border}`, padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>{equipo.nombre}</div>
                    <div style={{ fontSize: '10px', color: theme.textFaint, marginTop: '1px' }}>
                      {equipo.jugadorNombres.join(' \u00B7 ')}
                      {equipo.handicap_equipo != null && ` \u00B7 HCP ${equipo.handicap_equipo}`}
                    </div>
                    {formatoJuego === 'foursome' && equipo.jugadorNombres.length === 2 && (
                      <div style={{ fontSize: '10px', color: '#c4992a', marginTop: '2px' }}>
                        Tira: {teePlayerEnHoyo(currentHole, equipo.jugadorNombres[0], equipo.jugadorNombres[1])}
                      </div>
                    )}
                  </div>
                  {teamPlayed > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', color: theme.textFaint, fontFamily: '"DM Mono", monospace' }}>{teamGross}</span>
                      {formatoJuego === 'stableford' ? (
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#c4992a' }}>
                          {(() => {
                            let pts = 0
                            for (let h = 1; h <= totalHoles; h++) {
                              const s = equipo.scores[String(h)]
                              if (s != null) {
                                const hd = holeDataMap[h]
                                pts += puntosStablefordHoyo(s, hd?.par ?? 4, equipo.handicap_equipo ?? 0, hd?.stroke_index ?? h)
                              }
                            }
                            return `${pts} pts`
                          })()}
                        </span>
                      ) : (
                        <span style={{ fontSize: '13px', fontWeight: 700, color: getVsParColor(teamVsPar) }}>{getVsParLabel(teamVsPar)}</span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                  <button
                    onClick={() => handleTeamScoreChange(equipo.id, currentHole, -1)}
                    disabled={teamScore != null && teamScore <= 1}
                    style={{
                      width: '52px', height: '52px', borderRadius: '14px', fontSize: '24px', fontWeight: 300,
                      background: 'var(--bg)', color: '#374151', border: '1px solid #e2e8f0',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      touchAction: 'manipulation', userSelect: 'none',
                      opacity: teamScore != null && teamScore <= 1 ? 0.3 : 1,
                    }}
                  >{'\u2212'}</button>
                  <div style={{ textAlign: 'center', minWidth: '80px' }}>
                    <div style={{ fontSize: '42px', fontWeight: 700, lineHeight: 1, color: teamScore != null ? '#1a1a2e' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>
                      {displayTeamScore}
                    </div>
                    {teamScore != null && chipStyle && (
                      <div style={{
                        padding: '2px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: 500,
                        background: chipStyle.bg, color: chipStyle.textColor,
                        border: `${chipStyle.borderWidth} solid ${chipStyle.border}`,
                        display: 'inline-block', marginTop: '4px',
                      }}>
                        {teamDiff <= -2 ? 'Eagle' : teamDiff === -1 ? 'Birdie' : teamDiff === 0 ? 'Par' : teamDiff === 1 ? 'Bogey' : `+${teamDiff}`}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleTeamScoreChange(equipo.id, currentHole, 1)}
                    disabled={teamScore != null && teamScore >= 15}
                    style={{
                      width: '52px', height: '52px', borderRadius: '14px', fontSize: '24px', fontWeight: 600,
                      background: theme.gold, color: '#ffffff', border: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      touchAction: 'manipulation', userSelect: 'none',
                      opacity: teamScore != null && teamScore >= 15 ? 0.3 : 1,
                    }}
                  >+</button>
                </div>
              </div>
            )
          })}

          {/* Individual scoring (hidden for team scoring formats) */}
          {!['scramble', 'foursome'].includes(formatoJuego) && jugadores.map(j => {
            const playerScore = scores[j.id]?.[currentHole]
            const displayScore = playerScore ?? par
            const diff = playerScore != null ? playerScore - par : 0
            const { gross, vsPar, out, inn } = getPlayerTotal(j.id)
            const played = holesWithScores(j.id)
            const scoreResult = playerScore != null ? getScoreResult(playerScore, par) : null
            const chipStyle = scoreResult ? SCORE_STYLES[scoreResult] : null
            const hcp = playerHcp[j.id] ?? 0
            const dotHcp = getDotHcp(j.id)
            const strokesThisHole = strokesRecibidosEnHoyo(dotHcp, holeData.stroke_index)
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

                {/* A1 anti-toque: aviso cuando hay pending confirm para este jugador/hoyo */}
                {pendingScoreConfirm?.jugadorId === j.id && pendingScoreConfirm?.hole === currentHole && (
                  <div style={{
                    textAlign: 'center', marginBottom: '8px',
                    fontSize: '11px', fontWeight: 600, color: '#c4992a',
                    background: 'rgba(196,153,42,0.12)',
                    border: '1px solid rgba(196,153,42,0.35)',
                    borderRadius: '8px', padding: '6px 10px',
                    animation: 'livePulse 1.2s ease-in-out infinite',
                  }}>
                    Tocá otra vez para cambiar el score
                  </div>
                )}

                {/* Score + controls */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                  {/* Minus button */}
                  <button
                    onClick={() => handleScoreChange(j.id, currentHole, -1)}
                    disabled={playerScore != null && playerScore <= 1}
                    style={{
                      width: '52px', height: '52px', borderRadius: '14px',
                      fontSize: '24px', fontWeight: 300,
                      background: pendingScoreConfirm?.jugadorId === j.id && pendingScoreConfirm?.hole === currentHole
                        ? 'rgba(196,153,42,0.2)' : 'var(--bg)',
                      color: '#374151',
                      border: pendingScoreConfirm?.jugadorId === j.id && pendingScoreConfirm?.hole === currentHole
                        ? '1px solid rgba(196,153,42,0.55)' : '1px solid #e2e8f0',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      touchAction: 'manipulation', userSelect: 'none',
                      opacity: playerScore != null && playerScore <= 1 ? 0.3 : 1,
                      transition: 'background 0.2s, border 0.2s',
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
                          display: 'inline-flex', alignItems: 'center', gap: '3px',
                          alignSelf: 'flex-start', marginTop: '6px',
                        }}>
                          {Array.from({ length: strokesThisHole }, (_, i) => (
                            <span key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c4992a' }} />
                          ))}
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
                      background: pendingScoreConfirm?.jugadorId === j.id && pendingScoreConfirm?.hole === currentHole
                        ? '#d4a843' : theme.gold,
                      color: '#ffffff',
                      border: pendingScoreConfirm?.jugadorId === j.id && pendingScoreConfirm?.hole === currentHole
                        ? '2px solid rgba(255,255,255,0.6)' : 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      touchAction: 'manipulation', userSelect: 'none',
                      opacity: playerScore != null && playerScore >= 15 ? 0.3 : 1,
                      transition: 'background 0.2s, border 0.2s',
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
              : confirmFinalize ? (maxThru < totalHoles ? `\u00bfGuardar ronda parcial (${maxThru}/${totalHoles} hoyos)?` : '\u00bfFinalizar ronda?') : 'Finalizar ronda \u2713'}
          </button>
        )}
      </div>

      {/* Descartar ronda — dos-pasos, destructivo sutil */}
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
        >{discarding ? 'Descartando\u2026' : confirmDiscard ? 'Toca otra vez para borrar todo' : 'Descartar ronda'}</button>
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
