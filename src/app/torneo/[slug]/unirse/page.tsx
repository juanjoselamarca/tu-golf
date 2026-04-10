'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface TournamentInfo {
  id: string
  name: string
  slug: string
  format: string
  date_start: string | null
  codigo: string | null
  course_name: string | null
  courses: { nombre: string; ciudad: string; slope_rating: number; course_rating: number; par_total: number } | null
}

interface ProfileInfo {
  name: string
  indice: number | null
}

function calcCourseHandicap(indice: number, slope: number, rating: number, par: number) {
  return Math.round(indice * (slope / 113) + (rating - par))
}

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
  const [tournament, setTournament] = useState<TournamentInfo | null>(null)
  const [profile, setProfile] = useState<ProfileInfo | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [inscribing, setInscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const supabase = createClient()

  const loadData = useCallback(async () => {
    // Check auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace(`/login?redirect=/torneo/${slug}/unirse`)
      return
    }
    setUserId(user.id)

    // Fetch profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('name, indice')
      .eq('id', user.id)
      .single()
    if (prof) setProfile(prof as ProfileInfo)

    // Fetch tournament
    const { data: t, error: tErr } = await supabase
      .from('tournaments')
      .select('id, name, slug, format, date_start, codigo, course_name, courses(nombre, ciudad, slope_rating, course_rating, par_total)')
      .eq('slug', slug)
      .single()

    if (tErr || !t) {
      setError('Torneo no encontrado')
      setLoading(false)
      return
    }
    setTournament(t as unknown as TournamentInfo)

    // Check if already registered
    const { data: existing } = await supabase
      .from('players')
      .select('id')
      .eq('tournament_id', t.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) setAlreadyRegistered(true)

    setLoading(false)
  }, [slug, router, supabase])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleInscribirse = async () => {
    if (!userId || !tournament || !profile || inscribing) return
    setInscribing(true)
    setError(null)

    const course = tournament.courses
    const courseHandicap =
      profile.indice != null && course
        ? calcCourseHandicap(profile.indice, course.slope_rating, course.course_rating, course.par_total)
        : null

    // Insert player
    const { data: player, error: pErr } = await supabase
      .from('players')
      .insert({
        tournament_id: tournament.id,
        user_id: userId,
        handicap_at_registration: courseHandicap,
        status: 'approved',
      })
      .select()
      .single()

    if (pErr || !player) {
      const msg = pErr?.message?.toLowerCase() || ''
      if (msg.includes('duplicate') || msg.includes('unique')) {
        setError('Ya estás inscrito en este torneo.')
        setAlreadyRegistered(true)
      } else if (msg.includes('permission') || msg.includes('policy') || pErr?.code === '42501') {
        setError('No tienes permiso para inscribirte. Contacta al organizador del torneo.')
      } else if (msg.includes('violates check') || msg.includes('not-null')) {
        setError('Faltan datos en tu perfil. Verifica que tengas nombre y handicap configurados.')
      } else {
        setError(`No se pudo completar la inscripción: ${pErr?.message || 'error desconocido'}. Intenta nuevamente.`)
      }
      setInscribing(false)
      return
    }

    // Create round
    await supabase.from('rounds').insert({
      tournament_id: tournament.id,
      player_id: player.id,
      status: 'in_progress',
    })

    setSuccess(true)
    setInscribing(false)
  }

  // Success screen
  if (success && tournament) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#070d18',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <div style={{ fontSize: '64px', marginBottom: '20px', animation: 'bounce 0.6s ease infinite alternate' }}>
          🏌️
        </div>
        <div
          style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '24px',
            color: '#edeae4',
            fontWeight: 700,
            textAlign: 'center',
            marginBottom: '8px',
          }}
        >
          ¡Inscripción exitosa!
        </div>
        <div style={{ fontSize: '14px', color: '#94a8c0', textAlign: 'center', marginBottom: '24px' }}>
          Estás inscrito en {tournament.name}
        </div>

        {tournament.codigo && (
          <div
            style={{
              background: 'rgba(14,28,47,0.92)',
              border: '1px solid rgba(196,153,42,0.3)',
              borderRadius: '14px',
              padding: '20px 32px',
              textAlign: 'center',
              marginBottom: '24px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
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
            color: '#070d18',
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
    <div style={{ minHeight: '100vh', background: '#070d18', padding: '0' }}>

      {/* Header */}
      <div style={{ padding: '24px 20px 0' }}>
        <Link href={`/torneo/${slug}`} style={{ color: '#94a8c0', fontSize: '13px', textDecoration: 'none' }}>
          ← Volver al torneo
        </Link>
      </div>

      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '32px 20px' }}>

        <h1
          style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '26px',
            color: '#edeae4',
            fontWeight: 700,
            margin: '0 0 24px',
          }}
        >
          Inscribirse al torneo
        </h1>

        {/* Error */}
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

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a8c0', fontSize: '14px' }}>
            Cargando...
          </div>
        )}

        {/* Tournament info card */}
        {!loading && tournament && (
          <>
            <div
              style={{
                background: 'rgba(14,28,47,0.92)',
                border: '1px solid rgba(196,153,42,0.2)',
                borderRadius: '14px',
                padding: '24px',
                marginBottom: '20px',
              }}
            >
              <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                Torneo
              </div>
              <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#edeae4', fontWeight: 700, marginBottom: '16px' }}>
                {tournament.name}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(tournament.courses?.nombre || tournament.course_name) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>⛳</span>
                    <span style={{ fontSize: '14px', color: '#94a8c0' }}>
                      {tournament.courses?.nombre || tournament.course_name}
                      {tournament.courses?.ciudad && `, ${tournament.courses.ciudad}`}
                    </span>
                  </div>
                )}
                {tournament.date_start && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>📅</span>
                    <span style={{ fontSize: '14px', color: '#94a8c0' }}>{formatDate(tournament.date_start)}</span>
                  </div>
                )}
                {tournament.format && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>🏌️</span>
                    <span style={{ fontSize: '14px', color: '#94a8c0' }}>{formatLabel(tournament.format)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Player info card */}
            {profile && (
              <div
                style={{
                  background: 'rgba(14,28,47,0.92)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '14px',
                  padding: '24px',
                  marginBottom: '24px',
                }}
              >
                <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
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
                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#edeae4' }}>{profile.name}</div>
                    <div style={{ fontSize: '13px', color: '#94a8c0' }}>
                      {profile.indice != null
                        ? `Índice: ${Number(profile.indice).toFixed(1)}`
                        : 'Sin índice registrado'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action */}
            {alreadyRegistered ? (
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
                  style={{ fontSize: '13px', color: '#94a8c0', textDecoration: 'underline', textUnderlineOffset: '3px' }}
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
                  color: '#070d18',
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
