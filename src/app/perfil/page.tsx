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
  background: 'rgba(7,13,24,0.6)',
  border: '1px solid rgba(122,143,168,0.3)',
  color: '#edeae4',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '14px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

export default function PerfilPage() {
  const router = useRouter()

  const [profile,      setProfile]      = useState<Profile | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [editing,      setEditing]      = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [editName,     setEditName]     = useState('')
  const [editIndice,   setEditIndice]   = useState('')
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

      // Count tournaments played
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

    if (updated) {
      setProfile(updated as Profile)
    }
    setSaving(false)
    setSaved(true)
    setEditing(false)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a8fa8' }}>
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

  return (
    <div style={{ background: '#070d18', minHeight: '100vh', padding: '40px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        {/* Back */}
        <Link href="/dashboard" style={{ color: '#7a8fa8', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '24px' }}>
          ← Dashboard
        </Link>

        {/* Header card */}
        <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.2)', borderRadius: '16px', padding: '32px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: '#edeae4', margin: '0 0 6px' }}>
              {profile.name || 'Golfista'}
            </h1>
            <p style={{ fontSize: '14px', color: '#7a8fa8', margin: '0 0 4px' }}>{profile.email}</p>
            {profile.indice != null && (
              <p style={{ fontSize: '13px', color: '#c4992a', margin: 0, fontWeight: 600 }}>
                Índice: {profile.indice}
              </p>
            )}
          </div>
        </div>

        {/* Stats card */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px', marginBottom: '20px' }}>
          <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏆</div>
            <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#c4992a', fontWeight: 700 }}>{tourneysPlayed}</div>
            <div style={{ fontSize: '12px', color: '#7a8fa8', marginTop: '4px' }}>Torneos jugados</div>
          </div>
          <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
            <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#7a8fa8', fontWeight: 600 }}>Próximamente</div>
            <div style={{ fontSize: '12px', color: '#7a8fa8', marginTop: '4px' }}>Estadísticas</div>
          </div>
        </div>

        {/* Edit card */}
        <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.2)', borderRadius: '16px', padding: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#edeae4', margin: 0 }}>
              Mis datos
            </h2>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                style={{ background: 'transparent', border: '1px solid rgba(196,153,42,0.3)', color: '#c4992a', padding: '7px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
              >
                Editar
              </button>
            )}
            {saved && (
              <span style={{ fontSize: '13px', color: '#22c55e' }}>✓ Guardado</span>
            )}
          </div>

          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '6px' }}>Nombre</label>
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
                <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '6px' }}>Índice de golf</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="54"
                  placeholder="Ej: 12.5"
                  value={editIndice}
                  onChange={(e) => setEditIndice(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '14px', padding: '10px 24px', borderRadius: '8px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  onClick={() => { setEditing(false); setEditName(profile.name || ''); setEditIndice(profile.indice != null ? String(profile.indice) : '') }}
                  style={{ background: 'transparent', border: '1px solid rgba(122,143,168,0.3)', color: '#7a8fa8', fontSize: '14px', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(122,143,168,0.1)' }}>
                <span style={{ fontSize: '13px', color: '#7a8fa8' }}>Nombre</span>
                <span style={{ fontSize: '14px', color: '#edeae4', fontWeight: 500 }}>{profile.name || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(122,143,168,0.1)' }}>
                <span style={{ fontSize: '13px', color: '#7a8fa8' }}>Email</span>
                <span style={{ fontSize: '14px', color: '#edeae4' }}>{profile.email}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                <span style={{ fontSize: '13px', color: '#7a8fa8' }}>Índice de golf</span>
                <span style={{ fontSize: '14px', color: profile.indice != null ? '#c4992a' : '#7a8fa8', fontWeight: profile.indice != null ? 600 : 400 }}>
                  {profile.indice != null ? profile.indice : '—'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Links */}
        <div style={{ marginTop: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link
            href="/perfil/historial"
            style={{ background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.25)', color: '#c4992a', padding: '10px 18px', borderRadius: '8px', fontSize: '14px', textDecoration: 'none', fontWeight: 500 }}
          >
            📋 Historial de tarjetas →
          </Link>
          <Link
            href="/ronda-libre/nueva"
            style={{ background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.25)', color: '#c4992a', padding: '10px 18px', borderRadius: '8px', fontSize: '14px', textDecoration: 'none', fontWeight: 500 }}
          >
            ⛳ Nueva ronda libre →
          </Link>
        </div>
      </div>
    </div>
  )
}
