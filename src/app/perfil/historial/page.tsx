'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { formatLabel } from '@/golf/core/rules'
import Scorecard, { type ScorecardHole, type ScorecardProps } from '@/components/Scorecard'
import HoleBar from '@/components/HoleBar'
import { calcularDiferencial, calcularNivel } from '@/lib/indice-golfers'
import { parPerHoleArray } from '@/golf/core/compare'
import { Radio, ClipboardList, Trophy, ChevronDown, AlertTriangle, MoreVertical, Pencil, Trash2 } from '@/components/icons'

/* ─── Datos ────────────────────────────────────────────── */
const CANCHAS_CHILE = [
  'Granadilla Golf Club', 'Club de Golf Los Leones', 'Club de Golf La Dehesa',
  'Club de Golf Marbella', 'Club de Golf Hacienda', 'Prince of Wales Country Club',
  'Club de Campo del Pacífico', 'Club de Golf Cachagua', 'Rocas de Santo Domingo Golf',
  'Club de Golf Concón', 'Club de Golf Viña del Mar', 'Club de Golf Quisco',
  'Club de Golf Valle Escondido', 'Club de Golf Papudo', 'Club de Golf Zapallar',
  'Club de Golf Algarrobo', 'Club de Golf Cartagena', 'Club de Golf Casablanca',
  'Los Arrayanes Golf Club', 'Club de Golf Pirque', 'Club de Golf Rancagua',
  'Club de Golf San Fernando', 'Club de Golf Talca', 'Club de Golf Chillán',
  'Club de Golf Concepción', 'Club de Golf Los Ángeles', 'Club de Golf Temuco',
  'Club de Golf Valdivia', 'Club de Golf Osorno', 'Club de Golf Puerto Montt',
  'Club de Golf Puerto Varas', 'Club de Golf Punta Arenas',
  'Club de Golf Antofagasta', 'Club de Golf Iquique', 'Club de Golf Arica',
  'Club de Golf La Serena', 'Club de Golf Copiapó', 'Club de Golf Ovalle',
  'Club de Golf Quilicura', 'Club de Golf Maipú', 'Club de Golf Pudahuel',
  'Club de Golf Peñalolén', 'Club de Golf Lo Barnechea', 'Club de Golf Vitacura',
  'Club de Golf Las Condes', 'Stgo. Country Club', 'Otra cancha',
]

const TEES = ['Blanco', 'Amarillo', 'Azul', 'Rojo', 'Dorado', 'Negro', 'Verde', 'Naranja']
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => THIS_YEAR - i)

/* ─── Types ────────────────────────────────────────────── */
interface HistoricalRound {
  id:           string
  course_name:  string
  course_id?:   string | null
  tee_color:    string | null
  played_at:    string
  scores:       (number | null)[]
  total_gross:  number | null
  holes_played: number | null
  notes:        string | null
  privacy:      string
  created_at:   string
  formato_juego?: string
  modo_juego?:    string
  par_per_hole?:  Record<string, number> | null
  /** Si true, la ronda NO entra al cálculo del índice Golfers+ (inbox e21e2a32 parte B). */
  excluded_from_handicap?: boolean
  /** Diferencial WHS pre-calculado en BD — usado por modal "¿Qué rondas cuentan?" (inbox 82af3d48). */
  diferencial?: number | null
}

interface BestRound {
  score: number
  course: string
  date: string
  vsPar: number
  /** id de la ronda — habilita tap-to-scroll a la card en la lista (inbox e21e2a32). */
  roundId: string | null
}

interface HistorialStats {
  totalRounds: number
  totalRounds18: number
  totalRounds9: number
  avgOverPar18: number | null
  avgOverPar9: number | null
  totalBirdies: number
  totalEagles: number
  totalPars: number
  totalBogeys: number
  totalDoubles: number
  bestRound18: BestRound | null
  bestRound9: BestRound | null
  courseBreakdown: Array<{ courseName: string; roundCount: number; avgScore: number; bestScore: number }>
  roundsByMonth: Array<{ month: string; label: string; rounds: unknown[] }>
}

/* ─── Helpers ──────────────────────────────────────────── */
function computeStats(scores: (number | null)[], holePars?: number[]) {
  const filled = scores.filter((s): s is number => s != null)
  if (filled.length === 0) return null
  const total     = filled.reduce((a, b) => a + b, 0)
  const pars_arr  = holePars ?? Array(filled.length).fill(4)
  const par       = pars_arr.reduce((a, b) => a + b, 0)
  const overUnder = total - par
  // Contar resultados usando par real por hoyo (no asumir par 4)
  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0
  for (let i = 0; i < filled.length; i++) {
    const diff = filled[i] - (pars_arr[i] ?? 4)
    if (diff <= -2) eagles++
    else if (diff === -1) birdies++
    else if (diff === 0) pars++
    else if (diff === 1) bogeys++
    else doubles++
  }
  const front9    = filled.slice(0, 9).reduce((a, b) => a + b, 0)
  const back9     = filled.length > 9 ? filled.slice(9).reduce((a, b) => a + b, 0) : null
  return { total, overUnder, eagles, birdies, pars, bogeys, doubles, front9, back9, filledHoles: filled.length, holePars: pars_arr }
}

function cellBg(score: number | null, par: number = 4): React.CSSProperties {
  if (score == null) return { background: 'var(--score-empty-bg)',  color: 'var(--score-empty-fg)' }
  const diff = score - par
  if (diff <= -2)  return { background: 'var(--score-eagle-bg)',  color: 'var(--score-eagle-fg)' }
  if (diff === -1) return { background: 'var(--score-birdie-bg)', color: 'var(--score-birdie-fg)' }
  if (diff === 0)  return { background: 'rgba(0,0,0,0.04)',       color: 'var(--text)' } // par neutro en ambos modos
  if (diff === 1)  return { background: 'var(--score-bogey-bg)',  color: 'var(--score-bogey-fg)' }
  return { background: 'var(--score-double-bg)', color: 'var(--score-double-fg)' }
}

function formatOv(n: number) { return n > 0 ? `+${n}` : n === 0 ? 'E' : String(n) }

function taigerMessage(count: number): string {
  if (count === 0) return 'tAIger+ está listo para analizar tu juego'
  if (count < 5)   return 'tAIger+ está aprendiendo tu juego'
  if (count < 10)  return 'Análisis parcial disponible'
  if (count < 20)  return 'tAIger+ detecta tus patrones'
  if (count < 50)  return 'perfil sólido — análisis profundo activo'
  return 'análisis completo'
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getMonthLabel(dateStr: string): string {
  const [year, monthStr] = dateStr.split('-')
  const idx = parseInt(monthStr, 10) - 1
  return `${MONTHS[idx]} ${year}`
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

function groupByMonth(rounds: HistoricalRound[]): Array<{ key: string; label: string; rounds: HistoricalRound[] }> {
  const map = new Map<string, HistoricalRound[]>()
  for (const r of rounds) {
    const key = getMonthKey(r.played_at)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, rounds]) => ({ key, label: getMonthLabel(rounds[0].played_at), rounds }))
}

function scoreColor(vsPar: number | null): string {
  if (vsPar == null) return '#374151'
  if (vsPar < 0) return '#16a34a'
  if (vsPar === 0) return '#c4992a'
  return '#5a6370' // sobre par = gris neutro (NUNCA rojo para score total)
}

const TEE_COLORS: Record<string, string> = {
  Blanco: '#ffffff', Amarillo: '#fbbf24', Azul: '#3b82f6', Rojo: '#ef4444',
  Dorado: '#c4992a', Negro: '#111827', Verde: '#22c55e', Naranja: '#f97316',
}

/* ─── Estilos base ─────────────────────────────────────── */
const inputBase: React.CSSProperties = {
  background:   'var(--input-bg)',
  border:       '1px solid var(--input-border)',
  color:        'var(--text)',
  borderRadius: '8px',
  padding:      '10px 12px',
  outline:      'none',
  width:        '100%',
  boxSizing:    'border-box' as const,
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  borderRadius: '14px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  overflow: 'hidden',
}

/* ─── Componente ───────────────────────────────────────── */
function HistorialContent() {
  const router = useRouter()

  const [userId,   setUserId]   = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)
  // roundsLoaded distingue "todavía cargando rondas" de "ya cargué y están vacías".
  // Sin esta separación se renderizaba el empty state "Tu historial está vacío" en el
  // gap entre auth done y loadRounds() done — flash visible al volver de una tarjeta
  // (inbox 9e37669f).
  const [roundsLoaded, setRoundsLoaded] = useState(false)
  const [rounds,   setRounds]   = useState<HistoricalRound[]>([])
  const [showForm, setShowForm] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('add') === 'true'
    }
    return false
  })
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  // Menú "..." por card (editar/eliminar minimalista, inbox 92ebdc65).
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  const [editScores, setEditScores] = useState<(number | null)[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [courseParCache, setCourseParCache] = useState<Record<string, Record<number, number>>>({})

  // Stats from API
  const [apiStats, setApiStats] = useState<HistorialStats | null>(null)

  // Form fields
  const [courseName, setCourseName] = useState('')
  const [teeColor,   setTeeColor]   = useState('')
  const [day,   setDay]   = useState(String(new Date().getDate()))
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [year,  setYear]  = useState(String(THIS_YEAR))
  const [scores, setScores] = useState<(number | null)[]>(Array(18).fill(null))
  const [notes,      setNotes]      = useState('')
  const [privacy,    setPrivacy]    = useState('private')


  const formStats  = computeStats(scores)
  const totalGross = formStats?.total ?? null

  /* ── Aggregate header stats (fallback from local rounds if API hasn't loaded) ──
         Match Play se mide en hoyos ganados, no en strokes vs par; excluir
         esas rondas del promedio y del best-round para no ensuciar la estadística. */
  let aggBirdies = 0, aggEagles = 0
  let ovSum = 0, ovCount = 0
  for (const r of rounds) {
    const holePars = parPerHoleArray(r.par_per_hole, r.scores?.length ?? 0)
    const s = computeStats(r.scores, holePars)
    if (!s) continue
    aggBirdies += s.birdies
    aggEagles  += s.eagles
    if (r.total_gross != null && r.formato_juego !== 'match_play') {
      // Regla de golf: vsPar solo se mide sobre hoyos jugados. El promedio
      // del historial solo tiene sentido con rondas COMPLETAS — incluir
      // rondas parciales (ej. 13 de 18 hoyos) compara total_gross parcial
      // contra par 72 y produce números absurdos tipo "-28".
      const expectedHoles = r.holes_played ?? r.scores?.length ?? 18
      const playedHoles = r.scores?.filter((s: number | null) => s != null).length ?? 0
      const isComplete = playedHoles >= expectedHoles && playedHoles > 0
      if (isComplete) {
        const parRonda = expectedHoles <= 9 ? 36 : 72
        ovSum += r.total_gross - parRonda
        ovCount++
      }
    }
  }
  const avgOv = ovCount > 0 ? Math.round(ovSum / ovCount * 10) / 10 : null

  /* ── Personal Record — por vsPar, solo rondas COMPLETAS (excluye match play) ── */
  const bestRound = rounds.reduce<{ score: number; course: string; vsPar: number } | null>((best, r) => {
    if (r.total_gross == null) return best
    if (r.formato_juego === 'match_play') return best
    const expectedHoles = r.holes_played ?? r.scores?.length ?? 18
    const playedHoles = r.scores?.filter((s: number | null) => s != null).length ?? 0
    if (playedHoles < expectedHoles || playedHoles === 0) return best
    const parRonda = expectedHoles <= 9 ? 36 : 72
    const rVsPar = r.total_gross - parRonda
    if (!best || rVsPar < best.vsPar) return { score: r.total_gross, course: r.course_name, vsPar: rVsPar }
    return best
  }, null)

  const [loadError, setLoadError] = useState(false)

  // Inyectar keyframes globales una sola vez. Patrón portable (mismo que
  // InstallAppCard / StepCelebration) — evita problemas de styled-jsx
  // con ESLint + inline animation style.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const id = 'historial-skel-keyframes'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      @keyframes historial-skel {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `
    document.head.appendChild(style)
  }, [])

  /* Auth */
  useEffect(() => {
    const check = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login?redirect=/perfil/historial'); return }
        setUserId(user.id)
        setLoading(false)
      } catch {
        setLoading(false)
        setLoadError(true)
      }
    }
    check()
  }, [router])

  /* Timeout — si loading dura más de 8s, mostrar estado vacío */
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false)
        setLoadError(true)
      }
    }, 8000)
    return () => clearTimeout(timeout)
  }, [loading])

  /* Fetch stats from API — non-blocking */
  useEffect(() => {
    if (loading) return
    fetch('/api/historial/stats')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setApiStats(data as HistorialStats) })
      .catch(() => { /* non-blocking, ignore */ })
  }, [loading])

  const loadRounds = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('historical_rounds')
        .select('id, course_name, course_id, tee_color, played_at, scores, total_gross, holes_played, notes, privacy, created_at, formato_juego, modo_juego, par_per_hole, excluded_from_handicap, diferencial')
        .order('played_at', { ascending: false })
        .limit(500)
      if (error) { setLoadError(true); return }
      setRounds((data as HistoricalRound[]) || [])
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      // Marcamos roundsLoaded incluso si hubo error, para que el JSX deje de mostrar
      // el skeleton; el bloque loadError ya cubre la rama de fallo.
      setRoundsLoaded(true)
    }
  }, [])

  useEffect(() => { if (!loading) loadRounds() }, [loading, loadRounds])

  const resetForm = () => {
    setCourseName(''); setTeeColor('')
    setDay(String(new Date().getDate())); setMonth(String(new Date().getMonth() + 1)); setYear(String(THIS_YEAR))
    setScores(Array(18).fill(null)); setNotes(''); setPrivacy('private')
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    setSaving(true)
    const playedAt = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`
    const supabase = createClient()

    // Lookup slope/rating from courses by name for diferencial
    let slopeRating: number | null = null
    let courseRating: number | null = null
    let courseId: string | null = null
    if (courseName) {
      const { data: courseData } = await supabase
        .from('courses')
        .select('id, slope_rating, course_rating')
        .ilike('nombre', courseName)
        .limit(1)
        .single()
      if (courseData) {
        courseId = courseData.id
        // Try tee-specific CR/Slope
        if (teeColor && courseData.id) {
          const { data: teeData } = await supabase
            .from('course_tees')
            .select('rating, slope')
            .eq('course_id', courseData.id)
            .ilike('nombre', `${teeColor}%`)
            .limit(1)
            .single()
          if (teeData?.rating) courseRating = teeData.rating
          if (teeData?.slope) slopeRating = teeData.slope
        }
        if (!courseRating) courseRating = courseData.course_rating ?? null
        if (!slopeRating) slopeRating = courseData.slope_rating ?? null
      }
    }
    const diferencial = (slopeRating && courseRating && totalGross)
      ? calcularDiferencial(totalGross, courseRating, slopeRating)
      : null

    // holes_played es ahora NOT NULL — contamos los hoyos con score real.
    // Si el form quedara vacío (caso defensivo, el botón debería estar bloqueado),
    // caemos a 18 que es el default histórico.
    const holesPlayed = scores.filter((s) => s != null).length || 18

    const { error } = await supabase.from('historical_rounds').insert({
      user_id: userId, course_name: courseName,
      course_id: courseId,
      tee_color: teeColor || null, played_at: playedAt,
      scores, total_gross: totalGross,
      holes_played: holesPlayed,
      notes: notes || null, privacy,
      slope_rating: slopeRating,
      course_rating: courseRating,
      diferencial,
    })
    setSaving(false)
    if (!error) {
      // Recalculate Índice Golfers+ and nivel
      supabase.rpc('calcular_indice_golfers', { p_user_id: userId }).then(() => {})
      const hace90Dias = new Date()
      hace90Dias.setDate(hace90Dias.getDate() - 90)
      supabase
        .from('historical_rounds')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('played_at', hace90Dias.toISOString())
        .then(({ count }) => {
          const nuevoNivel = calcularNivel(count ?? 0)
          const expira = new Date()
          expira.setDate(expira.getDate() + 60)
          supabase.from('profiles').update({
            nivel: nuevoNivel,
            nivel_updated_at: new Date().toISOString(),
            nivel_expires_at: expira.toISOString(),
          }).eq('id', userId).then(() => {})
        })
      await trackEvent(supabase, userId!, 'tarjeta_historica_agregada', { course_name: courseName })
      resetForm(); setShowForm(false); await loadRounds()
    }
  }

  // Toggle excluded_from_handicap — inbox e21e2a32 parte B.
  // Update optimista en UI + UPDATE en BD + trigger recálculo del índice.
  const handleToggleExcluded = async (r: HistoricalRound) => {
    const next = !r.excluded_from_handicap
    setRounds(prev => prev.map(x => x.id === r.id ? { ...x, excluded_from_handicap: next } : x))
    const supabase = createClient()
    const { error } = await supabase
      .from('historical_rounds')
      .update({ excluded_from_handicap: next })
      .eq('id', r.id)
    if (error) {
      // Revert si falló
      setRounds(prev => prev.map(x => x.id === r.id ? { ...x, excluded_from_handicap: !next } : x))
      return
    }
    // Disparar recálculo del índice (fire-and-forget como en handleDelete)
    if (userId) {
      void supabase.rpc('calcular_indice_golfers', { p_user_id: userId })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta ronda de tu historial? Esta acción no se puede deshacer.')) return
    setDeleting(id)
    const supabase = createClient()
    await supabase.from('historical_rounds').delete().eq('id', id)
    setDeleting(null)
    setRounds(prev => prev.filter(r => r.id !== id))
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    // Load course pars if we have course_id and not cached
    const round = rounds.find(r => r.id === id)
    if (round?.course_id && !courseParCache[round.course_id]) {
      const supabase = createClient()
      supabase.from('course_holes').select('numero, par').eq('course_id', round.course_id).order('numero')
        .then(({ data }) => {
          if (data && data.length > 0) {
            const pars: Record<number, number> = {}
            data.forEach((h: { numero: number; par: number }) => { pars[h.numero] = h.par })
            setCourseParCache(prev => ({ ...prev, [round.course_id!]: pars }))
          }
        })
    }
  }

  const startEdit = (r: HistoricalRound) => {
    setEditingId(r.id)
    setEditScores([...(r.scores ?? [])].concat(Array(18).fill(null)).slice(0, 18))
    // Auto-expand
    setExpanded(prev => { const next = new Set(prev); next.add(r.id); return next })
  }

  const handleEditScore = (idx: number, value: string) => {
    const num = value === '' ? null : parseInt(value)
    setEditScores(prev => {
      const next = [...prev]
      next[idx] = (num != null && !isNaN(num) && num >= 1 && num <= 15) ? num : null
      return next
    })
  }

  const saveEdit = async (id: string) => {
    setSavingEdit(true)
    const filled = editScores.filter((s): s is number => s != null)
    const totalGross = filled.reduce((a, b) => a + b, 0)
    const supabase = createClient()
    await supabase.from('historical_rounds').update({
      scores: editScores,
      total_gross: totalGross > 0 ? totalGross : null,
    }).eq('id', id)
    setRounds(prev => prev.map(r => r.id === id ? { ...r, scores: editScores, total_gross: totalGross > 0 ? totalGross : null } : r))
    setEditingId(null)
    setSavingEdit(false)
  }

  /* ── Derived data ── */
  const monthGroups = groupByMonth(rounds)

  // Use API stats if available, otherwise fallback to local computation
  const statRondas = apiStats?.totalRounds ?? rounds.length
  const statProm = apiStats?.avgOverPar18 != null ? formatOv(apiStats.avgOverPar18) : (avgOv != null ? formatOv(avgOv) : '—')
  const statBirdies = apiStats?.totalBirdies ?? aggBirdies
  const statEagles = apiStats?.totalEagles ?? aggEagles

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '32px', height: '32px', border: '3px solid var(--border)', borderTopColor: '#c4992a', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <div style={{ fontSize: '14px' }}>Cargando historial...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )

  if (loadError && rounds.length === 0) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '20px' }}>
      <div style={{ color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlertTriangle size={48} strokeWidth={1.5} /></div>
      <p style={{ color: 'var(--text)', fontSize: '16px', textAlign: 'center', margin: 0 }}>
        No se pudieron cargar las tarjetas
      </p>
      <p style={{ color: 'var(--text-3)', fontSize: '13px', textAlign: 'center', margin: 0 }}>
        Revisa tu conexión e intenta de nuevo
      </p>
      <button
        onClick={() => { setLoadError(false); setRoundsLoaded(false); setLoading(true); }}
        style={{
          background: '#c4992a', color: 'var(--brand-dark)', fontWeight: 700,
          fontSize: '14px', padding: '12px 28px', borderRadius: '10px',
          border: 'none', cursor: 'pointer', marginTop: '8px',
        }}
      >
        Reintentar
      </button>
      <Link href="/dashboard" style={{ color: 'var(--text-3)', fontSize: '13px', textDecoration: 'none', marginTop: '4px' }}>
        &#8592; Volver al dashboard
      </Link>
    </div>
  )

  const progress = Math.min(rounds.length / Math.max(rounds.length, 1), 1)

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>

      {/* ══════════════════════════════════════════════════════ */}
      {/* SECTION 1 — Header Stats                             */}
      {/* ══════════════════════════════════════════════════════ */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '20px 16px 16px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          {/* Back + Title */}
          <Link href="/perfil" style={{ color: 'var(--text-3)', fontSize: '13px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '6px', minHeight: '44px' }}>
            &#8592; Mi Perfil
          </Link>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '26px', color: 'var(--text)', margin: '0 0 16px 0', fontWeight: 700 }}>
            Mi Historial
          </h1>

          {/* Stat pills — horizontal scroll on mobile */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
            {[
              { label: 'Rondas',  value: String(statRondas) },
              { label: 'Prom',    value: statProm },
              { label: 'Birdies', value: String(statBirdies) },
              { label: 'Eagles',  value: String(statEagles) },
            ].map(pill => (
              <div key={pill.label} style={{
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '20px', padding: '6px 16px',
                display: 'flex', gap: '6px', alignItems: 'center',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>{pill.label}</span>
                <span style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{pill.value}</span>
              </div>
            ))}
          </div>

          {/* tAIger progress bar */}
          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              {/* TODO(foundation): reemplazar &#128047; por <TaigerIcon /> cuando el icon system migre emojis — P7 */}
              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>&#128047; {taigerMessage(rounds.length)}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{rounds.length}</span>
            </div>
            <div style={{ height: '4px', background: 'rgba(196,153,42,0.15)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '2px',
                width: `${progress * 100}%`,
                background: 'linear-gradient(90deg, #c4992a, #e8c06a)',
                transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px 16px 100px' }}>

        {/* ══════════════════════════════════════════════════════ */}
        {/* SECTION 2 — Personal Records (solo 18h y 9h)         */}
        {/* ══════════════════════════════════════════════════════ */}
        {apiStats && (apiStats.bestRound18 || apiStats.bestRound9) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '10px',
            marginBottom: '16px',
          }}>
            {/* Highlight transient cuando el user tapea un Personal Record (inbox e21e2a32) */}
            <style>{`
              .historial-pr-highlight {
                animation: historial-pr-pulse 1.6s ease-out;
              }
              @keyframes historial-pr-pulse {
                0%   { background: rgba(196,153,42,0.18); box-shadow: 0 0 0 3px rgba(196,153,42,0.35); }
                100% { background: transparent; box-shadow: 0 0 0 0 rgba(196,153,42,0); }
              }
            `}</style>
            {([
              { label: 'Personal Record 18 hoyos', data: apiStats.bestRound18, showVsPar: true },
              { label: 'Personal Record 9 hoyos', data: apiStats.bestRound9, showVsPar: true },
            ] as const).map(rec => {
              if (!rec.data) return null
              const d = rec.data
              const canScroll = !!d.roundId
              const handleClick = () => {
                if (!d.roundId) return
                // Tap-to-scroll a la card de la ronda PR en la lista (inbox e21e2a32).
                // Si la ronda no está visible (ej. está colapsada en un mes futuro), el
                // browser hace el scroll de todas formas porque el elemento existe en el DOM.
                const el = document.getElementById(`round-card-${d.roundId}`)
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  // Highlight transient de 1.6s para que el usuario "vea" cuál es.
                  el.classList.add('historial-pr-highlight')
                  setTimeout(() => el.classList.remove('historial-pr-highlight'), 1600)
                }
              }
              return (
                <div
                  key={rec.label}
                  onClick={canScroll ? handleClick : undefined}
                  onKeyDown={canScroll ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } } : undefined}
                  role={canScroll ? 'button' : undefined}
                  tabIndex={canScroll ? 0 : undefined}
                  aria-label={canScroll ? `Ir a ${rec.label} en la lista` : undefined}
                  style={{
                    ...cardStyle,
                    padding: '14px 16px',
                    cursor: canScroll ? 'pointer' : 'default',
                    transition: 'transform 120ms ease, box-shadow 120ms ease',
                  }}
                  onMouseEnter={canScroll ? (e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' } : undefined}
                  onMouseLeave={canScroll ? (e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' } : undefined}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', color: '#c4992a' }}><Trophy size={14} strokeWidth={1.75} /></span>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{rec.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace', fontSize: '28px', fontWeight: 700, color: '#c4992a', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {d.score}
                    </span>
                    {rec.showVsPar && 'vsPar' in d && (
                      <span style={{ fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace', fontSize: '12px', fontWeight: 600, color: scoreColor(d.vsPar), fontVariantNumeric: 'tabular-nums' }}>
                        {formatOv(d.vsPar)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.course}
                  </div>
                  <div style={{ fontSize: '10px', color: '#d1d5db', marginTop: '2px' }}>
                    {formatDateShort(d.date)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* SECTION 5 — Add Round Form (toggled by button/FAB)   */}
        {/* ══════════════════════════════════════════════════════ */}
        {showForm && (
          <form onSubmit={handleSave} style={{
            ...cardStyle,
            background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.2)',
            padding: '28px 20px', marginBottom: '24px',
          }}>

            {/* Live preview card */}
            <div style={{
              background: 'rgba(196,153,42,0.06)', border: '1px solid rgba(196,153,42,0.2)',
              borderRadius: '12px', padding: '16px 20px', marginBottom: '24px',
              borderLeft: '3px solid #c4992a',
            }}>
              <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', color: 'var(--text)', marginBottom: '4px' }}>
                {courseName || 'Tu cancha'}
                {teeColor && <span style={{ fontSize: '12px', color: 'var(--text-2)', marginLeft: '8px' }}>&#183; Tee {teeColor}</span>}
              </div>
              {formStats && totalGross != null ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                  <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '2rem', color: 'var(--text)', fontWeight: 700 }}>
                    {totalGross}
                  </span>
                  <span style={{
                    fontSize: '13px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px',
                    background: formStats.overUnder <= 0 ? 'rgba(196,153,42,0.2)' : 'rgba(220,38,38,0.15)',
                    color: formStats.overUnder <= 0 ? '#c4992a' : '#f87171',
                  }}>
                    {formatOv(formStats.overUnder)} par
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                    {formStats.birdies > 0 && `&#128038; ${formStats.birdies} `}
                    {formStats.bogeys  > 0 && `&#128204; ${formStats.bogeys} `}
                    {formStats.doubles > 0 && `&#128308; ${formStats.doubles}`}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '4px' }}>Ingresa tus scores hoyo a hoyo...</div>
              )}
              {formStats && (
                <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '6px' }}>
                  Total: {formStats.total} &#183; {formStats.overUnder > 0 ? '+' : ''}{formStats.overUnder === 0 ? 'E' : formStats.overUnder} &#183; {formStats.birdies} birdies &#183; {formStats.pars} pares &#183; {formStats.bogeys} bogeys
                </div>
              )}
            </div>

            {/* Cancha + Tee */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px' }}>Cancha *</label>
                <select required value={courseName} onChange={e => setCourseName(e.target.value)}
                  style={{ ...inputBase, cursor: 'pointer' }}>
                  <option value="">— Seleccionar cancha —</option>
                  {CANCHAS_CHILE.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px' }}>Tees</label>
                <select value={teeColor} onChange={e => setTeeColor(e.target.value)}
                  style={{ ...inputBase, cursor: 'pointer', width: '110px' }}>
                  <option value="">—</option>
                  {TEES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Fecha */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px' }}>Fecha *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={day}   onChange={e => setDay(e.target.value)}   style={{ ...inputBase, width: '70px',  cursor: 'pointer' }}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputBase, flex: 1,       cursor: 'pointer' }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select value={year}  onChange={e => setYear(e.target.value)}  style={{ ...inputBase, width: '90px',  cursor: 'pointer' }}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Scores por hoyo — front 9 + back 9 */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '8px' }}>
                Scores por hoyo (par 4 asumido)
              </label>
              {(['Front 9', 'Back 9'] as const).map((half, halfIdx) => (
                <div key={half} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '5px' }}>{half}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '5px' }}>
                    {Array.from({ length: 9 }, (_, j) => {
                      const idx = halfIdx * 9 + j
                      const val = scores[idx]
                      return (
                        <div key={idx} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '9px', color: 'var(--text-2)', marginBottom: '3px' }}>H{idx + 1}</div>
                          <input
                            type="number" min={1} max={19} inputMode="numeric"
                            placeholder="—"
                            value={val ?? ''}
                            onChange={e => {
                              const n = parseInt(e.target.value)
                              const next = [...scores]
                              next[idx] = isNaN(n) || n < 1 || n > 20 ? null : n
                              setScores(next)
                            }}
                            style={{
                              width: '100%', ...cellBg(val),
                              border: '1px solid rgba(122,143,168,0.15)',
                              borderRadius: '6px', padding: '7px 2px',
                              fontSize: '16px',
                              fontWeight: 600, textAlign: 'center',
                              outline: 'none', appearance: 'textfield' as const,
                              boxSizing: 'border-box' as const, minHeight: '44px',
                            }}
                            onFocus={e  => (e.currentTarget.style.borderColor = '#c4992a')}
                            onBlur={e   => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.15)')}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Notas */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px' }}>Notas (opcional)</label>
              <textarea
                placeholder="¿Algo memorable de esta ronda?"
                value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                style={{ ...inputBase, resize: 'vertical', minHeight: '58px' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#c4992a')}
                onBlur={e  => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')}
              />
            </div>

            {/* Save button */}
            <div>
              <button type="submit" disabled={saving || !courseName} style={{
                width: '100%', height: '54px',
                background: saving || !courseName ? 'rgba(196,153,42,0.4)' : '#c4992a',
                color: 'var(--brand-dark)', fontWeight: 700, fontSize: '16px',
                borderRadius: '10px', border: 'none',
                cursor: saving || !courseName ? 'not-allowed' : 'pointer',
              }}>
                {saving ? 'Guardando...' : 'Guardar y ver mi análisis \u2192'}
              </button>
              <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-2)', marginTop: '8px' }}>
                &#128047; tAIger+ analizará esta ronda automáticamente
              </div>
            </div>
          </form>
        )}

        {/* ── Loading skeleton de rondas ── */}
        {roundsLoaded === false && !loadError && !showForm && (
          <div aria-busy="true" aria-live="polite" style={{ padding: '24px 16px' }}>
            <div style={{ srOnly: 'true' } as React.CSSProperties} className="sr-only">Cargando historial…</div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: '80px',
                  marginBottom: '12px',
                  borderRadius: '12px',
                  background: 'linear-gradient(90deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.07) 50%, rgba(0,0,0,0.04) 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'historial-skel 1.4s ease-in-out infinite',
                }}
              />
            ))}
            {/* Keyframes inyectados via useEffect (ver bloque al inicio del componente).
                <style jsx global> rompe ESLint en Vercel build. */}
          </div>
        )}

        {/* ── Empty state — solo cuando roundsLoaded para evitar flash al volver de una tarjeta ── */}
        {roundsLoaded && rounds.length === 0 && !showForm && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            {loadError ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}><Radio size={56} strokeWidth={1.5} /></div>
                <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: 'var(--text)', marginBottom: '8px' }}>
                  La carga tardó más de lo esperado
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-3)', marginBottom: '28px', maxWidth: '320px', margin: '0 auto 28px' }}>
                  Puede ser tu conexión a internet. Intenta recargar la página.
                </div>
                <button
                  onClick={() => window.location.reload()}
                  style={{
                    background: '#c4992a', color: 'var(--brand-dark)', fontWeight: 700, fontSize: '14px',
                    padding: '12px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  }}
                >
                  Recargar
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}><ClipboardList size={56} strokeWidth={1.5} /></div>
                <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: 'var(--text)', marginBottom: '8px' }}>
                  Tu historial esta vacio
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '28px', maxWidth: '360px', margin: '0 auto 28px', lineHeight: 1.6 }}>
                  Importa tu historial o registra tu primera ronda para activar tus estadisticas y el coaching con IA.
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setShowForm(true)}
                    style={{
                      background: '#c4992a', color: 'var(--brand-dark)', fontWeight: 700, fontSize: '14px',
                      padding: '12px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                    }}
                  >
                    Registrar ronda
                  </button>
                  <a href="/importar" style={{
                    display: 'inline-flex', alignItems: 'center',
                    background: 'transparent', color: '#c4992a', fontWeight: 600, fontSize: '14px',
                    padding: '12px 24px', borderRadius: '10px', border: '1px solid rgba(196,153,42,0.4)',
                    textDecoration: 'none',
                  }}>
                    Importar historial
                  </a>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(196,153,42,0.6)', padding: '10px 16px', background: 'rgba(196,153,42,0.06)', borderRadius: '8px', display: 'inline-block', marginTop: '20px' }}>
                  &#128047; tAIger+ analizara tu juego con 3+ rondas
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* SECTION 4 — Rounds grouped by month                  */}
        {/* ══════════════════════════════════════════════════════ */}
        {rounds.length > 0 && (
          <>
            {monthGroups.map(group => (
              <div key={group.key} style={{ marginBottom: '24px' }}>
                {/* Month header */}
                <h2 style={{
                  fontFamily: '"Playfair Display", serif',
                  fontSize: '18px', fontWeight: 700, color: 'var(--text)',
                  margin: '0 0 10px 4px',
                }}>
                  {group.label}
                </h2>

                <div style={{ ...cardStyle }}>
                  {group.rounds.map((r, rIdx) => {
                    const holePars = parPerHoleArray(r.par_per_hole, r.scores?.length ?? 0)
                    const stats   = computeStats(r.scores, holePars)
                    const dateStr = formatDateShort(r.played_at)
                    const holes   = r.holes_played ?? r.scores?.filter(Boolean).length ?? 18
                    const par     = stats?.holePars ? stats.holePars.reduce((a: number, b: number) => a + b, 0) : (holes <= 9 ? 36 : 72)
                    // Match Play no se mide por strokes vs par — se mide por hoyos
                    // ganados/perdidos. No mostramos +N sobre el par total en la row.
                    const isMatchPlay = r.formato_juego === 'match_play'
                    // vsPar solo es válido sobre rondas COMPLETAS. Si la ronda es
                    // parcial y no tenemos pars hoyo a hoyo, no podemos calcular
                    // contra el par jugado real → mostrar "—" en lugar de un
                    // número absurdo tipo "-28".
                    const playedScores = r.scores?.filter((s: number | null) => s != null).length ?? 0
                    const isCompleteRound = playedScores >= holes && playedScores > 0
                    const ov      = (r.total_gross != null && !isMatchPlay && isCompleteRound) ? r.total_gross - par : null
                    const isOpen  = expanded.has(r.id)
                    const teeHex  = r.tee_color ? TEE_COLORS[r.tee_color] || '#9ca3af' : null

                    return (
                      <div
                        key={r.id}
                        id={`round-card-${r.id}`}
                        className="card-animate"
                        onClick={() => router.push(`/perfil/historial/${r.id}`)}
                        style={{
                          borderBottom: rIdx < group.rounds.length - 1 ? '1px solid #f0f0f0' : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {/* Row */}
                        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                          {/* Score — colored by vsPar */}
                          <div style={{ flexShrink: 0, textAlign: 'center', width: '50px' }}>
                            <div style={{
                              fontSize: '26px', fontWeight: 700, lineHeight: 1,
                              color: scoreColor(ov),
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {r.total_gross ?? '—'}
                            </div>
                            {ov != null && (
                              <div style={{
                                fontSize: '11px', fontWeight: 600, marginTop: '3px',
                                color: scoreColor(ov),
                              }}>
                                {formatOv(ov)}
                              </div>
                            )}
                          </div>

                          {/* Divider */}
                          <div style={{ width: '1px', height: '36px', background: 'var(--border)', flexShrink: 0 }} />

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.course_name}
                              </span>
                              {r.formato_juego && r.formato_juego !== 'stroke_play' && (
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  background: 'rgba(196,153,42,0.12)',
                                  color: '#92400e',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  fontFamily: '"DM Mono", monospace',
                                  letterSpacing: '0.02em',
                                  marginLeft: '6px',
                                  flexShrink: 0,
                                }}>
                                  {formatLabel(r.formato_juego, r.modo_juego)}
                                </span>
                              )}
                              {r.modo_juego === 'neto' && r.formato_juego !== 'stableford' && r.formato_juego !== 'match_play' && (
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 6px',
                                  borderRadius: '6px',
                                  // Paleta de marca: dorado outline para badges de modo.
                                  // El azul/cian (#1e40af) estaba fuera del design system.
                                  background: 'rgba(196,153,42,0.08)',
                                  color: '#92400e',
                                  border: '1px solid rgba(196,153,42,0.25)',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  fontFamily: '"DM Mono", monospace',
                                  letterSpacing: '0.02em',
                                  marginLeft: '4px',
                                  flexShrink: 0,
                                }}>
                                  NETO
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                              <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{dateStr}</span>
                              {teeHex && (
                                <span style={{
                                  width: '8px', height: '8px', borderRadius: '50%',
                                  background: teeHex,
                                  border: teeHex === '#ffffff' ? '1px solid #d1d5db' : 'none',
                                  display: 'inline-block', flexShrink: 0,
                                }} />
                              )}
                            </div>
                          </div>

                          {/* Right side — menú "..." + chevron (inbox 92ebdc65) */}
                          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setMenuOpenFor(menuOpenFor === r.id ? null : r.id) }}
                              aria-label="Opciones de la tarjeta"
                              aria-expanded={menuOpenFor === r.id}
                              aria-haspopup="menu"
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--text-3)', padding: '6px',
                                minWidth: '32px', minHeight: '32px',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: '8px',
                              }}
                            >
                              <MoreVertical size={16} strokeWidth={2} />
                            </button>
                            <span style={{
                              fontSize: '12px', color: '#d1d5db',
                              transition: 'transform 0.2s',
                              transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                              display: 'inline-block',
                            }} aria-hidden><ChevronDown size={14} strokeWidth={2} /></span>

                            {menuOpenFor === r.id && (
                              <>
                                {/* Backdrop click-outside */}
                                <div
                                  onClick={(e) => { e.stopPropagation(); setMenuOpenFor(null) }}
                                  style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                                  aria-hidden
                                />
                                <div
                                  role="menu"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    position: 'absolute', top: 'calc(100% + 4px)', right: '4px',
                                    minWidth: '160px',
                                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                    borderRadius: '10px',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)',
                                    padding: '4px',
                                    zIndex: 50,
                                  }}
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setMenuOpenFor(null)
                                      // Navegar a página detalle con flag edit (el detalle entra en modo edición).
                                      router.push(`/perfil/historial/${r.id}?edit=1`)
                                    }}
                                    style={{
                                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                                      padding: '10px 12px', minHeight: '44px',
                                      background: 'none', border: 'none', cursor: 'pointer',
                                      fontSize: '13px', color: 'var(--text)',
                                      fontFamily: '"DM Sans", system-ui, sans-serif',
                                      borderRadius: '6px',
                                      textAlign: 'left',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(196,153,42,0.08)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                                  >
                                    <Pencil size={14} strokeWidth={1.75} />
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setMenuOpenFor(null)
                                      // Toggle excluded_from_handicap (inbox e21e2a32 parte B).
                                      void handleToggleExcluded(r)
                                    }}
                                    style={{
                                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                                      padding: '10px 12px', minHeight: '44px',
                                      background: 'none', border: 'none', cursor: 'pointer',
                                      fontSize: '13px', color: 'var(--text)',
                                      fontFamily: '"DM Sans", system-ui, sans-serif',
                                      borderRadius: '6px',
                                      textAlign: 'left',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(196,153,42,0.08)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                                  >
                                    <span style={{ width: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden>
                                      {r.excluded_from_handicap ? '✓' : '∅'}
                                    </span>
                                    {r.excluded_from_handicap ? 'Incluir en índice' : 'Excluir del índice'}
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    disabled={deleting === r.id}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setMenuOpenFor(null)
                                      // Confirmación nativa antes de borrar (acción destructiva).
                                      const dateLabel = r.played_at ? formatDateShort(r.played_at) : 'esta ronda'
                                      const courseLabel = r.course_name || 'esa cancha'
                                      if (window.confirm(`¿Eliminar la ronda en ${courseLabel} (${dateLabel})? No se puede deshacer.`)) {
                                        void handleDelete(r.id)
                                      }
                                    }}
                                    style={{
                                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                                      padding: '10px 12px', minHeight: '44px',
                                      background: 'none', border: 'none', cursor: 'pointer',
                                      fontSize: '13px', color: '#dc2626',
                                      fontFamily: '"DM Sans", system-ui, sans-serif',
                                      borderRadius: '6px',
                                      textAlign: 'left',
                                      opacity: deleting === r.id ? 0.5 : 1,
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(220,38,38,0.08)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                                  >
                                    <Trash2 size={14} strokeWidth={1.75} />
                                    {deleting === r.id ? 'Eliminando…' : 'Eliminar'}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Garmin activity bar.
                            par_per_hole por ronda es la fuente confiable; courseParCache
                            solo se popula al expandir la card, así que sin esta preferencia
                            la barra colapsada renderizaba con par=4 default → colores
                            incoherentes con la ronda real (inbox 4633254e). */}
                        {r.scores && r.scores.some(Boolean) && (
                          <div style={{ padding: '0 16px 8px' }}>
                            <HoleBar
                              scores={r.scores ?? []}
                              pars={r.par_per_hole ?? (r.course_id ? courseParCache[r.course_id] : undefined) ?? {}}
                              totalHoles={r.holes_played ?? 18}
                              height={5}
                              gap={1.5}
                            />
                          </div>
                        )}

                        {/* Badge "Excluida del índice" — inbox e21e2a32 parte B.
                            Indicador sutil para que el usuario sepa qué rondas marcó como excluidas. */}
                        {r.excluded_from_handicap && (
                          <div style={{ padding: '0 16px 10px' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              fontSize: '10px', fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: 'rgba(148,168,192,0.12)',
                              color: 'var(--text-3)',
                              fontFamily: '"DM Mono", monospace',
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                            }}>
                              <span aria-hidden>∅</span> no cuenta para el índice
                            </span>
                          </div>
                        )}

                        {/* ── Expanded scorecard ── */}
                        {isOpen && (() => {
                          // Preferencia: par_per_hole de la ronda > courseParCache (popula al expandir) > {}.
                          // Sin esto la scorecard expandida usaba par=4 default cuando el cache aún no había
                          // resuelto, dando una vsPar errónea por hoyo.
                          const parPerHoleRaw = r.par_per_hole ?? {}
                          const cp: Record<number, number> = r.course_id ? (courseParCache[r.course_id] ?? {}) : {}
                          const getParFor = (n: number): number => {
                            const fromRound = parPerHoleRaw[String(n)] ?? (parPerHoleRaw as Record<number, number>)[n]
                            if (typeof fromRound === 'number') return fromRound
                            return cp[n] ?? 4
                          }
                          const totalHoles = r.holes_played ?? 18
                          const scorecardHoles: ScorecardHole[] = Array.from({ length: totalHoles }, (_, i) => ({
                            numero: i + 1,
                            par: getParFor(i + 1),
                            stroke_index: i + 1,
                          }))
                          const scorecardScores: Record<string, number> = Object.fromEntries(
                            (r.scores ?? [])
                              .map((s: number | null, i: number) => [String(i + 1), s] as [string, number | null])
                              .filter((pair): pair is [string, number] => pair[1] != null)
                          )

                          return (
                            <div style={{ padding: '0 0 14px' }} onClick={(e) => e.stopPropagation()}>
                              <Scorecard
                                holes={scorecardHoles}
                                scores={scorecardScores}
                                courseHandicap={0}
                                modo="gross"
                                formato={(r.formato_juego as ScorecardProps['formato']) ?? 'stroke_play'}
                                playerName={undefined}
                                courseName={r.course_name}
                                date={dateStr}
                              />

                              {/* Action buttons */}
                              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', padding: '0 10px' }}>
                                {editingId !== r.id && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); startEdit(r) }}
                                    style={{
                                      background: 'none', border: '1px solid var(--border)', borderRadius: '8px',
                                      padding: '6px 14px', fontSize: '12px', color: '#c4992a', fontWeight: 600,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Editar
                                  </button>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(r.id) }}
                                  disabled={deleting === r.id}
                                  style={{
                                    background: 'none', border: '1px solid #fecaca', borderRadius: '8px',
                                    padding: '6px 14px', fontSize: '12px', color: '#dc2626', fontWeight: 500,
                                    cursor: 'pointer', opacity: deleting === r.id ? 0.5 : 1,
                                  }}
                                >
                                  {deleting === r.id ? 'Eliminando...' : 'Eliminar'}
                                </button>
                              </div>

                              {/* Edit mode */}
                              {editingId === r.id && (
                                <div style={{ marginTop: '12px', borderTop: '1px solid #f0f0f0', paddingTop: '12px' }} onClick={(e) => e.stopPropagation()}>
                                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>Editar scores (1-15)</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '3px', marginBottom: '6px' }}>
                                    {Array.from({ length: 9 }, (_, i) => (
                                      <div key={i} style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '8px', color: 'var(--text-3)', marginBottom: '2px' }}>{i + 1}</div>
                                        <input
                                          type="text" inputMode="numeric" pattern="[0-9]*"
                                          value={editScores[i] ?? ''}
                                          onChange={(e) => handleEditScore(i, e.target.value)}
                                          style={{ width: '100%', textAlign: 'center', fontSize: '14px', fontWeight: 600, padding: '6px 0', border: '1px solid var(--border)', borderRadius: '6px', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text)', boxSizing: 'border-box' }}
                                          onFocus={(e) => { e.target.style.borderColor = '#c4992a'; e.target.select() }}
                                          onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '3px', marginBottom: '10px' }}>
                                    {Array.from({ length: 9 }, (_, i) => (
                                      <div key={i + 9} style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '8px', color: 'var(--text-3)', marginBottom: '2px' }}>{i + 10}</div>
                                        <input
                                          type="text" inputMode="numeric" pattern="[0-9]*"
                                          value={editScores[i + 9] ?? ''}
                                          onChange={(e) => handleEditScore(i + 9, e.target.value)}
                                          style={{ width: '100%', textAlign: 'center', fontSize: '14px', fontWeight: 600, padding: '6px 0', border: '1px solid var(--border)', borderRadius: '6px', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text)', boxSizing: 'border-box' }}
                                          onFocus={(e) => { e.target.style.borderColor = '#c4992a'; e.target.select() }}
                                          onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); saveEdit(r.id) }}
                                      disabled={savingEdit}
                                      style={{ flex: 1, padding: '10px', background: '#c4992a', color: 'var(--brand-dark)', fontWeight: 700, fontSize: '14px', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                    >
                                      {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditingId(null) }}
                                      style={{ padding: '10px 16px', background: 'none', border: '1px solid var(--border)', color: '#6b7280', fontSize: '14px', borderRadius: '8px', cursor: 'pointer' }}
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-3)', marginTop: '20px' }}>
              {rounds.length} tarjetas guardadas
            </p>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* FAB — Add round button                               */}
      {/* ══════════════════════════════════════════════════════ */}
      <button
        onClick={() => { setShowForm(!showForm); if (!showForm) resetForm() }}
        style={{
          position: 'fixed', bottom: '24px', right: '24px',
          width: '56px', height: '56px', borderRadius: '50%',
          background: showForm ? '#6b7280' : '#c4992a',
          color: showForm ? '#ffffff' : '#1a1a2e',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          fontSize: '24px', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50,
          transition: 'background 0.2s, transform 0.2s',
        }}
        aria-label={showForm ? 'Cancelar' : 'Agregar ronda'}
      >
        <span style={{ transform: showForm ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block', lineHeight: 1 }}>+</span>
      </button>
    </div>
  )
}

export default function HistorialPage() {
  return (
    <Suspense fallback={<div style={{ background: 'var(--bg)', minHeight: '100vh' }} />}>
      <HistorialContent />
    </Suspense>
  )
}
