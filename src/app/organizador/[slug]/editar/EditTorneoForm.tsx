'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { useFormErrors } from '@/hooks/useFormErrors'
import type { CourseOption } from './page'

interface TournamentData {
  id: string; name: string; slug: string; format: string; hole_count: number
  tees: string; use_handicap: boolean; date_start: string | null
  cover_image_url: string | null; courses: { id: string; nombre: string } | null
}

interface Props { tournament: TournamentData; courses: CourseOption[] }

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
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function FieldErr({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p style={{ color: '#f87171', fontSize: '12px', marginTop: '4px' }}>{msg}</p>
}

export default function EditTorneoForm({ tournament, courses }: Props) {
  const router = useRouter()
  const { showError, showSuccess } = useToast()
  const { fieldError, setFieldError, clearAll } = useFormErrors()
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Parse date_start into day/month/year
  const parsedDate = tournament.date_start ? new Date(tournament.date_start + 'T12:00:00') : null

  const [name,           setName]           = useState(tournament.name)
  const [courseSearch,   setCourseSearch]   = useState(tournament.courses?.nombre || '')
  const [selectedCourse, setSelectedCourse] = useState<CourseOption | null>(
    tournament.courses ? { id: tournament.courses.id, nombre: tournament.courses.nombre, ciudad: null } : null
  )
  const [showCourses,    setShowCourses]    = useState(false)
  const [format,         setFormat]         = useState(tournament.format)
  const [holeCount,      setHoleCount]      = useState(tournament.hole_count)
  const [tees,           setTees]           = useState(tournament.tees)
  const [useHandicap,    setUseHandicap]    = useState(tournament.use_handicap)
  const [day,            setDay]            = useState(parsedDate ? String(parsedDate.getDate()) : '')
  const [month,          setMonth]          = useState(parsedDate ? String(parsedDate.getMonth() + 1) : '')
  const [year,           setYear]           = useState(parsedDate ? String(parsedDate.getFullYear()) : '')
  const [coverUrl,       setCoverUrl]       = useState(tournament.cover_image_url || '')
  const [loading,        setLoading]        = useState(false)

  const filteredCourses = courses.filter(
    (c) => courseSearch === '' ||
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

  const dateISO = day && month && year
    ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    : ''

  const inputStyle = (field: string): React.CSSProperties => ({
    background: 'rgba(7,13,24,0.6)', border: `1px solid ${fieldError(field) ? '#dc2626' : 'rgba(122,143,168,0.3)'}`,
    color: '#edeae4', borderRadius: '8px', padding: '12px', width: '100%',
    fontSize: '15px', outline: 'none', transition: 'border-color 200ms', boxSizing: 'border-box' as const,
  })
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '6px' }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearAll()
    let hasErrors = false
    if (!name.trim()) { setFieldError('name', 'El nombre es obligatorio.'); hasErrors = true }
    if (!selectedCourse) { setFieldError('course', 'Debes seleccionar una cancha.'); hasErrors = true }
    if (!dateISO) { setFieldError('date', 'La fecha es obligatoria.'); hasErrors = true }
    if (hasErrors) return

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('tournaments')
      .update({
        name: name.trim(),
        course_id: selectedCourse!.id,
        format, hole_count: holeCount, tees,
        use_handicap: useHandicap,
        cover_image_url: coverUrl.trim() || null,
        date_start: dateISO,
      })
      .eq('id', tournament.id)

    if (error) {
      showError('Error al guardar', 'No pudimos guardar los cambios. Intenta nuevamente.')
      setLoading(false)
      return
    }

    showSuccess('¡Torneo actualizado!', 'Los cambios fueron guardados correctamente.')
    router.push('/dashboard')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', backgroundImage: 'url(https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=1920&q=80)', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', padding: '40px 16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,13,24,0.85)' }} />
      <div style={{ position: 'relative', zIndex: 10, background: 'rgba(14,28,47,0.94)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(196,153,42,0.25)', borderRadius: '16px', padding: '40px', maxWidth: '600px', width: '100%' }}>
        <Link href="/dashboard" style={{ color: '#7a8fa8', fontSize: '13px', textDecoration: 'none', display: 'block', marginBottom: '20px' }}>← Volver al dashboard</Link>
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '13px', color: '#c4992a', marginBottom: '6px' }}>⛳ Tu Golf</div>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#edeae4', margin: 0 }}>Editar torneo</h1>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Nombre */}
          <div>
            <label style={labelStyle}>Nombre del torneo</label>
            <input type="text" value={name} onChange={(e) => { setName(e.target.value); if (fieldError('name')) clearAll() }}
              style={inputStyle('name')}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#c4992a' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('name') ? '#dc2626' : 'rgba(122,143,168,0.3)' }} />
            <FieldErr msg={fieldError('name')} />
          </div>

          {/* Cancha */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <label style={labelStyle}>Cancha</label>
            <input type="text" placeholder="Buscar cancha..." value={courseSearch}
              onChange={(e) => { setCourseSearch(e.target.value); setSelectedCourse(null); setShowCourses(true) }}
              onFocus={() => setShowCourses(true)}
              style={{ ...inputStyle('course'), borderColor: fieldError('course') ? '#dc2626' : selectedCourse ? '#c4992a' : 'rgba(122,143,168,0.3)' }} />
            {selectedCourse && <div style={{ fontSize: '12px', color: '#c4992a', marginTop: '4px' }}>✓ {selectedCourse.nombre}</div>}
            <FieldErr msg={fieldError('course')} />
            {showCourses && filteredCourses.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.2)', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', zIndex: 50 }}>
                {filteredCourses.slice(0, 15).map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => { setSelectedCourse(c); setCourseSearch(c.nombre); setShowCourses(false); clearAll() }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#edeae4', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,153,42,0.08)')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}>
                    {c.nombre}{c.ciudad && <span style={{ color: '#7a8fa8', fontSize: '12px', marginLeft: '8px' }}>— {c.ciudad}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Formato */}
          <div>
            <label style={labelStyle}>Formato</label>
            <div style={{ display: 'flex', gap: '12px' }}>
              {FORMATS.map((f) => (
                <button key={f.value} type="button" onClick={() => setFormat(f.value)}
                  style={{ flex: 1, padding: '14px', border: format === f.value ? '2px solid #c4992a' : '1px solid rgba(122,143,168,0.3)', borderRadius: '10px', background: format === f.value ? 'rgba(196,153,42,0.08)' : 'rgba(7,13,24,0.4)', cursor: 'pointer', textAlign: 'left', transition: 'all 200ms' }}>
                  <div style={{ color: '#edeae4', fontWeight: 600, fontSize: '14px' }}>{f.label}</div>
                  <div style={{ color: '#7a8fa8', fontSize: '12px', marginTop: '4px' }}>{f.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Hoyos + Tees */}
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Hoyos</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[18, 9].map((n) => (
                  <button key={n} type="button" onClick={() => setHoleCount(n)}
                    style={{ flex: 1, padding: '10px', border: holeCount === n ? '2px solid #c4992a' : '1px solid rgba(122,143,168,0.3)', borderRadius: '8px', background: holeCount === n ? 'rgba(196,153,42,0.08)' : 'rgba(7,13,24,0.4)', color: holeCount === n ? '#edeae4' : '#7a8fa8', cursor: 'pointer', fontSize: '14px', fontWeight: holeCount === n ? 600 : 400 }}>
                    {n} hoyos
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Tee</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {TEES.map((t) => (
                  <button key={t.value} type="button" onClick={() => setTees(t.value)}
                    style={{ padding: '8px 12px', border: tees === t.value ? '2px solid #c4992a' : '1px solid rgba(122,143,168,0.3)', borderRadius: '6px', background: tees === t.value ? 'rgba(196,153,42,0.08)' : 'rgba(7,13,24,0.4)', color: tees === t.value ? '#edeae4' : '#7a8fa8', cursor: 'pointer', fontSize: '13px', fontWeight: tees === t.value ? 600 : 400 }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Handicap */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(7,13,24,0.4)', borderRadius: '10px', border: '1px solid rgba(122,143,168,0.15)' }}>
            <div>
              <div style={{ color: '#edeae4', fontSize: '14px', fontWeight: 500 }}>Aplicar hándicap WHS</div>
              <div style={{ color: '#7a8fa8', fontSize: '12px', marginTop: '2px' }}>Ajusta los scores según el índice de cada jugador</div>
            </div>
            <button type="button" onClick={() => setUseHandicap(!useHandicap)}
              style={{ width: '48px', height: '26px', borderRadius: '13px', background: useHandicap ? '#c4992a' : 'rgba(122,143,168,0.3)', position: 'relative', transition: 'background 200ms', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: '3px', left: useHandicap ? '25px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left 200ms' }} />
            </button>
          </div>

          {/* Fecha */}
          <div>
            <label style={labelStyle}>Fecha del torneo</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select value={day} onChange={(e) => { setDay(e.target.value); if (fieldError('date')) clearAll() }}
                style={{ ...inputStyle('date'), flex: '0 0 80px', width: '80px', appearance: 'none', cursor: 'pointer' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#c4992a' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? '#dc2626' : 'rgba(122,143,168,0.3)' }}>
                <option value="">Día</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={String(d)}>{d}</option>)}
              </select>
              <select value={month} onChange={(e) => { setMonth(e.target.value); if (fieldError('date')) clearAll() }}
                style={{ ...inputStyle('date'), flex: 1, appearance: 'none', cursor: 'pointer' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#c4992a' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? '#dc2626' : 'rgba(122,143,168,0.3)' }}>
                <option value="">Mes</option>
                {MONTHS.map((m, i) => <option key={i+1} value={String(i+1)}>{m}</option>)}
              </select>
              <select value={year} onChange={(e) => { setYear(e.target.value); if (fieldError('date')) clearAll() }}
                style={{ ...inputStyle('date'), flex: '0 0 90px', width: '90px', appearance: 'none', cursor: 'pointer' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#c4992a' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? '#dc2626' : 'rgba(122,143,168,0.3)' }}>
                <option value="">Año</option>
                {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() + i).map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
            <FieldErr msg={fieldError('date')} />
          </div>

          {/* Foto */}
          <div>
            <label style={labelStyle}>Foto de portada (opcional)</label>
            <input type="url" placeholder="URL de imagen" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)}
              style={{ background: 'rgba(7,13,24,0.6)', border: '1px solid rgba(122,143,168,0.3)', color: '#edeae4', borderRadius: '8px', padding: '12px', width: '100%', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')} />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <Link href="/dashboard"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '13px', borderRadius: '8px', border: '1px solid rgba(122,143,168,0.3)', color: '#7a8fa8', fontSize: '15px', textDecoration: 'none', fontWeight: 500, textAlign: 'center' }}>
              Cancelar
            </Link>
            <button type="submit" disabled={loading}
              style={{ flex: 2, background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '15px', borderRadius: '8px', padding: '13px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: loading ? 0.8 : 1, transition: 'filter 200ms' }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.08)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)' }}>
              {loading ? 'Guardando...' : 'Guardar cambios →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
