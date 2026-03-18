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
  const [holeCount,      setHoleCount]      = useState(18)
  const [tees,           setTees]           = useState('blanco')
  const [useHandicap,    setUseHandicap]    = useState(true)
  const [categories,     setCategories]     = useState<string[]>(['A', 'B', 'C'])
  const [newCat,         setNewCat]         = useState('')
  const [day,            setDay]            = useState('')
  const [month,          setMonth]          = useState('')
  const [year,           setYear]           = useState('')
  const [coverUrl,       setCoverUrl]       = useState('')
  const [loading,        setLoading]        = useState(false)

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

  const addCategory = () => {
    const cat = newCat.trim().toUpperCase()
    if (!cat || categories.includes(cat)) return
    setCategories(prev => [...prev, cat])
    setNewCat('')
  }
  const removeCategory = (cat: string) => {
    if (categories.length <= 1) return
    setCategories(prev => prev.filter(c => c !== cat))
  }

  // Input style helper — red border on error
  const inputStyle = (field: string): React.CSSProperties => ({
    background:  'rgba(7,13,24,0.6)',
    border:      `1px solid ${fieldError(field) ? '#dc2626' : 'rgba(122,143,168,0.3)'}`,
    color:       '#edeae4',
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
    fontSize:   '12px',
    color:      '#94a8c0',
    marginBottom: '6px',
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
    if (categories.length < 1) {
      setFieldError('categories', 'Necesitas al menos 1 categoría.')
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

    const tournamentBase = {
      name:            name.trim(),
      slug,
      organizer_id:    userId,
      course_id:       selectedCourse!.id,
      format,
      hole_count:      holeCount,
      tees,
      use_handicap:    useHandicap,
      cover_image_url: coverUrl.trim() || null,
      status:          'draft',
      date_start:      dateISO,
    }

    // Intento 1: con modo_juego
    let tError: { message?: string; code?: string } | null = null
    let tournament: Record<string, unknown> | null = null

    const { data: t1, error: te1 } = await supabase
      .from('tournaments')
      .insert({ ...tournamentBase, modo_juego: 'gross' })
      .select()
      .single()

    if (!te1) {
      tournament = t1
    } else if (
      te1.message?.includes('modo_juego') ||
      te1.message?.includes('schema cache') ||
      te1.code === '42703'
    ) {
      // Columna no existe — reintentar sin modo_juego
      const { data: t2, error: te2 } = await supabase
        .from('tournaments')
        .insert(tournamentBase)
        .select()
        .single()
      tournament = t2
      tError = te2
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

    await trackEvent(supabase, userId, 'torneo_creado', { name: name.trim(), slug })

    await Promise.all([
      supabase.from('categories').insert(
        categories.map((cat, i) => ({
          tournament_id: tournament.id,
          name: cat,
          handicap_min: i === 0 ? 0 : null,
          handicap_max: i === 0 ? 18 : null,
        }))
      ),
      supabase.from('flights').insert([
        { tournament_id: tournament.id, name: 'Flight 1', tee_time: dateISO ? `${dateISO}T08:00:00` : null },
      ]),
    ])

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
        <Link href="/dashboard" style={{ color: '#94a8c0', fontSize: '13px', textDecoration: 'none', display: 'block', marginBottom: '20px' }}>
          ← Volver al dashboard
        </Link>

        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '13px', color: '#c4992a', marginBottom: '6px' }}>Golfers+</div>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#edeae4', margin: 0 }}>
            Crear nuevo torneo
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
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.2)', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', zIndex: 50 }}>
                {filteredCourses.slice(0, 15).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelectedCourse(c); setCourseSearch(c.nombre); setShowCourses(false); clearAll() }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#edeae4', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,153,42,0.08)')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}
                  >
                    {c.nombre}
                    {c.ciudad && <span style={{ color: '#94a8c0', fontSize: '12px', marginLeft: '8px' }}>— {c.ciudad}</span>}
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
                  onClick={() => setFormat(f.value)}
                  style={{
                    flex: 1, padding: '14px',
                    border: format === f.value ? '2px solid #c4992a' : '1px solid rgba(122,143,168,0.3)',
                    borderRadius: '10px',
                    background: format === f.value ? 'rgba(196,153,42,0.08)' : 'rgba(7,13,24,0.4)',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 200ms',
                  }}
                >
                  <div style={{ color: '#edeae4', fontWeight: 600, fontSize: '14px' }}>{f.label}</div>
                  <div style={{ color: '#94a8c0', fontSize: '12px', marginTop: '4px' }}>{f.desc}</div>
                </button>
              ))}
            </div>
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
                      color: holeCount === n ? '#edeae4' : '#94a8c0',
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
                      color: tees === t.value ? '#edeae4' : '#94a8c0',
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
              <div style={{ color: '#edeae4', fontSize: '14px', fontWeight: 500 }}>Aplicar hándicap WHS</div>
              <div style={{ color: '#94a8c0', fontSize: '12px', marginTop: '2px' }}>Ajusta los scores según el índice de cada jugador</div>
            </div>
            <button
              type="button"
              onClick={() => setUseHandicap(!useHandicap)}
              style={{ width: '48px', height: '26px', borderRadius: '13px', background: useHandicap ? '#c4992a' : 'rgba(122,143,168,0.3)', position: 'relative', transition: 'background 200ms', border: 'none', cursor: 'pointer', flexShrink: 0 }}
            >
              <span style={{ position: 'absolute', top: '3px', left: useHandicap ? '25px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left 200ms' }} />
            </button>
          </div>

          {/* Categorías */}
          <div>
            <label style={labelStyle}>Categorías del torneo</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
              {categories.map(cat => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(196,153,42,0.12)', border: '1px solid rgba(196,153,42,0.3)', borderRadius: '20px', padding: '4px 12px' }}>
                  <span style={{ color: '#edeae4', fontSize: '13px', fontWeight: 600 }}>{cat}</span>
                  {categories.length > 1 && (
                    <button type="button" onClick={() => removeCategory(cat)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a8c0', fontSize: '14px', lineHeight: 1, padding: '0 2px' }}>
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" placeholder="Nueva categoría (ej: C)" value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }}
                style={{ ...inputStyle('categories'), flex: 1, padding: '8px 12px', fontSize: '14px' }}
                maxLength={20} />
              <button type="button" onClick={addCategory}
                style={{ background: 'rgba(196,153,42,0.15)', border: '1px solid rgba(196,153,42,0.4)', color: '#c4992a', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                +
              </button>
            </div>
            <FieldErr msg={fieldError('categories')} />
          </div>

          {/* 7. Fecha */}
          <div>
            <label style={labelStyle}>Fecha del torneo</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {/* Día */}
              <select
                value={day}
                onChange={(e) => { setDay(e.target.value); if (fieldError('date')) clearAll() }}
                style={{
                  ...inputStyle('date'),
                  flex: '0 0 80px',
                  width: '80px',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? '#dc2626' : '#c4992a' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? '#dc2626' : 'rgba(122,143,168,0.3)' }}
              >
                <option value="">Día</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={String(d)}>{d}</option>
                ))}
              </select>

              {/* Mes */}
              <select
                value={month}
                onChange={(e) => { setMonth(e.target.value); if (fieldError('date')) clearAll() }}
                style={{
                  ...inputStyle('date'),
                  flex: 1,
                  appearance: 'none',
                  cursor: 'pointer',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? '#dc2626' : '#c4992a' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? '#dc2626' : 'rgba(122,143,168,0.3)' }}
              >
                <option value="">Mes</option>
                {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => (
                  <option key={i + 1} value={String(i + 1)}>{m}</option>
                ))}
              </select>

              {/* Año */}
              <select
                value={year}
                onChange={(e) => { setYear(e.target.value); if (fieldError('date')) clearAll() }}
                style={{
                  ...inputStyle('date'),
                  flex: '0 0 90px',
                  width: '90px',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? '#dc2626' : '#c4992a' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? '#dc2626' : 'rgba(122,143,168,0.3)' }}
              >
                <option value="">Año</option>
                {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() + i).map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
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
              style={{ background: 'rgba(7,13,24,0.6)', border: '1px solid rgba(122,143,168,0.3)', color: '#edeae4', borderRadius: '8px', padding: '12px', width: '100%', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
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
            style={{ background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '16px', width: '100%', borderRadius: '8px', padding: '14px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: loading ? 0.8 : 1, transition: 'filter 200ms', marginTop: '4px' }}
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
