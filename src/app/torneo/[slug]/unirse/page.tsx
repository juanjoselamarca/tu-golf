'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { PersonStanding, Flag, Calendar } from '@/components/icons'
import type {
  JoinInfoTournament,
  JoinInfoProfile,
} from '@/lib/data/tournaments/joinFlow'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatLabel(format: string) {
  const labels: Record<string, string> = {
    stroke_play: 'Stroke Play',
    match_play: 'Match Play',
    stableford: 'Stableford',
    scramble: 'Scramble',
    best_ball: 'Best Ball',
  }
  return labels[format] || format
}

export default function UnirsePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [loading, setLoading] = useState(true)
  const [tournament, setTournament] = useState<JoinInfoTournament | null>(null)
  const [profile, setProfile] = useState<JoinInfoProfile | null>(null)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [inscribing, setInscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/torneos/${encodeURIComponent(slug)}/join-info`, {
      cache: 'no-store',
    })
    if (res.status === 404) {
      setError('Torneo no encontrado')
      setLoading(false)
      return
    }
    if (!res.ok) {
      setError('No se pudo cargar la información del torneo. Intenta nuevamente.')
      setLoading(false)
      return
    }
    const data = (await res.json()) as {
      tournament: JoinInfoTournament
      profile: JoinInfoProfile | null
      alreadyRegistered: boolean
      authenticated: boolean
    }
    setTournament(data.tournament)
    setProfile(data.profile)
    setAlreadyRegistered(data.alreadyRegistered)
    setAuthenticated(data.authenticated ?? false)
    setLoading(false)
  }, [slug, router])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleInscribirse = async () => {
    if (!tournament || !profile || inscribing) return
    setInscribing(true)
    setError(null)

    const res = await fetch(`/api/torneos/${encodeURIComponent(slug)}/inscribirse`, {
      method: 'POST',
    })

    if (res.ok) {
      setSuccess(true)
      setInscribing(false)
      return
    }

    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    if (body.error === 'already_registered') {
      setAlreadyRegistered(true)
      setError(body.message ?? 'Ya estás inscrito en este torneo.')
    } else {
      setError(body.message ?? 'No se pudo completar la inscripción. Intenta nuevamente.')
    }
    setInscribing(false)
  }

  if (success && tournament) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', animation: 'bounce 0.6s ease infinite alternate' }}>
          <PersonStanding size={64} strokeWidth={1.5} />
        </div>
        <div
          style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '24px',
            color: 'var(--text)',
            fontWeight: 700,
            textAlign: 'center',
            marginBottom: '8px',
          }}
        >
          ¡Inscripción exitosa!
        </div>
        <div style={{ fontSize: '14px', color: 'var(--text-2)', textAlign: 'center', marginBottom: '24px' }}>
          Estás inscrito en {tournament.name}
        </div>

        {tournament.codigo && (
          <div
            style={{
              background: 'var(--surface-soft)',
              border: '1px solid var(--surface-border-strong)',
              borderRadius: '14px',
              padding: '20px 32px',
              textAlign: 'center',
              marginBottom: '24px',
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Código del torneo
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '32px', fontWeight: 700, color: '#c4992a', letterSpacing: '0.15em' }}>
              {tournament.codigo}
            </div>
          </div>
        )}

        <Link
          href={`/torneo/${slug}`}
          style={{
            background: '#c4992a',
            color: 'var(--brand-dark)',
            fontWeight: 700,
            fontSize: '15px',
            padding: '14px 32px',
            borderRadius: '10px',
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          Ver leaderboard →
        </Link>
        <style>{`
          @keyframes bounce {
            from { transform: translateY(0); }
            to   { transform: translateY(-12px); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '0' }}>
      <div style={{ padding: '24px 20px 0' }}>
        <Link href={`/torneo/${slug}`} style={{ color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none' }}>
          ← Volver al torneo
        </Link>
      </div>
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '32px 20px' }}>
        <h1
          style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '26px',
            color: 'var(--text)',
            fontWeight: 700,
            margin: '0 0 24px',
          }}
        >
          Inscribirse al torneo
        </h1>

        {error && (
          <div
            style={{
              background: 'rgba(220,50,50,0.12)',
              border: '1px solid rgba(220,50,50,0.3)',
              borderRadius: '12px',
              padding: '14px 16px',
              color: '#f87171',
              fontSize: '14px',
              marginBottom: '20px',
            }}
          >
            {error}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-2)', fontSize: '14px' }}>
            Cargando...
          </div>
        )}

        {!loading && tournament && (
          <>
            <div
              style={{
                background: 'var(--surface-soft)',
                border: '1px solid var(--surface-border)',
                borderRadius: '14px',
                padding: '24px',
                marginBottom: '20px',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                Torneo
              </div>
              <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: 'var(--text)', fontWeight: 700, marginBottom: '16px' }}>
                {tournament.name}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(tournament.courses?.nombre || tournament.course_name) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Flag size={14} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle' }} />
                    <span style={{ fontSize: '14px', color: 'var(--text-2)' }}>
                      {tournament.courses?.nombre || tournament.course_name}
                      {tournament.courses?.ciudad && `, ${tournament.courses.ciudad}`}
                    </span>
                  </div>
                )}
                {tournament.date_start && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                    <span style={{ fontSize: '14px', color: 'var(--text-2)' }}>{formatDate(tournament.date_start)}</span>
                  </div>
                )}
                {tournament.format && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <PersonStanding size={14} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle' }} />
                    <span style={{ fontSize: '14px', color: 'var(--text-2)' }}>{formatLabel(tournament.format)}</span>
                  </div>
                )}
              </div>
            </div>

            {profile && (
              <div
                style={{
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--surface-border)',
                  borderRadius: '14px',
                  padding: '24px',
                  marginBottom: '24px',
                }}
              >
                <div style={{ fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                  Tu perfil
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'rgba(196,153,42,0.15)',
                      border: '1.5px solid rgba(196,153,42,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      color: '#c4992a',
                      fontWeight: 700,
                    }}
                  >
                    {profile.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>{profile.name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                      {profile.indice != null
                        ? `Índice: ${Number(profile.indice).toFixed(1)}`
                        : 'Sin índice registrado'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!authenticated ? (
              /* Visitor sin sesión — muestra info del torneo + CTA login */
              <div style={{ textAlign: 'center' }}>
                <Link
                  href={`/login?next=/torneo/${slug}/unirse`}
                  style={{
                    display: 'block',
                    width: '100%',
                    background: '#c4992a',
                    color: 'var(--brand-dark)',
                    fontWeight: 700,
                    fontSize: '16px',
                    padding: '16px',
                    borderRadius: '10px',
                    border: 'none',
                    textDecoration: 'none',
                    textAlign: 'center',
                  }}
                >
                  Iniciar sesión para inscribirme
                </Link>
                <p style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '10px' }}>
                  Vuelves automáticamente al torneo después
                </p>
                <Link
                  href={`/torneo/${slug}`}
                  style={{ fontSize: '13px', color: 'var(--text-2)', textDecoration: 'underline', textUnderlineOffset: '3px', marginTop: '8px', display: 'inline-block' }}
                >
                  Ver leaderboard sin inscribirme →
                </Link>
              </div>
            ) : alreadyRegistered ? (
              <div
                style={{
                  background: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  borderRadius: '12px',
                  padding: '18px',
                  textAlign: 'center',
                  marginBottom: '16px',
                }}
              >
                <div style={{ fontSize: '15px', color: '#22c55e', fontWeight: 600, marginBottom: '4px' }}>
                  Ya estás inscrito en este torneo
                </div>
                <Link
                  href={`/torneo/${slug}`}
                  style={{ fontSize: '13px', color: 'var(--text-2)', textDecoration: 'underline', textUnderlineOffset: '3px' }}
                >
                  Ver leaderboard →
                </Link>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleInscribirse}
                disabled={inscribing || !profile}
                style={{
                  width: '100%',
                  background: '#c4992a',
                  color: 'var(--brand-dark)',
                  fontWeight: 700,
                  fontSize: '16px',
                  padding: '16px',
                  borderRadius: '10px',
                  border: 'none',
                  cursor: inscribing ? 'not-allowed' : 'pointer',
                  opacity: inscribing ? 0.7 : 1,
                  transition: 'opacity 200ms',
                }}
              >
                {inscribing ? 'Inscribiendo...' : 'Inscribirme'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
