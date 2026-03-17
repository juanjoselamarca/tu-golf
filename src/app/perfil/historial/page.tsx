'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'

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
  'Club de Golf Las Condes', 'Stgo. Country Club', 'Otra cancha',
]

const TEES = ['Blanco', 'Amarillo', 'Azul', 'Rojo', 'Dorado', 'Negro', 'Verde', 'Naranja']
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

/* ─── Helpers ──────────────────────────────────────────── */
function computeStats(scores: (number | null)[]) {
  const filled = scores.filter((s): s is number => s != null)
  if (filled.length === 0) return null
  const total     = filled.reduce((a, b) => a + b, 0)
  const par       = 4 * filled.length
  const overUnder = total - par
  const eagles    = filled.filter(s => s <= 2).length
  const birdies   = filled.filter(s => s === 3).length
  const pars      = filled.filter(s => s === 4).length
  const bogeys    = filled.filter(s => s === 5).length
  const doubles   = filled.filter(s => s >= 6).length
  const front9    = filled.slice(0, 9).reduce((a, b) => a + b, 0)
  const back9     = filled.slice(9).reduce((a, b) => a + b, 0)
  return { total, overUnder, eagles, birdies, pars, bogeys, doubles, front9, back9, filledHoles: filled.length }
}

function cellBg(score: number | null): React.CSSProperties {
  if (score == null) return { background: 'rgba(7,13,24,0.4)', color: '#3a4a5a' }
  if (score <= 2)    return { background: 'rgba(37,99,235,0.38)',  color: '#93c5fd' }
  if (score === 3)   return { background: 'rgba(22,163,74,0.38)',  color: '#86efac' }
  if (score === 4)   return { background: 'rgba(255,255,255,0.05)',color: '#edeae4' }
  if (score === 5)   return { background: 'rgba(196,153,42,0.25)', color: '#fcd34d' }
  return               { background: 'rgba(220,38,38,0.30)',  color: '#fca5a5' }
}

function formatOv(n: number) { return n > 0 ? `+${n}` : n === 0 ? 'E' : String(n) }

function taigerMessage(count: number): string {
  if (count === 0) return 'el tAIger está esperando tus datos'
  if (count < 5)   return 'el tAIger está aprendiendo tu juego'
  if (count < 10)  return 'análisis parcial disponible'
  if (count < 20)  return 'el tAIger detecta tus patrones'
  if (count < 50)  return 'perfil sólido — análisis profundo activo'
  return 'análisis completo ✓'
}

/* ─── Estilos base ─────────────────────────────────────── */
const inputBase: React.CSSProperties = {
  background:   'rgba(7,13,24,0.6)',
  border:       '1px solid rgba(122,143,168,0.3)',
  color:        '#edeae4',
  borderRadius: '8px',
  padding:      '10px 12px',
  outline:      'none',
  width:        '100%',
  boxSizing:    'border-box' as const,
}

/* ─── Componente ───────────────────────────────────────── */
function HistorialContent() {
  const router = useRouter()

  const [userId,   setUserId]   = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [rounds,   setRounds]   = useState<HistoricalRound[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Form fields
  const [courseName, setCourseName] = useState('')
  const [teeColor,   setTeeColor]   = useState('')
  const [day,   setDay]   = useState(String(new Date().getDate()))
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [year,  setYear]  = useState(String(THIS_YEAR))
  const [scores, setScores] = useState<(number | null)[]>(Array(18).fill(null))
  const [notes,      setNotes]      = useState('')
  const [privacy,    setPrivacy]    = useState('private')


  const formStats  = computeStats(scores)
  const totalGross = formStats?.total ?? null

  /* ── Aggregate header stats ── */
  let aggBirdies = 0, aggEagles = 0
  let ovSum = 0, ovCount = 0
  for (const r of rounds) {
    const s = computeStats(r.scores)
    if (!s) continue
    aggBirdies += s.birdies
    aggEagles  += s.eagles
    if (r.total_gross != null) { ovSum += r.total_gross - 72; ovCount++ }
  }
  const avgOv = ovCount > 0 ? Math.round(ovSum / ovCount * 10) / 10 : null

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
    setCourseName(''); setTeeColor('')
    setDay(String(new Date().getDate())); setMonth(String(new Date().getMonth() + 1)); setYear(String(THIS_YEAR))
    setScores(Array(18).fill(null)); setNotes(''); setPrivacy('private')
  }

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
    if (!error) { await trackEvent(supabase, userId!, 'tarjeta_historica_agregada', { course_name: courseName }); resetForm(); setShowForm(false); await loadRounds() }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta tarjeta?')) return
    setDeleting(id)
    const supabase = createClient()
    await supabase.from('historical_rounds').delete().eq('id', id)
    setDeleting(null)
    setRounds(prev => prev.filter(r => r.id !== id))
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (loading) return (
    <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a8fa8' }}>
      Cargando...
    </div>
  )

  const progress = Math.min(rounds.length / 50, 1)

  return (
    <div style={{ background: '#070d18', minHeight: '100vh' }}>

      {/* ── Header ── */}
      <div style={{ background: 'rgba(14,28,47,0.98)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '20px 24px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <Link href="/dashboard" style={{ color: '#7a8fa8', fontSize: '12px', textDecoration: 'none', display: 'block', marginBottom: '6px' }}>← Dashboard</Link>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: '#edeae4', margin: 0 }}>
                Mi Historial
              </h1>
            </div>
            <button
              onClick={() => { setShowForm(!showForm); if (!showForm) resetForm() }}
              disabled={rounds.length >= 50}
              style={{
                background: rounds.length >= 50 ? 'rgba(196,153,42,0.3)' : '#c4992a',
                color: '#070d18', fontWeight: 700, fontSize: '14px',
                padding: '10px 20px', borderRadius: '8px', border: 'none',
                cursor: rounds.length >= 50 ? 'not-allowed' : 'pointer',
              }}
            >
              {showForm ? '✕ Cancelar' : '+ Agregar ronda'}
            </button>
          </div>

          {/* Stat pills */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {[
              { label: 'Rondas',  value: String(rounds.length) },
              { label: 'Prom +/-', value: avgOv != null ? formatOv(avgOv) : '—' },
              { label: 'Birdies', value: String(aggBirdies) },
              { label: 'Eagles',  value: String(aggEagles) },
            ].map(pill => (
              <div key={pill.label} style={{
                background: 'rgba(196,153,42,0.1)', border: '1px solid rgba(196,153,42,0.25)',
                borderRadius: '20px', padding: '5px 14px',
                display: 'flex', gap: '6px', alignItems: 'center',
              }}>
                <span style={{ fontSize: '11px', color: '#7a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{pill.label}</span>
                <span style={{ fontSize: '14px', color: '#c4992a', fontWeight: 700 }}>{pill.value}</span>
              </div>
            ))}
          </div>

          {/* tAIger progress bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontSize: '11px', color: '#7a8fa8' }}>🐯 {taigerMessage(rounds.length)}</span>
              <span style={{ fontSize: '11px', color: '#7a8fa8' }}>{rounds.length}/50</span>
            </div>
            <div style={{ height: '4px', background: 'rgba(196,153,42,0.15)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '2px',
                width: `${progress * 100}%`,
                background: 'linear-gradient(90deg, #c4992a, #e8c06a)',
                transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '28px 20px' }}>

        {/* ── Form ── */}
        {showForm && (
          <form onSubmit={handleSave} style={{
            background: 'rgba(14,28,47,0.92)', border: '1px solid rgba(196,153,42,0.2)',
            borderRadius: '16px', padding: '28px', marginBottom: '36px',
          }}>

            {/* Live preview card */}
            <div style={{
              background: 'rgba(196,153,42,0.06)', border: '1px solid rgba(196,153,42,0.2)',
              borderRadius: '12px', padding: '16px 20px', marginBottom: '24px',
              borderLeft: '3px solid #c4992a',
            }}>
              <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', color: '#edeae4', marginBottom: '4px' }}>
                {courseName || 'Tu cancha'}
                {teeColor && <span style={{ fontSize: '12px', color: '#7a8fa8', marginLeft: '8px' }}>· Tee {teeColor}</span>}
              </div>
              {formStats && totalGross != null ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                  <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '2rem', color: '#edeae4', fontWeight: 700 }}>
                    {totalGross}
                  </span>
                  <span style={{
                    fontSize: '13px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px',
                    background: formStats.overUnder <= 0 ? 'rgba(196,153,42,0.2)' : 'rgba(220,38,38,0.15)',
                    color: formStats.overUnder <= 0 ? '#c4992a' : '#f87171',
                  }}>
                    {formatOv(formStats.overUnder)} par
                  </span>
                  <span style={{ fontSize: '12px', color: '#7a8fa8' }}>
                    {formStats.birdies > 0 && `🐦 ${formStats.birdies} `}
                    {formStats.bogeys  > 0 && `📌 ${formStats.bogeys} `}
                    {formStats.doubles > 0 && `🔴 ${formStats.doubles}`}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#7a8fa8', marginTop: '4px' }}>Ingresa tus scores hoyo a hoyo...</div>
              )}
              {formStats && (
                <div style={{ fontSize: '12px', color: '#7a8fa8', marginTop: '6px' }}>
                  Total: {formStats.total} · {formStats.overUnder > 0 ? '+' : ''}{formStats.overUnder === 0 ? 'E' : formStats.overUnder} · {formStats.birdies} birdies · {formStats.pars} pares · {formStats.bogeys} bogeys
                </div>
              )}
            </div>

            {/* Cancha + Tee */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '5px' }}>Cancha *</label>
                <select required value={courseName} onChange={e => setCourseName(e.target.value)}
                  style={{ ...inputBase, cursor: 'pointer' }}>
                  <option value="">— Seleccionar cancha —</option>
                  {CANCHAS_CHILE.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '5px' }}>Tees</label>
                <select value={teeColor} onChange={e => setTeeColor(e.target.value)}
                  style={{ ...inputBase, cursor: 'pointer', width: '110px' }}>
                  <option value="">—</option>
                  {TEES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Fecha */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '5px' }}>Fecha *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={day}   onChange={e => setDay(e.target.value)}   style={{ ...inputBase, width: '70px',  cursor: 'pointer' }}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputBase, flex: 1,       cursor: 'pointer' }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select value={year}  onChange={e => setYear(e.target.value)}  style={{ ...inputBase, width: '90px',  cursor: 'pointer' }}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Scores por hoyo — front 9 + back 9 */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '8px' }}>
                Scores por hoyo (par 4 asumido)
              </label>
              {(['Front 9', 'Back 9'] as const).map((half, halfIdx) => (
                <div key={half} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#7a8fa8', marginBottom: '5px' }}>{half}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '5px' }}>
                    {Array.from({ length: 9 }, (_, j) => {
                      const idx = halfIdx * 9 + j
                      const val = scores[idx]
                      return (
                        <div key={idx} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '9px', color: '#7a8fa8', marginBottom: '3px' }}>H{idx + 1}</div>
                          <input
                            type="number" min={1} max={20} inputMode="numeric"
                            placeholder="—"
                            value={val ?? ''}
                            onChange={e => {
                              const n = parseInt(e.target.value)
                              const next = [...scores]
                              next[idx] = isNaN(n) || n < 1 || n > 20 ? null : n
                              setScores(next)
                            }}
                            style={{
                              width: '100%', ...cellBg(val),
                              border: '1px solid rgba(122,143,168,0.15)',
                              borderRadius: '6px', padding: '7px 2px',
                              fontWeight: 600, textAlign: 'center',
                              outline: 'none', appearance: 'textfield' as const,
                              boxSizing: 'border-box' as const, minHeight: '44px',
                            }}
                            onFocus={e  => (e.currentTarget.style.borderColor = '#c4992a')}
                            onBlur={e   => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.15)')}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Notas */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '5px' }}>Notas (opcional)</label>
              <textarea
                placeholder="¿Algo memorable de esta ronda?"
                value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                style={{ ...inputBase, resize: 'vertical', minHeight: '58px' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#c4992a')}
                onBlur={e  => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')}
              />
            </div>

            {/* Save button */}
            <div>
              <button type="submit" disabled={saving || !courseName} style={{
                width: '100%', height: '54px',
                background: saving || !courseName ? 'rgba(196,153,42,0.4)' : '#c4992a',
                color: '#070d18', fontWeight: 700, fontSize: '16px',
                borderRadius: '10px', border: 'none',
                cursor: saving || !courseName ? 'not-allowed' : 'pointer',
              }}>
                {saving ? 'Guardando...' : 'Guardar y ver mi análisis →'}
              </button>
              <div style={{ textAlign: 'center', fontSize: '12px', color: '#7a8fa8', marginTop: '8px' }}>
                🐯 el tAIger analizará esta ronda automáticamente
              </div>
            </div>
          </form>
        )}

        {/* ── Empty state ── */}
        {rounds.length === 0 && !showForm && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>🐯</div>
            <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: '#edeae4', marginBottom: '8px' }}>
              el tAIger está esperando tus datos
            </div>
            <div style={{ fontSize: '14px', color: '#7a8fa8', marginBottom: '28px', maxWidth: '320px', margin: '0 auto 28px' }}>
              Registra tu primera ronda y el tAIger comenzará a analizar tu juego
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(196,153,42,0.6)', padding: '10px 16px', background: 'rgba(196,153,42,0.06)', borderRadius: '8px', display: 'inline-block' }}>
              🔗 Integración Garmin Golf — próximamente
            </div>
          </div>
        )}

        {/* ── Cards grid ── */}
        {rounds.length > 0 && (
          <>
            <div className="historial-cards-grid">
              {rounds.map((r) => {
                const stats   = computeStats(r.scores)
                const dateStr = new Date(r.played_at + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
                const ov      = r.total_gross != null ? r.total_gross - 72 : null
                const isGood  = ov != null && ov <= 0
                const isOpen  = expanded.has(r.id)

                return (
                  <div
                    key={r.id}
                    className="card-animate"
                    style={{
                      background: '#0e1c2f',
                      border: '1px solid rgba(122,143,168,0.12)',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'
                      ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 32px rgba(0,0,0,0.4)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                      ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
                    }}
                  >
                    {/* Top band */}
                    <div style={{
                      height: '3px',
                      background: isGood
                        ? 'linear-gradient(90deg, #c4992a, #e8c06a)'
                        : 'linear-gradient(90deg, rgba(122,143,168,0.3), rgba(122,143,168,0.1))',
                    }} />

                    <div style={{ padding: '16px' }}>
                      {/* Course + date + delete */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '14px', color: '#edeae4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.course_name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#7a8fa8', marginTop: '2px', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span>{dateStr}</span>
                            {r.tee_color && <span style={{ background: 'rgba(196,153,42,0.1)', padding: '1px 6px', borderRadius: '8px', color: '#c4992a', fontSize: '10px' }}>Tee {r.tee_color}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={deleting === r.id}
                          style={{ background: 'transparent', border: 'none', color: 'rgba(248,113,113,0.4)', cursor: 'pointer', fontSize: '16px', flexShrink: 0, padding: '2px 4px', minHeight: 0, minWidth: 0 }}
                        >
                          {deleting === r.id ? '…' : '×'}
                        </button>
                      </div>

                      {/* Big score */}
                      {r.total_gross != null && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px' }}>
                          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '2.8rem', color: '#edeae4', fontWeight: 700, lineHeight: 1 }}>
                            {r.total_gross}
                          </span>
                          {ov != null && (
                            <span style={{
                              fontSize: '13px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px',
                              background: isGood ? 'rgba(196,153,42,0.15)' : 'rgba(220,38,38,0.12)',
                              color: isGood ? '#c4992a' : '#f87171',
                            }}>
                              {formatOv(ov)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Stats row */}
                      {stats && (
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                          {stats.eagles  > 0 && <span style={{ fontSize: '11px', color: '#93c5fd' }}>🦅 {stats.eagles}</span>}
                          {stats.birdies > 0 && <span style={{ fontSize: '11px', color: '#86efac' }}>🐦 {stats.birdies}</span>}
                          {stats.pars    > 0 && <span style={{ fontSize: '11px', color: '#7a8fa8' }}>📍 {stats.pars}</span>}
                          {stats.bogeys  > 0 && <span style={{ fontSize: '11px', color: '#fcd34d' }}>📌 {stats.bogeys}</span>}
                          {stats.doubles > 0 && <span style={{ fontSize: '11px', color: '#fca5a5' }}>🔴 {stats.doubles}</span>}
                          {stats.filledHoles < 18 && (
                            <span style={{ fontSize: '11px', color: '#7a8fa8' }}>{stats.filledHoles} hoyos</span>
                          )}
                        </div>
                      )}

                      {/* Expand toggle */}
                      <button
                        onClick={() => toggleExpand(r.id)}
                        style={{
                          background: 'transparent', border: 'none', color: '#7a8fa8',
                          fontSize: '11px', cursor: 'pointer', padding: 0, minHeight: 0, minWidth: 0,
                        }}
                      >
                        {isOpen ? '▲ Ocultar scorecard' : '▼ Ver scorecard'}
                      </button>

                      {/* Mini scorecard */}
                      {isOpen && (
                        <div style={{ marginTop: '10px' }}>
                          {[0, 9].map(start => (
                            <div key={start} style={{ marginBottom: '6px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '3px' }}>
                                {r.scores.slice(start, start + 9).map((s, j) => (
                                  <div key={j} style={{
                                    ...cellBg(s),
                                    borderRadius: '4px', textAlign: 'center', padding: '3px 1px',
                                  }}>
                                    <div style={{ fontSize: '8px', opacity: 0.6, marginBottom: '1px' }}>H{start + j + 1}</div>
                                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{s ?? '—'}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          {r.notes && (
                            <div style={{ fontSize: '11px', color: '#7a8fa8', fontStyle: 'italic', marginTop: '6px' }}>
                              &ldquo;{r.notes}&rdquo;
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <p style={{ textAlign: 'center', fontSize: '12px', color: '#7a8fa8', marginTop: '20px' }}>
              {rounds.length}/50 tarjetas guardadas
            </p>
          </>
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
