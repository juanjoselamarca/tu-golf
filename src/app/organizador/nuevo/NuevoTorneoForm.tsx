'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { useToast } from '@/hooks/useToast'
import { useFormErrors } from '@/hooks/useFormErrors'
import type { CourseOption } from './page'

interface Props {
  userId:  string
  courses: CourseOption[]
}

function Spinner() {
  return (
    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

const FORMATS = [
  { value: 'stroke_play', label: 'Stroke Play', desc: 'Contar golpes totales' },
  { value: 'stableford',  label: 'Stableford',  desc: 'Puntos por hoyo' },
  { value: 'match_play',  label: 'Match Play',  desc: 'Hoyo a hoyo, 1 vs 1' },
]

const TEES = [
  { value: 'campeonato', label: 'Campeonato' },
  { value: 'azul',       label: 'Azul' },
  { value: 'blanco',     label: 'Blanco' },
  { value: 'rojo',       label: 'Rojo' },
]

// Reusable field-error helper
function FieldErr({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p style={{ color: '#f87171', fontSize: '12px', marginTop: '4px' }}>{msg}</p>
}

export default function NuevoTorneoForm({ userId, courses }: Props) {
  const router = useRouter()
  const { showError } = useToast()
  const { fieldError, setFieldError, clearAll } = useFormErrors()
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [name,           setName]           = useState('')
  const [courseSearch,   setCourseSearch]   = useState('')
  const [selectedCourse, setSelectedCourse] = useState<CourseOption | null>(null)
  const [showCourses,    setShowCourses]    = useState(false)
  const [format,         setFormat]         = useState('stroke_play')
  const [modo,           setModo]           = useState<'gross' | 'neto'>('gross')
  const [holeCount,      setHoleCount]      = useState(18)
  const [tees,           setTees]           = useState('blanco')
  const [useHandicap,    setUseHandicap]    = useState(true)
  const [day,            setDay]            = useState('')
  const [month,          setMonth]          = useState('')
  const [year,           setYear]           = useState('')
  const [coverUrl,       setCoverUrl]       = useState('')
  const [loading,        setLoading]        = useState(false)
  const [showSIGrid,     setShowSIGrid]     = useState(false)
  const [customSI,       setCustomSI]       = useState<Record<string, number>>({})
  const [courseHoles,     setCourseHoles]    = useState<Array<{ numero: number; par: number; stroke_index: number; yardaje_blanco?: number }>>([])
  const [siSource,       setSiSource]       = useState<'estimated' | 'generic' | 'verified'>('generic')
  const [suggestSI,      setSuggestSI]      = useState(false)

  const filteredCourses = courses.filter(
    (c) =>
      courseSearch === '' ||
      c.nombre.toLowerCase().includes(courseSearch.toLowerCase()) ||
      (c.ciudad || '').toLowerCase().includes(courseSearch.toLowerCase())
  )

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowCourses(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Load course holes when a course is selected
  useEffect(() => {
    if (!selectedCourse) { setCourseHoles([]); return }
    const supabase = createClient()
    supabase.from('course_holes')
      .select('numero, par, stroke_index, yardaje_blanco')
      .eq('course_id', selectedCourse.id)
      .order('numero')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCourseHoles(data)
          // Check if SI is generic
          const isGeneric = data.length === 18 &&
            data[0].stroke_index === 7 && data[1].stroke_index === 15
          setSiSource(isGeneric ? 'generic' : 'estimated')
        }
      })
    supabase.from('courses')
      .select('si_verificado')
      .eq('id', selectedCourse.id)
      .single()
      .then(({ data }) => {
        if (data?.si_verificado) setSiSource('verified')
      })
  }, [selectedCourse])

  // Input style helper — red border on error
  const inputStyle = (field: string): React.CSSProperties => ({
    background:  '#f8f9fa',
    border:      `1px solid ${fieldError(field) ? '#dc2626' : '#e2e8f0'}`,
    color:       '#1a1a2e',
    borderRadius: '8px',
    padding:     '12px',
    width:       '100%',
    fontSize:    '15px',
    outline:     'none',
    transition:  'border-color 200ms',
    boxSizing:   'border-box' as const,
  })

  const labelStyle: React.CSSProperties = {
    display:    'block',
    fontFamily: '"DM Sans", sans-serif',
    fontSize:   '13px',
    color:      '#6b7280',
    marginBottom: '8px',
    fontWeight:  500,
  }

  // Derive ISO date string from the three selects
  const dateISO = day && month && year
    ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearAll()

    // ── Client-side validation ────────────────────────────
    let hasErrors = false
    if (!name.trim()) {
      setFieldError('name', 'El nombre del torneo es obligatorio.')
      hasErrors = true
    }
    if (!selectedCourse) {
      setFieldError('course', 'Debes seleccionar una cancha.')
      hasErrors = true
    }
    if (!dateISO) {
      setFieldError('date', 'La fecha del torneo es obligatoria.')
      hasErrors = true
    }
    if (hasErrors) return

    setLoading(true)

    const supabase = createClient()

    const slug =
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 50) +
      '-' +
      Date.now().toString(36)

    await supabase.from('profiles').update({ role: 'organizer' }).eq('id', userId)

    const codigo = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('')

    const tournamentBase = {
      name:                 name.trim(),
      slug,
      organizer_id:         userId,
      course_id:            selectedCourse!.id,
      format,
      hole_count:           holeCount,
      tees,
      use_handicap:         useHandicap,
      afecta_estadisticas:  true,
      codigo,
      cover_image_url:      coverUrl.trim() || null,
      status:               'draft',
      date_start:           dateISO,
      total_rounds:         1,
    }

    let tError: { message?: string; code?: string } | null = null
    let tournament: Record<string, unknown> | null = null

    const { data: t1, error: te1 } = await supabase
      .from('tournaments')
      .insert({
        ...tournamentBase,
        // Match Play y Stableford oficiales requieren neto. Cualquier otra selección
        // del usuario se ignora para evitar formatos técnicamente inválidos.
        modo_juego: (format === 'match_play' || format === 'stableford') ? 'neto' : modo,
        formato_juego: format,
      })
      .select()
      .single()

    if (!te1) {
      tournament = t1
    } else {
      tError = te1
    }

    if (tError || !tournament) {
      // ── Server error translation ─────────────────────────
      const msg = (tError?.message || '').toLowerCase()

      if (msg.includes('tees')) {
        showError('Tee no válido', 'El tee seleccionado no está disponible. Elige Campeonato, Azul, Blanco o Rojo.')
        setFieldError('tees', 'Selecciona un tee válido')
      } else if (msg.includes('course')) {
        showError('Cancha requerida', 'Debes seleccionar una cancha para continuar.')
        setFieldError('course', 'Campo obligatorio')
      } else if (msg.includes('slug') || msg.includes('unique') || msg.includes('duplicate')) {
        showError('Nombre duplicado', 'Ya existe un torneo con ese nombre. Agrega el año o un identificador único.')
        setFieldError('name', 'Este nombre ya está en uso')
      } else if (msg.includes('date_start')) {
        showError('Fecha requerida', 'Debes ingresar la fecha del torneo.')
        setFieldError('date', 'Campo obligatorio')
      } else {
        showError('Error inesperado', 'No pudimos crear el torneo. Por favor intenta nuevamente.')
      }
      setLoading(false)
      return
    }

    // Snapshot de cancha: guardar par, SI, yardaje inmutable para scoring
    try {
      const { saveCourseSnapshot } = await import('@/lib/save-course-snapshot')
      const siOverride = Object.keys(customSI).length > 0 ? customSI : null
      await saveCourseSnapshot(supabase, 'tournaments', tournament.id as string, selectedCourse!.id, siOverride, tees)

      // Contribución comunitaria: proponer SI para la cancha
      if (suggestSI && siOverride && selectedCourse) {
        await supabase.from('course_si_proposals').insert({
          course_id: selectedCourse.id,
          proposed_by: userId,
          stroke_index: siOverride,
        })
      }
    } catch { /* non-blocking */ }

    await trackEvent(supabase, userId, 'torneo_creado', { name: name.trim(), slug })

    const { error: catErr } = await supabase.from('categories').insert([
      { tournament_id: tournament.id, name: 'General', handicap_min: 0, handicap_max: 54 },
    ])
    if (catErr) console.warn('[categories]', catErr.message)

    router.push(`/organizador/${slug}/jugadores`)
  }

  return (
    <div
      style={{
        minHeight:           '100vh',
        display:             'flex',
        alignItems:          'flex-start',
        justifyContent:      'center',
        backgroundImage:     'url(https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=1920&q=80)',
        backgroundSize:      'cover',
        backgroundPosition:  'center',
        position:            'relative',
        padding:             '40px 16px',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,13,24,0.85)' }} />

      <div
        style={{
          position:             'relative',
          zIndex:               10,
          background:           'rgba(14,28,47,0.94)',
          backdropFilter:       'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border:               '1px solid rgba(196,153,42,0.25)',
          borderRadius:         '16px',
          padding:              '40px',
          maxWidth:             '600px',
          width:                '100%',
        }}
      >
        <Link href="/dashboard" style={{ color: '#4a5568', fontSize: '13px', textDecoration: 'none', display: 'block', marginBottom: '20px' }}>
          ← Volver al dashboard
        </Link>

        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '13px', color: '#c4992a', marginBottom: '6px' }}>Golfers+</div>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '32px', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
            Nuevo Torneo
          </h1>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* 1. Nombre */}
          <div>
            <label style={labelStyle}>Nombre del torneo</label>
            <input
              type="text"
              placeholder="Ej: Copa Club Los Leones 2026"
              value={name}
              onChange={(e) => { setName(e.target.value); if (fieldError('name')) clearAll() }}
              style={inputStyle('name')}
              onFocus={(e) => { e.currentTarget.style.borderColor = fieldError('name') ? '#dc2626' : '#c4992a' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('name') ? '#dc2626' : 'rgba(122,143,168,0.3)' }}
            />
            <FieldErr msg={fieldError('name')} />
          </div>

          {/* 2. Cancha */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <label style={labelStyle}>Cancha</label>
            <input
              type="text"
              placeholder="Buscar cancha por nombre o ciudad..."
              value={courseSearch}
              onChange={(e) => { setCourseSearch(e.target.value); setSelectedCourse(null); setShowCourses(true) }}
              onFocus={() => setShowCourses(true)}
              style={{
                ...inputStyle('course'),
                borderColor: fieldError('course') ? '#dc2626' : selectedCourse ? '#c4992a' : 'rgba(122,143,168,0.3)',
              }}
            />
            {selectedCourse && (
              <div style={{ fontSize: '12px', color: '#c4992a', marginTop: '4px' }}>
                ✓ {selectedCourse.nombre}{selectedCourse.ciudad ? ` — ${selectedCourse.ciudad}` : ''}
              </div>
            )}
            <FieldErr msg={fieldError('course')} />
            {showCourses && filteredCourses.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#ffffff', border: '1px solid rgba(196,153,42,0.2)', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', zIndex: 50 }}>
                {filteredCourses.slice(0, 15).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelectedCourse(c); setCourseSearch(c.nombre); setShowCourses(false); clearAll() }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#1a1a2e', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,153,42,0.08)')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}
                  >
                    {c.nombre}
                    {c.ciudad && <span style={{ color: '#4a5568', fontSize: '12px', marginLeft: '8px' }}>— {c.ciudad}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3. Formato */}
          <div>
            <label style={labelStyle}>Formato de juego</label>
            <div style={{ display: 'flex', gap: '12px' }}>
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => {
                    setFormat(f.value)
                    // Match Play siempre neto (cultura golf Chile).
                    // Stableford oficial R&A también requiere neto (suma con handicap).
                    if (f.value === 'match_play' || f.value === 'stableford') setModo('neto')
                  }}
                  style={{
                    flex: 1, padding: '14px',
                    border: format === f.value ? '2px solid #c4992a' : '1px solid rgba(122,143,168,0.3)',
                    borderRadius: '10px',
                    background: format === f.value ? 'rgba(196,153,42,0.08)' : 'rgba(7,13,24,0.4)',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 200ms',
                  }}
                >
                  <div style={{ color: '#1a1a2e', fontWeight: 600, fontSize: '14px' }}>{f.label}</div>
                  <div style={{ color: '#4a5568', fontSize: '12px', marginTop: '4px' }}>{f.desc}</div>
                </button>
              ))}
            </div>

            {/* Selector Gross/Neto — separado del formato.
                Oculto para Match Play y Stableford — ambos siempre neto (regla oficial). */}
            {(format !== 'match_play' && format !== 'stableford') ? (
              <div style={{ marginTop: '16px' }}>
                <label style={labelStyle}>Modo de scoring</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {([
                    { value: 'neto' as const, label: 'Neto', desc: 'Con handicap', icon: '\u2696\uFE0F' },
                    { value: 'gross' as const, label: 'Gross', desc: 'Sin handicap', icon: '\uD83C\uDFAF' },
                  ]).map(m => {
                    const active = modo === m.value
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setModo(m.value)}
                        style={{
                          flex: 1, padding: '14px',
                          border: active ? '2px solid #c4992a' : '1px solid rgba(122,143,168,0.3)',
                          borderRadius: '10px',
                          background: active ? 'rgba(196,153,42,0.08)' : 'rgba(7,13,24,0.4)',
                          cursor: 'pointer', textAlign: 'left', transition: 'all 200ms',
                        }}
                      >
                        <div style={{ fontSize: '18px', marginBottom: '4px' }}>{m.icon}</div>
                        <div style={{ color: '#1a1a2e', fontWeight: 600, fontSize: '14px' }}>{m.label}</div>
                        <div style={{ color: '#4a5568', fontSize: '12px', marginTop: '2px' }}>{m.desc}</div>
                      </button>
                    )
                  })}
                </div>
                {format === 'stableford' && (
                  <div style={{
                    marginTop: '12px',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: 'rgba(196,153,42,0.06)',
                    border: '1px solid rgba(196,153,42,0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '16px' }}>{'\u2696\uFE0F'}</span>
                      <span style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.4 }}>
                        {modo === 'neto'
                          ? 'Stableford Neto: puntos calculados sobre el score neto (con handicap aplicado).'
                          : 'Stableford Gross: puntos calculados sobre el score bruto (sin handicap).'}
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
                          color: '#92400e',
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
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                marginTop: '16px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: 'rgba(196,153,42,0.06)',
                border: '1px solid rgba(196,153,42,0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '16px' }}>{'\u2696\uFE0F'}</span>
                  <span style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.4 }}>
                    {format === 'stableford'
                      ? 'Stableford oficial se juega siempre con handicap (neto) — regla R&A/USGA.'
                      : 'Match Play siempre se juega con handicap (neto) — formato estandar en clubes de Chile.'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 4+5. Hoyos + Tees */}
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Cantidad de hoyos</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[18, 9].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setHoleCount(n)}
                    style={{
                      flex: 1, padding: '10px',
                      border: holeCount === n ? '2px solid #c4992a' : '1px solid rgba(122,143,168,0.3)',
                      borderRadius: '8px',
                      background: holeCount === n ? 'rgba(196,153,42,0.08)' : 'rgba(7,13,24,0.4)',
                      color: holeCount === n ? '#1a1a2e' : '#4a5568',
                      cursor: 'pointer', fontSize: '14px', fontWeight: holeCount === n ? 600 : 400,
                    }}
                  >
                    {n} hoyos
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Tee de salida</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {TEES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTees(t.value)}
                    style={{
                      padding: '8px 12px',
                      border: tees === t.value
                        ? `2px solid ${fieldError('tees') ? '#dc2626' : '#c4992a'}`
                        : `1px solid ${fieldError('tees') ? 'rgba(220,38,38,0.5)' : 'rgba(122,143,168,0.3)'}`,
                      borderRadius: '6px',
                      background: tees === t.value ? 'rgba(196,153,42,0.08)' : 'rgba(7,13,24,0.4)',
                      color: tees === t.value ? '#1a1a2e' : '#4a5568',
                      cursor: 'pointer', fontSize: '13px', fontWeight: tees === t.value ? 600 : 400,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <FieldErr msg={fieldError('tees')} />
            </div>
          </div>

          {/* 6. Handicap toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(7,13,24,0.4)', borderRadius: '10px', border: '1px solid rgba(122,143,168,0.15)' }}>
            <div>
              <div style={{ color: '#1a1a2e', fontSize: '14px', fontWeight: 500 }}>Aplicar hándicap WHS</div>
              <div style={{ color: '#4a5568', fontSize: '12px', marginTop: '2px' }}>Ajusta los scores según el índice de cada jugador</div>
            </div>
            <button
              type="button"
              onClick={() => setUseHandicap(!useHandicap)}
              style={{ width: '48px', height: '26px', borderRadius: '13px', background: useHandicap ? '#c4992a' : 'rgba(122,143,168,0.3)', position: 'relative', transition: 'background 200ms', border: 'none', cursor: 'pointer', flexShrink: 0 }}
            >
              <span style={{ position: 'absolute', top: '3px', left: useHandicap ? '25px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left 200ms' }} />
            </button>
          </div>

          {/* 6b. SI warning for Stableford */}
          {format === 'stableford' && selectedCourse && siSource !== 'verified' && (
            <div style={{
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: '12px',
              padding: '16px',
            }}>
              <div style={{ fontSize: '13px', color: '#92400e', lineHeight: 1.5, marginBottom: '12px' }}>
                La dificultad por hoyo (stroke index) de esta cancha esta {siSource === 'generic' ? 'generica' : 'estimada'}.
                En Stableford, esto puede afectar el resultado en ±2 puntos.
              </div>
              {!showSIGrid ? (
                <button
                  type="button"
                  onClick={() => {
                    // Pre-fill with current SI
                    const prefill: Record<string, number> = {}
                    courseHoles.forEach(h => { prefill[String(h.numero)] = h.stroke_index })
                    setCustomSI(prefill)
                    setShowSIGrid(true)
                  }}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(245,158,11,0.3)',
                    color: '#92400e',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Corregir con la scorecard del club
                </button>
              ) : (
                <div>
                  <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '8px', fontWeight: 500 }}>
                    Ingresa la dificultad (1 = mas dificil, {holeCount} = mas facil):
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: holeCount === 18 ? '1fr 1fr' : '1fr', gap: '2px' }}>
                    {/* Front 9 */}
                    <div>
                      <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, padding: '4px 8px', textTransform: 'uppercase' }}>
                        {holeCount === 18 ? 'Front 9' : 'Hoyos'}
                      </div>
                      {courseHoles.slice(0, Math.min(9, holeCount)).map(h => (
                        <div key={h.numero} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px' }}>
                          <span style={{ fontSize: '12px', color: '#6b7280', width: '20px' }}>H{h.numero}</span>
                          <span style={{ fontSize: '11px', color: '#9ca3af', width: '30px' }}>P{h.par}</span>
                          <input
                            type="number"
                            min={1}
                            max={holeCount}
                            value={customSI[String(h.numero)] || ''}
                            onChange={e => setCustomSI(prev => ({ ...prev, [String(h.numero)]: parseInt(e.target.value) || 0 }))}
                            style={{
                              width: '48px', padding: '4px 6px', fontSize: '13px',
                              background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px',
                              textAlign: 'center', color: '#1a1a2e',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    {/* Back 9 */}
                    {holeCount === 18 && (
                      <div>
                        <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, padding: '4px 8px', textTransform: 'uppercase' }}>
                          Back 9
                        </div>
                        {courseHoles.slice(9, 18).map(h => (
                          <div key={h.numero} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px' }}>
                            <span style={{ fontSize: '12px', color: '#6b7280', width: '20px' }}>H{h.numero}</span>
                            <span style={{ fontSize: '11px', color: '#9ca3af', width: '30px' }}>P{h.par}</span>
                            <input
                              type="number"
                              min={1}
                              max={18}
                              value={customSI[String(h.numero)] || ''}
                              onChange={e => setCustomSI(prev => ({ ...prev, [String(h.numero)]: parseInt(e.target.value) || 0 }))}
                              style={{
                                width: '48px', padding: '4px 6px', fontSize: '13px',
                                background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px',
                                textAlign: 'center', color: '#1a1a2e',
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button
                      type="button"
                      onClick={() => { setShowSIGrid(false); setCustomSI({}) }}
                      style={{ fontSize: '12px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSIGrid(false)}
                      style={{ fontSize: '12px', color: '#92400e', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', cursor: 'pointer', padding: '4px 12px', fontWeight: 500 }}
                    >
                      Guardar dificultad
                    </button>
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6b7280', cursor: 'pointer' }}>
                      <input type="checkbox" checked={suggestSI} onChange={e => setSuggestSI(e.target.checked)} style={{ accentColor: '#c4992a' }} />
                      Sugerir esta dificultad para futuros torneos en esta cancha
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 7. Fecha */}
          <div>
            <label style={labelStyle}>Fecha del torneo</label>
            <input
              type="date"
              value={dateISO}
              onChange={(e) => {
                const v = e.target.value
                if (v) {
                  const [y, m, d] = v.split('-')
                  setYear(y); setMonth(m); setDay(d)
                } else {
                  setYear(''); setMonth(''); setDay('')
                }
                if (fieldError('date')) clearAll()
              }}
              min={new Date().toISOString().split('T')[0]}
              style={{
                ...inputStyle('date'),
                width: '100%',
                cursor: 'pointer',
                colorScheme: 'dark',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? '#dc2626' : '#c4992a' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? '#dc2626' : 'rgba(122,143,168,0.3)' }}
            />
            <FieldErr msg={fieldError('date')} />
          </div>

          {/* 8. Foto */}
          <div>
            <label style={labelStyle}>Foto de portada (opcional)</label>
            <input
              type="url"
              placeholder="URL de imagen (Unsplash, etc.)"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              style={{ background: 'rgba(7,13,24,0.6)', border: '1px solid rgba(122,143,168,0.3)', color: '#1a1a2e', borderRadius: '8px', padding: '12px', width: '100%', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')}
            />
            {coverUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={coverUrl} alt="Preview" style={{ marginTop: '8px', width: '100%', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(196,153,42,0.2)' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{ background: '#c4992a', color: '#1a1a2e', fontWeight: 700, fontSize: '16px', width: '100%', borderRadius: '8px', padding: '14px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: loading ? 0.8 : 1, transition: 'filter 200ms', marginTop: '4px' }}
            onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.08)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)' }}
          >
            {loading && <Spinner />}
            {loading ? 'Creando torneo...' : 'Crear torneo →'}
          </button>
        </form>
      </div>
    </div>
  )
}
