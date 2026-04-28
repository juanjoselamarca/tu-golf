'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { ExperiencePanel } from '@/components/ExperienceSetup'
import { nivelCPI } from '@/golf/stats/cpi'
import { addToast } from '@/hooks/useToast'
import { NIVEL_LABELS, NIVEL_DESCRIPCION, rondasParaActivar } from '@/lib/indice-golfers'
import { Button } from '@/components/ui/Button'

interface Profile {
  id: string
  name: string
  email: string
  indice: number | null
  avatar_url: string | null
  indice_golfers: number | null
  indice_golfers_updated_at: string | null
  nivel: number | null
  nivel_updated_at: string | null
  nivel_expires_at: string | null
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
  const [deleteStep, setDeleteStep] = useState(0) // 0=idle, 1=first confirm, 2=deleting
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
        supabase.from('profiles').select('id, name, email, indice, avatar_url, indice_golfers, indice_golfers_updated_at, nivel, nivel_updated_at, nivel_expires_at').eq('id', user.id).single(),
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
            background: '#ffffff',
            border: '1px solid rgba(196,153,42,0.22)',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#c4992a', color: '#1a1a2e', fontWeight: 700, fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {initials}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <span style={{ background: 'rgba(196,153,42,0.10)', border: '1px solid rgba(196,153,42,0.28)', color: '#c4992a', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Perfil de jugador
                </span>
                <span style={{ background: '#f8f9fa', border: '1px solid #e2e8f0', color: '#4a5568', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600 }}>
                  {playerTier}
                </span>
              </div>

              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#1a1a2e', margin: '0 0 8px', lineHeight: 1.1 }}>
                {profile.name || 'Golfista'}
              </h1>
              {/* H16 cerrado: email movido a sección Cuenta (evita PII en screenshots del header) */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {profile.indice != null ? (
                  <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: 700 }}>
                    Índice: {profile.indice}
                  </span>
                ) : (
                  <Button
                    variant="nav"
                    size="sm"
                    onClick={() => { setEditing(true); setTimeout(() => document.getElementById('edit-form')?.scrollIntoView({ behavior: 'smooth' }), 100) }}
                  >
                    + Agregar índice →
                  </Button>
                )}
                <span style={{ fontSize: '13px', color: '#4a5568' }}>
                  Torneos: {tourneysPlayed}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dual Index Cards — P18: storytelling explícito de qué es cada índice */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          {/* Índice Federación */}
          <div style={{ background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', fontFamily: '"DM Mono", monospace', marginBottom: '8px', margin: '0 0 8px' }}>
              Federación
            </p>
            <p style={{ fontSize: '38px', fontWeight: 700, color: '#1a1a2e', fontFamily: '"Cormorant Garamond", serif', lineHeight: 1, margin: '0 0 4px' }}>
              {profile.indice != null ? profile.indice.toFixed(1) : '—'}
            </p>
            <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
              Oficial USGA · torneos federados
            </p>
          </div>

          {/* Índice Golfers+ */}
          <div style={{ background: '#f8f9fa', border: `1px solid ${profile.indice_golfers != null ? 'rgba(196,153,42,0.35)' : '#e2e8f0'}`, borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c4992a', fontFamily: '"DM Mono", monospace', margin: '0 0 8px' }}>
              Golfers+
            </p>
            {profile.indice_golfers != null ? (
              <>
                <p style={{ fontSize: '38px', fontWeight: 700, color: '#c4992a', fontFamily: '"Cormorant Garamond", serif', lineHeight: 1, margin: '0 0 4px' }}>
                  {profile.indice_golfers.toFixed(1)}
                </p>
                <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                  Rendimiento real · coaching y amistosos
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: '28px', color: '#94a3b8', lineHeight: 1, margin: '0 0 4px' }}>—</p>
                <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                  3+ rondas para activar
                </p>
              </>
            )}
          </div>
        </div>

        {/* P18: link explicativo — "¿Cuándo uso cuál?" */}
        <div style={{ marginBottom: '12px', textAlign: 'center' }}>
          <Link href="/indices" style={{
            fontSize: '12px', color: '#c4992a', textDecoration: 'none',
            fontFamily: '"DM Sans", system-ui, sans-serif', fontWeight: 600,
            padding: '6px 10px', borderRadius: '8px',
            display: 'inline-flex', alignItems: 'center', gap: '4px',
          }}>
            ¿Cuándo uso cuál? →
          </Link>
        </div>

        {/* Gap note — when difference >= 1.5 between indices */}
        {profile.indice != null && profile.indice_golfers != null && Math.abs(profile.indice - profile.indice_golfers) >= 1.5 && (
          <div style={{ padding: '10px 14px', background: 'rgba(196,153,42,0.07)', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '12px' }}>
            <p style={{ fontSize: '12px', color: '#4a5568', margin: 0, lineHeight: 1.5 }}>
              <strong style={{ color: '#c4992a' }}>{Math.abs(profile.indice - profile.indice_golfers).toFixed(1)} puntos</strong> de diferencia entre tu índice oficial y tu rendimiento reciente. tAIger+ puede analizar esto.
            </p>
          </div>
        )}

        {/* Nivel badge */}
        {profile.nivel != null && profile.nivel > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '16px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#c4992a', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a2e', margin: 0 }}>
                {NIVEL_LABELS[profile.nivel] ?? 'Rookie'}
              </p>
              <p style={{ fontSize: '11px', color: '#4a5568', margin: 0 }}>
                {NIVEL_DESCRIPCION[profile.nivel] ?? ''}
              </p>
            </div>
          </div>
        )}

        {/* CPI Section */}
        {cpiData && cpiData.status === 'ok' && (
          <div style={{
            background: '#ffffff',
            border: '1px solid rgba(196,153,42,0.22)',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', color: '#c4992a', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>CPI&trade;</span>
              <span style={{ fontSize: '12px', color: '#4a5568' }}>
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
              <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Math.max(0, cpiData.score))}%`, height: '100%', background: `linear-gradient(90deg, ${getCpiColor(cpiData.score)}cc, ${getCpiColor(cpiData.score)})`, borderRadius: '3px', transition: 'width 0.6s ease' }} />
              </div>
              <span style={{ fontSize: '12px', color: '#4a5568', whiteSpace: 'nowrap' }}>
                {cpiData.roundsInWindow} rondas
              </span>
            </div>
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
              Activa tu CPI&trade;
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Necesitas 5+ rondas para activar tu CPI&trade;. Importa tus rondas hist&oacute;ricas para calcular tu &iacute;ndice de rendimiento.
            </p>
            <Link href="/importar" style={{
              display: 'inline-flex', alignItems: 'center',
              background: '#c4992a', color: '#1a1a2e',
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
            background: 'rgba(217,119,6,0.04)',
            border: '1px solid rgba(217,119,6,0.28)',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '18px',
          }}>
            <div style={{ fontSize: '12px', color: '#d97706', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>CPI&trade;</div>
            <p style={{ fontSize: '14px', color: '#4a5568', margin: '0 0 10px', fontWeight: 600 }}>
              Juega una ronda reciente para reactivar tu CPI&trade;
            </p>
            <Link href="/ronda-libre/nueva" style={{ fontSize: '13px', color: '#c4992a', textDecoration: 'none', fontWeight: 600 }}>
              Crear ronda &rarr;
            </Link>
          </div>
        )}

        {/* Niveles Golfers+ por skill (handicap) — Sprint E: LevelsBar premium */}

        <div style={{ background: '#ffffff', border: '1px solid rgba(196,153,42,0.18)', borderRadius: '16px', padding: '18px 18px 20px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#1a1a2e', margin: 0 }}>
              Cuenta
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {saved && <span style={{ fontSize: '13px', color: '#22c55e' }}>✓ Guardado</span>}
              {!editing && (
                <Button variant="nav" size="sm" onClick={() => setEditing(true)}>
                  Editar perfil
                </Button>
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
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Índice Federación</label>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  placeholder="Ej: 15.4 — tu índice oficial de la Federación"
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
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', margin: '4px 0 0' }}>
                  Golfers+ calcula su propio índice automáticamente basado en tus rondas.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
                <Button variant="commit" size="md" onClick={handleSave} loading={saving} disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => { setEditing(false); setEditName(profile.name || ''); setEditIndice(profile.indice != null ? String(profile.indice) : '') }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                ['Nombre', profile.name || '—'],
                ['Email', profile.email],
              ].map(([label, value], idx, arr) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: idx < arr.length - 1 ? '1px solid #f1f5f9' : 'none', gap: '12px' }}>
                  <span style={{ fontSize: '13px', color: '#4a5568' }}>{label}</span>
                  <span style={{ fontSize: '14px', color: '#1a1a2e', fontWeight: 600, textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sincroniza tu historial — bloque editorial, no Link huérfano */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '16px 18px',
          marginBottom: '18px',
        }}>
          <div style={{
            fontSize: '10px', fontWeight: 700, color: '#94a3b8',
            fontFamily: '"DM Mono", monospace',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            Sincronización
          </div>
          <div style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '17px', color: '#1a1a2e', fontWeight: 600,
            marginBottom: '4px', letterSpacing: '-0.01em',
          }}>
            Trae tu historial completo
          </div>
          <p style={{ fontSize: '13px', color: '#4a5568', margin: '0 0 14px', lineHeight: 1.5 }}>
            Importa tus rondas desde FedeGolf, Garmin Connect o un CSV — el Índice Golfers+ y CPI™ se recalculan automáticamente.
          </p>
          <Link
            href="/importar"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minHeight: '40px', padding: '0 18px',
              background: 'transparent', border: '1px solid rgba(196,153,42,0.6)',
              color: '#c4992a', borderRadius: '10px',
              fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            }}
          >
            Importar historial →
          </Link>
        </div>

        {/* Notification settings */}
        <div style={{ marginTop: '16px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <ExperiencePanel />
        </div>

        {/* Eliminar cuenta */}
        <div style={{ marginTop: '32px', padding: '20px', background: '#fff5f5', borderRadius: '16px', border: '1px solid #fecaca' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#991b1b', marginBottom: '8px' }}>Eliminar mi cuenta</h3>
          <p style={{ fontSize: '13px', color: '#b91c1c', marginBottom: '16px', lineHeight: 1.5 }}>
            Se eliminarán todos tus datos: perfil, rondas, historial, estadísticas y sesiones de coaching. Esta acción no se puede deshacer.
          </p>
          {deleteStep === 0 && (
            <Button variant="destructive" size="md" onClick={() => setDeleteStep(1)}>
              Eliminar mi cuenta permanentemente
            </Button>
          )}
          {deleteStep === 1 && (
            <div style={{ background: '#fef2f2', borderRadius: '12px', padding: '16px', border: '1px solid #fca5a5' }}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#991b1b', marginBottom: '12px' }}>
                ¿Estás seguro? Se borrarán TODOS tus datos y no podrás recuperarlos.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    setDeleteStep(2)
                    try {
                      const res = await fetch('/api/profile/delete-account', { method: 'DELETE' })
                      if (res.ok) {
                        addToast({ title: 'Cuenta eliminada', message: 'Tu cuenta y todos tus datos fueron eliminados.', type: 'success' })
                        setTimeout(() => { window.location.href = '/' }, 1500)
                      } else {
                        const data = await res.json().catch(() => ({}))
                        addToast({ title: 'No se pudo eliminar', message: data.error || 'Ocurrió un error. Intenta de nuevo o contacta soporte.', type: 'error' })
                        setDeleteStep(0)
                      }
                    } catch {
                      addToast({ title: 'Sin conexión', message: 'No pudimos conectar con el servidor. Verifica tu internet e intenta de nuevo.', type: 'error' })
                      setDeleteStep(0)
                    }
                  }}
                >
                  Sí, eliminar todo
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteStep(0)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {deleteStep === 2 && (
            <p style={{ fontSize: '14px', color: '#991b1b', fontWeight: 500 }}>Eliminando tu cuenta...</p>
          )}
        </div>
      </div>
    </div>
  )
}
