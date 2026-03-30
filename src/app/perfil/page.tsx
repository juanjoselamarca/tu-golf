'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { ExperiencePanel } from '@/components/ExperienceSetup'
import { nivelCPI } from '@/golf/stats/cpi'

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
  fontSize: '16px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

function getCpiColor(score: number): string {
  if (score >= 75) return '#16a34a'
  if (score >= 60) return '#c4992a'
  if (score >= 40) return '#94a8c0'
  if (score >= 25) return '#d97706'
  return '#dc2626'
}

function getCpiLabel(score: number): string {
  if (score >= 75) return 'Forma excepcional'
  if (score >= 60) return 'En forma'
  if (score >= 40) return 'Estable'
  if (score >= 25) return 'Bajo su nivel'
  return 'Fuera de forma'
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
  const [cpiData, setCpiData] = useState<{score: number; status: string; trend: number; roundsInWindow: number; roundsTotal: number; deltaForma: number} | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?redirect=/perfil'); return }

      // Parallel queries — all at once, not sequential
      const [profRes, countRes] = await Promise.all([
        supabase.from('profiles').select('id, name, email, indice, avatar_url').eq('id', user.id).single(),
        supabase.from('players').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ])

      if (profRes.data) {
        const p = profRes.data as Profile
        setProfile(p)
        setEditName(p.name || '')
        setEditIndice(p.indice != null ? String(p.indice) : '')
      }

      setTourneysPlayed(countRes.count ?? 0)

      // CPI fetch in parallel (non-blocking)
      fetch('/api/cpi').then(r => r.json()).then(data => {
        if (data.score !== undefined) setCpiData(data)
      }).catch(() => {})

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

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '16px 16px 80px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <Link href="/dashboard" style={{ color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '18px' }}>
          ← Dashboard
        </Link>

        <div
          style={{
            background: 'linear-gradient(135deg, rgba(23,49,41,0.96) 0%, rgba(14,28,47,0.94) 100%)',
            border: '1px solid rgba(196,153,42,0.18)',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {initials}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
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
                  <button onClick={() => { setEditing(true); setTimeout(() => document.getElementById('edit-form')?.scrollIntoView({ behavior: 'smooth' }), 100) }} style={{
                    fontSize: '14px', color: '#c4992a', fontWeight: 700,
                    background: 'rgba(196,153,42,0.12)', border: '1px solid rgba(196,153,42,0.3)',
                    borderRadius: '10px', padding: '12px 20px', cursor: 'pointer',
                    minHeight: '44px', minWidth: '44px',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                    + Agregar índice →
                  </button>
                )}
                <span style={{ fontSize: '13px', color: '#9fb4aa' }}>
                  Torneos: {tourneysPlayed}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Completa tu perfil — only show if no índice */}
        {!profile.indice && (
          <div style={{
            background: 'var(--brand-light)', border: '1px solid rgba(196,153,42,0.2)',
            borderRadius: '14px', padding: '16px', marginBottom: '18px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>
              Completa tu perfil
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--brand)', fontWeight: 600 }}>✓</span>
                <span style={{ color: 'var(--brand)', fontWeight: 600, fontSize: '14px' }}>Cuenta creada</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--text-3)' }}>○</span>
                <span style={{ color: 'var(--text-3)', fontSize: '14px' }}>
                  Agregar índice / handicap
                </span>
                <button onClick={() => setEditing(true)} style={{ color: 'var(--brand)', fontSize: '13px', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, marginLeft: 'auto' }}>
                  Completar →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CPI Section */}
        {cpiData && cpiData.status === 'ok' && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(14,28,47,0.96) 0%, rgba(23,49,41,0.94) 100%)',
            border: '1px solid rgba(196,153,42,0.22)',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>CPI&trade;</span>
              <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                {nivelCPI(cpiData.score)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginBottom: '10px' }}>
              <span style={{ fontFamily: '"Cormorant Garamond", "Playfair Display", serif', fontSize: '36px', fontWeight: 700, color: getCpiColor(cpiData.score), lineHeight: 1 }}>
                {cpiData.score.toFixed(1)}
              </span>
              <span style={{
                background: `${getCpiColor(cpiData.score)}20`,
                color: getCpiColor(cpiData.score),
                padding: '3px 10px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 600,
              }}>
                {getCpiLabel(cpiData.score)}
              </span>
              {cpiData.trend !== 0 && (
                <span style={{ fontSize: '14px', fontWeight: 600, color: cpiData.trend > 0 ? '#16a34a' : '#dc2626' }}>
                  {cpiData.trend > 0 ? '▲' : '▼'} {cpiData.trend > 0 ? '+' : ''}{cpiData.trend.toFixed(1)}
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Math.max(0, cpiData.score))}%`, height: '100%', background: `linear-gradient(90deg, ${getCpiColor(cpiData.score)}cc, ${getCpiColor(cpiData.score)})`, borderRadius: '3px', transition: 'width 0.6s ease' }} />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                {cpiData.roundsInWindow} rondas
              </span>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
              Índice: {profile.indice ?? '—'} · Rondas: {cpiData.roundsTotal}
            </div>

            <Link href="/importar" style={{ fontSize: '13px', color: '#c4992a', textDecoration: 'none', fontWeight: 600, display: 'inline-block', marginTop: '8px' }}>
              + Importar más rondas
            </Link>
          </div>
        )}

        {cpiData && cpiData.status === 'insufficient_data' && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(196,153,42,0.08) 0%, rgba(196,153,42,0.04) 100%)',
            border: '1px solid rgba(196,153,42,0.3)',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '18px',
          }}>
            <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#c4992a', fontWeight: 700, marginBottom: '8px' }}>
              Activ&aacute; tu CPI&trade;
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Necesit&aacute;s 5+ rondas para activar tu CPI&trade;. Import&aacute; tus rondas hist&oacute;ricas para calcular tu &iacute;ndice de rendimiento.
            </p>
            <Link href="/importar" style={{
              display: 'inline-flex', alignItems: 'center',
              background: '#c4992a', color: '#070d18',
              padding: '10px 20px', borderRadius: '10px',
              fontSize: '14px', fontWeight: 700,
              textDecoration: 'none',
            }}>
              Importar historial &rarr;
            </Link>
          </div>
        )}

        {cpiData && cpiData.status === 'momentum_paused' && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(14,28,47,0.96) 0%, rgba(23,49,41,0.94) 100%)',
            border: '1px solid rgba(217,119,6,0.3)',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '18px',
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>CPI&trade;</div>
            <p style={{ fontSize: '14px', color: '#d97706', margin: '0 0 10px', fontWeight: 600 }}>
              Jug&aacute; una ronda reciente para reactivar tu CPI&trade;
            </p>
            <Link href="/ronda-libre/nueva" style={{ fontSize: '13px', color: '#c4992a', textDecoration: 'none', fontWeight: 600 }}>
              Crear ronda &rarr;
            </Link>
          </div>
        )}

        {profile.indice != null && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.14)', borderRadius: '14px', padding: '18px 16px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ fontSize: '24px' }}>🏌️</div>
            <div>
              <div style={{ fontSize: '26px', color: '#c8a55a', fontWeight: 700, lineHeight: 1.1, fontFamily: '"Playfair Display", serif' }}>
                {profile.indice}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '4px' }}>Handicap</div>
            </div>
          </div>
        )}

        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.14)', borderRadius: '16px', padding: '18px 18px 20px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: 'var(--text)', margin: 0 }}>
              Mis datos
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {saved && <span style={{ fontSize: '13px', color: '#22c55e' }}>✓ Guardado</span>}
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  style={{ background: 'transparent', border: '1px solid rgba(196,153,42,0.3)', color: '#c4992a', padding: '8px 16px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Editar perfil
                </button>
              )}
            </div>
          </div>

          {editing ? (
            <div id="edit-form" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Índice de handicap</label>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  placeholder="Ej: 12.5"
                  value={editIndice}
                  onChange={(e) => setEditIndice(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)'
                    const v = e.target.value.replace(',', '.')
                    const n = parseFloat(v)
                    if (!isNaN(n) && n >= 0 && n <= 54) setEditIndice(String(n))
                  }}
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

        <Link
          href="/importar"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '48px', background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.25)', color: '#c4992a', borderRadius: '12px', fontSize: '14px', textDecoration: 'none', fontWeight: 600 }}
        >
          + Importar historial de rondas →
        </Link>

        {/* Notification settings */}
        <div style={{ marginTop: '16px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <ExperiencePanel />
        </div>
      </div>
    </div>
  )
}
