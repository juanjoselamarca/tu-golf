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
  datos_verificados?: boolean | null
  par_total?: number | null
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

  // Wizard step
  const [step, setStep] = useState(1)

  const [userId, setUserId] = useState<string | null>(null)
  const [creatorName, setCreatorName] = useState('')
  const [creatorHandicap, setCreatorHandicap] = useState<number | null>(null)
  const [cancha, setCancha] = useState('')
  const [canchaSearch, setCanchaSearch] = useState('')
  const [showCanchaDropdown, setShowCanchaDropdown] = useState(false)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [coursesDB, setCoursesDB] = useState<CourseDB[]>([])
  const [tees, setTees] = useState('blanco')
  const [partidaSimultanea, setPartidaSimultanea] = useState(false)
  const [hoyoInicio, setHoyoInicio] = useState(1)
  const [adminMode, setAdminMode] = useState(false)

  // Admin mode: player slots
  interface AdminPlayer {
    tipo: 'cuenta' | 'invitado'
    nombre: string
    telefono: string
    handicap: number | null
  }
  const [adminPlayers, setAdminPlayers] = useState<AdminPlayer[]>([])
  const updateAdminPlayer = (idx: number, field: keyof AdminPlayer, value: string | number | null) => {
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
      setAdminPlayers(prev => [...prev, { tipo: 'invitado', nombre: '', telefono: '', handicap: null }])
    }
  }
  const [formato, setFormato] = useState<'stroke_play' | 'stableford' | 'match_play'>('stroke_play')
  const [fechaStr, setFechaStr] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
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
      setCreatorName(name)

      const { data: courses } = await supabase
        .from('courses')
        .select('id, nombre, ciudad, datos_verificados, par_total')
        .eq('activa', true)
        .is('parent_id', null)
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

      // Parallel fetch: course info, hole count, tees, and children — all independent
      const [
        { data: course },
        { count: holeCount },
        { data: tees },
        { data: children },
      ] = await Promise.all([
        supabase.from('courses').select('par_total, course_rating, slope_rating').eq('id', courseId).single(),
        supabase.from('course_holes').select('*', { count: 'exact', head: true }).eq('course_id', courseId),
        supabase.from('course_tees').select('nombre, yardaje_total, rating, slope').eq('course_id', courseId).order('yardaje_total', { ascending: false }),
        supabase.from('courses').select('id, loop_nombre, par_total').eq('parent_id', courseId).order('loop_nombre'),
      ])

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
      setCourseTees((tees as CourseTee[]) || [])
      if (tees && tees.length > 0) {
        const blanco = tees.find(t => t.nombre.toLowerCase() === 'blanco')
        setTees(blanco ? 'blanco' : tees[0].nombre.toLowerCase())
      }
      if (children && children.length >= 2) {
        // Multi-loop via children — batch verify hole counts in single query
        const childIds = children.map(c => c.id)
        const { data: allChildHoles } = await supabase
          .from('course_holes')
          .select('course_id')
          .in('course_id', childIds)
        const holeCountMap = new Map<string, number>()
        if (allChildHoles) {
          for (const h of allChildHoles) {
            holeCountMap.set(h.course_id, (holeCountMap.get(h.course_id) ?? 0) + 1)
          }
        }
        const validLoops: CourseLoop[] = []
        for (const child of children) {
          const count = holeCountMap.get(child.id) ?? 0
          if (count >= 9 && child.loop_nombre) {
            validLoops.push({ recorrido: child.loop_nombre, holes: count, par: child.par_total ?? 36 })
          }
        }
        if (validLoops.length >= 2) {
          validLoops.sort((a, b) => a.recorrido.localeCompare(b.recorrido))
          setCourseLoops(validLoops)
          setSelectedLoops(validLoops.slice(0, 2).map(l => l.recorrido))
        } else {
          setCourseLoops([])
          setSelectedLoops([])
        }
      } else {
        // Fallback: check holes directly on parent (legacy model)
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
    }
    fetchCourseData()
  }, [courseId])

  const handleSubmit = async () => {
    if (!userId) return
    if (!cancha) {
      showError('Selecciona una cancha', 'Elige la cancha donde vas a jugar.')
      return
    }

    // Build player list
    const jugadoresValidos = adminMode
      ? [creatorName, ...adminPlayers.filter(p => p.nombre.trim()).map(p => p.nombre.trim())]
      : [creatorName]
    if (jugadoresValidos.length === 0) {
      showError('Faltan jugadores', 'Agrega al menos un jugador para crear la ronda.')
      return
    }
    if (formato === 'match_play' && jugadoresValidos.length !== 2) {
      showError('Match Play requiere 2 jugadores', 'Agrega exactamente un rival para jugar Match Play.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const codigo = Math.random().toString(36).substring(2, 8).toUpperCase()

    const holes = 18

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

    // modo_juego según formato seleccionado
    const modoJuego = formato === 'match_play' ? 'match_play_neto'
      : formato === 'stableford' ? 'stableford' : 'gross'
    const { data: d1, error: e1 } = await supabase
      .from('rondas_libres')
      .insert({ ...baseData, modo_juego: modoJuego })
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
            showError('Error de configuracion', 'La base de datos no esta configurada. Contacta al administrador.')
          } else {
            showError('Error al crear la ronda', e2?.message || 'Algo salio mal. Intenta nuevamente.')
          }
          return
        }
        ronda = d2
      } else if (e1.message?.includes("'public.rondas_libres'") || e1.message?.includes('relation') || e1.code === '42P01') {
        setLoading(false)
        showError('Error de configuracion', 'La base de datos no esta configurada. Contacta al administrador.')
        return
      } else {
        setLoading(false)
        showError('Error al crear la ronda', e1.message || 'Algo salio mal. Intenta nuevamente.')
        return
      }
    }

    if (!ronda) {
      setLoading(false)
      showError('Error al crear la ronda', 'Algo salio mal. Intenta nuevamente.')
      return
    }

    for (let i = 0; i < jugadoresValidos.length; i++) {
      const playerData: Record<string, unknown> = {
        ronda_id: ronda.id,
        nombre: jugadoresValidos[i],
        user_id: i === 0 ? userId : null,
        scores: {},
        handicap: i === 0 ? creatorHandicap : (adminMode && i > 0 ? adminPlayers[i - 1]?.handicap ?? null : null),
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

    // Snapshot de cancha para scoring inmutable
    if (courseId && ronda?.id) {
      try {
        const { saveCourseSnapshot } = await import('@/lib/save-course-snapshot')
        await saveCourseSnapshot(supabase, 'rondas_libres', ronda.id, courseId, null, tees)
      } catch { /* non-blocking */ }
    }

    await trackEvent(supabase, userId, 'ronda_creada', { codigo, cancha, holes })

    setRoundCode(codigo)
    setShowShareScreen(true)
    setLoading(false)
  }

  const handleShareWhatsApp = (type: 'jugar' | 'seguir') => {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://golfersplus.vercel.app')
    const link = type === 'jugar'
      ? `${baseUrl}/ronda-libre/${roundCode}/score`
      : `${baseUrl}/ronda-libre/${roundCode}`
    const message = type === 'jugar'
      ? `Unete a mi ronda en Golfers+! Codigo: ${roundCode}\n${link}`
      : `Sigue mi ronda en vivo en Golfers+!\n${link}`
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  const handleCopyLink = (type: 'jugar' | 'seguir') => {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://golfersplus.vercel.app')
    const link = type === 'jugar'
      ? `${baseUrl}/ronda-libre/${roundCode}/score`
      : `${baseUrl}/ronda-libre/${roundCode}`
    navigator.clipboard.writeText(link)
  }

  // ─── Share screen after round creation ───
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
              {cancha} &middot; 18 hoyos
            </div>

            {/* Invitar a jugar */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: colors.textSecondary, marginBottom: '8px', fontWeight: 500 }}>
                Invitar a jugar
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleShareWhatsApp('jugar')}
                  style={{
                    flex: 1, background: '#25D366', color: '#ffffff', fontWeight: 700, fontSize: '15px',
                    padding: '14px 16px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  WhatsApp
                </button>
                <button
                  onClick={() => handleCopyLink('jugar')}
                  style={{
                    padding: '14px 16px', background: colors.card, border: `1px solid ${colors.cardBorder}`,
                    color: colors.textSecondary, fontWeight: 500, fontSize: '14px', borderRadius: '12px', cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Copiar link
                </button>
              </div>
            </div>

            {/* Invitar a seguir */}
            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: colors.textSecondary, marginBottom: '8px', fontWeight: 500 }}>
                Invitar a seguir
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleShareWhatsApp('seguir')}
                  style={{
                    flex: 1, background: '#25D366', color: '#ffffff', fontWeight: 700, fontSize: '15px',
                    padding: '14px 16px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  WhatsApp
                </button>
                <button
                  onClick={() => handleCopyLink('seguir')}
                  style={{
                    padding: '14px 16px', background: colors.card, border: `1px solid ${colors.cardBorder}`,
                    color: colors.textSecondary, fontWeight: 500, fontSize: '14px', borderRadius: '12px', cursor: 'pointer',
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
                width: '100%', background: colors.gold, color: colors.activeBtnText, fontWeight: 700, fontSize: '16px',
                padding: '16px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {adminMode ? 'Empezar score de grupo \u2192' : 'Empezar a jugar \u2192'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step indicator ───
  const StepIndicator = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '28px' }}>
      {[1, 2, 3].map(s => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', fontWeight: 600,
            background: s === step ? colors.gold : s < step ? 'rgba(196,153,42,0.15)' : '#f3f4f6',
            color: s === step ? '#ffffff' : s < step ? colors.gold : colors.textLabel,
            transition: 'all 0.2s',
          }}>
            {s < step ? '\u2713' : s}
          </div>
          {s < 3 && (
            <div style={{
              width: '32px', height: '2px',
              background: s < step ? colors.gold : '#e5e7eb',
              transition: 'background 0.2s',
            }} />
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ background: colors.bg, minHeight: '100vh', padding: '20px 16px 80px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        {/* Back link */}
        <Link href="/dashboard" style={{ color: colors.textSecondary, fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '24px' }}>
          {'\u2190'} Dashboard
        </Link>

        {/* Header */}
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '32px', color: colors.textPrimary, marginBottom: '4px', marginTop: 0, fontWeight: 700 }}>
          Nueva Ronda
        </h1>
        <p style={{ fontSize: '14px', color: colors.textSecondary, marginTop: 0, marginBottom: '20px' }}>
          {step === 1 ? 'Como quieres jugar?' : step === 2 ? 'Donde juegas?' : 'Con quien juegas?'}
        </p>

        <StepIndicator />

        {/* ═══ STEP 1: Como quieres jugar? ═══ */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Card: Cada uno marca */}
            <button
              type="button"
              onClick={() => { setAdminMode(false); setAdminPlayers([]); setStep(2) }}
              style={{
                background: !adminMode ? 'rgba(196,153,42,0.06)' : colors.card,
                border: `2px solid ${!adminMode ? colors.gold : colors.cardBorder}`,
                borderRadius: '16px',
                padding: '28px 24px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>{'\u26F3'}</div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, marginBottom: '4px' }}>
                Cada uno marca su score
              </div>
              <div style={{ fontSize: '13px', color: colors.textSecondary }}>
                Cada jugador usa su celular
              </div>
            </button>

            {/* Card: Yo llevo el score */}
            <button
              type="button"
              onClick={() => {
                setAdminMode(true)
                setAdminPlayers([{ tipo: 'invitado', nombre: '', telefono: '', handicap: null }])
                setStep(2)
              }}
              style={{
                background: adminMode ? 'rgba(196,153,42,0.06)' : colors.card,
                border: `2px solid ${adminMode ? colors.gold : colors.cardBorder}`,
                borderRadius: '16px',
                padding: '28px 24px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>{'\uD83D\uDCCB'}</div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, marginBottom: '4px' }}>
                Yo llevo el score del grupo
              </div>
              <div style={{ fontSize: '13px', color: colors.textSecondary }}>
                Tu marcas el score de todos
              </div>
            </button>
          </div>
        )}

        {/* ═══ STEP 2: Donde juegas? ═══ */}
        {step === 2 && (
          <div>
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
                <label style={{ display: 'block', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: colors.textSecondary, marginBottom: '8px', fontWeight: 500 }}>
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
                  >{'\u00D7'}</button>
                )}
                {showCanchaDropdown && (() => {
                  const q = canchaSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                  const dbByName = new Map(coursesDB.map(c => [c.nombre, c]))
                  const unified: { name: string; courseId: string | null; ciudad: string | null; verified: boolean }[] = []
                  const seen = new Set<string>()
                  for (const name of CANCHAS_CHILE) {
                    if (!name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) continue
                    const db = dbByName.get(name)
                    unified.push({ name, courseId: db?.id ?? null, ciudad: db?.ciudad ?? null, verified: !!db?.datos_verificados })
                    seen.add(name)
                  }
                  for (const c of coursesDB) {
                    if (seen.has(c.nombre)) continue
                    if (!c.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) continue
                    unified.push({ name: c.nombre, courseId: c.id, ciudad: c.ciudad, verified: !!c.datos_verificados })
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
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {c.courseId && (
                              <span style={{
                                width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                                background: c.verified ? '#16a34a' : '#d97706',
                              }} />
                            )}
                            {c.name}
                          </span>
                          {c.ciudad && <span style={{ color: colors.textLabel, fontSize: '12px', marginLeft: '8px' }}>{'\u2014'} {c.ciudad}</span>}
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
                  background: courseDetails.has_holes ? 'rgba(196,153,42,0.08)' : 'rgba(217,119,6,0.08)',
                  borderRadius: '10px',
                  fontSize: '13px',
                  color: '#374151',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexWrap: 'wrap',
                }}>
                  {courseDetails.has_holes ? (
                    <>
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>{'\u2713'}</span>
                      {courseDetails.par_total && <span>Par {courseDetails.par_total}</span>}
                      {courseDetails.course_rating && <span>&middot; CR {courseDetails.course_rating}</span>}
                      {courseDetails.slope_rating && <span>&middot; Slope {courseDetails.slope_rating}</span>}
                    </>
                  ) : (
                    <>
                      <span style={{ color: '#d97706', fontWeight: 700 }}>{'!'}</span>
                      <span style={{ color: '#92400e' }}>Datos parciales — el scoring puede no ser exacto</span>
                    </>
                  )}
                </div>
              )}

              {/* Multi-loop selector — combination-based for 27h courses */}
              {courseLoops.length >= 2 && (() => {
                // Generate all 2-loop combinations
                const combos: Array<{ loops: string[]; par: number; key: string }> = []
                for (let i = 0; i < courseLoops.length; i++) {
                  for (let j = i + 1; j < courseLoops.length; j++) {
                    const l1 = courseLoops[i], l2 = courseLoops[j]
                    combos.push({
                      loops: [l1.recorrido, l2.recorrido],
                      par: l1.par + l2.par,
                      key: [l1.recorrido, l2.recorrido].map(l => l.toLowerCase()).sort().join('_'),
                    })
                  }
                }
                const activeKey = selectedLoops.length === 2
                  ? selectedLoops.map(l => l.toLowerCase()).sort().join('_')
                  : null
                // Find matching tees for each combo
                const teesForCombo = (key: string) => courseTees.filter(t => t.nombre.toLowerCase().includes(key))
                return (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: colors.textSecondary, marginBottom: '10px', fontWeight: 500 }}>
                      Elige tu recorrido de 18 hoyos
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {combos.map(combo => {
                        const isActive = combo.key === activeKey
                        const comboTees = teesForCombo(combo.key)
                        const blancoTee = comboTees.find(t => t.nombre.startsWith('blanco'))
                        return (
                          <button
                            key={combo.key}
                            type="button"
                            onClick={() => setSelectedLoops(combo.loops)}
                            style={{
                              width: '100%', padding: '16px 20px', borderRadius: '14px',
                              border: isActive ? `2px solid ${colors.gold}` : '1px solid #e5e7eb',
                              cursor: 'pointer', textAlign: 'left',
                              background: isActive ? 'rgba(196,153,42,0.06)' : '#ffffff',
                              transition: 'all 0.15s',
                              WebkitTapHighlightColor: 'transparent',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', fontWeight: 600, color: isActive ? colors.gold : colors.textPrimary }}>
                                  {combo.loops.join(' + ')}
                                </div>
                                <div style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#6b7280', marginTop: '3px' }}>
                                  18 hoyos &middot; Par {combo.par}
                                  {blancoTee ? ` \u00b7 ${blancoTee.yardaje_total?.toLocaleString()} yds` : ''}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                {blancoTee ? (
                                  <div style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '11px', color: '#9ca3af' }}>
                                    <div>CR {blancoTee.rating}</div>
                                    <div>Slope {blancoTee.slope}</div>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Formato de juego */}
            <div style={{
              background: colors.card,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <label style={{ display: 'block', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: colors.textSecondary, marginBottom: '10px', fontWeight: 500 }}>
                Formato de juego
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {([
                  { value: 'stroke_play' as const, label: 'Stroke Play', desc: 'Gana el de menos golpes', icon: '\u26F3' },
                  { value: 'stableford' as const, label: 'Stableford', desc: 'Puntos por hoyo (neto)', icon: '\u2B50' },
                  { value: 'match_play' as const, label: 'Match Play Neto', desc: 'Hoyo a hoyo, 1 vs 1', icon: '\u2694\uFE0F' },
                ]).map(f => {
                  const active = formato === f.value
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => {
                        setFormato(f.value)
                        // Match play fuerza admin mode con 1 rival
                        if (f.value === 'match_play' && !adminMode) {
                          setAdminMode(true)
                          setAdminPlayers([{ tipo: 'invitado', nombre: '', telefono: '', handicap: null }])
                        }
                      }}
                      style={{
                        width: '100%', padding: '14px 16px', borderRadius: '12px',
                        border: active ? `2px solid ${colors.gold}` : `1px solid ${colors.cardBorder}`,
                        background: active ? 'rgba(196,153,42,0.06)' : '#ffffff',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.15s',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '20px' }}>{f.icon}</span>
                        <div>
                          <div style={{
                            fontSize: '15px', fontWeight: 600,
                            color: active ? colors.gold : colors.textPrimary,
                          }}>
                            {f.label}
                          </div>
                          <div style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '2px' }}>
                            {f.desc}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Match play info badge */}
              {formato === 'match_play' && (
                <div style={{
                  marginTop: '12px', padding: '10px 14px',
                  background: 'rgba(196,153,42,0.08)', borderRadius: '10px',
                  fontSize: '12px', color: '#92400e', lineHeight: 1.5,
                }}>
                  Match Play Neto: se aplica la diferencia de handicap entre los 2 jugadores.
                  El de mayor HCP recibe strokes en los hoyos mas dificiles.
                </div>
              )}
            </div>

            {/* Tees + Date row */}
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
                <label style={{ display: 'block', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: colors.textSecondary, marginBottom: '8px', fontWeight: 500 }}>
                  Tees
                </label>
                {courseTees.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(() => {
                      // Filter tees by selected loop combination (e.g., "blanco_norte_sur")
                      const loopKey = selectedLoops.length === 2
                        ? selectedLoops.map(l => l.toLowerCase()).sort().join('_')
                        : null
                      const filtered = loopKey
                        ? courseTees.filter(t => t.nombre.toLowerCase().includes(loopKey))
                        : courseTees
                      const teesToShow = filtered.length > 0 ? filtered : courseTees
                      return teesToShow.map((t) => {
                        const val = t.nombre.toLowerCase()
                        const active = tees === val
                        // Pretty-print tee name: "blanco_norte_sur" → "Blanco"
                        const displayName = loopKey
                          ? t.nombre.split('_')[0].charAt(0).toUpperCase() + t.nombre.split('_')[0].slice(1)
                          : t.nombre.charAt(0).toUpperCase() + t.nombre.slice(1)
                        return (
                          <button
                            key={t.nombre}
                            type="button"
                            onClick={() => setTees(val)}
                            style={{
                              width: '100%', padding: '14px 16px', borderRadius: '12px',
                              border: '1px solid',
                              cursor: 'pointer', textAlign: 'left',
                              fontWeight: active ? 600 : 400,
                              background: active ? colors.activeBtn : '#f9fafb',
                              borderColor: active ? colors.activeBtn : '#e5e7eb',
                              color: active ? colors.activeBtnText : '#374151',
                              transition: 'all 0.15s',
                              WebkitTapHighlightColor: 'transparent',
                            }}
                          >
                            <div style={{ fontSize: '14px', fontWeight: 600 }}>{displayName}</div>
                            <div style={{ fontSize: '11px', color: active ? 'rgba(7,13,24,0.7)' : '#6b7280', marginTop: '2px' }}>
                              {t.yardaje_total?.toLocaleString()} yds
                              {t.rating ? ` \u00b7 CR ${t.rating}` : ''}
                              {t.slope ? ` \u00b7 Slope ${t.slope}` : ''}
                            </div>
                          </button>
                        )
                      })
                    })()}
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
                            padding: '10px 18px', borderRadius: '24px',
                            border: '1px solid',
                            cursor: 'pointer', fontSize: '14px', minHeight: '40px',
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

              {/* Fecha */}
              <div>
                <label style={{ display: 'block', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: colors.textSecondary, marginBottom: '8px', fontWeight: 500 }}>
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
            </div>

            {/* Partida simultanea */}
            <div style={{
              background: colors.card,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: '16px',
              padding: '16px 20px',
              marginBottom: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <div
                onClick={() => {
                  setPartidaSimultanea(prev => { if (prev) setHoyoInicio(1); return !prev })
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer',
                }}
              >
                <div style={{
                  width: '40px', height: '24px', borderRadius: '12px',
                  background: partidaSimultanea ? colors.gold : '#d1d5db',
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
                  <div style={{ fontSize: '14px', fontWeight: 500, color: colors.textPrimary }}>Partida simultanea</div>
                  <div style={{ fontSize: '11px', color: colors.textSecondary }}>Empieza en un hoyo distinto al 1</div>
                </div>
              </div>

              {partidaSimultanea && (
                <div style={{ marginTop: '12px', padding: '0 4px' }}>
                  <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '8px' }}>Hoyo de inicio:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Array.from({ length: 17 }, (_, i) => i + 2).map(h => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setHoyoInicio(h)}
                        style={{
                          width: '38px', height: '38px', borderRadius: '10px',
                          fontSize: '14px', fontWeight: hoyoInicio === h ? 700 : 400,
                          background: hoyoInicio === h ? colors.gold : '#f3f4f6',
                          color: hoyoInicio === h ? '#ffffff' : colors.textSecondary,
                          border: `1px solid ${hoyoInicio === h ? colors.gold : colors.cardBorder}`,
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

            {/* Nav buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  flex: 1, padding: '14px', background: 'transparent',
                  border: `1px solid ${colors.cardBorder}`, borderRadius: '12px',
                  color: colors.textSecondary, fontSize: '15px', fontWeight: 500, cursor: 'pointer',
                }}
              >
                {'\u2190'} Atras
              </button>
              <button
                type="button"
                disabled={!cancha}
                onClick={() => setStep(3)}
                style={{
                  flex: 2, padding: '14px',
                  background: !cancha ? '#e5e7eb' : colors.gold,
                  color: !cancha ? '#9ca3af' : colors.activeBtnText,
                  border: 'none', borderRadius: '12px',
                  fontSize: '16px', fontWeight: 600, cursor: !cancha ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                Siguiente {'\u2192'}
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3: Con quien juegas? ═══ */}
        {step === 3 && (
          <div>
            {/* Creator (read-only) */}
            <div style={{
              background: colors.card,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <label style={{ display: 'block', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: colors.textSecondary, marginBottom: '10px', fontWeight: 500 }}>
                Jugadores
              </label>

              {/* Creator card */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: '12px',
                background: 'rgba(196,153,42,0.06)', border: `1px solid rgba(196,153,42,0.2)`,
                marginBottom: '10px',
              }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: colors.textPrimary }}>{creatorName}</div>
                  <div style={{ fontSize: '12px', color: colors.textSecondary }}>
                    HCP {creatorHandicap != null ? creatorHandicap : '--'}
                  </div>
                </div>
                <span style={{
                  fontSize: '11px', color: colors.gold,
                  background: 'rgba(196,153,42,0.1)', padding: '3px 10px', borderRadius: '10px', fontWeight: 600,
                }}>
                  Tu
                </span>
              </div>

              {/* Admin mode players */}
              {adminMode && (
                <>
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
                              cursor: 'pointer', minHeight: '32px',
                            }}
                          >
                            {tipo === 'cuenta' ? 'Con cuenta' : 'Invitado'}
                          </button>
                        ))}
                      </div>

                      {/* Name input */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                        <input
                          type="text"
                          placeholder={player.tipo === 'cuenta' ? 'Nombre del jugador' : 'Nombre del invitado'}
                          value={player.nombre}
                          onChange={(e) => updateAdminPlayer(idx, 'nombre', e.target.value)}
                          style={{
                            background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                            color: colors.textPrimary, borderRadius: '10px',
                            padding: '10px 12px', fontSize: '15px', outline: 'none',
                            flex: 1, minHeight: '44px', boxSizing: 'border-box' as const,
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => removeAdminPlayer(idx)}
                          style={{
                            background: 'transparent', border: `1px solid ${colors.cardBorder}`,
                            color: '#ef4444', borderRadius: '10px', padding: '8px 12px',
                            cursor: 'pointer', flexShrink: 0, fontSize: '14px',
                            minHeight: '44px', minWidth: '44px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          x
                        </button>
                      </div>

                      {/* HCP input */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <label style={{ fontSize: '12px', color: colors.textLabel, flexShrink: 0 }}>HCP</label>
                        <input
                          type="number"
                          placeholder="--"
                          value={player.handicap ?? ''}
                          onChange={(e) => updateAdminPlayer(idx, 'handicap', e.target.value ? Number(e.target.value) : null)}
                          style={{
                            background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                            color: colors.textPrimary, borderRadius: '10px',
                            padding: '8px 12px', fontSize: '14px', outline: 'none',
                            width: '80px', minHeight: '38px', boxSizing: 'border-box' as const,
                          }}
                        />
                      </div>

                      {/* Phone input for guests */}
                      {player.tipo === 'invitado' && (
                        <input
                          type="tel"
                          placeholder="Telefono (WhatsApp, opcional)"
                          value={player.telefono}
                          onChange={(e) => updateAdminPlayer(idx, 'telefono', e.target.value)}
                          style={{
                            background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                            color: colors.textPrimary, borderRadius: '10px',
                            padding: '10px 12px', fontSize: '15px', outline: 'none',
                            width: '100%', minHeight: '44px', marginTop: '6px',
                            boxSizing: 'border-box' as const,
                          }}
                        />
                      )}
                    </div>
                  ))}

                  {/* Add player button — match play only allows 1 rival */}
                  {adminPlayers.length < (formato === 'match_play' ? 1 : 3) && (
                    <button
                      type="button"
                      onClick={addAdminPlayer}
                      style={{
                        width: '100%', background: 'transparent',
                        border: `1px dashed ${colors.gold}`, color: colors.gold,
                        borderRadius: '10px', padding: '12px', cursor: 'pointer',
                        fontSize: '14px', fontWeight: 500, textAlign: 'center', minHeight: '44px',
                      }}
                    >
                      + Agregar jugador
                    </button>
                  )}
                </>
              )}

              {/* Match Play: handicap difference preview */}
              {formato === 'match_play' && adminPlayers.length === 1 && (
                <div style={{
                  marginTop: '12px', padding: '14px',
                  background: 'rgba(196,153,42,0.06)',
                  border: '1px solid rgba(196,153,42,0.2)',
                  borderRadius: '12px',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.gold, marginBottom: '8px' }}>
                    Match Play Neto
                  </div>
                  {(() => {
                    const hcpA = creatorHandicap ?? 0
                    const hcpB = adminPlayers[0]?.handicap ?? 0
                    const diff = Math.abs(hcpA - hcpB)
                    const receiver = hcpA > hcpB ? creatorName : (adminPlayers[0]?.nombre || 'Rival')
                    if (diff === 0) {
                      return (
                        <div style={{ fontSize: '13px', color: colors.textSecondary }}>
                          Mismo handicap — sin strokes de ventaja
                        </div>
                      )
                    }
                    return (
                      <div style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: 1.6 }}>
                        <strong>{receiver}</strong> recibe <strong style={{ color: colors.gold }}>{diff} stroke{diff !== 1 ? 's' : ''}</strong> de ventaja
                        <br />
                        <span style={{ fontSize: '11px', color: colors.textLabel }}>
                          HCP {creatorName}: {hcpA} vs HCP {adminPlayers[0]?.nombre || 'Rival'}: {hcpB}
                        </span>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Non-admin: simple note */}
              {!adminMode && formato !== 'match_play' && (
                <div style={{
                  padding: '14px',
                  background: 'rgba(196,153,42,0.04)',
                  borderRadius: '10px',
                  fontSize: '13px',
                  color: colors.textSecondary,
                  lineHeight: 1.5,
                }}>
                  Otros jugadores pueden unirse compartiendo el enlace despues de crear la ronda.
                </div>
              )}
            </div>

            {/* Nav buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setStep(2)}
                style={{
                  flex: 1, padding: '14px', background: 'transparent',
                  border: `1px solid ${colors.cardBorder}`, borderRadius: '12px',
                  color: colors.textSecondary, fontSize: '15px', fontWeight: 500, cursor: 'pointer',
                }}
              >
                {'\u2190'} Atras
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleSubmit}
                style={{
                  flex: 2, padding: '14px',
                  background: loading ? '#e5e7eb' : colors.gold,
                  color: loading ? '#9ca3af' : colors.activeBtnText,
                  border: 'none', borderRadius: '12px',
                  fontSize: '16px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 2px 8px rgba(196,153,42,0.3)',
                  transition: 'all 0.15s',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {loading ? 'Creando ronda...' : 'Crear ronda \u2192'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
