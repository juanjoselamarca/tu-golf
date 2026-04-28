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
  { value: 'stroke_play' as const, label: 'Stroke Play', desc: 'Gana el de menos golpes' },
  { value: 'stableford' as const,  label: 'Stableford',  desc: 'Puntos por hoyo — gana el de mas puntos' },
  { value: 'match_play' as const,  label: 'Match Play',  desc: 'Hoyo a hoyo, 1 vs 1' },
  { value: 'best_ball' as const,   label: 'Best Ball',   desc: 'Equipos: cuenta la mejor bola' },
  { value: 'scramble' as const,    label: 'Scramble',    desc: 'Equipos: eligen el mejor tiro' },
  { value: 'foursome' as const,    label: 'Foursome',    desc: 'Equipos de 2: tiros alternados' },
]

const TEES = [
  { value: 'negras', label: 'Negras' },
  { value: 'azul',       label: 'Azul' },
  { value: 'blanco',     label: 'Blanco' },
  { value: 'rojo',       label: 'Rojo' },
]

// White theme (matching ronda-libre/nueva)
const colors = {
  bg: '#ffffff',
  card: '#f9fafb',
  cardBorder: '#e5e7eb',
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textLabel: '#9ca3af',
  gold: '#c4992a',
  activeBtnText: '#070d18',
  inputBg: '#ffffff',
  inputBorder: '#d1d5db',
}

function FieldErr({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p style={{ color: '#f87171', fontSize: '12px', marginTop: '4px' }}>{msg}</p>
}

export default function NuevoTorneoForm({ userId, courses }: Props) {
  const router = useRouter()
  const { showError } = useToast()
  const { fieldError, setFieldError, clearAll } = useFormErrors()

  // Wizard step
  const [step, setStep] = useState(1)

  // Step 1: Basic info
  const [name, setName] = useState('')
  const [selectedCourse, setSelectedCourse] = useState<CourseOption | null>(null)
  const [courseSearch, setCourseSearch] = useState('')
  const [showCourses, setShowCourses] = useState(false)
  const [dateISO, setDateISO] = useState('')
  const [coverUrl, setCoverUrl] = useState('')

  // Step 2: Format & mode
  const [format, setFormat] = useState<'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome'>('stroke_play')
  const [modo, setModo] = useState<'gross' | 'neto'>('gross')
  const [holeCount, setHoleCount] = useState(18)
  const [tees, setTees] = useState('blanco')
  const [useHandicap, setUseHandicap] = useState(true)

  // Step 3: Stableford SI (optional)
  const [courseHoles, setCourseHoles] = useState<Array<{ numero: number; par: number; stroke_index: number }>>([])
  const [siSource, setSiSource] = useState<'generic' | 'estimated' | 'verified'>('generic')
  const [showSIGrid, setShowSIGrid] = useState(false)
  const [customSI, setCustomSI] = useState<Record<string, number>>({})
  const [suggestSI, setSuggestSI] = useState(false)

  const [loading, setLoading] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowCourses(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Filter courses
  const filteredCourses = courses.filter(c => {
    const q = courseSearch.toLowerCase()
    return c.nombre.toLowerCase().includes(q) || c.ciudad?.toLowerCase().includes(q)
  })

  // Fetch course holes for SI when course changes
  useEffect(() => {
    if (!selectedCourse) { setCourseHoles([]); setSiSource('generic'); return }
    const supabase = createClient()
    supabase.from('course_holes')
      .select('numero, par, stroke_index')
      .eq('course_id', selectedCourse.id)
      .order('numero')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCourseHoles(data)
          const isGeneric = data.length >= 2 &&
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

  const inputStyle = (field: string): React.CSSProperties => ({
    background:    colors.inputBg,
    border:        `1px solid ${fieldError(field) ? '#dc2626' : colors.inputBorder}`,
    color:         colors.textPrimary,
    borderRadius:  '12px',
    padding:       '14px',
    width:         '100%',
    fontSize:      '15px',
    outline:       'none',
    transition:    'border-color 200ms',
    boxSizing:     'border-box' as const,
    fontFamily:    '"DM Sans", sans-serif',
  })

  const labelStyle: React.CSSProperties = {
    display:      'block',
    fontFamily:   '"DM Sans", sans-serif',
    fontSize:     '13px',
    color:        colors.textSecondary,
    marginBottom: '8px',
    fontWeight:   500,
  }

  const cardStyle: React.CSSProperties = {
    background:   colors.card,
    border:       `1px solid ${colors.cardBorder}`,
    borderRadius: '16px',
    padding:      '20px',
    marginBottom: '16px',
    boxShadow:    '0 1px 3px rgba(0,0,0,0.04)',
  }

  const handleSubmit = async () => {
    clearAll()
    let hasErrors = false
    if (!name.trim()) { setFieldError('name', 'El nombre del torneo es obligatorio.'); hasErrors = true }
    if (!selectedCourse) { setFieldError('course', 'Debes seleccionar una cancha.'); hasErrors = true }
    if (!dateISO) { setFieldError('date', 'La fecha del torneo es obligatoria.'); hasErrors = true }
    if (hasErrors) { setStep(1); return }

    setLoading(true)

    const res = await fetch('/api/torneos/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        course_id: selectedCourse!.id,
        format,
        modo,
        hole_count: holeCount,
        tees,
        use_handicap: useHandicap,
        date_start: dateISO,
        cover_image_url: coverUrl.trim() || null,
        custom_si: Object.keys(customSI).length > 0 ? customSI : undefined,
        suggest_si: suggestSI,
      }),
    })

    const result = await res.json()
    if (!res.ok || !result.ok) {
      const errMsg = result.error || 'Error inesperado'
      if (errMsg.includes('nombre') || res.status === 409) {
        setFieldError('name', 'Este nombre ya esta en uso')
      }
      showError('Error al crear torneo', errMsg)
      setLoading(false)
      return
    }

    const supabase = createClient()
    await trackEvent(supabase, userId, 'torneo_creado', { name: name.trim(), slug: result.slug })

    router.push(`/organizador/${result.slug}/jugadores`)
  }

  const isTeamFormat = ['best_ball', 'scramble', 'foursome'].includes(format)
  const needsModoSelector = format !== 'match_play' && format !== 'stableford'
  const totalSteps = format === 'stableford' && selectedCourse && siSource !== 'verified' ? 3 : 2

  return (
    <div style={{
      minHeight: '100dvh',
      background: colors.bg,
      padding: '0 16px 40px',
    }}>
      {/* Header */}
      <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '20px' }}>
        <Link href="/dashboard" style={{ color: colors.textSecondary, fontSize: '13px', textDecoration: 'none', display: 'block', marginBottom: '16px' }}>
          ← Volver al dashboard
        </Link>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: colors.gold, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>
            Golfers+
          </div>
          <h1 style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '28px', fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
            Nuevo Torneo
          </h1>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
            <div key={s} style={{
              flex: 1, height: '4px', borderRadius: '2px',
              background: s <= step ? colors.gold : '#e5e7eb',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* ═══ Step 1: Info basica ═══ */}
        {step === 1 && (
          <div>
            {/* Nombre */}
            <div style={cardStyle}>
              <label style={labelStyle}>Nombre del torneo</label>
              <input
                type="text"
                placeholder="Ej: Copa Club Los Leones 2026"
                value={name}
                onChange={(e) => { setName(e.target.value); if (fieldError('name')) clearAll() }}
                style={inputStyle('name')}
                onFocus={(e) => { e.currentTarget.style.borderColor = fieldError('name') ? '#dc2626' : colors.gold }}
                onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('name') ? '#dc2626' : colors.inputBorder }}
              />
              <FieldErr msg={fieldError('name')} />
            </div>

            {/* Cancha */}
            <div style={cardStyle} ref={dropdownRef}>
              <label style={labelStyle}>Cancha</label>
              <input
                type="text"
                placeholder="Buscar cancha por nombre o ciudad..."
                value={courseSearch}
                onChange={(e) => { setCourseSearch(e.target.value); setSelectedCourse(null); setShowCourses(true) }}
                onFocus={() => setShowCourses(true)}
                style={{
                  ...inputStyle('course'),
                  borderColor: fieldError('course') ? '#dc2626' : selectedCourse ? colors.gold : colors.inputBorder,
                }}
              />
              {selectedCourse && (
                <div style={{ fontSize: '12px', color: colors.gold, marginTop: '6px', fontWeight: 500 }}>
                  {selectedCourse.nombre}{selectedCourse.ciudad ? ` — ${selectedCourse.ciudad}` : ''}
                </div>
              )}
              <FieldErr msg={fieldError('course')} />
              {showCourses && filteredCourses.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute', top: '4px', left: 0, right: 0,
                    background: '#ffffff', border: `1px solid ${colors.cardBorder}`,
                    borderRadius: '12px', maxHeight: '200px', overflowY: 'auto', zIndex: 50,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  }}>
                    {filteredCourses.slice(0, 15).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setSelectedCourse(c); setCourseSearch(c.nombre); setShowCourses(false); clearAll() }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: colors.textPrimary, fontSize: '14px',
                          borderBottom: `1px solid ${colors.cardBorder}`,
                          fontFamily: '"DM Sans", sans-serif',
                        }}
                      >
                        {c.nombre}
                        {c.ciudad && <span style={{ color: colors.textSecondary, fontSize: '12px', marginLeft: '8px' }}>— {c.ciudad}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Fecha */}
            <div style={cardStyle}>
              <label style={labelStyle}>Fecha del torneo</label>
              <input
                type="date"
                value={dateISO}
                onChange={(e) => { setDateISO(e.target.value); if (fieldError('date')) clearAll() }}
                min={new Date().toISOString().split('T')[0]}
                style={{ ...inputStyle('date'), cursor: 'pointer' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? '#dc2626' : colors.gold }}
                onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? '#dc2626' : colors.inputBorder }}
              />
              <FieldErr msg={fieldError('date')} />
            </div>

            {/* Foto portada */}
            <div style={cardStyle}>
              <label style={labelStyle}>Foto de portada (opcional)</label>
              <input
                type="url"
                placeholder="URL de imagen (Unsplash, etc.)"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                style={inputStyle('cover')}
                onFocus={(e) => { e.currentTarget.style.borderColor = colors.gold }}
                onBlur={(e) => { e.currentTarget.style.borderColor = colors.inputBorder }}
              />
              {coverUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={coverUrl} alt="Preview" style={{
                  marginTop: '8px', width: '100%', height: '100px',
                  objectFit: 'cover', borderRadius: '12px', border: `1px solid ${colors.cardBorder}`,
                }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
              )}
            </div>

            {/* Next */}
            <button
              type="button"
              onClick={() => {
                clearAll()
                let hasErrors = false
                if (!name.trim()) { setFieldError('name', 'El nombre del torneo es obligatorio.'); hasErrors = true }
                if (!selectedCourse) { setFieldError('course', 'Debes seleccionar una cancha.'); hasErrors = true }
                if (!dateISO) { setFieldError('date', 'La fecha del torneo es obligatoria.'); hasErrors = true }
                if (!hasErrors) setStep(2)
              }}
              style={{
                width: '100%', padding: '14px',
                background: colors.gold, color: colors.activeBtnText,
                border: 'none', borderRadius: '12px',
                fontSize: '16px', fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(196,153,42,0.3)',
                fontFamily: '"DM Sans", sans-serif',
              }}
            >
              Siguiente →
            </button>
          </div>
        )}

        {/* ═══ Step 2: Formato y reglas ═══ */}
        {step === 2 && (
          <div>
            {/* Formato */}
            <div style={cardStyle}>
              <label style={labelStyle}>Formato de juego</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {FORMATS.map(f => {
                  const active = format === f.value
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => {
                        setFormat(f.value)
                        if (f.value === 'match_play' || f.value === 'stableford') setModo('neto')
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
                      <div style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary }}>{f.label}</div>
                      <div style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '2px' }}>{f.desc}</div>
                    </button>
                  )
                })}
              </div>

              {/* Team format info */}
              {isTeamFormat && (
                <div style={{
                  marginTop: '12px', padding: '12px 16px', borderRadius: '10px',
                  background: 'rgba(196,153,42,0.06)', border: `1px solid rgba(196,153,42,0.2)`,
                }}>
                  <span style={{ fontSize: '12px', color: colors.textSecondary, lineHeight: 1.4 }}>
                    Los equipos se asignan al inscribir jugadores despues de crear el torneo.
                  </span>
                </div>
              )}
            </div>

            {/* Modo gross/neto */}
            {needsModoSelector && (
              <div style={cardStyle}>
                <label style={labelStyle}>Modo de scoring</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {([
                    { value: 'neto' as const, label: 'Neto', desc: 'Con handicap' },
                    { value: 'gross' as const, label: 'Gross', desc: 'Sin handicap' },
                  ]).map(m => {
                    const active = modo === m.value
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setModo(m.value)}
                        style={{
                          flex: 1, padding: '14px 16px', borderRadius: '12px',
                          border: active ? `2px solid ${colors.gold}` : `1px solid ${colors.cardBorder}`,
                          background: active ? 'rgba(196,153,42,0.06)' : '#ffffff',
                          cursor: 'pointer', textAlign: 'left',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary }}>{m.label}</div>
                        <div style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '2px' }}>{m.desc}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Neto auto-lock info */}
            {!needsModoSelector && (
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', color: colors.textSecondary, lineHeight: 1.4 }}>
                    {format === 'stableford'
                      ? 'Stableford oficial se juega siempre con handicap (neto) — regla R&A/USGA.'
                      : 'Match Play siempre se juega con handicap (neto) — formato estandar en clubes de Chile.'}
                  </span>
                </div>
              </div>
            )}

            {/* Stableford point guide */}
            {format === 'stableford' && (
              <div style={{ ...cardStyle, background: 'rgba(196,153,42,0.04)' }}>
                <label style={labelStyle}>Sistema de puntos Stableford</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[
                    { label: 'Albatross+', pts: 5 },
                    { label: 'Eagle', pts: 4 },
                    { label: 'Birdie', pts: 3 },
                    { label: 'Par', pts: 2 },
                    { label: 'Bogey', pts: 1 },
                    { label: 'Doble+', pts: 0 },
                  ].map(item => (
                    <span key={item.label} style={{
                      fontSize: '11px', fontFamily: '"DM Mono", monospace',
                      color: colors.textSecondary,
                      background: '#ffffff', border: `1px solid ${colors.cardBorder}`,
                      borderRadius: '6px', padding: '4px 8px', whiteSpace: 'nowrap',
                    }}>
                      <span style={{ color: colors.gold, fontWeight: 700 }}>{item.pts}</span>
                      {' '}{item.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Hoyos + Tees */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div style={{ ...cardStyle, flex: 1, marginBottom: 0 }}>
                <label style={labelStyle}>Hoyos</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[18, 9].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setHoleCount(n)}
                      style={{
                        flex: 1, padding: '10px',
                        border: holeCount === n ? `2px solid ${colors.gold}` : `1px solid ${colors.cardBorder}`,
                        borderRadius: '10px',
                        background: holeCount === n ? 'rgba(196,153,42,0.06)' : '#ffffff',
                        color: holeCount === n ? colors.textPrimary : colors.textSecondary,
                        cursor: 'pointer', fontSize: '14px',
                        fontWeight: holeCount === n ? 600 : 400,
                        fontFamily: '"DM Sans", sans-serif',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ ...cardStyle, flex: 1, marginBottom: 0 }}>
                <label style={labelStyle}>Tee</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {TEES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTees(t.value)}
                      style={{
                        padding: '8px 12px',
                        border: tees === t.value ? `2px solid ${colors.gold}` : `1px solid ${colors.cardBorder}`,
                        borderRadius: '8px',
                        background: tees === t.value ? 'rgba(196,153,42,0.06)' : '#ffffff',
                        color: tees === t.value ? colors.textPrimary : colors.textSecondary,
                        cursor: 'pointer', fontSize: '13px',
                        fontWeight: tees === t.value ? 600 : 400,
                        fontFamily: '"DM Sans", sans-serif',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Handicap toggle */}
            <div style={{
              ...cardStyle,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ color: colors.textPrimary, fontSize: '14px', fontWeight: 500, fontFamily: '"DM Sans", sans-serif' }}>
                  Aplicar handicap WHS
                </div>
                <div style={{ color: colors.textSecondary, fontSize: '12px', marginTop: '2px' }}>
                  Ajusta los scores segun el indice de cada jugador
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUseHandicap(!useHandicap)}
                style={{
                  width: '48px', height: '26px', borderRadius: '13px',
                  background: useHandicap ? colors.gold : '#d1d5db',
                  position: 'relative', transition: 'background 200ms',
                  border: 'none', cursor: 'pointer', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: '3px',
                  left: useHandicap ? '25px' : '3px',
                  width: '20px', height: '20px', borderRadius: '50%',
                  background: 'white', transition: 'left 200ms',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }} />
              </button>
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
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                ← Atras
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  if (totalSteps === 3) {
                    setStep(3)
                  } else {
                    handleSubmit()
                  }
                }}
                style={{
                  flex: 2, padding: '14px',
                  background: loading ? '#e5e7eb' : colors.gold,
                  color: loading ? '#9ca3af' : colors.activeBtnText,
                  border: 'none', borderRadius: '12px',
                  fontSize: '16px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 2px 8px rgba(196,153,42,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                {loading && <Spinner />}
                {loading ? 'Creando...' : totalSteps === 3 ? 'Siguiente →' : 'Crear torneo →'}
              </button>
            </div>
          </div>
        )}

        {/* ═══ Step 3: SI customization (Stableford only) ═══ */}
        {step === 3 && (
          <div>
            <div style={cardStyle}>
              <div style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: 1.5, marginBottom: '16px' }}>
                La dificultad por hoyo (stroke index) de esta cancha esta {siSource === 'generic' ? 'generica' : 'estimada'}.
                En Stableford, esto puede afectar el resultado en ±2 puntos.
              </div>

              {!showSIGrid ? (
                <button
                  type="button"
                  onClick={() => {
                    const prefill: Record<string, number> = {}
                    courseHoles.forEach(h => { prefill[String(h.numero)] = h.stroke_index })
                    setCustomSI(prefill)
                    setShowSIGrid(true)
                  }}
                  style={{
                    background: 'rgba(196,153,42,0.06)',
                    border: `1px solid rgba(196,153,42,0.3)`,
                    color: colors.gold, padding: '10px 18px', borderRadius: '10px',
                    fontSize: '13px', cursor: 'pointer', fontWeight: 600,
                    fontFamily: '"DM Sans", sans-serif',
                  }}
                >
                  Corregir con la scorecard del club
                </button>
              ) : (
                <div>
                  <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '10px', fontWeight: 500 }}>
                    Ingresa la dificultad (1 = mas dificil, {holeCount} = mas facil):
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: holeCount === 18 ? '1fr 1fr' : '1fr', gap: '4px' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: colors.textLabel, fontWeight: 600, padding: '4px 8px', textTransform: 'uppercase' as const }}>
                        {holeCount === 18 ? 'Front 9' : 'Hoyos'}
                      </div>
                      {courseHoles.slice(0, Math.min(9, holeCount)).map(h => (
                        <div key={h.numero} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px' }}>
                          <span style={{ fontSize: '12px', color: colors.textSecondary, width: '24px' }}>H{h.numero}</span>
                          <span style={{ fontSize: '11px', color: colors.textLabel, width: '28px' }}>P{h.par}</span>
                          <input
                            type="number" min={1} max={holeCount}
                            value={customSI[String(h.numero)] || ''}
                            onChange={e => setCustomSI(prev => ({ ...prev, [String(h.numero)]: parseInt(e.target.value) || 0 }))}
                            style={{
                              width: '48px', padding: '6px', fontSize: '13px',
                              background: '#fff', border: `1px solid ${colors.inputBorder}`,
                              borderRadius: '6px', textAlign: 'center', color: colors.textPrimary,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    {holeCount === 18 && (
                      <div>
                        <div style={{ fontSize: '10px', color: colors.textLabel, fontWeight: 600, padding: '4px 8px', textTransform: 'uppercase' as const }}>
                          Back 9
                        </div>
                        {courseHoles.slice(9, 18).map(h => (
                          <div key={h.numero} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px' }}>
                            <span style={{ fontSize: '12px', color: colors.textSecondary, width: '24px' }}>H{h.numero}</span>
                            <span style={{ fontSize: '11px', color: colors.textLabel, width: '28px' }}>P{h.par}</span>
                            <input
                              type="number" min={1} max={18}
                              value={customSI[String(h.numero)] || ''}
                              onChange={e => setCustomSI(prev => ({ ...prev, [String(h.numero)]: parseInt(e.target.value) || 0 }))}
                              style={{
                                width: '48px', padding: '6px', fontSize: '13px',
                                background: '#fff', border: `1px solid ${colors.inputBorder}`,
                                borderRadius: '6px', textAlign: 'center', color: colors.textPrimary,
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button
                      type="button"
                      onClick={() => { setShowSIGrid(false); setCustomSI({}) }}
                      style={{ fontSize: '12px', color: colors.textSecondary, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', fontFamily: '"DM Sans", sans-serif' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSIGrid(false)}
                      style={{
                        fontSize: '12px', color: colors.gold,
                        background: 'rgba(196,153,42,0.08)', border: `1px solid rgba(196,153,42,0.3)`,
                        borderRadius: '8px', cursor: 'pointer', padding: '6px 14px', fontWeight: 600,
                        fontFamily: '"DM Sans", sans-serif',
                      }}
                    >
                      Guardar dificultad
                    </button>
                  </div>
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: colors.textSecondary, cursor: 'pointer' }}>
                      <input type="checkbox" checked={suggestSI} onChange={e => setSuggestSI(e.target.checked)} style={{ accentColor: colors.gold }} />
                      Sugerir esta dificultad para futuros torneos en esta cancha
                    </label>
                  </div>
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
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                ← Atras
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
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                {loading && <Spinner />}
                {loading ? 'Creando torneo...' : 'Crear torneo →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
