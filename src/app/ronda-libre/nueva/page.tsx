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
const MODOS: { value: 'gross' | 'neto' | 'stableford'; label: string; desc: string }[] = [
  { value: 'gross',      label: 'Score Gross',  desc: 'Score real sin ajuste de índice' },
  { value: 'neto',       label: 'Score Neto',   desc: 'Score ajustado por índice de handicap' },
  { value: 'stableford', label: 'Stableford',   desc: 'Puntos por hoyo (neto)' },
]
// MONTHS removed — using native date input

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
  const [canchaSearch, setCanchaSearch] = useState('')
  const [showCanchaDropdown, setShowCanchaDropdown] = useState(false)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [coursesDB, setCoursesDB] = useState<CourseDB[]>([])
  const [tees, setTees] = useState('blanco')
  const [holes,      setHoles]      = useState<18 | 9>(18)
  const [modoJuego,  setModoJuego]  = useState<'gross' | 'neto' | 'stableford'>('gross')
  const [fechaStr, setFechaStr] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
      console.error('Agrega al menos un jugador para crear la ronda.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const codigo = Math.random().toString(36).substring(2, 8).toUpperCase()

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

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '20px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        {/* Back link */}
        <Link href="/dashboard" style={{ color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '24px' }}>
          ← Dashboard
        </Link>

        {/* Card */}
        <div style={{ background: 'var(--bg-card-light)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>

          {/* Title */}
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#c4992a', marginBottom: '20px', marginTop: 0 }}>
            ⛳ Nueva Ronda Libre
          </h1>

          <form onSubmit={handleSubmit}>

            {/* Cancha — autocomplete */}
            <div style={{ marginBottom: '20px', position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                style={{ ...inputStyle, cursor: 'text' }}
              />
              {cancha && !showCanchaDropdown && (
                <button
                  type="button"
                  onClick={() => { setCancha(''); setCourseId(null); setCanchaSearch('') }}
                  style={{
                    position: 'absolute', right: '12px', top: '32px',
                    background: 'none', border: 'none', color: 'var(--text-3)',
                    fontSize: '18px', cursor: 'pointer', padding: '4px',
                  }}
                >×</button>
              )}
              {showCanchaDropdown && (() => {
                const q = canchaSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                // Build a unified list following CANCHAS_CHILE order
                // DB matches get their courseId, non-DB entries get null
                const dbByName = new Map(coursesDB.map(c => [c.nombre, c]))
                const unified: { name: string; courseId: string | null; ciudad: string | null }[] = []
                const seen = new Set<string>()
                // First: CANCHAS_CHILE entries (preserves popularity order)
                for (const name of CANCHAS_CHILE) {
                  if (!name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) continue
                  const db = dbByName.get(name)
                  unified.push({ name, courseId: db?.id ?? null, ciudad: db?.ciudad ?? null })
                  seen.add(name)
                }
                // Then: DB entries not in CANCHAS_CHILE
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
                    background: 'var(--bg-card-light)', border: '1px solid var(--border-md)',
                    borderRadius: '10px', marginTop: '4px', maxHeight: '260px', overflowY: 'auto',
                    boxShadow: 'var(--shadow-lg)',
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
                          color: 'var(--text)', fontSize: '14px', cursor: 'pointer',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        {c.name}
                        {c.ciudad && <span style={{ color: 'var(--text-3)', fontSize: '12px', marginLeft: '8px' }}>— {c.ciudad}</span>}
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
                          color: '#c4992a', fontSize: '14px', cursor: 'pointer',
                        }}
                      >
                        Usar &quot;{canchaSearch}&quot; como nombre de cancha
                      </button>
                    )}
                  </div>
                )
              })()}
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
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid',
                        cursor: 'pointer',
                        fontSize: '14px',
                        minHeight: '44px',
                        fontWeight: active ? 700 : 400,
                        background: active ? 'var(--brand)' : 'var(--bg-card-light)',
                        borderColor: active ? 'var(--brand)' : 'var(--border-md)',
                        color: active ? '#070d18' : 'var(--text-2)',
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
                        padding: '12px 24px',
                        borderRadius: '10px',
                        border: '1px solid',
                        cursor: 'pointer',
                        fontSize: '14px',
                        minHeight: '44px',
                        fontWeight: active ? 700 : 400,
                        background: active ? 'var(--brand)' : 'var(--bg-card-light)',
                        borderColor: active ? 'var(--brand)' : 'var(--border-md)',
                        color: active ? '#070d18' : 'var(--text-2)',
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
                        padding: '12px 16px', borderRadius: '10px', border: '1px solid',
                        cursor: 'pointer', fontSize: '14px', minHeight: '44px',
                        fontWeight: active ? 700 : 400,
                        background: active ? 'var(--brand)' : 'var(--bg-card-light)',
                        borderColor: active ? 'var(--brand)' : 'var(--border-md)',
                        color: active ? '#070d18' : 'var(--text-2)', transition: 'all 0.15s',
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
              <input
                type="date"
                value={fechaStr}
                onChange={(e) => setFechaStr(e.target.value)}
                style={{
                  ...inputStyle,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  WebkitAppearance: 'none' as const,
                  appearance: 'none' as const,
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--input-focus)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--input-border)')}
              />
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
                background: 'var(--brand)',
                color: '#070d18',
                fontWeight: 700,
                fontSize: '16px',
                padding: '16px',
                borderRadius: '14px',
                border: 'none',
                cursor: loading || !cancha ? 'not-allowed' : 'pointer',
                opacity: loading || !cancha ? 0.35 : 1,
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
