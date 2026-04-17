'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { useToast } from '@/hooks/useToast'
import CourseSelector from '@/components/CourseSelector'

const TEES_OPTIONS = ['Campeonato', 'Azul', 'Blanco', 'Rojo']

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
  const [courseId, setCourseId] = useState<string | null>(null)
  const [tees, setTees] = useState('blanco')
  const [partidaSimultanea, setPartidaSimultanea] = useState(false)
  const [hoyoInicio, setHoyoInicio] = useState(1)
  // Single-loop: elección 18 vs 9 hoyos, y qué mitad (front/back)
  const [totalHolesChoice, setTotalHolesChoice] = useState<9 | 18>(18)
  const [nineChoice, setNineChoice] = useState<'front' | 'back'>('front')
  const [adminMode, setAdminMode] = useState(false)

  // Admin mode: player slots
  interface AdminPlayer {
    tipo: 'cuenta' | 'invitado'
    nombre: string
    telefono: string
    handicap: number | null
    tees: string | null
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
    const maxPlayers = isTeamFormat ? 7 : 3
    if (adminPlayers.length < maxPlayers) {
      setAdminPlayers(prev => [...prev, { tipo: 'invitado', nombre: '', telefono: '', handicap: null, tees: null }])
    }
  }
  const [formato, setFormato] = useState<'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome'>('stroke_play')
  const isTeamFormat = ['best_ball', 'scramble', 'foursome'].includes(formato)
  const [equipos, setEquipos] = useState<Array<{ nombre: string; jugadorIndices: number[] }>>([
    { nombre: 'Equipo 1', jugadorIndices: [] },
    { nombre: 'Equipo 2', jugadorIndices: [] },
  ])
  const [modo, setModo] = useState<'gross' | 'neto'>('gross')
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

  // Slope/CR del tee seleccionado (fallback al global del curso si el tee no los tiene cargados)
  const activeTee = courseTees.find(t => t.nombre.toLowerCase() === tees.toLowerCase())
  const effectiveSlope = activeTee?.slope ?? courseDetails?.slope_rating ?? null
  const effectiveCR = activeTee?.rating ?? courseDetails?.course_rating ?? null

  // Helper: devuelve slope/CR del tee de un jugador, con fallback al tee global de la ronda
  const teeSlopeCR = (teeName: string | null | undefined): { slope: number | null; cr: number | null } => {
    if (!teeName) return { slope: effectiveSlope, cr: effectiveCR }
    const t = courseTees.find(ct => ct.nombre.toLowerCase() === teeName.toLowerCase())
    return { slope: t?.slope ?? effectiveSlope, cr: t?.rating ?? effectiveCR }
  }

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

    // Validación equipos: team formats requieren asignación completa
    if (['best_ball', 'scramble', 'foursome'].includes(formato)) {
      if (jugadoresValidos.length < 4) {
        showError('Faltan jugadores', `${formato === 'foursome' ? 'Foursome' : formato === 'scramble' ? 'Scramble' : 'Best Ball'} necesita al menos 4 jugadores (2 equipos de 2)`)
        setLoading(false)
        return
      }
      const minPerTeam = formato === 'foursome' ? 2 : 2
      const maxPerTeam = formato === 'foursome' ? 2 : 4
      const allValid = equipos.every(e => e.jugadorIndices.length >= minPerTeam && e.jugadorIndices.length <= maxPerTeam)
      const totalAssigned = equipos.reduce((sum, e) => sum + e.jugadorIndices.length, 0)
      if (!allValid || totalAssigned !== jugadoresValidos.length) {
        const msg = formato === 'foursome'
          ? 'Foursome requiere exactamente 2 jugadores por equipo'
          : 'Asigna todos los jugadores a un equipo (mínimo 2 por equipo)'
        showError('Equipos incompletos', msg)
        setLoading(false)
        return
      }
    }

    // Modalidades que exigen índice WHS para todos los jugadores con nombre.
    // Stableford Gross NO requiere HCP (los puntos se calculan sobre bruto vs par).
    const requiereHCP =
      formato === 'match_play' ||
      (modo === 'neto' && (formato === 'stroke_play' || formato === 'stableford' || formato === 'best_ball' || formato === 'scramble' || formato === 'foursome'))
    if (requiereHCP) {
      const filledAdmin = adminMode ? adminPlayers.filter(p => p.nombre.trim()) : []
      const missingHCP = filledAdmin.some(p => p.handicap == null)
      if (creatorHandicap == null || missingHCP) {
        showError('Índice requerido', 'Esta modalidad requiere el índice WHS de todos los jugadores para calcular el handicap de cancha.')
        return
      }
    }

    setLoading(true)

    const supabase = createClient()
    const codigo = Math.random().toString(36).substring(2, 8).toUpperCase()

    const isMultiLoop = courseLoops.length >= 2
    const holes = isMultiLoop && selectedLoops.length > 0
      ? selectedLoops.reduce((sum, r) => sum + (courseLoops.find(l => l.recorrido === r)?.holes ?? 9), 0)
      : totalHolesChoice

    // hoyo_inicio:
    // - Multi-loop: 1 (los loops ya determinan los hoyos), salvo partida simultánea.
    // - Single-loop 18 hoyos: 1 o hoyoInicio si partida simultánea.
    // - Single-loop 9 hoyos: Front=1, Back=10 (ignora partida simultánea para mantener simpleza).
    let finalHoyoInicio = 1
    if (isMultiLoop) {
      finalHoyoInicio = partidaSimultanea ? hoyoInicio : 1
    } else if (totalHolesChoice === 9) {
      finalHoyoInicio = nineChoice === 'back' ? 10 : 1
    } else {
      finalHoyoInicio = partidaSimultanea ? hoyoInicio : 1
    }

    const baseData: Record<string, unknown> = {
      codigo,
      creador_id: userId,
      course_id: courseId || null,
      course_name: cancha,
      tees,
      holes,
      fecha: fechaStr,
      estado: 'en_curso',
      hoyo_inicio: finalHoyoInicio,
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

    // Match Play siempre es neto (cultura golf Chile — con handicap).
    // Stableford ahora permite gross (sin handicap) y neto (con handicap).
    const modoJuego = formato === 'match_play' ? 'neto' : modo
    const formatoJuego = formato
    const { data: d1, error: e1 } = await supabase
      .from('rondas_libres')
      .insert({ ...baseData, modo_juego: modoJuego, formato_juego: formatoJuego })
      .select('id')
      .single()

    let ronda = d1
    if (e1) {
      if (
        e1.message?.includes('formato_juego') ||
        e1.message?.includes('schema cache') ||
        e1.code === '42703'
      ) {
        // Fallback: formato_juego no existe aún en BD → insertar sin él pero CON modo_juego
        const { data: d2, error: e2 } = await supabase
          .from('rondas_libres')
          .insert({ ...baseData, modo_juego: modoJuego })
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
        // Tee por jugador: creador usa el tee global, admin players pueden tener el suyo
        tees: i === 0 ? tees : (adminMode && i > 0 ? (adminPlayers[i - 1]?.tees ?? tees) : tees),
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

    // Persistir equipos para formatos team-aware
    if (isTeamFormat && ronda?.id) {
      const { data: insertedJugadores } = await supabase
        .from('ronda_libre_jugadores')
        .select('id, nombre')
        .eq('ronda_id', ronda.id)
        .order('created_at', { ascending: true })

      if (insertedJugadores) {
        for (const equipo of equipos) {
          const jugadoresEquipo = equipo.jugadorIndices.map(idx => ({
            dbRecord: insertedJugadores[idx],
            handicap: idx === 0
              ? (creatorHandicap ?? 0)
              : (adminPlayers[idx - 1]?.handicap ?? 0),
          }))
          const handicaps = jugadoresEquipo.map(j => j.handicap)
          let handicapEquipo: number | null = null
          if (formato === 'scramble') {
            const { calcularHandicapScramble } = await import('@/golf/formats/scramble')
            handicapEquipo = calcularHandicapScramble(handicaps)
          } else if (formato === 'foursome') {
            const { calcularHandicapFoursome } = await import('@/golf/formats/foursome')
            handicapEquipo = calcularHandicapFoursome(handicaps[0], handicaps[1])
          }

          const { data: equipoDB } = await supabase
            .from('ronda_equipos')
            .insert({
              ronda_id: ronda.id,
              nombre: equipo.nombre,
              handicap_equipo: handicapEquipo,
              scores: {},
            })
            .select('id')
            .single()

          if (equipoDB) {
            const members = jugadoresEquipo.map((j, idx) => ({
              equipo_id: equipoDB.id,
              jugador_id: j.dbRecord.id,
              orden: idx,
            }))
            await supabase.from('ronda_equipo_jugadores').insert(members)
          }
        }
      }
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
    const baseUrl = 'https://golfersplus.vercel.app'
    const link = type === 'jugar'
      ? `${baseUrl}/ronda-libre/${roundCode}/score`
      : `${baseUrl}/ronda-libre/${roundCode}`
    const message = type === 'jugar'
      ? `Unete a mi ronda en Golfers+! ${link}`
      : `Sigue mi ronda en vivo en Golfers+! ${link}`
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  const handleCopyLink = (type: 'jugar' | 'seguir') => {
    const baseUrl = 'https://golfersplus.vercel.app'
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
              <div style={{ fontSize: '28px', marginBottom: '10px' }}></div>
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
                setAdminPlayers([{ tipo: 'invitado', nombre: '', telefono: '', handicap: null, tees: null }])
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
              <div style={{ fontSize: '28px', marginBottom: '10px' }}></div>
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
              <div>
                <label style={{ display: 'block', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: colors.textSecondary, marginBottom: '8px', fontWeight: 500 }}>
                  Cancha *
                </label>
                {!cancha ? (
                  <CourseSelector
                    onSelect={(course) => {
                      setCancha(course.nombre)
                      setCourseId(course.id)
                    }}
                  />
                ) : (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 14px',
                    background: colors.inputBg,
                    border: `1px solid ${colors.inputBorder}`,
                    borderRadius: '10px',
                    minHeight: '48px',
                  }}>
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: courseId ? '#16a34a' : '#d97706',
                      flexShrink: 0,
                    }} />
                    <span style={{ color: colors.textPrimary, fontSize: '14px', flex: 1 }}>{cancha}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCancha('')
                        setCourseId(null)
                        setCourseTees([])
                        setCourseLoops([])
                        setSelectedLoops([])
                      }}
                      style={{
                        background: 'none', border: 'none',
                        color: colors.textLabel, fontSize: '13px',
                        cursor: 'pointer', padding: '4px 8px',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      Cambiar
                    </button>
                  </div>
                )}
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
                      {courseDetails.par_total && (
                        <span>
                          Par {courseDetails.par_total}
                          {courseLoops.length < 2 && totalHolesChoice === 9 && (
                            <span style={{ color: colors.textSecondary }}>
                              {' '}&middot; {nineChoice === 'back' ? 'Back 9 (10-18)' : 'Front 9 (1-9)'}
                            </span>
                          )}
                        </span>
                      )}
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

            {/* ¿Cuántos hoyos? — solo single-loop (multi-loop ya define hoyos vía recorridos) */}
            {cancha && courseLoops.length < 2 && (
              <div style={{
                background: colors.card,
                border: `1px solid ${colors.cardBorder}`,
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                <label style={{ display: 'block', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: colors.textSecondary, marginBottom: '10px', fontWeight: 500 }}>
                  {'\u00bf'}Cu{'\u00e1'}ntos hoyos?
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {([18, 9] as const).map(n => {
                    const active = totalHolesChoice === n
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setTotalHolesChoice(n)
                          if (n === 18) {
                            // Al volver a 18, reset hoyoInicio a 1 salvo partidaSimultanea
                            if (!partidaSimultanea) setHoyoInicio(1)
                          } else {
                            // 9 hoyos: forzar default Front 9; deshabilitar partidaSimultanea
                            setNineChoice('front')
                            setHoyoInicio(1)
                            if (partidaSimultanea) setPartidaSimultanea(false)
                          }
                        }}
                        style={{
                          flex: 1, padding: '14px 16px', borderRadius: '12px',
                          border: active ? `2px solid ${colors.gold}` : `1px solid ${colors.cardBorder}`,
                          background: active ? 'rgba(196,153,42,0.06)' : '#ffffff',
                          cursor: 'pointer', textAlign: 'center',
                          transition: 'all 0.15s',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <div style={{
                          fontSize: '15px', fontWeight: 600,
                          color: active ? colors.gold : colors.textPrimary,
                        }}>
                          {n} hoyos
                        </div>
                        <div style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '2px' }}>
                          {n === 18 ? 'Ronda completa' : 'Media ronda'}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {totalHolesChoice === 9 && (
                  <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                    {([
                      { value: 'front' as const, label: 'Front 9', desc: 'Hoyos 1-9' },
                      { value: 'back' as const, label: 'Back 9', desc: 'Hoyos 10-18' },
                    ]).map(opt => {
                      const active = nineChoice === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setNineChoice(opt.value)
                            setHoyoInicio(opt.value === 'back' ? 10 : 1)
                          }}
                          style={{
                            flex: 1, padding: '12px 14px', borderRadius: '10px',
                            border: active ? `2px solid ${colors.gold}` : `1px solid ${colors.cardBorder}`,
                            background: active ? 'rgba(196,153,42,0.06)' : '#ffffff',
                            cursor: 'pointer', textAlign: 'center',
                            transition: 'all 0.15s',
                            WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          <div style={{
                            fontSize: '14px', fontWeight: 600,
                            color: active ? colors.gold : colors.textPrimary,
                          }}>
                            {opt.label}
                          </div>
                          <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '2px' }}>
                            {opt.desc}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

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
                  { value: 'stroke_play' as const, label: 'Stroke Play', desc: 'Gana el de menos golpes', icon: '' },
                  { value: 'stableford' as const, label: 'Stableford', desc: 'Puntos por hoyo — gana el de más puntos', icon: '' },
                  { value: 'match_play' as const, label: 'Match Play', desc: 'Hoyo a hoyo, 1 vs 1', icon: '' },
                  // Team formats: motores listos, UI de equipos pendiente
                  { value: 'best_ball' as const, label: 'Best Ball', desc: 'Equipos: cuenta la mejor bola', icon: '\uD83C\uDFC6' },
                  { value: 'scramble' as const, label: 'Scramble', desc: 'Equipos: eligen el mejor tiro', icon: '\uD83E\uDD1D' },
                  { value: 'foursome' as const, label: 'Foursome', desc: 'Equipos de 2: tiros alternados', icon: '\uD83D\uDD04' },
                ]).map(f => {
                  const active = formato === f.value
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => {
                        setFormato(f.value)
                        // Match Play siempre neto (cultura golf Chile)
                        if (f.value === 'match_play') setModo('neto')
                        // Match play fuerza admin mode con 1 rival
                        if (f.value === 'match_play' && !adminMode) {
                          setAdminMode(true)
                          setAdminPlayers([{ tipo: 'invitado', nombre: '', telefono: '', handicap: null, tees: null }])
                        }
                        // Stableford requiere handicap de todos los jugadores desde el inicio → fuerza admin mode
                        if (f.value === 'stableford' && !adminMode) {
                          setAdminMode(true)
                          setAdminPlayers([{ tipo: 'invitado', nombre: '', telefono: '', handicap: null, tees: null }])
                        }
                        // Team formats force admin mode with 3 rivals (min 4 players for 2 teams of 2)
                        if (['best_ball', 'scramble', 'foursome'].includes(f.value) && !adminMode) {
                          setAdminMode(true)
                          setAdminPlayers([
                            { tipo: 'invitado', nombre: '', telefono: '', handicap: null, tees: null },
                            { tipo: 'invitado', nombre: '', telefono: '', handicap: null, tees: null },
                            { tipo: 'invitado', nombre: '', telefono: '', handicap: null, tees: null },
                          ])
                          setEquipos([{ nombre: 'Equipo 1', jugadorIndices: [] }, { nombre: 'Equipo 2', jugadorIndices: [] }])
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

              {/* Match Play info — misma estructura visual que Stableford */}
              {formato === 'match_play' && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: 'rgba(196,153,42,0.06)',
                  border: '1px solid rgba(196,153,42,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>{'\u2696\uFE0F'}</span>
                    <span style={{ fontSize: '12px', color: colors.textSecondary, lineHeight: 1.4 }}>
                      Hoyo a hoyo, 1 vs 1. Se aplica la diferencia de handicap: el jugador con mayor HCP recibe strokes en los hoyos más difíciles.
                    </span>
                  </div>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(196,153,42,0.15)',
                  }}>
                    {[
                      { label: 'Ganas hoyo', sym: '+1' },
                      { label: 'Empate', sym: '=' },
                      { label: 'Pierdes hoyo', sym: '−1' },
                    ].map(item => (
                      <span key={item.label} style={{
                        fontSize: '11px',
                        fontFamily: '"DM Mono", monospace',
                        color: colors.textSecondary,
                        background: '#ffffff',
                        border: '1px solid rgba(196,153,42,0.2)',
                        borderRadius: '6px',
                        padding: '3px 7px',
                        whiteSpace: 'nowrap',
                      }}>
                        <span style={{ color: '#c4992a', fontWeight: 700 }}>{item.sym}</span>
                        {' '}{item.label}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: '10px', color: colors.textSecondary, opacity: 0.75, lineHeight: 1.3 }}>
                    Gana quien cierre el match con más hoyos ganados.
                  </div>
                </div>
              )}

              {/* Selector Gross/Neto — separado del formato.
                  Oculto para Match Play (cultura golf Chile) — siempre neto. */}
              {formato !== 'match_play' && (
                <div style={{ marginTop: '20px' }}>
                  <div style={{
                    fontFamily: '"DM Sans", sans-serif',
                    fontSize: '13px', color: colors.textSecondary, marginBottom: '10px',
                    fontWeight: 500,
                  }}>
                    Modo de scoring
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {([
                      { value: 'neto' as const, label: 'Neto', desc: 'Con handicap', icon: '' },
                      { value: 'gross' as const, label: 'Gross', desc: 'Sin handicap', icon: '' },
                    ]).map(m => {
                      const active = modo === m.value
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setModo(m.value)}
                          style={{
                            flex: 1,
                            padding: '16px',
                            borderRadius: '12px',
                            border: active ? `2px solid ${colors.gold}` : `1px solid ${colors.cardBorder}`,
                            background: active ? 'rgba(196,153,42,0.06)' : '#ffffff',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.15s',
                            WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          <div style={{ fontSize: '20px', marginBottom: '6px' }}>{m.icon}</div>
                          <div style={{
                            fontSize: '15px', fontWeight: 600,
                            color: active ? colors.gold : colors.textPrimary,
                            marginBottom: '2px',
                          }}>
                            {m.label}
                          </div>
                          <div style={{ fontSize: '11px', color: colors.textSecondary }}>{m.desc}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Mensaje informativo para Stableford */}
              {formato === 'stableford' && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: 'rgba(196,153,42,0.06)',
                  border: '1px solid rgba(196,153,42,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>{'\u2696\uFE0F'}</span>
                    <span style={{ fontSize: '12px', color: colors.textSecondary, lineHeight: 1.4 }}>
                      {modo === 'neto'
                        ? 'Gana quien sume más puntos. Los puntos se calculan sobre tu score neto — el handicap te da strokes en los hoyos más difíciles.'
                        : 'Gana quien sume más puntos. Los puntos se calculan sobre tu score bruto — el handicap no entra en juego.'}
                    </span>
                  </div>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(196,153,42,0.15)',
                  }}>
                    {[
                      { label: 'Albatross+', pts: 5 },
                      { label: 'Eagle', pts: 4 },
                      { label: 'Birdie', pts: 3 },
                      { label: 'Par', pts: 2 },
                      { label: 'Bogey', pts: 1 },
                      { label: 'Doble+', pts: 0 },
                    ].map(item => (
                      <span key={item.label} style={{
                        fontSize: '11px',
                        fontFamily: '"DM Mono", monospace',
                        color: colors.textSecondary,
                        background: '#ffffff',
                        border: '1px solid rgba(196,153,42,0.2)',
                        borderRadius: '6px',
                        padding: '3px 7px',
                        whiteSpace: 'nowrap',
                      }}>
                        <span style={{ color: '#c4992a', fontWeight: 700 }}>{item.pts}</span>
                        {' '}{item.label}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: '10px', color: colors.textSecondary, opacity: 0.75, lineHeight: 1.3 }}>
                    Gana el jugador con más puntos al final de la ronda.
                  </div>
                </div>
              )}

              {/* Stroke Play info — misma estructura visual que Stableford / Match Play */}
              {formato === 'stroke_play' && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: 'rgba(196,153,42,0.06)',
                  border: '1px solid rgba(196,153,42,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>{'\u26F3'}</span>
                    <span style={{ fontSize: '12px', color: colors.textSecondary, lineHeight: 1.4 }}>
                      {modo === 'neto'
                        ? 'Se cuentan todos los golpes de la ronda. Al final se descuenta el handicap para obtener el score neto.'
                        : 'Se cuentan todos los golpes de la ronda, sin descontar handicap.'}
                    </span>
                  </div>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(196,153,42,0.15)',
                  }}>
                    {[
                      { label: 'Eagle', sym: '−2' },
                      { label: 'Birdie', sym: '−1' },
                      { label: 'Par', sym: '0' },
                      { label: 'Bogey', sym: '+1' },
                      { label: 'Doble+', sym: '+2' },
                    ].map(item => (
                      <span key={item.label} style={{
                        fontSize: '11px',
                        fontFamily: '"DM Mono", monospace',
                        color: colors.textSecondary,
                        background: '#ffffff',
                        border: '1px solid rgba(196,153,42,0.2)',
                        borderRadius: '6px',
                        padding: '3px 7px',
                        whiteSpace: 'nowrap',
                      }}>
                        <span style={{ color: '#c4992a', fontWeight: 700 }}>{item.sym}</span>
                        {' '}{item.label}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: '10px', color: colors.textSecondary, opacity: 0.75, lineHeight: 1.3 }}>
                    {modo === 'neto'
                      ? 'Gana el jugador con menos golpes tras descontar el handicap.'
                      : 'Gana el jugador con menos golpes al terminar la ronda.'}
                  </div>
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

            {/* Partida simultanea — se oculta si eligió 9 hoyos (Front/Back ya define el inicio) */}
            {!(courseLoops.length < 2 && totalHolesChoice === 9) && (
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
            )}

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

              {/* Creator card — editable: índice y tee */}
              <div style={{
                padding: '12px 14px', borderRadius: '12px',
                background: 'rgba(196,153,42,0.06)', border: `1px solid rgba(196,153,42,0.2)`,
                marginBottom: '10px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: colors.textPrimary }}>{creatorName}</div>
                  <span style={{
                    fontSize: '11px', color: colors.gold,
                    background: 'rgba(196,153,42,0.1)', padding: '3px 10px', borderRadius: '10px', fontWeight: 600,
                  }}>
                    Tu
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '12px', color: colors.textLabel, flexShrink: 0 }}>Índice</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ej: 10.5"
                    value={creatorHandicap ?? ''}
                    onChange={(e) => setCreatorHandicap(e.target.value ? Number(e.target.value) : null)}
                    style={{
                      background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                      color: colors.textPrimary, borderRadius: '10px',
                      padding: '8px 12px', fontSize: '14px', outline: 'none',
                      width: '90px', minHeight: '38px', boxSizing: 'border-box' as const,
                    }}
                  />
                  {courseTees.length > 1 && (
                    <select
                      value={tees}
                      onChange={(e) => setTees(e.target.value)}
                      style={{
                        background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                        color: colors.textPrimary, borderRadius: '10px',
                        padding: '8px 10px', fontSize: '13px', outline: 'none',
                        minHeight: '38px', boxSizing: 'border-box' as const,
                        cursor: 'pointer',
                      }}
                      title="Tee de salida"
                    >
                      {courseTees.map(t => {
                        const val = t.nombre.toLowerCase()
                        const label = val.charAt(0).toUpperCase() + val.slice(1)
                        return <option key={val} value={val}>{label}</option>
                      })}
                    </select>
                  )}
                  {creatorHandicap != null && effectiveSlope && effectiveCR && courseDetails?.par_total && (
                    <span style={{ fontSize: '12px', color: '#c4992a', fontWeight: 600 }}>
                      HCP {Math.round(creatorHandicap * (effectiveSlope / 113) + (effectiveCR - courseDetails.par_total))}
                    </span>
                  )}
                </div>
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

                      {/* Índice WHS → Handicap de cancha calculado */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: '12px', color: colors.textLabel, flexShrink: 0 }}>Índice</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Ej: 10.5"
                          value={player.handicap ?? ''}
                          onChange={(e) => updateAdminPlayer(idx, 'handicap', e.target.value ? Number(e.target.value) : null)}
                          style={{
                            background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                            color: colors.textPrimary, borderRadius: '10px',
                            padding: '8px 12px', fontSize: '14px', outline: 'none',
                            width: '90px', minHeight: '38px', boxSizing: 'border-box' as const,
                          }}
                        />
                        {/* Tee del jugador — hereda del tee global, override opcional */}
                        {courseTees.length > 1 && (
                          <select
                            value={player.tees ?? tees}
                            onChange={(e) => updateAdminPlayer(idx, 'tees', e.target.value)}
                            style={{
                              background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                              color: colors.textPrimary, borderRadius: '10px',
                              padding: '8px 10px', fontSize: '13px', outline: 'none',
                              minHeight: '38px', boxSizing: 'border-box' as const,
                              cursor: 'pointer',
                            }}
                            title="Tee de salida"
                          >
                            {courseTees.map(t => {
                              const val = t.nombre.toLowerCase()
                              const label = val.charAt(0).toUpperCase() + val.slice(1)
                              return <option key={val} value={val}>{label}</option>
                            })}
                          </select>
                        )}
                        {(() => {
                          const { slope: pSlope, cr: pCR } = teeSlopeCR(player.tees ?? tees)
                          return player.handicap != null && pSlope && pCR && courseDetails?.par_total ? (
                            <span style={{ fontSize: '12px', color: '#c4992a', fontWeight: 600 }}>
                              HCP {Math.round(player.handicap * (pSlope / 113) + (pCR - courseDetails.par_total))}
                            </span>
                          ) : null
                        })()}
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
                  {adminPlayers.length < (formato === 'match_play' ? 1 : isTeamFormat ? 7 : 3) && (
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

              {/* Match Play Neto: handicap difference preview (solo si modo = neto) */}
              {formato === 'match_play' && adminPlayers.length === 1 && (
                <div style={{
                  marginTop: '12px', padding: '14px',
                  background: 'rgba(196,153,42,0.06)',
                  border: '1px solid rgba(196,153,42,0.2)',
                  borderRadius: '12px',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.gold, marginBottom: '8px' }}>
                    Diferencia de handicap
                  </div>
                  {(() => {
                    // HCP cancha = round(Índice × Slope/113 + (CR - Par)) según USGA/WHS
                    const par = courseDetails?.par_total ?? 72
                    const computeCourseHcp = (indice: number | null | undefined, teeName: string | null | undefined): number => {
                      if (indice == null) return 0
                      const { slope, cr } = teeSlopeCR(teeName)
                      if (!slope || !cr) return Math.round(indice)
                      return Math.round(indice * (slope / 113) + (cr - par))
                    }
                    const hcpA = computeCourseHcp(creatorHandicap, tees)
                    const hcpB = computeCourseHcp(adminPlayers[0]?.handicap, adminPlayers[0]?.tees ?? tees)
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
                          HCP cancha: {hcpA} ({creatorName}) vs {hcpB} ({adminPlayers[0]?.nombre || 'Rival'})
                        </span>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Team assignment UI */}
              {isTeamFormat && adminMode && adminPlayers.filter(p => p.nombre.trim()).length >= 3 && (
                <div style={{
                  background: colors.card,
                  border: `1px solid ${colors.cardBorder}`,
                  borderRadius: '16px',
                  padding: '20px',
                  marginBottom: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                  <label style={{ display: 'block', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: colors.textSecondary, marginBottom: '10px', fontWeight: 500 }}>
                    Asignar equipos
                  </label>
                  {equipos.map((equipo, eIdx) => (
                    <div key={eIdx} style={{
                      background: '#f9fafb', borderRadius: '12px', padding: '12px',
                      marginBottom: '8px', border: '1px solid #e5e7eb',
                    }}>
                      <input
                        type="text"
                        value={equipo.nombre}
                        onChange={(e) => {
                          const updated = [...equipos]
                          updated[eIdx] = { ...updated[eIdx], nombre: e.target.value }
                          setEquipos(updated)
                        }}
                        style={{
                          width: '100%', border: 'none', background: 'transparent',
                          fontSize: '14px', fontWeight: 600, color: '#111827',
                          marginBottom: '8px', outline: 'none',
                          fontFamily: '"DM Sans", sans-serif',
                        }}
                      />
                      {[creatorName, ...adminPlayers.filter(p => p.nombre.trim()).map(p => p.nombre.trim())].map((nombre, pIdx) => {
                        const isInThisTeam = equipo.jugadorIndices.includes(pIdx)
                        const isInOtherTeam = equipos.some((e, i) => i !== eIdx && e.jugadorIndices.includes(pIdx))
                        return (
                          <button
                            key={pIdx}
                            type="button"
                            disabled={isInOtherTeam}
                            onClick={() => {
                              const updated = [...equipos]
                              if (isInThisTeam) {
                                updated[eIdx] = { ...updated[eIdx], jugadorIndices: updated[eIdx].jugadorIndices.filter(i => i !== pIdx) }
                              } else {
                                updated[eIdx] = { ...updated[eIdx], jugadorIndices: [...updated[eIdx].jugadorIndices, pIdx] }
                              }
                              setEquipos(updated)
                            }}
                            style={{
                              display: 'block', width: '100%', padding: '8px 12px',
                              marginBottom: '4px', borderRadius: '8px',
                              border: isInThisTeam ? `2px solid ${colors.gold}` : '1px solid #e5e7eb',
                              background: isInThisTeam ? 'rgba(196,153,42,0.06)' : isInOtherTeam ? '#f3f4f6' : '#ffffff',
                              opacity: isInOtherTeam ? 0.4 : 1,
                              cursor: isInOtherTeam ? 'not-allowed' : 'pointer',
                              fontSize: '13px', color: '#374151', textAlign: 'left' as const,
                              fontFamily: '"DM Sans", sans-serif',
                              WebkitTapHighlightColor: 'transparent',
                            }}
                          >
                            {nombre} {isInThisTeam && '\u2713'}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                  {equipos.length < 4 && (
                    <button
                      type="button"
                      onClick={() => setEquipos([...equipos, { nombre: `Equipo ${equipos.length + 1}`, jugadorIndices: [] }])}
                      style={{
                        width: '100%', padding: '10px', borderRadius: '8px',
                        border: '1px dashed #d1d5db', background: 'transparent',
                        fontSize: '13px', color: '#9ca3af', cursor: 'pointer',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      + Agregar equipo
                    </button>
                  )}
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
