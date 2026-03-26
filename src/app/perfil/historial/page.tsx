'use client'

import { Suspense, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import ScoreSymbol from '@/components/ScoreSymbol'

/* ─── Types ────────────────────────────────────────────── */
interface RoundData {
  id: string
  course_name: string
  played_at: string
  scores: number[]
  total_gross: number
  holes_played: number
  import_source: string | null
  parPerHole: number[] | null
  vsPar: number | null
}

interface MonthGroup {
  month: string
  label: string
  rounds: RoundData[]
}

interface RecordEntry {
  score: number
  course: string
  date: string
  vsPar?: number
}

interface CourseBreakdown {
  courseName: string
  roundCount: number
  avgScore: number
  bestScore: number
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
  bestRound18: RecordEntry | null
  bestRound9: RecordEntry | null
  bestFront9: { score: number; course: string; date: string } | null
  bestBack9: { score: number; course: string; date: string } | null
  recentScores18: { date: string; score: number; vsPar: number }[]
  courseBreakdown: CourseBreakdown[]
  roundsByMonth: MonthGroup[]
}

interface CourseOption {
  id: string
  nombre: string
}

interface CourseHole {
  numero: number
  par: number
  recorrido: string | null
}

/* ─── Constants ────────────────────────────────────────── */
const TEES = ['Blanco', 'Amarillo', 'Azul', 'Rojo', 'Dorado', 'Negro', 'Verde', 'Naranja']
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => THIS_YEAR - i)
const GOLD = '#c4992a'
const GOLD_LIGHT = 'rgba(196,153,42,0.12)'

/* ─── Helpers ──────────────────────────────────────────── */
function formatOv(n: number) { return n > 0 ? `+${n}` : n === 0 ? 'E' : String(n) }

function scoreColor(vsPar: number | null): string {
  if (vsPar == null) return '#374151'
  if (vsPar < 0) return '#16a34a'
  if (vsPar === 0) return GOLD
  return '#dc2626'
}

function taigerMessage(count: number): string {
  if (count === 0) return 'tAIger+ esta listo para analizar tu juego'
  if (count < 5) return 'tAIger+ esta aprendiendo tu juego'
  if (count < 10) return 'Analisis parcial disponible'
  if (count < 20) return 'tAIger+ detecta tus patrones'
  return 'Perfil solido — analisis profundo activo'
}

function taigerProgress(count: number): number {
  // Logarithmic scale: 5->20%, 10->40%, 20->65%, 50->85%, 100->95%
  if (count === 0) return 0
  return Math.min(Math.log(count + 1) / Math.log(120) * 100, 100)
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function importBadge(source: string | null): { label: string; bg: string; color: string } | null {
  if (!source) return null
  const s = source.toLowerCase()
  if (s.includes('garmin')) return { label: 'Garmin', bg: '#dcfce7', color: '#166534' }
  if (s.includes('photo') || s.includes('foto')) return { label: 'Foto', bg: GOLD_LIGHT, color: '#92702a' }
  return null
}

/* ─── SVG Icons ────────────────────────────────────────── */
function IconTrophy({ size = 20, color = GOLD }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  )
}

function IconFlag({ size = 18, color = '#6b7280' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

function IconPlus({ size = 18, color = '#070d18' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconChevron({ open, color = '#9ca3af' }: { open: boolean; color?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
      style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function IconTrash({ size = 16, color = '#d1d5db' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function IconGolf({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="30" fill={GOLD_LIGHT} />
      <path d="M32 14v28M32 14l12 8-12 8" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="48" r="4" fill={GOLD} opacity="0.3" />
      <circle cx="32" cy="48" r="2" fill={GOLD} />
    </svg>
  )
}

/* ─── Sparkline Component ──────────────────────────────── */
function Sparkline({ data }: { data: { vsPar: number }[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 100)
    return () => clearTimeout(t)
  }, [])

  if (data.length < 2) return null

  const last20 = data.slice(-20)
  const W = 280, H = 48, PAD = 4
  const scores = last20.map(d => d.vsPar)
  const min = Math.min(...scores) - 1
  const max = Math.max(...scores) + 1
  const range = max - min || 1

  const points = scores.map((s, i) => {
    const x = PAD + (i / (scores.length - 1)) * (W - 2 * PAD)
    const y = PAD + (1 - (s - min) / range) * (H - 2 * PAD)
    return `${x},${y}`
  }).join(' ')

  // Zero line (par)
  const zeroY = PAD + (1 - (0 - min) / range) * (H - 2 * PAD)

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '48px', display: 'block' }}>
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 3" />
      <polyline
        points={points}
        fill="none"
        stroke={GOLD}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: drawn ? 'none' : '1000',
          strokeDashoffset: drawn ? '0' : '1000',
          transition: 'stroke-dashoffset 1.2s ease-out',
        }}
      />
      {/* Last point dot */}
      {(() => {
        const lastPt = points.split(' ').pop()!.split(',')
        return <circle cx={parseFloat(lastPt[0])} cy={parseFloat(lastPt[1])} r="3" fill={GOLD} />
      })()}
    </svg>
  )
}

/* ─── AnimatedNumber Component ─────────────────────────── */
function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(0)
  const formatter = format || ((n: number) => String(n))

  useEffect(() => {
    if (value === 0) { setDisplay(0); return }
    const duration = 600
    const start = performance.now()
    const from = 0
    const step = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // easeOutCubic
      setDisplay(Math.round(from + (value - from) * eased))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [value])

  return <>{formatter(display)}</>
}

/* ─── Main Component ───────────────────────────────────── */
function HistorialContent() {
  const router = useRouter()

  // Core state
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [stats, setStats] = useState<HistorialStats | null>(null)

  // UI state
  const [showForm, setShowForm] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('add') === 'true'
    }
    return false
  })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState('all')
  const [deleting, setDeleting] = useState<string | null>(null)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editScores, setEditScores] = useState<(number | null)[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  // Form state
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [courseId, setCourseId] = useState('')
  const [teeColor, setTeeColor] = useState('')
  const [day, setDay] = useState(String(new Date().getDate()))
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [year, setYear] = useState(String(THIS_YEAR))
  const [formScores, setFormScores] = useState<(number | null)[]>(Array(18).fill(null))
  const [formPars, setFormPars] = useState<number[]>([])
  const [courseHoles, setCourseHoles] = useState<CourseHole[]>([])
  const [recorridos, setRecorridos] = useState<string[]>([])
  const [selectedRecorrido, setSelectedRecorrido] = useState('')
  const [saving, setSaving] = useState(false)
  const [holeCount, setHoleCount] = useState(18)

  // Refs
  const mounted = useRef(false)

  /* ── Auth ── */
  useEffect(() => {
    const check = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login?redirect=/perfil/historial'); return }
        setUserId(user.id)
        setLoading(false)
      } catch (err) {
        setLoading(false)
        setLoadError(true)
        setErrorDetail('Auth error: ' + (err instanceof Error ? err.message : 'desconocido'))
      }
    }
    check()
  }, [router])

  /* ── Timeout ── */
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) { setLoading(false); setLoadError(true); setErrorDetail('Timeout: la carga tardo mas de 15 segundos') }
    }, 15000)
    return () => clearTimeout(timeout)
  }, [loading])

  /* ── Load stats — direct from Supabase (reliable, no API dependency) ── */
  const [errorDetail, setErrorDetail] = useState('')
  const loadStats = useCallback(async () => {
    if (!userId) return
    try {
      const supabase = createClient()

      // Parallel fetch: rounds + courses + holes
      const [roundsRes, coursesRes, holesRes] = await Promise.all([
        supabase.from('historical_rounds')
          .select('id, course_name, course_id, played_at, scores, total_gross, holes_played, import_source')
          .order('played_at', { ascending: false })
          .limit(500),
        supabase.from('courses').select('id, nombre'),
        supabase.from('course_holes').select('course_id, numero, par').order('numero'),
      ])

      if (roundsRes.error) throw new Error(roundsRes.error.message)

      const rawRounds = roundsRes.data || []
      const allCourses = coursesRes.data || []
      const allHoles = holesRes.data || []

      // Build course par map
      const courseParMap = new Map<string, number[]>()
      for (const h of allHoles) {
        if (!courseParMap.has(h.course_id)) courseParMap.set(h.course_id, [])
        courseParMap.get(h.course_id)!.push(h.par)
      }

      // Process rounds
      const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

      let totalBirdies = 0, totalEagles = 0, totalParsCount = 0, totalBogeys = 0, totalDoubles = 0
      let bestRound18: HistorialStats['bestRound18'] = null
      let bestRound9: HistorialStats['bestRound9'] = null
      let bestFront9: HistorialStats['bestFront9'] = null
      let bestBack9: HistorialStats['bestBack9'] = null
      const recentScores18: HistorialStats['recentScores18'] = []
      const courseCountMap = new Map<string, { count: number; totalScore: number; best: number }>()
      const monthGroups = new Map<string, HistorialStats['roundsByMonth'][0]>()

      let sum18 = 0, count18 = 0, sum9 = 0, count9 = 0

      for (const r of rawRounds) {
        const scores: number[] = Array.isArray(r.scores) ? r.scores : []
        const holesPlayed = r.holes_played || scores.length || 18
        const totalGross = r.total_gross || scores.reduce((a: number, b: number) => a + (b || 0), 0)

        // Find pars
        let parPerHole: number[] | null = null
        let vsPar: number | null = null
        const courseId = r.course_id
        if (courseId && courseParMap.has(courseId)) {
          parPerHole = courseParMap.get(courseId)!.slice(0, holesPlayed)
        }
        if (parPerHole && parPerHole.length >= holesPlayed) {
          const parTotal = parPerHole.reduce((a, b) => a + b, 0)
          vsPar = totalGross - parTotal
          // Count hole stats
          for (let i = 0; i < Math.min(scores.length, parPerHole.length); i++) {
            if (scores[i] == null) continue
            const diff = scores[i] - parPerHole[i]
            if (diff <= -2) totalEagles++
            else if (diff === -1) totalBirdies++
            else if (diff === 0) totalParsCount++
            else if (diff === 1) totalBogeys++
            else totalDoubles++
          }
        } else {
          const stdPar = holesPlayed <= 9 ? 36 : 72
          vsPar = totalGross - stdPar
        }

        // Averages
        if (holesPlayed >= 18) { sum18 += vsPar || 0; count18++ }
        else { sum9 += vsPar || 0; count9++ }

        // Best rounds
        if (holesPlayed >= 18 && (!bestRound18 || totalGross < bestRound18.score)) {
          bestRound18 = { score: totalGross, course: r.course_name, date: r.played_at, vsPar: vsPar || 0 }
        }
        if (holesPlayed <= 9 && holesPlayed > 0 && (!bestRound9 || totalGross < bestRound9.score)) {
          bestRound9 = { score: totalGross, course: r.course_name, date: r.played_at, vsPar: vsPar || 0 }
        }
        const front9 = scores.slice(0, 9).reduce((a: number, b: number) => a + (b || 0), 0)
        const back9 = scores.slice(9).reduce((a: number, b: number) => a + (b || 0), 0)
        if (front9 > 0 && (!bestFront9 || front9 < bestFront9.score)) {
          bestFront9 = { score: front9, course: r.course_name, date: r.played_at }
        }
        if (back9 > 0 && scores.length > 9 && (!bestBack9 || back9 < bestBack9.score)) {
          bestBack9 = { score: back9, course: r.course_name, date: r.played_at }
        }

        // Recent 18h for sparkline
        if (holesPlayed >= 18 && recentScores18.length < 20) {
          recentScores18.push({ date: r.played_at, score: totalGross, vsPar: vsPar || 0 })
        }

        // Course breakdown
        const cc = courseCountMap.get(r.course_name)
        if (cc) { cc.count++; cc.totalScore += totalGross; cc.best = Math.min(cc.best, totalGross) }
        else courseCountMap.set(r.course_name, { count: 1, totalScore: totalGross, best: totalGross })

        // Month grouping
        const monthKey = r.played_at.slice(0, 7)
        const monthIdx = parseInt(r.played_at.slice(5, 7), 10) - 1
        const monthLabel = `${MONTH_NAMES[monthIdx] || '?'} ${r.played_at.slice(0, 4)}`

        if (!monthGroups.has(monthKey)) {
          monthGroups.set(monthKey, { month: monthKey, label: monthLabel, rounds: [] })
        }
        monthGroups.get(monthKey)!.rounds.push({
          id: r.id, course_name: r.course_name, played_at: r.played_at,
          scores, total_gross: totalGross, holes_played: holesPlayed,
          import_source: r.import_source, parPerHole, vsPar,
        })
      }

      // Build courseBreakdown
      const courseBreakdown = Array.from(courseCountMap.entries())
        .map(([name, d]) => ({ courseName: name, roundCount: d.count, avgScore: Math.round(d.totalScore / d.count), bestScore: d.best }))
        .sort((a, b) => b.roundCount - a.roundCount)
        .slice(0, 5)

      const statsData: HistorialStats = {
        totalRounds: rawRounds.length,
        totalRounds18: count18,
        totalRounds9: count9,
        avgOverPar18: count18 > 0 ? Math.round(sum18 / count18 * 10) / 10 : null,
        avgOverPar9: count9 > 0 ? Math.round(sum9 / count9 * 10) / 10 : null,
        totalBirdies, totalEagles, totalPars: totalParsCount, totalBogeys, totalDoubles,
        bestRound18, bestRound9, bestFront9, bestBack9,
        recentScores18: recentScores18.reverse(),
        courseBreakdown,
        roundsByMonth: Array.from(monthGroups.values()),
      }

      setStats(statsData)
      setLoadError(false)
      setErrorDetail('')
    } catch (err) {
      setLoadError(true)
      setErrorDetail(err instanceof Error ? err.message : 'Error desconocido')
    }
  }, [userId])

  useEffect(() => {
    if (!loading && userId) loadStats()
  }, [loading, userId, loadStats])

  /* ── Load courses for form ── */
  useEffect(() => {
    if (!loading && userId) {
      const supabase = createClient()
      supabase.from('courses').select('id, nombre').order('nombre').then(({ data }) => {
        if (data) setCourses(data as CourseOption[])
      })
    }
  }, [loading, userId])

  /* ── Load course holes when course selected ── */
  useEffect(() => {
    if (!courseId) {
      setCourseHoles([])
      setFormPars([])
      setRecorridos([])
      setSelectedRecorrido('')
      setHoleCount(18)
      return
    }
    const supabase = createClient()
    supabase.from('course_holes').select('numero, par, recorrido')
      .eq('course_id', courseId).order('numero')
      .then(({ data }) => {
        if (!data || data.length === 0) {
          setCourseHoles([])
          setFormPars([])
          setRecorridos([])
          setSelectedRecorrido('')
          return
        }
        const holes = data as CourseHole[]
        setCourseHoles(holes)

        // Check for recorridos
        const uniqueRec = Array.from(new Set(holes.map(h => h.recorrido).filter(Boolean) as string[]))
        setRecorridos(uniqueRec)

        if (uniqueRec.length > 0) {
          setSelectedRecorrido(uniqueRec[0])
        } else {
          // Single recorrido
          const sorted = holes.sort((a, b) => a.numero - b.numero)
          setHoleCount(sorted.length)
          setFormPars(sorted.map(h => h.par))
          setFormScores(Array(sorted.length).fill(null))
        }
      })
  }, [courseId])

  /* ── Update pars when recorrido changes ── */
  useEffect(() => {
    if (!selectedRecorrido || courseHoles.length === 0) return
    const filtered = courseHoles
      .filter(h => h.recorrido === selectedRecorrido)
      .sort((a, b) => a.numero - b.numero)
    setHoleCount(filtered.length)
    setFormPars(filtered.map(h => h.par))
    setFormScores(Array(filtered.length).fill(null))
  }, [selectedRecorrido, courseHoles])

  /* ── Filtered rounds ── */
  const filteredMonths = useMemo(() => {
    if (!stats) return []
    return stats.roundsByMonth.map(mg => {
      let filtered = mg.rounds
      if (activeFilter === '18') filtered = filtered.filter(r => r.holes_played >= 18)
      else if (activeFilter === '9') filtered = filtered.filter(r => r.holes_played < 18)
      else if (activeFilter !== 'all') filtered = filtered.filter(r => r.course_name === activeFilter)
      return { ...mg, rounds: filtered }
    }).filter(mg => mg.rounds.length > 0)
  }, [stats, activeFilter])

  /* ── Filter chips ── */
  const filterChips = useMemo(() => {
    if (!stats) return []
    const chips: { key: string; label: string }[] = [
      { key: 'all', label: 'Todas' },
      { key: '18', label: '18 hoyos' },
      { key: '9', label: '9 hoyos' },
    ]
    // Top 5 courses
    const topCourses = stats.courseBreakdown
      .sort((a, b) => b.roundCount - a.roundCount)
      .slice(0, 5)
    for (const c of topCourses) {
      chips.push({ key: c.courseName, label: c.courseName.replace(/Club de Golf\s*/i, '').replace(/Golf Club\s*/i, '') || c.courseName })
    }
    return chips
  }, [stats])

  /* ── Form helpers ── */
  const selectedCourseName = courses.find(c => c.id === courseId)?.nombre || ''

  const formTotal = useMemo(() => {
    const filled = formScores.filter((s): s is number => s != null)
    return filled.length > 0 ? filled.reduce((a, b) => a + b, 0) : null
  }, [formScores])

  const formVsPar = useMemo(() => {
    if (formPars.length === 0 || formTotal == null) return null
    const parTotal = formPars.reduce((a, b) => a + b, 0)
    return formTotal - parTotal
  }, [formTotal, formPars])

  const resetForm = () => {
    setCourseId('')
    setTeeColor('')
    setDay(String(new Date().getDate()))
    setMonth(String(new Date().getMonth() + 1))
    setYear(String(THIS_YEAR))
    setFormScores(Array(18).fill(null))
    setFormPars([])
    setRecorridos([])
    setSelectedRecorrido('')
    setHoleCount(18)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !courseId) return
    setSaving(true)
    const playedAt = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    const supabase = createClient()
    const { error } = await supabase.from('historical_rounds').insert({
      user_id: userId,
      course_name: selectedCourseName,
      course_id: courseId,
      tee_color: teeColor || null,
      played_at: playedAt,
      scores: formScores,
      total_gross: formTotal,
      holes_played: holeCount,
    })
    setSaving(false)
    if (!error) {
      await trackEvent(supabase, userId, 'tarjeta_historica_agregada', { course_name: selectedCourseName })
      resetForm()
      setShowForm(false)
      await loadStats()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar esta tarjeta?')) return
    setDeleting(id)
    const supabase = createClient()
    await supabase.from('historical_rounds').delete().eq('id', id)
    setDeleting(null)
    await loadStats()
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const startEdit = (r: RoundData) => {
    setEditingId(r.id)
    setEditScores([...(r.scores ?? [])].concat(Array(18).fill(null)).slice(0, r.holes_played || 18))
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
    setEditingId(null)
    setSavingEdit(false)
    await loadStats()
  }

  /* ── Fade-in on mount ── */
  useEffect(() => { mounted.current = true }, [])

  /* ── Loading ── */
  if (loading) return (
    <div style={{ background: '#f8f9fa', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${GOLD_LIGHT}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Cargando historial...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  /* ── Error ── */
  if (loadError && !stats) return (
    <div style={{ background: '#f8f9fa', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '20px' }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      <p style={{ color: '#111827', fontSize: '16px', textAlign: 'center', margin: 0 }}>No se pudieron cargar las tarjetas</p>
      <p style={{ color: '#6b7280', fontSize: '13px', textAlign: 'center', margin: 0 }}>Revisa tu conexion e intenta de nuevo</p>
      {errorDetail && <p style={{ color: '#ef4444', fontSize: '11px', textAlign: 'center', margin: 0, fontFamily: 'monospace', maxWidth: '300px', wordBreak: 'break-all' }}>{errorDetail}</p>}
      <button
        onClick={() => { setLoadError(false); setLoading(true) }}
        style={{ background: GOLD, color: '#070d18', fontWeight: 700, fontSize: '14px', padding: '12px 28px', borderRadius: '10px', border: 'none', cursor: 'pointer', marginTop: '8px' }}
      >
        Reintentar
      </button>
      <Link href="/perfil" style={{ color: '#6b7280', fontSize: '13px', textDecoration: 'none', marginTop: '4px' }}>
        Volver a mi perfil
      </Link>
    </div>
  )

  const s = stats // shorthand
  const totalRounds = s?.totalRounds ?? 0
  const avgOv = s?.avgOverPar18 ?? s?.avgOverPar9

  return (
    <div style={{ background: '#f8f9fa', minHeight: '100vh' }}>

      {/* ════════════════════════════════════════════════════════ */}
      {/* SECTION 1: HEADER                                      */}
      {/* ════════════════════════════════════════════════════════ */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '20px 20px 24px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>

          {/* Back + Title + Button */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
            <div>
              <Link href="/perfil" style={{ color: '#9ca3af', fontSize: '13px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '6px', minHeight: '44px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                Mi Perfil
              </Link>
              <h1 style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif', fontSize: '26px', color: '#111827', margin: 0, fontWeight: 700 }}>
                Mi Historial
              </h1>
            </div>
            <button
              onClick={() => { setShowForm(!showForm); if (!showForm) resetForm() }}
              style={{
                background: GOLD, color: '#070d18', fontWeight: 700, fontSize: '14px',
                padding: '10px 18px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px', minHeight: '44px', flexShrink: 0,
              }}
            >
              {showForm ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg> Cancelar</>
              ) : (
                <><IconPlus size={14} /> Agregar ronda</>
              )}
            </button>
          </div>

          {/* Stat pills */}
          {s && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {[
                { label: 'Rondas', value: totalRounds, fmt: (n: number) => String(n) },
                { label: 'Prom +/-', value: avgOv != null ? Math.round(avgOv * 10) : null, fmt: (n: number) => formatOv(n / 10) },
                { label: 'Birdies', value: s.totalBirdies, fmt: (n: number) => String(n) },
                { label: 'Eagles', value: s.totalEagles, fmt: (n: number) => String(n) },
              ].map(pill => (
                <div key={pill.label} style={{
                  background: '#f9fafb', border: '1px solid #e5e7eb',
                  borderRadius: '20px', padding: '6px 14px',
                  display: 'flex', gap: '6px', alignItems: 'center',
                }}>
                  <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-dm-sans), "DM Sans", sans-serif' }}>{pill.label}</span>
                  <span style={{ fontSize: '14px', color: '#111827', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
                    {pill.value != null ? <AnimatedNumber value={pill.value} format={pill.fmt} /> : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Sparkline */}
          {s && s.recentScores18.length >= 2 && (
            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', fontFamily: 'var(--font-dm-sans), "DM Sans", sans-serif' }}>
                Ultimas {Math.min(s.recentScores18.length, 20)} rondas (vs par)
              </div>
              <Sparkline data={s.recentScores18} />
            </div>
          )}

          {/* tAIger progress */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontSize: '11px', color: '#6b7280', fontFamily: 'var(--font-dm-sans), "DM Sans", sans-serif' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" style={{ verticalAlign: '-2px', marginRight: '4px' }}>
                  <path d="M12 2L9 9H2l6 4.5-2.3 7L12 16l6.3 4.5-2.3-7L22 9h-7z" />
                </svg>
                {taigerMessage(totalRounds)}
              </span>
              <span style={{ fontSize: '11px', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{totalRounds} rondas</span>
            </div>
            <div style={{ height: '4px', background: GOLD_LIGHT, borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '2px',
                width: `${taigerProgress(totalRounds)}%`,
                background: `linear-gradient(90deg, ${GOLD}, #e8c06a)`,
                transition: 'width 0.8s ease',
              }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px 100px' }}>

        {/* ════════════════════════════════════════════════════════ */}
        {/* SECTION 5: ADD ROUND FORM                              */}
        {/* ════════════════════════════════════════════════════════ */}
        {showForm && (
          <form onSubmit={handleSave} style={{
            background: '#ffffff', borderRadius: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
            padding: '24px', marginBottom: '28px',
            animation: 'fadeInUp 0.3s ease-out',
          }}>
            <h3 style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif', fontSize: '18px', color: '#111827', margin: '0 0 20px', fontWeight: 600 }}>
              Nueva ronda
            </h3>

            {/* Live preview */}
            {formTotal != null && (
              <div style={{
                background: '#f9fafb', borderRadius: '12px', padding: '14px 18px',
                marginBottom: '20px', borderLeft: `3px solid ${GOLD}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif', fontSize: '28px', color: '#111827', fontWeight: 700 }}>
                    {formTotal}
                  </span>
                  {formVsPar != null && (
                    <span style={{
                      fontSize: '13px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px',
                      background: formVsPar <= 0 ? GOLD_LIGHT : 'rgba(220,38,38,0.1)',
                      color: formVsPar <= 0 ? '#92702a' : '#dc2626',
                    }}>
                      {formatOv(formVsPar)} par
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                  {selectedCourseName || 'Tu cancha'}
                </div>
              </div>
            )}

            {/* Course select */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '5px', fontWeight: 500 }}>Cancha *</label>
              <select
                required value={courseId} onChange={e => setCourseId(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: '14px',
                  border: '1px solid #e5e7eb', borderRadius: '8px', background: '#ffffff',
                  color: '#111827', outline: 'none', cursor: 'pointer', minHeight: '44px',
                }}
              >
                <option value="">-- Seleccionar cancha --</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>

            {/* Recorrido selector */}
            {recorridos.length > 1 && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '5px', fontWeight: 500 }}>Recorrido</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {recorridos.map(r => (
                    <button
                      key={r} type="button"
                      onClick={() => setSelectedRecorrido(r)}
                      style={{
                        padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                        border: selectedRecorrido === r ? `2px solid ${GOLD}` : '1px solid #e5e7eb',
                        background: selectedRecorrido === r ? GOLD_LIGHT : '#ffffff',
                        color: selectedRecorrido === r ? '#92702a' : '#374151',
                        cursor: 'pointer', minHeight: '44px',
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tee + Date row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '5px', fontWeight: 500 }}>Tees</label>
                <select value={teeColor} onChange={e => setTeeColor(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#ffffff', color: '#111827', outline: 'none', cursor: 'pointer', minHeight: '44px' }}>
                  <option value="">--</option>
                  {TEES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '5px', fontWeight: 500 }}>Fecha *</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <select value={day} onChange={e => setDay(e.target.value)}
                    style={{ flex: '0 0 52px', padding: '10px 4px', fontSize: '14px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#ffffff', color: '#111827', outline: 'none', cursor: 'pointer', minHeight: '44px', textAlign: 'center' }}>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={month} onChange={e => setMonth(e.target.value)}
                    style={{ flex: 1, padding: '10px 4px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#ffffff', color: '#111827', outline: 'none', cursor: 'pointer', minHeight: '44px' }}>
                    {MONTHS_ES.map((m, i) => <option key={i} value={i + 1}>{m.slice(0, 3)}</option>)}
                  </select>
                  <select value={year} onChange={e => setYear(e.target.value)}
                    style={{ flex: '0 0 68px', padding: '10px 4px', fontSize: '14px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#ffffff', color: '#111827', outline: 'none', cursor: 'pointer', minHeight: '44px', textAlign: 'center' }}>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Scores por hoyo */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '10px', fontWeight: 500 }}>
                Scores por hoyo
              </label>
              {[0, 1].map(halfIdx => {
                const startHole = halfIdx * 9
                const endHole = Math.min(startHole + 9, holeCount)
                if (startHole >= holeCount) return null
                return (
                  <div key={halfIdx} style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px', fontWeight: 600 }}>{halfIdx === 0 ? 'OUT' : 'IN'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${endHole - startHole}, 1fr)`, gap: '4px' }}>
                      {Array.from({ length: endHole - startHole }, (_, j) => {
                        const idx = startHole + j
                        const val = formScores[idx]
                        const par = formPars[idx] ?? null
                        return (
                          <div key={idx} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '9px', color: '#9ca3af', marginBottom: '2px' }}>{idx + 1}</div>
                            {par != null && <div style={{ fontSize: '8px', color: '#d1d5db', marginBottom: '2px' }}>P{par}</div>}
                            <div style={{ position: 'relative' }}>
                              <input
                                type="number" min={1} max={20} inputMode="numeric"
                                placeholder="--"
                                value={val ?? ''}
                                onChange={e => {
                                  const n = parseInt(e.target.value)
                                  const next = [...formScores]
                                  next[idx] = isNaN(n) || n < 1 || n > 20 ? null : n
                                  setFormScores(next)
                                }}
                                style={{
                                  width: '100%', textAlign: 'center', fontSize: '16px', fontWeight: 600,
                                  padding: '7px 2px', border: '1px solid #e5e7eb', borderRadius: '8px',
                                  outline: 'none', background: '#ffffff', color: '#111827',
                                  boxSizing: 'border-box' as const, minHeight: '44px',
                                  appearance: 'textfield' as const,
                                }}
                                onFocus={e => { e.currentTarget.style.borderColor = GOLD }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb' }}
                              />
                            </div>
                            {val != null && par != null && (
                              <div style={{ marginTop: '3px', display: 'flex', justifyContent: 'center' }}>
                                <ScoreSymbol score={val} par={par} size="sm" theme="light" />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Save button */}
            <button type="submit" disabled={saving || !courseId} style={{
              width: '100%', height: '52px',
              background: saving || !courseId ? 'rgba(196,153,42,0.4)' : GOLD,
              color: '#070d18', fontWeight: 700, fontSize: '15px',
              borderRadius: '12px', border: 'none',
              cursor: saving || !courseId ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Guardando...' : 'Guardar ronda'}
            </button>
          </form>
        )}

        {/* ════════════════════════════════════════════════════════ */}
        {/* SECTION 6: EMPTY STATE                                 */}
        {/* ════════════════════════════════════════════════════════ */}
        {totalRounds === 0 && !showForm && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
              <IconGolf size={64} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif', fontSize: '22px', color: '#111827', margin: '0 0 8px', fontWeight: 600 }}>
              Comienza tu historial
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '28px', maxWidth: '300px', margin: '0 auto 28px', lineHeight: 1.5 }}>
              Registra tu primera tarjeta y tAIger+ comenzara a analizar tu juego.
            </p>
            <button
              onClick={() => setShowForm(true)}
              style={{
                background: GOLD, color: '#070d18', fontWeight: 700, fontSize: '15px',
                padding: '14px 28px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '8px',
              }}
            >
              <IconPlus size={16} />
              Agregar primera ronda
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════ */}
        {/* SECTION 2: RECORDS                                     */}
        {/* ════════════════════════════════════════════════════════ */}
        {s && totalRounds > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{
              fontFamily: 'var(--font-playfair), "Playfair Display", serif',
              fontSize: '18px', color: '#111827', margin: '0 0 12px', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <IconTrophy size={20} /> Tus Records
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                { label: 'Mejor 18 hoyos', data: s.bestRound18 },
                { label: 'Mejor 9 hoyos', data: s.bestRound9 },
                { label: 'Mejor front 9', data: s.bestFront9 },
                { label: 'Mejor back 9', data: s.bestBack9 },
              ].map(rec => (
                <div key={rec.label} style={{
                  background: '#ffffff', borderRadius: '14px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  padding: '14px 16px',
                }}>
                  <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', fontFamily: 'var(--font-dm-sans), "DM Sans", sans-serif' }}>
                    {rec.label}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-playfair), "Playfair Display", serif',
                    fontSize: '24px', fontWeight: 700, color: rec.data ? GOLD : '#d1d5db',
                    lineHeight: 1.1,
                  }}>
                    {rec.data ? rec.data.score : '—'}
                  </div>
                  {rec.data && (
                    <>
                      {'vsPar' in rec.data && rec.data.vsPar != null && (
                        <div style={{ fontSize: '12px', fontWeight: 600, color: scoreColor(rec.data.vsPar as number), marginTop: '2px' }}>
                          {formatOv(rec.data.vsPar as number)}
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rec.data.course}
                      </div>
                      <div style={{ fontSize: '10px', color: '#d1d5db', marginTop: '1px' }}>
                        {formatDateShort(rec.data.date)}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════ */}
        {/* SECTION 3: FILTER CHIPS                                */}
        {/* ════════════════════════════════════════════════════════ */}
        {s && totalRounds > 0 && filterChips.length > 0 && (
          <div style={{
            display: 'flex', gap: '8px', marginBottom: '24px',
            overflowX: 'auto', paddingBottom: '4px',
            WebkitOverflowScrolling: 'touch',
            msOverflowStyle: 'none', scrollbarWidth: 'none',
          }}>
            {filterChips.map(chip => {
              const isActive = activeFilter === chip.key
              return (
                <button
                  key={chip.key}
                  onClick={() => setActiveFilter(chip.key)}
                  style={{
                    padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, minHeight: '36px',
                    background: isActive ? GOLD : '#f3f4f6',
                    color: isActive ? '#070d18' : '#6b7280',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════ */}
        {/* SECTION 4: ROUNDS LIST (grouped by month)              */}
        {/* ════════════════════════════════════════════════════════ */}
        {filteredMonths.map(mg => (
          <div key={mg.month} style={{ marginBottom: '28px' }}>
            {/* Month header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '10px', padding: '0 4px',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-playfair), "Playfair Display", serif',
                fontSize: '16px', color: '#111827', margin: 0, fontWeight: 600,
              }}>
                {mg.label}
              </h3>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                {mg.rounds.length} ronda{mg.rounds.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Rounds */}
            <div style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              {mg.rounds.map((r, rIdx) => {
                const isOpen = expanded.has(r.id)
                const badge = importBadge(r.import_source)
                const holesCount = r.holes_played || r.scores.length
                const is18 = holesCount >= 18

                return (
                  <div
                    key={r.id}
                    className="card-animate"
                    style={{
                      background: '#ffffff',
                      borderBottom: rIdx < mg.rounds.length - 1 ? '1px solid #f3f4f6' : 'none',
                    }}
                  >
                    {/* Main row */}
                    <div
                      onClick={() => toggleExpand(r.id)}
                      style={{
                        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px',
                        cursor: 'pointer', minHeight: '64px',
                      }}
                    >
                      {/* Left: course info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            fontSize: '14px', fontWeight: 600, color: '#111827',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {r.course_name}
                          </span>
                          {badge && (
                            <span style={{
                              fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
                              background: badge.bg, color: badge.color, flexShrink: 0,
                            }}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                          {formatDateShort(r.played_at)}
                          {!is18 && <span style={{ marginLeft: '6px', color: '#d1d5db' }}>{holesCount}H</span>}
                        </div>
                      </div>

                      {/* Right: score */}
                      <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div>
                          <div style={{
                            fontFamily: 'var(--font-playfair), "Playfair Display", serif',
                            fontSize: '24px', fontWeight: 700, lineHeight: 1,
                            color: scoreColor(r.vsPar),
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {r.total_gross}
                          </div>
                          {r.vsPar != null && (
                            <div style={{
                              fontSize: '11px', fontWeight: 600, marginTop: '2px',
                              color: scoreColor(r.vsPar),
                            }}>
                              {formatOv(r.vsPar)}
                            </div>
                          )}
                        </div>
                        <IconChevron open={isOpen} />
                      </div>
                    </div>

                    {/* Expanded scorecard */}
                    <div style={{
                      maxHeight: isOpen ? '600px' : '0',
                      overflow: 'hidden',
                      transition: 'max-height 0.3s ease',
                    }}>
                      {isOpen && (() => {
                        const sc = r.scores ?? []
                        const pars = r.parPerHole
                        const getPar = (holeIdx: number) => pars ? pars[holeIdx] : null

                        const renderHalfRow = (startIdx: number, endIdx: number, label: string) => {
                          const halfScores = sc.slice(startIdx, endIdx)
                          const halfTotal = halfScores.filter(s => s != null).reduce((a, b) => (a ?? 0) + (b ?? 0), 0)
                          return (
                            <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '8px' }}>
                              <div style={{ flex: 1, display: 'flex' }}>
                                {Array.from({ length: endIdx - startIdx }, (_, i) => {
                                  const idx = startIdx + i
                                  const score = sc[idx] ?? null
                                  const par = getPar(idx)
                                  return (
                                    <div key={i} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                                      <div style={{ fontSize: '8px', color: '#bbb', marginBottom: '2px' }}>{idx + 1}</div>
                                      {par != null && <div style={{ fontSize: '7px', color: '#ddd', marginBottom: '1px' }}>P{par}</div>}
                                      <div style={{ minHeight: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {pars ? (
                                          <ScoreSymbol score={score} par={par} size="sm" theme="light" />
                                        ) : (
                                          <span style={{ fontSize: '12px', fontWeight: 600, color: score != null ? '#374151' : '#d1d5db' }}>
                                            {score ?? '-'}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                              <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '36px',
                                flexShrink: 0, borderLeft: '1px solid #f0f0f0', paddingLeft: '6px', marginLeft: '4px',
                              }}>
                                <div style={{ fontSize: '9px', fontWeight: 600, color: '#999', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '2px' }}>{label}</div>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: '#111' }}>{halfTotal}</div>
                              </div>
                            </div>
                          )
                        }

                        return (
                          <div style={{ padding: '0 12px 14px' }}>
                            <div style={{ height: '1px', background: '#f3f4f6', marginBottom: '10px' }} />

                            {/* OUT row */}
                            {renderHalfRow(0, Math.min(9, holesCount), 'OUT')}

                            {/* IN row */}
                            {holesCount > 9 && renderHalfRow(9, holesCount, 'IN')}

                            {/* Total + stats */}
                            <div style={{
                              display: 'flex', alignItems: 'center', borderTop: '1px solid #f0f0f0',
                              paddingTop: '8px', marginTop: '4px',
                            }}>
                              <div style={{ flex: 1, display: 'flex', gap: '8px', fontSize: '11px', color: '#9ca3af', flexWrap: 'wrap', alignItems: 'center' }}>
                                {editingId !== r.id && (
                                  <span
                                    onClick={(e) => { e.stopPropagation(); startEdit(r) }}
                                    style={{ color: GOLD, cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
                                  >
                                    Editar
                                  </span>
                                )}
                                <span
                                  onClick={(e) => { e.stopPropagation(); handleDelete(r.id) }}
                                  style={{ color: '#d1d5db', cursor: 'pointer', fontSize: '12px' }}
                                >
                                  {deleting === r.id ? 'Eliminando...' : 'Eliminar'}
                                </span>
                              </div>
                              <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '36px',
                                flexShrink: 0, borderLeft: '1px solid #f0f0f0', paddingLeft: '6px', marginLeft: '4px',
                              }}>
                                <div style={{ fontSize: '9px', fontWeight: 600, color: '#999', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '1px' }}>TOT</div>
                                <div style={{ fontSize: '16px', fontWeight: 800, color: '#111', fontVariantNumeric: 'tabular-nums' as const }}>{r.total_gross}</div>
                              </div>
                            </div>

                            {/* Edit mode */}
                            {editingId === r.id && (
                              <div style={{ marginTop: '14px', borderTop: '1px solid #f3f4f6', paddingTop: '14px' }} onClick={e => e.stopPropagation()}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>Editar scores (1-15)</div>
                                {[0, 1].map(halfIdx => {
                                  const start = halfIdx * 9
                                  const end = Math.min(start + 9, holesCount)
                                  if (start >= holesCount) return null
                                  return (
                                    <div key={halfIdx} style={{ display: 'grid', gridTemplateColumns: `repeat(${end - start}, 1fr)`, gap: '3px', marginBottom: '8px' }}>
                                      {Array.from({ length: end - start }, (_, i) => (
                                        <div key={start + i} style={{ textAlign: 'center' }}>
                                          <div style={{ fontSize: '8px', color: '#9ca3af', marginBottom: '2px' }}>{start + i + 1}</div>
                                          <input
                                            type="text" inputMode="numeric" pattern="[0-9]*"
                                            value={editScores[start + i] ?? ''}
                                            onChange={e => handleEditScore(start + i, e.target.value)}
                                            style={{
                                              width: '100%', textAlign: 'center', fontSize: '14px', fontWeight: 600,
                                              padding: '6px 0', border: '1px solid #e5e7eb', borderRadius: '6px',
                                              outline: 'none', background: '#ffffff', color: '#374151',
                                              boxSizing: 'border-box', minHeight: '44px',
                                            }}
                                            onFocus={e => { e.target.style.borderColor = GOLD; e.target.select() }}
                                            onBlur={e => { e.target.style.borderColor = '#e5e7eb' }}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  )
                                })}
                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                  <button
                                    onClick={e => { e.stopPropagation(); saveEdit(r.id) }}
                                    disabled={savingEdit}
                                    style={{
                                      flex: 1, padding: '10px', background: GOLD, color: '#070d18',
                                      fontWeight: 700, fontSize: '14px', border: 'none', borderRadius: '10px', cursor: 'pointer', minHeight: '44px',
                                    }}
                                  >
                                    {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); setEditingId(null) }}
                                    style={{
                                      padding: '10px 16px', background: 'none', border: '1px solid #e5e7eb',
                                      color: '#6b7280', fontSize: '14px', borderRadius: '10px', cursor: 'pointer', minHeight: '44px',
                                    }}
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
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* No results for filter */}
        {s && totalRounds > 0 && filteredMonths.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <IconFlag size={32} color="#d1d5db" />
            <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '12px' }}>
              No hay rondas con este filtro
            </p>
          </div>
        )}

        {/* Total count */}
        {totalRounds > 0 && (
          <p style={{ textAlign: 'center', fontSize: '12px', color: '#9ca3af', marginTop: '12px' }}>
            {totalRounds} tarjeta{totalRounds !== 1 ? 's' : ''} guardada{totalRounds !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  )
}

/* ─── Page wrapper ─────────────────────────────────────── */
export default function HistorialPage() {
  return (
    <Suspense fallback={<div style={{ background: '#f8f9fa', minHeight: '100vh' }} />}>
      <HistorialContent />
    </Suspense>
  )
}
