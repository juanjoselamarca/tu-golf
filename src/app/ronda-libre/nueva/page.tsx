'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { useToast } from '@/hooks/useToast'

const CANCHAS_CHILE = [
  // Tier 1 — Elite Santiago
  'Club de Golf Los Leones',
  'Prince of Wales Country Club',
  'Club de Golf La Dehesa',
  'Club de Golf El Polo',
  'Club de Golf Lomas de La Dehesa',
  'Las Brisas de Chicureo',
  'Hacienda Chicureo Golf Club',
  'Santiago Golf Club',
  // Tier 2 — Major national
  'Club de Golf Granadilla',
  'Club de Golf Sport Francés',
  'Club de Golf Mapocho',
  'Club de Golf Las Araucarias',
  // Tier 3 — Well-known Santiago
  'Club de Golf Peñalolén',
  'Club de Golf Los Arrayanes',
  'Club de Golf El Principal',
  'Club de Golf Altos de Chicureo',
  'Club de Golf Lomas Verdes',
  'Club de Golf Curacaví',
  'Club de Golf Cultivo',
  'Club de Golf Cajón del Maipo',
  // Tier 4 — Coast & Resort
  'Club de Golf Marbella',
  'Club de Golf Viña del Mar',
  'Club de Golf Reñaca',
  'Club de Golf Rocas de Santo Domingo',
  // Tier 5 — Regional
  'Club de Golf La Serena',
  'Club de Golf Concepción',
  'Club de Golf Temuco',
  'Club de Golf Antofagasta',
  'Club de Golf Puerto Montt',
  'Club de Golf Puerto Varas',
  'Club de Golf Osorno',
  'Club de Golf Rancagua',
  'Club de Golf Chillán',
  'Club de Golf Talca',
  'Club de Golf Curicó',
  'Club de Golf Iquique',
  'Club de Golf Arica',
  'Club de Golf Coquimbo',
  'Club de Golf Copiapó',
  'Club de Golf Punta Arenas',
  // Otros
  'Otra cancha',
]

const TEES_OPTIONS = ['Campeonato', 'Azul', 'Blanco', 'Rojo']

interface CourseDB {
  id: string
  nombre: string
  ciudad: string | null
}

interface CourseLoop {
  recorrido: string
  holes: number
  par: number
}

interface CourseDetails {
  par_total: number | null
  course_rating: number | null
  slope_rating: number | null
  has_holes: boolean
}

interface CourseTee {
  nombre: string
  yardaje_total: number | null
  rating: number | null
  slope: number | null
}

// White theme colors
const colors = {
  bg: '#ffffff',
  card: '#f9fafb',
  cardBorder: '#e5e7eb',
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textLabel: '#9ca3af',
  activeBtn: '#c4992a',
  activeBtnText: '#070d18',
  inactiveBtn: '#f9fafb',
  inactiveBtnText: '#6b7280',
  inputBg: '#ffffff',
  inputBorder: '#d1d5db',
  inputFocus: '#c4992a',
  gold: '#c4992a',
}

export default function NuevaRondaLibrePage() {
  const router = useRouter()
  const { showError } = useToast()

  const [userId, setUserId] = useState<string | null>(null)
  const [creatorHandicap, setCreatorHandicap] = useState<number | null>(null)
  const [cancha, setCancha] = useState('')
  const [canchaSearch, setCanchaSearch] = useState('')
  const [showCanchaDropdown, setShowCanchaDropdown] = useState(false)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [coursesDB, setCoursesDB] = useState<CourseDB[]>([])
  const [tees, setTees] = useState('azul')
  const [holes, setHoles] = useState<18 | 9>(18)
  const [partidaSimultanea, setPartidaSimultanea] = useState(false)
  const [hoyoInicio, setHoyoInicio] = useState(1)
  const [adminMode, setAdminMode] = useState(false)

  // Admin mode: player slots
  interface AdminPlayer {
    tipo: 'cuenta' | 'invitado'
    nombre: string
    telefono: string
  }
  const [adminPlayers, setAdminPlayers] = useState<AdminPlayer[]>([])
  const updateAdminPlayer = (idx: number, field: keyof AdminPlayer, value: string) => {
    setAdminPlayers(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }
  const removeAdminPlayer = (idx: number) => {
    setAdminPlayers(prev => prev.filter((_, i) => i !== idx))
  }
  const addAdminPlayer = () => {
    if (adminPlayers.length < 3) {
      setAdminPlayers(prev => [...prev, { tipo: 'invitado', nombre: '', telefono: '' }])
    }
  }
  const [fechaStr, setFechaStr] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [jugadores, setJugadores] = useState<string[]>(['', '', '', ''])
  const [courseDetails, setCourseDetails] = useState<CourseDetails | null>(null)
  const [courseTees, setCourseTees] = useState<CourseTee[]>([])
  const [courseLoops, setCourseLoops] = useState<CourseLoop[]>([])
  const [selectedLoops, setSelectedLoops] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [showShareScreen, setShowShareScreen] = useState(false)
  const [roundCode, setRoundCode] = useState('')

  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?redirect=/ronda-libre/nueva'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, indice')
        .eq('id', user.id)
        .single()

      setCreatorHandicap(profile?.indice ?? null)
      const name = profile?.name || user.user_metadata?.name || user.email?.split('@')[0] || 'Jugador'
      setJugadores([name, '', '', ''])

      const { data: courses } = await supabase
        .from('courses')
        .select('id, nombre, ciudad')
        .order('nombre')
      setCoursesDB((courses as CourseDB[]) || [])
    }
    check()
  }, [router])

  // Fetch course details, tees, and loops when courseId changes
  useEffect(() => {
    if (!courseId) {
      setCourseDetails(null)
      setCourseTees([])
      setCourseLoops([])
      setSelectedLoops([])
      return
    }
    const fetchCourseData = async () => {
      const supabase = createClient()
      const { data: course } = await supabase
        .from('courses')
        .select('par_total, course_rating, slope_rating')
        .eq('id', courseId)
        .single()
      const { count: holeCount } = await supabase
        .from('course_holes')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', courseId)
      if (course) {
        setCourseDetails({
          par_total: course.par_total,
          course_rating: course.course_rating,
          slope_rating: course.slope_rating,
          has_holes: (holeCount || 0) > 0,
        })
      } else {
        setCourseDetails(null)
      }
      const { data: tees } = await supabase
        .from('course_tees')
        .select('nombre, yardaje_total, rating, slope')
        .eq('course_id', courseId)
        .order('yardaje_total', { ascending: false })
      setCourseTees((tees as CourseTee[]) || [])
      if (tees && tees.length > 0) {
        setTees(tees[0].nombre.toLowerCase())
      }

      // Detect multi-loop courses (e.g. Brisas de Santo Domingo: Norte, Este, Sur)
      const { data: holeRows } = await supabase
        .from('course_holes')
        .select('recorrido, par')
        .eq('course_id', courseId)
      if (holeRows && holeRows.length > 0) {
        const loopMap = new Map<string, { count: number; par: number }>()
        for (const h of holeRows) {
          const r = (h.recorrido as string) || 'default'
          const existing = loopMap.get(r) ?? { count: 0, par: 0 }
          loopMap.set(r, { count: existing.count + 1, par: existing.par + (h.par as number) })
        }
        const nonDefault = Array.from(loopMap.entries()).filter(([k]) => k !== 'default')
        if (nonDefault.length >= 2) {
          const loops: CourseLoop[] = nonDefault.map(([r, d]) => ({ recorrido: r, holes: d.count, par: d.par }))
          loops.sort((a, b) => a.recorrido.localeCompare(b.recorrido))
          setCourseLoops(loops)
          // Auto-select first two for 18h
          setSelectedLoops(loops.slice(0, 2).map(l => l.recorrido))
        } else {
          setCourseLoops([])
          setSelectedLoops([])
        }
      } else {
        setCourseLoops([])
        setSelectedLoops([])
      }
    }
    fetchCourseData()
  }, [courseId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    if (!cancha) {
      showError('Selecciona una cancha', 'Elige la cancha donde vas a jugar.')
      return
    }

    // In admin mode, use adminPlayers list instead of jugadores
    const jugadoresValidos = adminMode
      ? [jugadores[0], ...adminPlayers.filter(p => p.nombre.trim()).map(p => p.nombre.trim())]
      : jugadores.filter(j => j.trim() !== '')
    if (jugadoresValidos.length === 0) {
      showError('Faltan jugadores', 'Agrega al menos un jugador para crear la ronda.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const codigo = Math.random().toString(36).substring(2, 8).toUpperCase()

    const baseData: Record<string, unknown> = {
      codigo,
      creador_id: userId,
      course_id: courseId || null,
      course_name: cancha,
      tees,
      holes,
      fecha: fechaStr,
      estado: 'en_curso',
      hoyo_inicio: partidaSimultanea ? hoyoInicio : 1,
    }

    // Multi-loop courses: store selected recorridos
    if (courseLoops.length > 0 && selectedLoops.length > 0) {
      baseData.recorridos = selectedLoops
    }

    // Admin mode columns
    if (adminMode) {
      baseData.admin_mode = true
      baseData.admin_user_id = userId
    }

    // Intento 1: con modo_juego = 'gross'
    const { data: d1, error: e1 } = await supabase
      .from('rondas_libres')
      .insert({ ...baseData, modo_juego: 'gross' })
      .select('id')
      .single()

    let ronda = d1
    if (e1) {
      if (
        e1.message?.includes('modo_juego') ||
        e1.message?.includes('schema cache') ||
        e1.code === '42703'
      ) {
        const { data: d2, error: e2 } = await supabase
          .from('rondas_libres')
          .insert(baseData)
          .select('id')
          .single()

        if (e2 || !d2) {
          setLoading(false)
          if (e2?.message?.includes("'public.rondas_libres'") || e2?.message?.includes('relation') || e2?.code === '42P01') {
            showError('Error de configuración', 'La base de datos no está configurada. Contacta al administrador.')
          } else {
            showError('Error al crear la ronda', e2?.message || 'Algo salió mal. Intenta nuevamente.')
          }
          return
        }
        ronda = d2
      } else if (e1.message?.includes("'public.rondas_libres'") || e1.message?.includes('relation') || e1.code === '42P01') {
        setLoading(false)
        showError('Error de configuración', 'La base de datos no está configurada. Contacta al administrador.')
        return
      } else {
        setLoading(false)
        showError('Error al crear la ronda', e1.message || 'Algo salió mal. Intenta nuevamente.')
        return
      }
    }

    if (!ronda) {
      setLoading(false)
      showError('Error al crear la ronda', 'Algo salió mal. Intenta nuevamente.')
      return
    }

    for (let i = 0; i < jugadoresValidos.length; i++) {
      const playerData: Record<string, unknown> = {
        ronda_id: ronda.id,
        nombre: jugadoresValidos[i],
        user_id: i === 0 ? userId : null,
        scores: {},
        handicap: i === 0 ? creatorHandicap : null,
      }
      // In admin mode, mark non-creator players as guests with phone
      if (adminMode && i > 0) {
        const ap = adminPlayers[i - 1]
        if (ap) {
          playerData.is_guest = ap.tipo === 'invitado'
          if (ap.tipo === 'invitado' && ap.telefono) {
            playerData.telefono_invitado = ap.telefono
          }
          if (ap.tipo === 'invitado') {
            playerData.nombre_invitado = ap.nombre
          }
        }
      }
      await supabase.from('ronda_libre_jugadores').insert(playerData)
    }

    await trackEvent(supabase, userId, 'ronda_creada', { codigo, cancha, holes })

    setRoundCode(codigo)
    setShowShareScreen(true)
    setLoading(false)
  }

  const filledCount = jugadores.filter((j) => j.trim()).length

  const handleShareWhatsApp = (type: 'jugar' | 'seguir') => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://golfersplus.vercel.app'
    const link = type === 'jugar'
      ? `${baseUrl}/ronda-libre/${roundCode}/score`
      : `${baseUrl}/ronda-libre/${roundCode}`
    const message = type === 'jugar'
      ? `Únete a mi ronda en Golfers+! Código: ${roundCode}\n${link}`
      : `Sigue mi ronda en vivo en Golfers+!\n${link}`
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  const handleCopyLink = (type: 'jugar' | 'seguir') => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://golfersplus.vercel.app'
    const link = type === 'jugar'
      ? `${baseUrl}/ronda-libre/${roundCode}/score`
      : `${baseUrl}/ronda-libre/${roundCode}`
    navigator.clipboard.writeText(link)
  }

  // Share screen after round creation
  if (showShareScreen) {
    return (
      <div style={{ background: colors.bg, minHeight: '100vh', padding: '20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>

          <div style={{
            background: colors.card,
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: '20px',
            padding: '40px 28px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: '14px', color: colors.textLabel, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
              Ronda creada
            </div>

            <div style={{
              fontFamily: '"Playfair Display", serif',
              fontSize: '48px',
              fontWeight: 700,
              color: colors.gold,
              letterSpacing: '0.15em',
              marginBottom: '8px',
            }}>
              {roundCode}
            </div>

            <div style={{ fontSize: '14px', color: colors.textSecondary, marginBottom: '32px' }}>
              {cancha} &middot; {holes} hoyos
            </div>

            {/* Invitar a jugar */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: colors.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Invitar a jugar
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleShareWhatsApp('jugar')}
                  style={{
                    flex: 1,
                    background: '#25D366',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '15px',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: 'none',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  WhatsApp
                </button>
                <button
                  onClick={() => handleCopyLink('jugar')}
                  style={{
                    padding: '14px 16px',
                    background: colors.card,
                    border: `1px solid ${colors.cardBorder}`,
                    color: colors.textSecondary,
                    fontWeight: 500,
                    fontSize: '14px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Copiar link
                </button>
              </div>
            </div>

            {/* Invitar a seguir */}
            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '12px', color: colors.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Invitar a seguir
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleShareWhatsApp('seguir')}
                  style={{
                    flex: 1,
                    background: '#25D366',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '15px',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: 'none',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  WhatsApp
                </button>
                <button
                  onClick={() => handleCopyLink('seguir')}
                  style={{
                    padding: '14px 16px',
                    background: colors.card,
                    border: `1px solid ${colors.cardBorder}`,
                    color: colors.textSecondary,
                    fontWeight: 500,
                    fontSize: '14px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Copiar link
                </button>
              </div>
            </div>

            <button
              onClick={() => router.push(adminMode ? `/ronda-libre/${roundCode}/score-grupo` : `/ronda-libre/${roundCode}/score`)}
              style={{
                width: '100%',
                background: colors.gold,
                color: colors.activeBtnText,
                fontWeight: 700,
                fontSize: '16px',
                padding: '16px',
                borderRadius: '14px',
                border: 'none',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {adminMode ? 'Empezar score de grupo →' : 'Empezar a jugar →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: colors.bg, minHeight: '100vh', padding: '20px 16px 80px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        {/* Back link */}
        <Link href="/dashboard" style={{ color: colors.textSecondary, fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '24px' }}>
          ← Dashboard
        </Link>

        {/* Header */}
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '32px', color: colors.textPrimary, marginBottom: '4px', marginTop: 0, fontWeight: 700 }}>
          Nueva Ronda
        </h1>
        <p style={{ fontSize: '14px', color: colors.textSecondary, marginTop: 0, marginBottom: '28px' }}>
          Selecciona la cancha y configura tu ronda
        </p>

        <form onSubmit={handleSubmit}>

          {/* Cancha — autocomplete */}
          <div style={{
            background: colors.card,
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '12px', color: colors.textLabel, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
                Cancha *
              </label>
              <input
                type="text"
                placeholder="Buscar cancha..."
                value={showCanchaDropdown ? canchaSearch : cancha}
                onChange={(e) => {
                  setCanchaSearch(e.target.value)
                  setShowCanchaDropdown(true)
                  if (!e.target.value) { setCancha(''); setCourseId(null) }
                }}
                onFocus={() => {
                  setCanchaSearch(cancha)
                  setShowCanchaDropdown(true)
                }}
                onBlur={() => setTimeout(() => setShowCanchaDropdown(false), 200)}
                style={{
                  background: colors.inputBg,
                  border: `1px solid ${colors.inputBorder}`,
                  color: colors.textPrimary,
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '16px',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box' as const,
                  minHeight: '48px',
                }}
              />
              {cancha && !showCanchaDropdown && (
                <button
                  type="button"
                  onClick={() => { setCancha(''); setCourseId(null); setCanchaSearch('') }}
                  style={{
                    position: 'absolute', right: '12px', top: '32px',
                    background: 'none', border: 'none', color: colors.textLabel,
                    fontSize: '18px', cursor: 'pointer', padding: '4px',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >×</button>
              )}
              {showCanchaDropdown && (() => {
                const q = canchaSearch.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                const dbByName = new Map(coursesDB.map(c => [c.nombre, c]))
                const unified: { name: string; courseId: string | null; ciudad: string | null }[] = []
                const seen = new Set<string>()
                for (const name of CANCHAS_CHILE) {
                  if (!name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)) continue
                  const db = dbByName.get(name)
                  unified.push({ name, courseId: db?.id ?? null, ciudad: db?.ciudad ?? null })
                  seen.add(name)
                }
                for (const c of coursesDB) {
                  if (seen.has(c.nombre)) continue
                  if (!c.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)) continue
                  unified.push({ name: c.nombre, courseId: c.id, ciudad: c.ciudad })
                }
                const results = unified.slice(0, 10)
                const hasResults = results.length > 0

                if (!hasResults && canchaSearch.length < 1) return null

                return (
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20,
                    background: colors.inputBg, border: `1px solid ${colors.cardBorder}`,
                    borderRadius: '10px', marginTop: '4px', maxHeight: '50vh', overflowY: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  }}>
                    {results.map(c => (
                      <button
                        key={c.name}
                        type="button"
                        onMouseDown={() => {
                          setCancha(c.name)
                          setCourseId(c.courseId)
                          setCanchaSearch(c.name)
                          setShowCanchaDropdown(false)
                        }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '10px 14px', background: 'none', border: 'none',
                          color: colors.textPrimary, fontSize: '14px', cursor: 'pointer',
                          borderBottom: `1px solid ${colors.cardBorder}`,
                        }}
                      >
                        {c.name}
                        {c.ciudad && <span style={{ color: colors.textLabel, fontSize: '12px', marginLeft: '8px' }}>— {c.ciudad}</span>}
                      </button>
                    ))}
                    {!hasResults && canchaSearch.length >= 2 && (
                      <button
                        type="button"
                        onMouseDown={() => {
                          setCancha(canchaSearch)
                          setCourseId(null)
                          setShowCanchaDropdown(false)
                        }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '12px 14px', background: 'none', border: 'none',
                          color: colors.gold, fontSize: '14px', cursor: 'pointer',
                        }}
                      >
                        Usar &quot;{canchaSearch}&quot; como nombre de cancha
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Course info badge */}
            {courseDetails && (
              <div style={{
                marginTop: '12px',
                padding: '10px 14px',
                background: 'rgba(196,153,42,0.08)',
                borderRadius: '10px',
                fontSize: '13px',
                color: '#374151',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <span style={{ color: '#16a34a', fontWeight: 700 }}>&#10003;</span>
                {courseDetails.par_total && <span>Par {courseDetails.par_total}</span>}
                {courseDetails.course_rating && <span>&middot; CR {courseDetails.course_rating}</span>}
                {courseDetails.slope_rating && <span>&middot; Slope {courseDetails.slope_rating}</span>}
                <span>&middot; Datos verificados</span>
              </div>
            )}

            {/* Multi-loop selector (e.g. Brisas de Santo Domingo: Norte + Este + Sur) */}
            {courseLoops.length >= 2 && (
              <div style={{
                marginTop: '12px',
                padding: '14px',
                background: 'rgba(196,153,42,0.05)',
                border: '1px solid rgba(196,153,42,0.2)',
                borderRadius: '12px',
              }}>
                <div style={{ fontSize: '12px', color: colors.textLabel, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
                  Recorridos ({holes === 18 ? 'elige 2' : 'elige 1'})
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {courseLoops.map(loop => {
                    const isSelected = selectedLoops.includes(loop.recorrido)
                    const maxLoops = holes === 18 ? 2 : 1
                    const canSelect = isSelected || selectedLoops.length < maxLoops
                    return (
                      <button
                        key={loop.recorrido}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedLoops(prev => prev.filter(l => l !== loop.recorrido))
                          } else if (canSelect) {
                            setSelectedLoops(prev => [...prev, loop.recorrido])
                          }
                        }}
                        style={{
                          padding: '10px 16px',
                          borderRadius: '12px',
                          border: '1px solid',
                          cursor: canSelect || isSelected ? 'pointer' : 'default',
                          fontSize: '14px',
                          fontWeight: isSelected ? 600 : 400,
                          background: isSelected ? colors.activeBtn : colors.inactiveBtn,
                          borderColor: isSelected ? colors.activeBtn : colors.inputBorder,
                          color: isSelected ? colors.activeBtnText : colors.inactiveBtnText,
                          opacity: canSelect || isSelected ? 1 : 0.4,
                          transition: 'all 0.15s',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <div>{loop.recorrido}</div>
                        <div style={{ fontSize: '10px', color: isSelected ? 'rgba(7,13,24,0.6)' : '#9ca3af', marginTop: '2px' }}>
                          {loop.holes} hoyos &middot; Par {loop.par}
                        </div>
                      </button>
                    )
                  })}
                </div>
                {selectedLoops.length > 0 && (
                  <div style={{ fontSize: '12px', color: colors.gold, marginTop: '8px', fontWeight: 500 }}>
                    {selectedLoops.join(' + ')} &middot; Par {courseLoops.filter(l => selectedLoops.includes(l.recorrido)).reduce((a, l) => a + l.par, 0)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tees + Holes row */}
          <div style={{
            background: colors.card,
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            {/* Tees */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: colors.textLabel, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
                Tees
              </label>
              {courseTees.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {courseTees.map((t) => {
                    const val = t.nombre.toLowerCase()
                    const active = tees === val
                    return (
                      <button
                        key={t.nombre}
                        type="button"
                        onClick={() => setTees(val)}
                        style={{
                          width: '100%',
                          padding: '14px 16px',
                          borderRadius: '12px',
                          border: '1px solid',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontWeight: active ? 600 : 400,
                          background: active ? colors.activeBtn : '#f9fafb',
                          borderColor: active ? colors.activeBtn : '#e5e7eb',
                          color: active ? colors.activeBtnText : '#374151',
                          transition: 'all 0.15s',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{t.nombre}</div>
                        <div style={{ fontSize: '11px', color: active ? 'rgba(7,13,24,0.7)' : '#6b7280', marginTop: '2px' }}>
                          {t.yardaje_total?.toLocaleString()} yds
                          {t.rating ? ` · CR ${t.rating}` : ''}
                          {t.slope ? ` · Slope ${t.slope}` : ''}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {TEES_OPTIONS.map((t) => {
                    const val = t.toLowerCase()
                    const active = tees === val
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTees(val)}
                        style={{
                          padding: '10px 18px',
                          borderRadius: '24px',
                          border: '1px solid',
                          cursor: 'pointer',
                          fontSize: '14px',
                          minHeight: '40px',
                          fontWeight: active ? 600 : 400,
                          background: active ? colors.activeBtn : colors.inactiveBtn,
                          borderColor: active ? colors.activeBtn : colors.inputBorder,
                          color: active ? colors.activeBtnText : colors.inactiveBtnText,
                          transition: 'all 0.15s',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        {t}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Hoyos */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: colors.textLabel, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
                Hoyos
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {([18, 9] as const).map((h) => {
                  const active = holes === h
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        setHoles(h)
                        // Trim selected loops to match hole count (9h = 1 loop, 18h = 2 loops)
                        if (courseLoops.length >= 2) {
                          const max = h === 18 ? 2 : 1
                          setSelectedLoops(prev => prev.slice(0, max))
                        }
                      }}
                      style={{
                        padding: '10px 28px',
                        borderRadius: '24px',
                        border: '1px solid',
                        cursor: 'pointer',
                        fontSize: '14px',
                        minHeight: '40px',
                        fontWeight: active ? 600 : 400,
                        background: active ? colors.activeBtn : colors.inactiveBtn,
                        borderColor: active ? colors.activeBtn : colors.inputBorder,
                        color: active ? colors.activeBtnText : colors.inactiveBtnText,
                        transition: 'all 0.15s',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      {h} hoyos
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Partida simultánea */}
          <div style={{ marginTop: '16px' }}>
            <div
              onClick={() => {
                setPartidaSimultanea(prev => { if (prev) setHoyoInicio(1); return !prev })
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer',
                padding: '12px 16px', borderRadius: '12px',
                background: partidaSimultanea ? 'rgba(196,153,42,0.08)' : 'transparent',
                border: `1px solid ${partidaSimultanea ? 'rgba(196,153,42,0.2)' : 'transparent'}`,
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: '40px', height: '24px', borderRadius: '12px',
                background: partidaSimultanea ? '#c4992a' : 'rgba(255,255,255,0.15)',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              }}>
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%', background: '#ffffff',
                  position: 'absolute', top: '3px',
                  left: partidaSimultanea ? '19px' : '3px',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#edeae4' }}>Partida simultánea</div>
                <div style={{ fontSize: '11px', color: '#94a8c0' }}>Empieza en un hoyo distinto al 1</div>
              </div>
            </div>

            {partidaSimultanea && (
              <div style={{ marginTop: '12px', padding: '0 4px' }}>
                <div style={{ fontSize: '12px', color: '#94a8c0', marginBottom: '8px' }}>Hoyo de inicio:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {Array.from({ length: holes - 1 }, (_, i) => i + 2).map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHoyoInicio(h)}
                      style={{
                        width: '38px', height: '38px', borderRadius: '10px',
                        fontSize: '14px', fontWeight: hoyoInicio === h ? 700 : 400,
                        background: hoyoInicio === h ? '#c4992a' : 'rgba(255,255,255,0.06)',
                        color: hoyoInicio === h ? '#070d18' : '#94a8c0',
                        border: `1px solid ${hoyoInicio === h ? '#c4992a' : 'rgba(255,255,255,0.1)'}`,
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Admin Mode Toggle */}
          <div style={{
            background: colors.card,
            border: `1px solid ${adminMode ? colors.gold : colors.cardBorder}`,
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'border-color 0.2s',
          }}>
            <div
              onClick={() => {
                setAdminMode(prev => {
                  if (!prev) {
                    // Initialize with empty player slots
                    setAdminPlayers([{ tipo: 'invitado', nombre: '', telefono: '' }])
                  } else {
                    setAdminPlayers([])
                  }
                  return !prev
                })
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer',
              }}
            >
              <div style={{
                width: '40px', height: '24px', borderRadius: '12px',
                background: adminMode ? colors.gold : '#d1d5db',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              }}>
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%', background: '#ffffff',
                  position: 'absolute', top: '3px',
                  left: adminMode ? '19px' : '3px',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary }}>Llevar el score de tu grupo</div>
                <div style={{ fontSize: '11px', color: colors.textSecondary }}>Tu llevas la tarjeta de todos los jugadores</div>
              </div>
            </div>

            {/* Admin mode player slots */}
            {adminMode && (
              <div style={{ marginTop: '16px', borderTop: `1px solid ${colors.cardBorder}`, paddingTop: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: colors.textLabel, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
                  Jugadores de tu grupo ({1 + adminPlayers.filter(p => p.nombre.trim()).length}/4)
                </label>

                {/* Player 1 (creator) — read only */}
                <div style={{ position: 'relative', marginBottom: '10px' }}>
                  <input
                    readOnly
                    value={jugadores[0]}
                    style={{
                      background: colors.inputBg,
                      border: `1px solid ${colors.inputBorder}`,
                      color: colors.gold,
                      borderRadius: '10px',
                      padding: '12px 14px',
                      fontSize: '16px',
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box' as const,
                      minHeight: '48px',
                      cursor: 'default',
                      paddingRight: '60px',
                    }}
                  />
                  <span style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    fontSize: '11px', color: colors.textSecondary,
                    background: 'rgba(196,153,42,0.1)', padding: '2px 7px', borderRadius: '10px',
                  }}>
                    Tu
                  </span>
                </div>

                {/* Additional player slots */}
                {adminPlayers.map((player, idx) => (
                  <div key={idx} style={{
                    marginBottom: '10px',
                    background: colors.inputBg,
                    border: `1px solid ${colors.cardBorder}`,
                    borderRadius: '12px',
                    padding: '12px',
                  }}>
                    {/* Type selector */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                      {(['cuenta', 'invitado'] as const).map(tipo => (
                        <button
                          key={tipo}
                          type="button"
                          onClick={() => updateAdminPlayer(idx, 'tipo', tipo)}
                          style={{
                            flex: 1, padding: '6px 10px', borderRadius: '8px',
                            fontSize: '12px', fontWeight: player.tipo === tipo ? 600 : 400,
                            background: player.tipo === tipo ? 'rgba(196,153,42,0.15)' : 'transparent',
                            color: player.tipo === tipo ? colors.gold : colors.textSecondary,
                            border: `1px solid ${player.tipo === tipo ? colors.gold : colors.cardBorder}`,
                            cursor: 'pointer',
                            minHeight: '32px',
                          }}
                        >
                          {tipo === 'cuenta' ? 'Con cuenta' : 'Invitado'}
                        </button>
                      ))}
                    </div>

                    {/* Name input */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder={player.tipo === 'cuenta' ? 'Nombre del jugador' : 'Nombre del invitado'}
                        value={player.nombre}
                        onChange={(e) => updateAdminPlayer(idx, 'nombre', e.target.value)}
                        style={{
                          background: colors.inputBg,
                          border: `1px solid ${colors.inputBorder}`,
                          color: colors.textPrimary,
                          borderRadius: '10px',
                          padding: '10px 12px',
                          fontSize: '15px',
                          outline: 'none',
                          flex: 1,
                          minHeight: '44px',
                          boxSizing: 'border-box' as const,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removeAdminPlayer(idx)}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${colors.cardBorder}`,
                          color: '#ef4444',
                          borderRadius: '10px',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          flexShrink: 0,
                          fontSize: '14px',
                          minHeight: '44px',
                          minWidth: '44px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        x
                      </button>
                    </div>

                    {/* Phone input for guests */}
                    {player.tipo === 'invitado' && (
                      <input
                        type="tel"
                        placeholder="Telefono (WhatsApp, opcional)"
                        value={player.telefono}
                        onChange={(e) => updateAdminPlayer(idx, 'telefono', e.target.value)}
                        style={{
                          background: colors.inputBg,
                          border: `1px solid ${colors.inputBorder}`,
                          color: colors.textPrimary,
                          borderRadius: '10px',
                          padding: '10px 12px',
                          fontSize: '15px',
                          outline: 'none',
                          width: '100%',
                          minHeight: '44px',
                          marginTop: '6px',
                          boxSizing: 'border-box' as const,
                        }}
                      />
                    )}
                  </div>
                ))}

                {/* Add player button */}
                {adminPlayers.length < 3 && (
                  <button
                    type="button"
                    onClick={addAdminPlayer}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: `1px dashed ${colors.gold}`,
                      color: colors.gold,
                      borderRadius: '10px',
                      padding: '12px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 500,
                      textAlign: 'center',
                      minHeight: '44px',
                    }}
                  >
                    + Agregar jugador al grupo
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Fecha */}
          <div style={{
            background: colors.card,
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <label style={{ display: 'block', fontSize: '12px', color: colors.textLabel, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
              Fecha
            </label>
            <input
              type="date"
              value={fechaStr}
              onChange={(e) => setFechaStr(e.target.value)}
              style={{
                background: colors.inputBg,
                border: `1px solid ${colors.inputBorder}`,
                color: colors.textPrimary,
                borderRadius: '10px',
                padding: '12px 14px',
                fontSize: '16px',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box' as const,
                minHeight: '48px',
                cursor: 'pointer',
                WebkitAppearance: 'none' as const,
                appearance: 'none' as const,
              }}
            />
          </div>

          {/* Jugadores — hidden when admin mode is active */}
          {!adminMode && <div style={{
            background: colors.card,
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <label style={{ display: 'block', fontSize: '12px', color: colors.textLabel, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
              Jugadores ({filledCount}/4)
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Jugador 1 (tu) */}
              <div style={{ position: 'relative' }}>
                <input
                  readOnly
                  value={jugadores[0]}
                  style={{
                    background: colors.inputBg,
                    border: `1px solid ${colors.inputBorder}`,
                    color: colors.gold,
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '16px',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box' as const,
                    minHeight: '48px',
                    cursor: 'default',
                    paddingRight: '60px',
                  }}
                />
                <span style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  fontSize: '11px', color: colors.textSecondary,
                  background: 'rgba(196,153,42,0.1)', padding: '2px 7px', borderRadius: '10px',
                }}>
                  Tu
                </span>
              </div>

              {/* Jugadores 2-4 */}
              {[1, 2, 3].map((idx) => {
                const show = idx <= filledCount || jugadores[idx] !== ''
                if (!show && filledCount < idx) return null
                return (
                  <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Nombre del jugador"
                      value={jugadores[idx]}
                      onChange={(e) => {
                        const next = [...jugadores]
                        next[idx] = e.target.value
                        setJugadores(next)
                      }}
                      style={{
                        background: colors.inputBg,
                        border: `1px solid ${colors.inputBorder}`,
                        color: colors.textPrimary,
                        borderRadius: '10px',
                        padding: '12px 14px',
                        fontSize: '16px',
                        outline: 'none',
                        width: '100%',
                        boxSizing: 'border-box' as const,
                        minHeight: '48px',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...jugadores]
                        next[idx] = ''
                        setJugadores(next)
                      }}
                      style={{
                        background: 'transparent',
                        border: `1px solid ${colors.cardBorder}`,
                        color: '#ef4444',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        flexShrink: 0,
                        fontSize: '14px',
                        minHeight: '48px',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      ×
                    </button>
                  </div>
                )
              })}

              {/* Add player button */}
              {filledCount < 4 && (
                <button
                  type="button"
                  onClick={() => {
                    const emptyIdx = jugadores.findIndex((j, i) => i > 0 && j.trim() === '')
                    if (emptyIdx === -1) return
                    const next = [...jugadores]
                    next[emptyIdx] = ' '
                    setJugadores(next)
                    setTimeout(() => {
                      setJugadores((prev) => {
                        const arr = [...prev]
                        arr[emptyIdx] = ''
                        return arr
                      })
                    }, 0)
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(196,153,42,0.25)',
                    color: colors.gold,
                    borderRadius: '10px',
                    padding: '12px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    textAlign: 'center',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  + Agregar jugador
                </button>
              )}
            </div>
          </div>}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !cancha}
            style={{
              width: '100%',
              background: colors.gold,
              color: colors.activeBtnText,
              fontWeight: 700,
              fontSize: '16px',
              padding: '16px',
              borderRadius: '14px',
              border: 'none',
              cursor: loading || !cancha ? 'not-allowed' : 'pointer',
              opacity: loading || !cancha ? 0.35 : 1,
              transition: 'all 0.15s',
              boxShadow: '0 2px 8px rgba(196,153,42,0.3)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {loading ? 'Creando ronda...' : 'Crear ronda →'}
          </button>
        </form>
      </div>
    </div>
  )
}
