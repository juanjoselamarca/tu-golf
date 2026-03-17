'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'

const CANCHAS_CHILE = [
  'Club de Golf Los Leones','Club de Golf La Dehesa','Club de Golf Los Arrayanes',
  'Club de Golf Las Brisas de Chicureo','Club de Golf Cultivo','Club de Golf Marbella',
  'Club de Golf Cajón del Maipo','Club de Golf Peñalolén','Santiago Golf Club',
  'Club de Golf El Rancho','Club de Golf Millaray','Club de Golf Lomas Verdes',
  'Club de Golf Mapocho','Club de Golf Curacaví','Hacienda Chicureo Golf Club',
  'Club de Golf El Principal','Club de Golf Altos de Chicureo','Club de Golf Valle Grande',
  'Club de Golf Viña del Mar','Club de Golf Granadilla','Club de Golf Reñaca',
  'Club de Golf La Serena','Club de Golf Coquimbo','Club de Golf Atacama',
  'Club de Golf Antofagasta','Club de Golf Iquique','Club de Golf Arica',
  'Club de Golf Puerto Montt','Club de Golf Puerto Varas','Club de Golf Osorno',
  'Club de Golf Temuco','Club de Golf Concepción','Club de Golf Chillán',
  'Club de Golf Talca','Club de Golf Curicó','Club de Golf Rancagua',
  'Club de Golf San Fernando','Club de Golf Linares','Club de Golf Constitución',
  'Club de Golf Punta Arenas','Club de Golf Puerto Natales','Club de Golf Coyhaique',
  'Club de Golf Copiapó','Club de Golf Vallenar','Club de Golf Ovalle',
  'Club de Golf Illapel','Club de Golf Los Andes','Club de Golf San Felipe',
  'Club de Golf Quillota','Club de Golf Olmué','Club de Golf Casablanca',
  'Club de Golf Melipilla','Club de Golf Talagante','Club de Golf Buin',
  'Club de Golf Paine','Club de Golf San Bernardo','Club de Golf Puente Alto',
  'Club de Golf Pirque','Club de Golf Colina','Club de Golf Lampa',
  'Club de Golf Til Til','Club de Golf Batuco','Club de Golf Quilicura',
  'Club de Golf Pudahuel','Club de Golf Maipú','Otra cancha',
]

const TEES_OPTIONS = ['Campeonato', 'Azul', 'Blanco', 'Rojo']
const MODOS: { value: 'gross' | 'neto' | 'stableford'; label: string; desc: string }[] = [
  { value: 'gross',      label: 'Score Gross',  desc: 'Score real sin ajuste de índice' },
  { value: 'neto',       label: 'Score Neto',   desc: 'Score ajustado por índice de handicap' },
  { value: 'stableford', label: 'Stableford',   desc: 'Puntos por hoyo (neto)' },
]
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  color: 'var(--text)',
  borderRadius: '8px',
  padding: '12px 14px',
  fontSize: '16px',   // M6: prevenir zoom iOS
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  minHeight: '52px',  // M6: touch target
}

interface CourseDB {
  id: string
  nombre: string
  ciudad: string | null
}

export default function NuevaRondaLibrePage() {
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [cancha, setCancha] = useState('')
  const [courseId, setCourseId] = useState<string | null>(null)
  const [coursesDB, setCoursesDB] = useState<CourseDB[]>([])
  const [tees, setTees] = useState('blanco')
  const [holes,      setHoles]      = useState<18 | 9>(18)
  const [modoJuego,  setModoJuego]  = useState<'gross' | 'neto' | 'stableford'>('gross')
  const [fecha, setFecha] = useState({
    day: new Date().getDate(),
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  })
  const [jugadores, setJugadores] = useState<string[]>(['', '', '', ''])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?redirect=/ronda-libre/nueva'); return }
      setUserId(user.id)

      // Get user name from profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single()

      const name = profile?.name || user.user_metadata?.name || user.email?.split('@')[0] || 'Jugador'
      setJugadores([name, '', '', ''])

      // Fetch courses from DB
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
      alert('Agrega al menos un jugador para crear la ronda.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const codigo = Math.random().toString(36).substring(2, 8).toUpperCase()
    const fechaStr = `${fecha.year}-${String(fecha.month).padStart(2, '0')}-${String(fecha.day).padStart(2, '0')}`

    // Insert ronda libre
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

    // Intento 1: con modo_juego
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
        // Columna no existe aún — reintentar SIN modo_juego
        const { data: d2, error: e2 } = await supabase
          .from('rondas_libres')
          .insert(baseData)
          .select('id')
          .single()

        if (e2 || !d2) {
          setLoading(false)
          if (e2?.message?.includes("'public.rondas_libres'") || e2?.message?.includes('relation') || e2?.code === '42P01') {
            alert('La base de datos aún no está configurada. Ejecuta el archivo EJECUTAR_EN_SUPABASE.sql en el panel de Supabase.')
          } else {
            alert('Error al crear la ronda: ' + e2?.message)
          }
          return
        }
        ronda = d2
      } else if (e1.message?.includes("'public.rondas_libres'") || e1.message?.includes('relation') || e1.code === '42P01') {
        setLoading(false)
        alert('La base de datos aún no está configurada. Ejecuta el archivo EJECUTAR_EN_SUPABASE.sql en el panel de Supabase.')
        return
      } else {
        setLoading(false)
        alert('Error al crear la ronda: ' + e1.message)
        return
      }
    }

    if (!ronda) {
      setLoading(false)
      alert('Error al crear la ronda.')
      return
    }

    // Insert jugadores (jugadoresValidos already filtered above)
    for (let i = 0; i < jugadoresValidos.length; i++) {
      await supabase.from('ronda_libre_jugadores').insert({
        ronda_id: ronda.id,
        nombre: jugadoresValidos[i],
        user_id: i === 0 ? userId : null,
        scores: {},
      })
    }

    await trackEvent(supabase, userId, 'ronda_creada', { codigo, cancha, holes })
    router.push(`/ronda-libre/${codigo}/score`)
  }

  const filledCount = jugadores.filter((j) => j.trim()).length
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '40px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        {/* Back link */}
        <Link href="/dashboard" style={{ color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '24px' }}>
          ← Dashboard
        </Link>

        {/* Card */}
        <div style={{ background: 'var(--bg-card-light)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px' }}>

          {/* Title */}
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#c4992a', marginBottom: '28px', marginTop: 0 }}>
            ⛳ Nueva Ronda Libre
          </h1>

          <form onSubmit={handleSubmit}>

            {/* Cancha */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Cancha *
              </label>
              <select
                required
                value={cancha}
                onChange={(e) => {
                  const val = e.target.value
                  setCancha(val)
                  // Match to DB course by nombre
                  const match = coursesDB.find(c => c.nombre === val)
                  setCourseId(match?.id ?? null)
                }}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')}
              >
                <option value="">— Seleccionar cancha —</option>
                {coursesDB.length > 0 && (
                  <optgroup label="Canchas con datos de hoyos">
                    {coursesDB.map((c) => (
                      <option key={c.id} value={c.nombre}>
                        {c.nombre}{c.ciudad ? ` — ${c.ciudad}` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Otras canchas">
                  {CANCHAS_CHILE.filter(c => !coursesDB.some(db => db.nombre === c)).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Tees */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                        padding: '8px 18px',
                        borderRadius: '8px',
                        border: '1px solid',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: active ? 700 : 400,
                        background: active ? '#c4992a' : 'transparent',
                        borderColor: active ? '#c4992a' : 'rgba(122,143,168,0.3)',
                        color: active ? '#070d18' : '#7a8fa8',
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
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                        padding: '8px 24px',
                        borderRadius: '8px',
                        border: '1px solid',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: active ? 700 : 400,
                        background: active ? '#c4992a' : 'transparent',
                        borderColor: active ? '#c4992a' : 'rgba(122,143,168,0.3)',
                        color: active ? '#070d18' : '#7a8fa8',
                        transition: 'all 0.15s',
                      }}
                    >
                      {h}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Modo de Juego */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Modo de Juego
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {MODOS.map((m) => {
                  const active = modoJuego === m.value
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setModoJuego(m.value)}
                      style={{
                        padding: '8px 16px', borderRadius: '8px', border: '1px solid',
                        cursor: 'pointer', fontSize: '14px', fontWeight: active ? 700 : 400,
                        background: active ? '#c4992a' : 'transparent',
                        borderColor: active ? '#c4992a' : 'rgba(122,143,168,0.3)',
                        color: active ? '#070d18' : '#7a8fa8', transition: 'all 0.15s',
                      }}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#c4992a' }}>
                {MODOS.find(m => m.value === modoJuego)?.desc}
              </div>
              {(modoJuego === 'neto' || modoJuego === 'stableford') && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-2)', background: 'rgba(196,153,42,0.06)', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '8px', padding: '8px 12px' }}>
                  ℹ️ Cada jugador debe tener su índice registrado en su perfil para el cálculo correcto
                </div>
              )}
            </div>

            {/* Fecha */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Fecha
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={fecha.day}
                  onChange={(e) => setFecha({ ...fecha, day: parseInt(e.target.value) })}
                  style={{ ...inputStyle, width: '75px', cursor: 'pointer' }}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <select
                  value={fecha.month}
                  onChange={(e) => setFecha({ ...fecha, month: parseInt(e.target.value) })}
                  style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select
                  value={fecha.year}
                  onChange={(e) => setFecha({ ...fecha, year: parseInt(e.target.value) })}
                  style={{ ...inputStyle, width: '95px', cursor: 'pointer' }}
                >
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Jugadores */}
            <div style={{ marginBottom: '28px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Jugadores ({filledCount}/4)
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Jugador 1 (tú) */}
                <div style={{ position: 'relative' }}>
                  <input
                    readOnly
                    value={jugadores[0]}
                    style={{ ...inputStyle, color: '#c4992a', cursor: 'default', paddingRight: '60px' }}
                  />
                  <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-2)', background: 'rgba(196,153,42,0.1)', padding: '2px 7px', borderRadius: '10px' }}>
                    Tú
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
                        style={{ ...inputStyle }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                        onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...jugadores]
                          next[idx] = ''
                          setJugadores(next)
                        }}
                        style={{ background: 'transparent', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: '6px', padding: '8px 10px', cursor: 'pointer', flexShrink: 0, fontSize: '14px' }}
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
                      // immediately clear so user can type
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
                      border: '1px dashed rgba(196,153,42,0.4)',
                      color: '#c4992a',
                      borderRadius: '8px',
                      padding: '10px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 500,
                      textAlign: 'center',
                    }}
                  >
                    ＋ Agregar jugador
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
                background: loading || !cancha ? 'rgba(196,153,42,0.4)' : '#c4992a',
                color: '#070d18',
                fontWeight: 700,
                fontSize: '18px',  // M6: 18px submit
                padding: '16px',
                height: '56px',    // M6: 56px submit button
                borderRadius: '10px',
                border: 'none',
                cursor: loading || !cancha ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {loading ? 'Creando ronda...' : 'Crear ronda →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
