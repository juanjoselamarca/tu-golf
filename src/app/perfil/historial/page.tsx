'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

/* ─── Datos ────────────────────────────────────────────── */
const CANCHAS_CHILE = [
  'Granadilla Golf Club', 'Club de Golf Los Leones', 'Club de Golf La Dehesa',
  'Club de Golf Marbella', 'Club de Golf Hacienda', 'Prince of Wales Country Club',
  'Club de Campo del Pacífico', 'Club de Golf Cachagua', 'Rocas de Santo Domingo Golf',
  'Club de Golf Concón', 'Club de Golf Viña del Mar', 'Club de Golf Quisco',
  'Club de Golf Valle Escondido', 'Club de Golf Papudo', 'Club de Golf Zapallar',
  'Club de Golf Algarrobo', 'Club de Golf Cartagena', 'Club de Golf Casablanca',
  'Los Arrayanes Golf Club', 'Club de Golf Pirque', 'Club de Golf Rancagua',
  'Club de Golf San Fernando', 'Club de Golf Talca', 'Club de Golf Chillán',
  'Club de Golf Concepción', 'Club de Golf Los Ángeles', 'Club de Golf Temuco',
  'Club de Golf Valdivia', 'Club de Golf Osorno', 'Club de Golf Puerto Montt',
  'Club de Golf Puerto Varas', 'Club de Golf Punta Arenas',
  'Club de Golf Antofagasta', 'Club de Golf Iquique', 'Club de Golf Arica',
  'Club de Golf La Serena', 'Club de Golf Copiapó', 'Club de Golf Ovalle',
  'Club de Golf Quilicura', 'Club de Golf Maipú', 'Club de Golf Pudahuel',
  'Club de Golf Peñalolén', 'Club de Golf Lo Barnechea', 'Club de Golf Vitacura',
  'Club de Golf Las Condes', 'Stgo. Country Club',
  'Otra cancha',
]

const TEES = ['Blanco', 'Amarillo', 'Azul', 'Rojo', 'Dorado', 'Negro', 'Verde', 'Naranja']
const PRIVACY_OPTIONS = [
  { value: 'private', label: '🔒 Solo yo' },
  { value: 'friends', label: '👥 Amigos' },
  { value: 'public',  label: '🌐 Público' },
]
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => THIS_YEAR - i)

/* ─── Types ────────────────────────────────────────────── */
interface HistoricalRound {
  id:          string
  course_name: string
  tee_color:   string | null
  played_at:   string
  scores:      (number | null)[]
  total_gross: number | null
  notes:       string | null
  privacy:     string
  created_at:  string
}

/* ─── Estilos base ─────────────────────────────────────── */
const inputBase: React.CSSProperties = {
  background:   'rgba(7,13,24,0.6)',
  border:       '1px solid rgba(122,143,168,0.3)',
  color:        '#edeae4',
  borderRadius: '8px',
  padding:      '10px 12px',
  fontSize:     '14px',
  outline:      'none',
  width:        '100%',
  boxSizing:    'border-box' as const,
}

/* ─── Componente ───────────────────────────────────────── */
function HistorialContent() {
  const router = useRouter()

  const [userId,    setUserId]    = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [rounds,    setRounds]    = useState<HistoricalRound[]>([])
  const [showForm,  setShowForm]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState<string | null>(null)

  // Form fields
  const [courseName, setCourseName] = useState('')
  const [teeColor,   setTeeColor]   = useState('')
  const [day,        setDay]        = useState(String(new Date().getDate()))
  const [month,      setMonth]      = useState(String(new Date().getMonth() + 1))
  const [year,       setYear]       = useState(String(THIS_YEAR))
  const [scores,     setScores]     = useState<(number | null)[]>(Array(18).fill(null))
  const [notes,      setNotes]      = useState('')
  const [privacy,    setPrivacy]    = useState('private')

  const totalGross = scores.every((s) => s == null) ? null : scores.reduce((acc: number, v) => acc + (v ?? 0), 0)

  /* Auth */
  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login?redirect=/perfil/historial'); return }
      setUserId(user.id)
      setLoading(false)
    }
    check()
  }, [router])

  /* Load rounds */
  const loadRounds = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('historical_rounds')
      .select('id, course_name, tee_color, played_at, scores, total_gross, notes, privacy, created_at')
      .order('played_at', { ascending: false })
      .limit(50)
    setRounds((data as HistoricalRound[]) || [])
  }, [])

  useEffect(() => { if (!loading) loadRounds() }, [loading, loadRounds])

  const resetForm = () => {
    setCourseName(''); setTeeColor(''); setDay(String(new Date().getDate()))
    setMonth(String(new Date().getMonth() + 1)); setYear(String(THIS_YEAR))
    setScores(Array(18).fill(null)); setNotes(''); setPrivacy('private')
  }

  /* Save */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    setSaving(true)
    const playedAt = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`
    const supabase = createClient()
    const { error } = await supabase.from('historical_rounds').insert({
      user_id: userId, course_name: courseName,
      tee_color: teeColor || null, played_at: playedAt,
      scores, total_gross: totalGross,
      notes: notes || null, privacy,
    })
    setSaving(false)
    if (!error) { resetForm(); setShowForm(false); await loadRounds() }
  }

  /* Delete */
  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta tarjeta?')) return
    setDeleting(id)
    const supabase = createClient()
    await supabase.from('historical_rounds').delete().eq('id', id)
    setDeleting(null)
    setRounds((prev) => prev.filter((r) => r.id !== id))
  }

  if (loading) return (
    <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a8fa8' }}>
      Cargando...
    </div>
  )

  return (
    <div style={{ background: '#070d18', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '20px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: '#edeae4', margin: '0 0 4px' }}>
              📋 Mi historial de tarjetas
            </h1>
            <Link href="/dashboard" style={{ color: '#7a8fa8', fontSize: '12px', textDecoration: 'none' }}>← Dashboard</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: '#7a8fa8' }}>{rounds.length}/50 tarjetas</span>
            <button
              onClick={() => { setShowForm(!showForm); if (!showForm) resetForm() }}
              disabled={rounds.length >= 50}
              style={{ background: rounds.length >= 50 ? 'rgba(196,153,42,0.3)' : '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '14px', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: rounds.length >= 50 ? 'not-allowed' : 'pointer' }}
            >
              {showForm ? '✕ Cancelar' : '+ Nueva tarjeta'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '28px 20px' }}>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSave} style={{ background: 'rgba(14,28,47,0.92)', border: '1px solid rgba(196,153,42,0.2)', borderRadius: '14px', padding: '28px', marginBottom: '32px' }}>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#edeae4', marginTop: 0, marginBottom: '24px' }}>
              Nueva tarjeta
            </h2>

            {/* Cancha + Tee */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '5px' }}>Cancha *</label>
                <select required value={courseName} onChange={(e) => setCourseName(e.target.value)}
                  style={{ ...inputBase, cursor: 'pointer' }}>
                  <option value="">— Seleccionar cancha —</option>
                  {CANCHAS_CHILE.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '5px' }}>Tees</label>
                <select value={teeColor} onChange={(e) => setTeeColor(e.target.value)}
                  style={{ ...inputBase, cursor: 'pointer', width: '120px' }}>
                  <option value="">—</option>
                  {TEES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Fecha */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '5px' }}>Fecha *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={day}   onChange={(e) => setDay(e.target.value)}
                  style={{ ...inputBase, width: '70px', cursor: 'pointer' }}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={month} onChange={(e) => setMonth(e.target.value)}
                  style={{ ...inputBase, flex: 1, cursor: 'pointer' }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select value={year}  onChange={(e) => setYear(e.target.value)}
                  style={{ ...inputBase, width: '90px', cursor: 'pointer' }}>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Scores por hoyo */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '8px' }}>
                Scores por hoyo
                {totalGross != null && (
                  <span style={{ color: '#c4992a', marginLeft: '10px', fontWeight: 600 }}>Total: {totalGross}</span>
                )}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '6px' }}>
                {scores.map((val, idx) => (
                  <div key={idx} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#7a8fa8', marginBottom: '3px' }}>H{idx + 1}</div>
                    <input
                      type="number" min={1} max={20} inputMode="numeric"
                      placeholder="—"
                      value={val ?? ''}
                      onChange={(e) => {
                        const n = parseInt(e.target.value)
                        const next = [...scores]
                        next[idx] = isNaN(n) || n < 1 || n > 20 ? null : n
                        setScores(next)
                      }}
                      style={{
                        width: '100%', background: 'rgba(7,13,24,0.6)',
                        border: '1px solid rgba(122,143,168,0.2)', color: '#edeae4',
                        borderRadius: '6px', padding: '6px 2px', fontSize: '15px',
                        fontWeight: 600, textAlign: 'center', outline: 'none',
                        appearance: 'textfield' as const, boxSizing: 'border-box' as const,
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                      onBlur={(e)  => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.2)')}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Notas */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '5px' }}>Notas (opcional)</label>
              <textarea
                placeholder="¿Algo memorable de esta ronda?"
                value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                style={{ ...inputBase, resize: 'vertical', minHeight: '58px' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                onBlur={(e)  => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')}
              />
            </div>

            {/* Privacidad */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '8px' }}>Privacidad</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {PRIVACY_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setPrivacy(opt.value)}
                    style={{
                      padding: '8px 16px', borderRadius: '20px', border: '1px solid',
                      cursor: 'pointer', fontSize: '13px',
                      background:   privacy === opt.value ? 'rgba(196,153,42,0.15)' : 'transparent',
                      borderColor:  privacy === opt.value ? '#c4992a' : 'rgba(122,143,168,0.3)',
                      color:        privacy === opt.value ? '#c4992a' : '#7a8fa8',
                      fontWeight:   privacy === opt.value ? 600 : 400,
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" disabled={saving}
              style={{ background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '15px', padding: '12px 28px', borderRadius: '8px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.8 : 1 }}>
              {saving ? 'Guardando...' : 'Guardar tarjeta →'}
            </button>
          </form>
        )}

        {/* Lista */}
        {rounds.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#7a8fa8' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
            <div style={{ fontSize: '18px', color: '#edeae4', marginBottom: '8px' }}>Sin tarjetas guardadas</div>
            <div style={{ fontSize: '14px' }}>Haz clic en &ldquo;+ Nueva tarjeta&rdquo; para registrar una ronda.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {rounds.map((r) => {
              const dateStr    = new Date(r.played_at + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
              const filledHoles = r.scores.filter((s) => s != null).length
              const privLabel   = PRIVACY_OPTIONS.find((o) => o.value === r.privacy)?.label || '🔒'
              return (
                <div key={r.id} style={{ background: 'rgba(14,28,47,0.85)', border: '1px solid rgba(122,143,168,0.12)', borderRadius: '12px', padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', color: '#edeae4', marginBottom: '4px' }}>
                        {r.course_name}
                        {r.tee_color && <span style={{ fontSize: '12px', color: '#7a8fa8', marginLeft: '8px' }}>· Tee {r.tee_color}</span>}
                      </div>
                      <div style={{ fontSize: '13px', color: '#7a8fa8' }}>
                        {dateStr}
                        &nbsp;·&nbsp; {filledHoles} hoyo{filledHoles !== 1 ? 's' : ''}
                        {r.total_gross != null && <span style={{ color: '#c4992a', marginLeft: '8px', fontWeight: 600 }}>Total: {r.total_gross}</span>}
                        <span style={{ marginLeft: '8px' }}>{privLabel}</span>
                      </div>
                      {r.notes && <div style={{ fontSize: '12px', color: '#7a8fa8', marginTop: '5px', fontStyle: 'italic' }}>{r.notes}</div>}
                    </div>
                    <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id}
                      style={{ background: 'transparent', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}>
                      {deleting === r.id ? '...' : 'Eliminar'}
                    </button>
                  </div>
                  {/* Mini scorecard */}
                  <div style={{ marginTop: '10px', display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                    {r.scores.map((s, i) => (
                      <div key={i} style={{ minWidth: '26px', textAlign: 'center', background: 'rgba(7,13,24,0.5)', borderRadius: '4px', padding: '3px 2px' }}>
                        <div style={{ fontSize: '9px', color: '#7a8fa8' }}>H{i+1}</div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: s != null ? '#edeae4' : '#3a4a5a' }}>{s ?? '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            <p style={{ textAlign: 'center', fontSize: '12px', color: '#7a8fa8', marginTop: '4px' }}>
              {rounds.length}/50 tarjetas guardadas
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function HistorialPage() {
  return (
    <Suspense fallback={<div style={{ background: '#070d18', minHeight: '100vh' }} />}>
      <HistorialContent />
    </Suspense>
  )
}
