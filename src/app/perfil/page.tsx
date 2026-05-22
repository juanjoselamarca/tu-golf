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
import { Avatar } from '@/components/ui/Avatar'
import { LevelsBar } from '@/components/perfil/LevelsBar'
import { getNivel } from '@/lib/mi-golf/niveles'
import { Check, ChevronUp, ChevronDown } from '@/components/icons'
import IndiceBreakdownModal from '@/components/IndiceBreakdownModal'
import { formatRelativeTime } from '@/lib/format'

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
  background: 'var(--bg-surface)',
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
  // Refresh FedeGolf — inbox 25366393
  const [fedegolfRefreshing, setFedegolfRefreshing] = useState(false)
  const [fedegolfMsg, setFedegolfMsg] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  // Modal "¿Qué rondas cuentan?" — inbox 82af3d48
  const [breakdownOpen, setBreakdownOpen] = useState(false)
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

  // Refresh índice FedeGolf manual — inbox 25366393.
  // El endpoint tiene cooldown de 4h, así que un click frecuente devuelve cached=true sin
  // pegarle a fedegolf.cl. Estados: ok, cached (warn), no-vinculado (warn), error.
  const handleFedegolfRefresh = async () => {
    if (fedegolfRefreshing) return
    setFedegolfRefreshing(true)
    setFedegolfMsg(null)
    try {
      const res = await fetch('/api/fedegolf/sync-indice', { method: 'POST' })
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; indice?: number; cambio?: boolean; cached?: boolean; error?: string }
        | null
      if (res.status === 404 || body?.error === 'No hay cuenta FedeGolf vinculada') {
        setFedegolfMsg({ kind: 'warn', text: 'Vinculá tu cuenta FedeGolf primero.' })
      } else if (!res.ok) {
        setFedegolfMsg({ kind: 'error', text: body?.error || 'No se pudo actualizar. Intentá más tarde.' })
      } else if (body?.cached) {
        setFedegolfMsg({ kind: 'warn', text: 'Ya está actualizado. Probá de nuevo en 4 horas.' })
      } else if (body?.cambio === false) {
        setFedegolfMsg({ kind: 'ok', text: 'Tu índice no cambió.' })
      } else {
        setFedegolfMsg({ kind: 'ok', text: `Índice actualizado: ${body?.indice?.toFixed(1) ?? '—'}` })
        // Refrescar profile para que la card muestre el nuevo valor
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: updated } = await supabase
            .from('profiles')
            .select('id, name, email, indice, avatar_url, indice_golfers, indice_golfers_updated_at, nivel, nivel_updated_at, nivel_expires_at')
            .eq('id', user.id).single()
          if (updated) setProfile(updated as Profile)
        }
      }
    } catch {
      setFedegolfMsg({ kind: 'error', text: 'Error de red. Probá de nuevo.' })
    } finally {
      setFedegolfRefreshing(false)
      // Auto-clear mensaje a los 6s
      setTimeout(() => setFedegolfMsg(null), 6000)
    }
  }

  if (loading) {
    return (
      <div style={{ background: 'var(--bg-surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
        Cargando perfil...
      </div>
    )
  }

  if (!profile) return null

  const playerTier = getPlayerTier(profile.indice)

  return (
    <div style={{
      background: 'var(--bg-surface)',
      minHeight: '100vh',
      // padding-bottom: el bottom-nav fijo mide 52px + safe-area-inset-bottom (15-20px en
      // iOS). 80px previos no alcanzaba en dispositivos con notch → la card "Tu experiencia"
      // se cortaba al fondo (inbox 164b8c80). 100px + safe-area da gap consistente con
      // /perfil/historial.
      paddingTop: '16px',
      paddingLeft: '16px',
      paddingRight: '16px',
      paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))',
    }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <Link href="/dashboard" style={{ color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '16px' }}>
          ← Dashboard
        </Link>

        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid rgba(196,153,42,0.22)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
            animation: 'profileIn 480ms cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <Avatar name={profile.name || 'Golfista'} size="xl" />


            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <span style={{ background: 'rgba(196,153,42,0.10)', border: '1px solid rgba(196,153,42,0.28)', color: '#c4992a', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Perfil de jugador
                </span>
                <span style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-2)', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600 }}>
                  {playerTier}
                </span>
              </div>

              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: 'var(--text)', margin: '0 0 8px', lineHeight: 1.1 }}>
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
                <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                  Torneos: {tourneysPlayed}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dual Index Cards — P18: storytelling explícito de qué es cada índice */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px', animation: 'profileIn 480ms cubic-bezier(0.16,1,0.3,1) both', animationDelay: '100ms' }}>
          {/* Índice Federación */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: '"DM Mono", monospace', marginBottom: '8px', margin: '0 0 8px' }}>
              Federación
            </p>
            <p style={{ fontSize: '38px', fontWeight: 700, color: 'var(--text)', fontFamily: '"Cormorant Garamond", serif', lineHeight: 1, margin: '0 0 4px' }}>
              {profile.indice != null ? profile.indice.toFixed(1) : '—'}
            </p>
            <p style={{ fontSize: '10px', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
              Oficial USGA · torneos federados
            </p>
            {/* Botón "Actualizar" — inbox 25366393. Trigger manual al sync FedeGolf
                (cooldown 4h server-side). No se muestra mientras refresca para evitar
                doble-click. Mensaje de resultado debajo, auto-clear a los 6s. */}
            <button
              type="button"
              onClick={handleFedegolfRefresh}
              disabled={fedegolfRefreshing}
              aria-label="Actualizar índice FedeGolf"
              style={{
                marginTop: '12px',
                minHeight: '32px',
                padding: '6px 10px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 600,
                fontFamily: '"DM Sans", system-ui, sans-serif',
                color: fedegolfRefreshing ? 'var(--text-3)' : '#c4992a',
                cursor: fedegolfRefreshing ? 'wait' : 'pointer',
                letterSpacing: '0.02em',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <span aria-hidden style={{
                display: 'inline-block',
                width: '11px', height: '11px',
                animation: fedegolfRefreshing ? 'fedegolfSpin 800ms linear infinite' : 'none',
              }}>↻</span>
              {fedegolfRefreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
            {fedegolfMsg && (
              <p
                role="status"
                aria-live="polite"
                style={{
                  marginTop: '8px',
                  marginBottom: 0,
                  fontSize: '10px',
                  lineHeight: 1.4,
                  color: fedegolfMsg.kind === 'error' ? '#dc2626' : fedegolfMsg.kind === 'warn' ? 'var(--text-2)' : '#16a34a',
                }}
              >
                {fedegolfMsg.text}
              </p>
            )}
            <style jsx>{`
              @keyframes fedegolfSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>

          {/* Índice Golfers+ — clickeable cuando hay índice para abrir el desglose
              de qué rondas cuentan (inbox 82af3d48). */}
          {profile.indice_golfers != null ? (
            <button
              type="button"
              onClick={() => setBreakdownOpen(true)}
              aria-label="Ver qué rondas cuentan para el cálculo"
              style={{
                background: 'var(--bg)',
                border: '1px solid rgba(196,153,42,0.35)',
                borderRadius: '16px',
                padding: '16px',
                textAlign: 'center',
                cursor: 'pointer',
                width: '100%',
                fontFamily: 'inherit',
                transition: 'transform 120ms ease',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}
            >
              <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c4992a', fontFamily: '"DM Mono", monospace', margin: '0 0 8px' }}>
                Golfers+
              </p>
              <p style={{ fontSize: '38px', fontWeight: 700, color: '#c4992a', fontFamily: '"Cormorant Garamond", serif', lineHeight: 1, margin: '0 0 4px' }}>
                {profile.indice_golfers.toFixed(1)}
              </p>
              <p style={{ fontSize: '10px', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
                Rendimiento real · coaching y amistosos
              </p>
              {profile.indice_golfers_updated_at && (
                <p style={{ fontSize: '9px', color: 'var(--text-3)', margin: '6px 0 0', fontFamily: '"DM Mono", monospace', letterSpacing: '0.04em', fontStyle: 'italic' }}>
                  Actualizado {formatRelativeTime(profile.indice_golfers_updated_at)}
                </p>
              )}
              <p style={{ fontSize: '10px', color: '#c4992a', margin: '8px 0 0', fontWeight: 600 }}>
                Ver qué rondas cuentan →
              </p>
            </button>
          ) : (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c4992a', fontFamily: '"DM Mono", monospace', margin: '0 0 8px' }}>
                Golfers+
              </p>
              <p style={{ fontSize: '28px', color: 'var(--text-3)', lineHeight: 1, margin: '0 0 4px' }}>—</p>
              <p style={{ fontSize: '10px', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
                3+ rondas para activar
              </p>
            </div>
          )}
        </div>

        {/* P18: link explicativo — "¿Cuándo uso cuál?" */}
        <div style={{ marginBottom: '12px', textAlign: 'center', animation: 'profileIn 480ms cubic-bezier(0.16,1,0.3,1) both', animationDelay: '180ms' }}>
          <Link href="/indices" style={{
            fontSize: '12px', color: '#c4992a', textDecoration: 'none',
            fontFamily: '"DM Sans", system-ui, sans-serif', fontWeight: 600,
            padding: '6px 10px', borderRadius: '8px',
            display: 'inline-flex', alignItems: 'center', gap: '4px',
          }}>
            ¿Cuándo uso cuál? →
          </Link>
        </div>

        {/* Gap note — momento editorial cuando hay desalineación >= 1.5 entre índices */}
        {profile.indice != null && profile.indice_golfers != null && Math.abs(profile.indice - profile.indice_golfers) >= 1.5 && (
          <div style={{
            padding: '14px 16px',
            background: 'rgba(196,153,42,0.06)',
            border: '1px solid rgba(196,153,42,0.28)',
            borderRadius: '12px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <div style={{
                fontSize: '9px',
                fontFamily: '"DM Mono", monospace',
                fontWeight: 700,
                color: '#c4992a',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: '4px',
              }}>
                Recomendación tAIger+
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
                <strong style={{ color: '#c4992a' }}>{Math.abs(profile.indice - profile.indice_golfers).toFixed(1)} puntos</strong> de diferencia entre tu índice oficial y tu rendimiento reciente.
              </p>
            </div>
            <Link href="/coach" style={{ textDecoration: 'none', flexShrink: 0 }}>
              <Button variant="commit" size="sm">
                Analizar con tAIger+ →
              </Button>
            </Link>
          </div>
        )}

        {/* Nivel badge */}
        {profile.nivel != null && profile.nivel > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '16px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#c4992a', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {NIVEL_LABELS[profile.nivel] ?? 'Sin nivel'}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-2)', margin: 0 }}>
                {NIVEL_DESCRIPCION[profile.nivel] ?? ''}
              </p>
            </div>
          </div>
        )}

        {/* CPI Section */}
        {cpiData && cpiData.status === 'ok' && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid rgba(196,153,42,0.22)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', color: '#c4992a', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>CPI&trade;</span>
              <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                {nivelCPI(cpiData.score)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '10px' }}>
              <span style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '36px', fontWeight: 700, color: getCpiColor(cpiData.score), lineHeight: 1 }}>
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '14px', fontWeight: 600, color: cpiData.trend > 0 ? '#16a34a' : '#dc2626' }}>
                  {cpiData.trend > 0 ? <ChevronUp size={16} strokeWidth={2.5} /> : <ChevronDown size={16} strokeWidth={2.5} />}
                  {cpiData.trend > 0 ? '+' : ''}{cpiData.trend.toFixed(1)}
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Math.max(0, cpiData.score))}%`, height: '100%', background: `linear-gradient(90deg, ${getCpiColor(cpiData.score)}cc, ${getCpiColor(cpiData.score)})`, borderRadius: '3px', transition: 'width 0.6s ease' }} />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                {cpiData.roundsInWindow} rondas
              </span>
            </div>
          </div>
        )}

        {cpiData && cpiData.status === 'insufficient_data' && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(196,153,42,0.08) 0%, rgba(196,153,42,0.04) 100%)',
            border: '1px solid rgba(196,153,42,0.3)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
          }}>
            <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#c4992a', fontWeight: 700, marginBottom: '8px' }}>
              Activa tu CPI&trade;
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Necesitas 5+ rondas para activar tu CPI&trade;. Importa tus rondas hist&oacute;ricas para calcular tu &iacute;ndice de rendimiento.
            </p>
            <Link href="/importar" style={{
              display: 'inline-flex', alignItems: 'center',
              background: '#c4992a', color: 'var(--brand-dark)',
              padding: '10px 20px', borderRadius: '12px',
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
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
          }}>
            <div style={{ fontSize: '12px', color: '#d97706', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>CPI&trade;</div>
            <p style={{ fontSize: '14px', color: 'var(--text-2)', margin: '0 0 10px', fontWeight: 600 }}>
              Juega una ronda reciente para reactivar tu CPI&trade;
            </p>
            <Link href="/ronda-libre/nueva" style={{ fontSize: '13px', color: '#c4992a', textDecoration: 'none', fontWeight: 600 }}>
              Crear ronda &rarr;
            </Link>
          </div>
        )}

        {/* Niveles Golfers+ por skill (handicap). Prioriza Índice Golfers+
            si está calculado (rendimiento real); fallback a Federación. */}
        {(() => {
          const indiceParaNivel = profile.indice_golfers ?? profile.indice
          if (indiceParaNivel == null) return null
          const nivelSkill = getNivel(indiceParaNivel)
          return <LevelsBar nivel={nivelSkill} />
        })()}

        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.18)', borderRadius: '16px', padding: '18px 18px 20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: 'var(--text)', margin: 0 }}>
              Cuenta
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {saved && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#16a34a' }}>
                  <Check size={14} strokeWidth={2.5} /> Guardado
                </span>
              )}
              {!editing && (
                <Button variant="nav" size="sm" onClick={() => setEditing(true)}>
                  Editar perfil
                </Button>
              )}
            </div>
          </div>

          {editing ? (
            <div id="edit-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px', margin: '4px 0 0' }}>
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
                  <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>{label}</span>
                  <span style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sincroniza tu historial — bloque editorial, no Link huérfano */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '16px 18px',
          marginBottom: '16px',
        }}>
          <div style={{
            fontSize: '10px', fontWeight: 700, color: 'var(--text-3)',
            fontFamily: '"DM Mono", monospace',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            Sincronización
          </div>
          <div style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '17px', color: 'var(--text)', fontWeight: 600,
            marginBottom: '4px', letterSpacing: '-0.01em',
          }}>
            Trae tu historial completo
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.5 }}>
            Importa tus rondas desde FedeGolf, Garmin Connect o un CSV — el Índice Golfers+ y CPI™ se recalculan automáticamente.
          </p>
          <Link
            href="/importar"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minHeight: '40px', padding: '0 18px',
              background: 'transparent', border: '1px solid rgba(196,153,42,0.6)',
              color: '#c4992a', borderRadius: '12px',
              fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            }}
          >
            Importar historial →
          </Link>
        </div>

        {/* Notification settings */}
        <div style={{ marginTop: '16px', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <ExperiencePanel />
        </div>

        {/* Eliminar cuenta — link discreto al final + modal de confirmación.
            Premium: la zona peligro NO es protagonista visual. */}
        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setDeleteStep(1)}
            style={{
              background: 'transparent', border: 'none', padding: '8px 12px',
              fontSize: '12px', color: 'var(--text-3)', cursor: 'pointer',
              textDecoration: 'underline', textUnderlineOffset: '3px',
              fontFamily: '"DM Sans", system-ui, sans-serif',
            }}
          >
            Eliminar mi cuenta
          </button>
        </div>

        {/* Modal de confirmación — solo render cuando deleteStep > 0 */}
        {deleteStep > 0 && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onClick={() => deleteStep === 1 && setDeleteStep(0)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(7,13,24,0.55)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '24px',
              animation: 'modalOverlayIn 200ms ease-out both',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--bg-surface)', borderRadius: '16px',
                padding: '28px', maxWidth: '420px', width: '100%',
                border: '1px solid rgba(220,38,38,0.18)',
                boxShadow: '0 24px 48px rgba(7,13,24,0.18)',
                animation: 'modalCardIn 320ms ease-out both',
              }}
            >
              <h3
                id="delete-account-title"
                style={{
                  fontFamily: '"Playfair Display", serif',
                  fontSize: '20px', fontWeight: 600,
                  color: 'var(--text)', margin: '0 0 8px',
                  letterSpacing: '-0.01em',
                }}
              >
                ¿Eliminar tu cuenta?
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-2)', margin: '0 0 20px', lineHeight: 1.55 }}>
                Se borrarán todos tus datos: perfil, rondas, historial, estadísticas y sesiones de coaching.
                <br />
                <strong style={{ color: '#991b1b' }}>Esta acción no se puede deshacer.</strong>
              </p>
              {deleteStep === 1 && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteStep(0)}>
                    Cancelar
                  </Button>
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
                </div>
              )}
              {deleteStep === 2 && (
                <p style={{ fontSize: '14px', color: '#991b1b', fontWeight: 500, margin: 0 }}>
                  Eliminando tu cuenta...
                </p>
              )}
            </div>
            <style>{`
              @keyframes modalOverlayIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes modalCardIn {
                from { opacity: 0; transform: translateY(8px) scale(0.97); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>
          </div>
        )}
      </div>

      <style>{`
        @keyframes profileIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Modal "¿Qué rondas cuentan?" — inbox 82af3d48 */}
      <IndiceBreakdownModal isOpen={breakdownOpen} onClose={() => setBreakdownOpen(false)} />
    </div>
  )
}
