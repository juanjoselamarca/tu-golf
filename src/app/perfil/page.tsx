'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

interface Profile {
  id: string
  name: string
  email: string
  indice: number | null
  avatar_url: string | null
}

const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  color: 'var(--text)',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '14px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

function getPlayerTier(indice: number | null) {
  if (indice == null) return 'Perfil en construcción'
  if (indice <= 5) return 'Competidor avanzado'
  if (indice <= 12) return 'Competidor consistente'
  if (indice <= 20) return 'Amateur en progreso'
  return 'Jugador activo'
}

export default function PerfilPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editName, setEditName] = useState('')
  const [editIndice, setEditIndice] = useState('')
  const [tourneysPlayed, setTourneysPlayed] = useState(0)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?redirect=/perfil'); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('id, name, email, indice, avatar_url')
        .eq('id', user.id)
        .single()

      if (prof) {
        const p = prof as Profile
        setProfile(p)
        setEditName(p.name || '')
        setEditIndice(p.indice != null ? String(p.indice) : '')
      }

      const { count } = await supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)

      setTourneysPlayed(count ?? 0)
      setLoading(false)
    }

    load()
  }, [router])

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)

    const supabase = createClient()
    const indiceParsed = editIndice.trim() !== '' ? parseFloat(editIndice) : null

    const { data: updated } = await supabase
      .from('profiles')
      .update({ name: editName.trim(), indice: indiceParsed })
      .eq('id', profile.id)
      .select('id, name, email, indice, avatar_url')
      .single()

    if (updated) setProfile(updated as Profile)

    setSaving(false)
    setSaved(true)
    setEditing(false)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
        Cargando perfil...
      </div>
    )
  }

  if (!profile) return null

  const initials = (profile.name || 'G')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const playerTier = getPlayerTier(profile.indice)
  const bestRoundRef = profile.indice != null ? Math.max(72, 72 + Math.round(profile.indice * 0.8)) : 84
  const scoringFocus = profile.indice != null ? (profile.indice <= 12 ? 'Cierre de ronda' : 'Consistencia hoyo a hoyo') : 'Completar historial'

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '16px 16px 40px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <Link href="/dashboard" style={{ color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '18px' }}>
          ← Dashboard
        </Link>

        <div
          style={{
            background: 'linear-gradient(135deg, rgba(23,49,41,0.96) 0%, rgba(14,28,47,0.94) 100%)',
            border: '1px solid rgba(196,153,42,0.18)',
            borderRadius: '18px',
            padding: '20px',
            marginBottom: '18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {initials}
            </div>

            <div style={{ flex: 1, minWidth: '220px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <span style={{ background: 'rgba(196,153,42,0.12)', border: '1px solid rgba(196,153,42,0.24)', color: '#c8a55a', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Perfil de jugador
                </span>
                <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#9fb4aa', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600 }}>
                  {playerTier}
                </span>
              </div>

              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.1 }}>
                {profile.name || 'Golfista'}
              </h1>
              <p style={{ fontSize: '14px', color: 'var(--text-2)', margin: '0 0 8px' }}>{profile.email}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {profile.indice != null ? (
                  <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: 700 }}>
                    Índice: {profile.indice}
                  </span>
                ) : (
                  <button onClick={() => setEditing(true)} style={{
                    fontSize: '13px', color: '#dc2626', fontWeight: 600,
                    background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
                    borderRadius: '20px', padding: '4px 12px', cursor: 'pointer',
                    minHeight: 0, minWidth: 0,
                  }}>
                    Sin índice · Agregar →
                  </button>
                )}
                <span style={{ fontSize: '13px', color: '#9fb4aa' }}>
                  Torneos: {tourneysPlayed}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {(!profile.indice || tourneysPlayed === 0) && (
          <div style={{
            background: 'var(--brand-light)', border: '1px solid rgba(196,153,42,0.2)',
            borderRadius: '14px', padding: '16px', marginBottom: '18px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>
              Completa tu perfil
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--brand)', fontWeight: 600 }}>✅</span>
                <span style={{ color: 'var(--brand)', fontWeight: 600, fontSize: '14px' }}>Cuenta creada</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: profile.indice != null ? 'var(--brand)' : 'var(--text-3)' }}>{profile.indice != null ? '✅' : '○'}</span>
                <span style={{ color: profile.indice != null ? 'var(--brand)' : 'var(--text-3)', fontSize: '14px' }}>
                  Agregar índice / handicap
                </span>
                {profile.indice == null && (
                  <button onClick={() => setEditing(true)} style={{ color: 'var(--brand)', fontSize: '13px', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, marginLeft: 'auto' }}>
                    Completar →
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: tourneysPlayed > 0 ? 'var(--brand)' : 'var(--text-3)' }}>{tourneysPlayed > 0 ? '✅' : '○'}</span>
                <span style={{ color: tourneysPlayed > 0 ? 'var(--brand)' : 'var(--text-3)', fontSize: '14px' }}>
                  Primera ronda
                </span>
                {tourneysPlayed === 0 && (
                  <Link href="/ronda-libre/nueva" style={{ color: 'var(--brand)', fontSize: '13px', textDecoration: 'none', fontWeight: 600, marginLeft: 'auto' }}>
                    Jugar ahora →
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '18px' }}>
          {[
            { icon: '🏌️', label: 'Handicap', value: profile.indice != null ? profile.indice : '—', accent: '#c8a55a' },
            { icon: '🏆', label: 'Torneos', value: tourneysPlayed, accent: '#edeae4' },
            { icon: '📉', label: 'Mejor vuelta ref.', value: bestRoundRef, accent: '#9ae6b4' },
            { icon: '🎯', label: 'Foco actual', value: scoringFocus, accent: '#9fb4aa', compact: true },
          ].map((stat) => (
            <div key={stat.label} style={{ background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.14)', borderRadius: '14px', padding: '18px 16px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>{stat.icon}</div>
              <div style={{ fontSize: stat.compact ? '14px' : '26px', color: stat.accent, fontWeight: 700, lineHeight: 1.1, fontFamily: stat.compact ? 'inherit' : '"Playfair Display", serif' }}>
                {stat.value}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '6px' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.14)', borderRadius: '16px', padding: '18px 18px 20px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: 'var(--text)', margin: 0 }}>
                Identidad competitiva
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-2)', margin: '4px 0 0' }}>
                Un resumen rápido de tu perfil en Golfers+.
              </p>
            </div>
            {saved && <span style={{ fontSize: '13px', color: '#22c55e' }}>✓ Guardado</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '14px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nivel actual</div>
              <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 700, marginTop: '4px' }}>{playerTier}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '14px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Próximo paso</div>
              <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 700, marginTop: '4px' }}>{scoringFocus}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: 'var(--text)', margin: 0 }}>
              Mis datos
            </h3>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                style={{ background: 'transparent', border: '1px solid rgba(196,153,42,0.3)', color: '#c4992a', padding: '8px 16px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
              >
                Editar perfil
              </button>
            )}
          </div>

          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Nombre</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Handicap</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="54"
                  inputMode="decimal"
                  placeholder="Ej: 12.5"
                  value={editIndice}
                  onChange={(e) => setEditIndice(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '14px', padding: '11px 22px', borderRadius: '10px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button
                  onClick={() => { setEditing(false); setEditName(profile.name || ''); setEditIndice(profile.indice != null ? String(profile.indice) : '') }}
                  style={{ background: 'transparent', border: '1px solid rgba(122,143,168,0.3)', color: 'var(--text-2)', fontSize: '14px', padding: '11px 18px', borderRadius: '10px', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                ['Nombre', profile.name || '—'],
                ['Email', profile.email],
                ['Handicap', profile.indice != null ? profile.indice : '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: label !== 'Handicap' ? '1px solid rgba(122,143,168,0.1)' : 'none', gap: '12px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>{label}</span>
                  <span style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Link href="/perfil/stats" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', minHeight: '48px',
          background: 'transparent', border: '1px solid rgba(196,153,42,0.4)',
          color: '#c4992a', borderRadius: '10px', fontSize: '15px',
          fontWeight: 600, textDecoration: 'none', marginBottom: '18px',
        }}>
          Ver mis estadísticas completas →
        </Link>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <Link
            href="/perfil/historial"
            style={{ background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.25)', color: '#c4992a', padding: '14px 16px', borderRadius: '12px', fontSize: '14px', textDecoration: 'none', fontWeight: 600 }}
          >
            📋 Ver historial de tarjetas →
          </Link>
          <Link
            href="/ronda-libre/nueva"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text)', padding: '14px 16px', borderRadius: '12px', fontSize: '14px', textDecoration: 'none', fontWeight: 600 }}
          >
            ⛳ Crear nueva ronda libre →
          </Link>
        </div>
      </div>
    </div>
  )
}
