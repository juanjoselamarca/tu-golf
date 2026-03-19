'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'

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

  const [userId, setUserId] = useState<string | null>(null)
  const [cancha, setCancha] = useState('')
  const [canchaSearch, setCanchaSearch] = useState('')
  const [showCanchaDropdown, setShowCanchaDropdown] = useState(false)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [coursesDB, setCoursesDB] = useState<CourseDB[]>([])
  const [tees, setTees] = useState('azul')
  const [holes, setHoles] = useState<18 | 9>(18)
  const [fechaStr, setFechaStr] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [jugadores, setJugadores] = useState<string[]>(['', '', '', ''])
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
        .select('name')
        .eq('id', user.id)
        .single()

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !cancha) return

    const jugadoresValidos = jugadores.filter(j => j.trim() !== '')
    if (jugadoresValidos.length === 0) {
      console.error('Agrega al menos un jugador para crear la ronda.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const codigo = Math.random().toString(36).substring(2, 8).toUpperCase()

    const baseData = {
      codigo,
      creador_id: userId,
      course_id: courseId || null,
      course_name: cancha,
      tees,
      holes,
      fecha: fechaStr,
      estado: 'en_curso',
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
            console.error('La base de datos aún no está configurada. Ejecuta el archivo EJECUTAR_EN_SUPABASE.sql en el panel de Supabase.')
          } else {
            console.error('Error al crear la ronda: ' + e2?.message)
          }
          return
        }
        ronda = d2
      } else if (e1.message?.includes("'public.rondas_libres'") || e1.message?.includes('relation') || e1.code === '42P01') {
        setLoading(false)
        console.error('La base de datos aún no está configurada. Ejecuta el archivo EJECUTAR_EN_SUPABASE.sql en el panel de Supabase.')
        return
      } else {
        setLoading(false)
        console.error('Error al crear la ronda: ' + e1.message)
        return
      }
    }

    if (!ronda) {
      setLoading(false)
      console.error('Error al crear la ronda.')
      return
    }

    for (let i = 0; i < jugadoresValidos.length; i++) {
      await supabase.from('ronda_libre_jugadores').insert({
        ronda_id: ronda.id,
        nombre: jugadoresValidos[i],
        user_id: i === 0 ? userId : null,
        scores: {},
      })
    }

    await trackEvent(supabase, userId, 'ronda_creada', { codigo, cancha, holes })

    setRoundCode(codigo)
    setShowShareScreen(true)
    setLoading(false)
  }

  const filledCount = jugadores.filter((j) => j.trim()).length

  const handleShareWhatsApp = (type: 'jugar' | 'seguir') => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://tu-golf.vercel.app'
    const link = type === 'jugar'
      ? `${baseUrl}/ronda-libre/${roundCode}/score`
      : `${baseUrl}/ronda-libre/${roundCode}`
    const message = type === 'jugar'
      ? `Unete a mi ronda en Golfers+! Codigo: ${roundCode}\n${link}`
      : `Sigue mi ronda en vivo en Golfers+!\n${link}`
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  const handleCopyLink = (type: 'jugar' | 'seguir') => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://tu-golf.vercel.app'
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
                  }}
                >
                  Copiar link
                </button>
              </div>
            </div>

            <button
              onClick={() => router.push(`/ronda-libre/${roundCode}/score`)}
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
              }}
            >
              Empezar a jugar →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: colors.bg, minHeight: '100vh', padding: '20px 16px' }}>
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
                  }}
                >×</button>
              )}
              {showCanchaDropdown && (() => {
                const q = canchaSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                const dbByName = new Map(coursesDB.map(c => [c.nombre, c]))
                const unified: { name: string; courseId: string | null; ciudad: string | null }[] = []
                const seen = new Set<string>()
                for (const name of CANCHAS_CHILE) {
                  if (!name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) continue
                  const db = dbByName.get(name)
                  unified.push({ name, courseId: db?.id ?? null, ciudad: db?.ciudad ?? null })
                  seen.add(name)
                }
                for (const c of coursesDB) {
                  if (seen.has(c.nombre)) continue
                  if (!c.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) continue
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
                      }}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
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
                      onClick={() => setHoles(h)}
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
                      }}
                    >
                      {h} hoyos
                    </button>
                  )
                })}
              </div>
            </div>
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

          {/* Jugadores */}
          <div style={{
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
                  }}
                >
                  + Agregar jugador
                </button>
              )}
            </div>
          </div>

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
            }}
          >
            {loading ? 'Creando ronda...' : 'Crear ronda →'}
          </button>
        </form>
      </div>
    </div>
  )
}
