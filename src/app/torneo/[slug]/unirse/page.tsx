'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface PlayerRow {
  id: string
  user_id: string | null
  handicap_at_registration: number | null
  profiles: { name: string; indice: number | null } | null
}

export default function UnirsePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [loading, setLoading] = useState(true)
  const [tournamentName, setTournamentName] = useState('')
  const [tournamentId, setTournamentId] = useState('')
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)

  const supabase = createClient()

  const loadData = useCallback(async () => {
    // Check auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace(`/login?redirect=/torneo/${slug}/unirse`)
      return
    }
    setUserId(user.id)

    // Fetch tournament
    const { data: t, error: tErr } = await supabase
      .from('tournaments')
      .select('id, name')
      .eq('slug', slug)
      .single()

    if (tErr || !t) {
      setError('Torneo no encontrado')
      setLoading(false)
      return
    }
    setTournamentName(t.name)
    setTournamentId(t.id)

    // Fetch players with profiles
    const { data: p, error: pErr } = await supabase
      .from('players')
      .select('id, user_id, handicap_at_registration, profiles(name, indice)')
      .eq('tournament_id', t.id)

    if (pErr) {
      setError('Error al cargar jugadores')
      setLoading(false)
      return
    }

    setPlayers((p as unknown as PlayerRow[]) || [])
    setLoading(false)
  }, [slug, router, supabase])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const claimPlayer = async (playerId: string, playerName: string) => {
    if (!userId || claimingId) return
    setClaimingId(playerId)
    setError(null)

    const { error: upErr } = await supabase
      .from('players')
      .update({ user_id: userId })
      .eq('id', playerId)

    if (upErr) {
      setError('No se pudo reclamar este jugador. Intentá de nuevo.')
      setClaimingId(null)
      return
    }

    setConfirmed(playerName)
    setTimeout(() => {
      router.push(`/torneo/${slug}`)
    }, 1800)
  }

  // Confirmation overlay
  if (confirmed) {
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
          }}
        >
          ¡Listo, {confirmed}!
        </div>
        <div style={{ fontSize: '14px', color: '#94a8c0', marginTop: '8px' }}>
          Redirigiendo al torneo...
        </div>
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
      <div style={{ padding: '24px 20px 16px' }}>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#94a8c0',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '8px',
          }}
        >
          {tournamentName || 'Cargando...'}
        </div>
        <h1
          style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '24px',
            color: '#edeae4',
            fontWeight: 700,
            margin: 0,
          }}
        >
          ¿Cuál eres tú?
        </h1>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            margin: '0 20px 16px',
            background: 'rgba(220,50,50,0.12)',
            border: '1px solid rgba(220,50,50,0.3)',
            borderRadius: '12px',
            padding: '14px 16px',
            color: '#f87171',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a8c0', fontSize: '14px' }}>
          Cargando jugadores...
        </div>
      )}

      {/* Player list */}
      {!loading && players.length > 0 && (
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {players.map((p) => {
            const name = p.profiles?.name || 'Jugador'
            const hcp = p.handicap_at_registration ?? p.profiles?.indice ?? '-'
            const isMe = p.user_id === userId
            const isTaken = p.user_id != null && p.user_id !== userId
            const isClaiming = claimingId === p.id

            return (
              <button
                key={p.id}
                onClick={() => {
                  if (!isTaken && !isMe) claimPlayer(p.id, name)
                }}
                disabled={isTaken || isMe || !!claimingId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  height: '64px',
                  background: '#0e1c2f',
                  border: isMe
                    ? '1.5px solid rgba(196,153,42,0.6)'
                    : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '12px',
                  padding: '0 16px',
                  cursor: isTaken || isMe ? 'default' : 'pointer',
                  opacity: isTaken ? 0.4 : 1,
                  textAlign: 'left',
                }}
              >
                {/* Flag */}
                <span style={{ fontSize: '20px' }}>🇨🇱</span>

                {/* Name + handicap */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: '#edeae4',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a8c0' }}>
                    HCP {hcp}
                  </div>
                </div>

                {/* Status badge */}
                {isClaiming && (
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      border: '2px solid #c4992a',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                )}
                {isMe && (
                  <span
                    style={{
                      background: 'rgba(196,153,42,0.2)',
                      color: '#c4992a',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: '6px',
                    }}
                  >
                    TÚ
                  </span>
                )}
                {isTaken && !isMe && (
                  <span style={{ fontSize: '12px', color: '#94a8c0' }}>ocupado</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* No players */}
      {!loading && players.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a8c0', fontSize: '14px' }}>
          No hay jugadores inscritos en este torneo.
        </div>
      )}

      {/* Bottom link */}
      {!loading && (
        <div style={{ textAlign: 'center', padding: '28px 20px' }}>
          <Link
            href={`/torneo/${slug}`}
            style={{
              color: '#94a8c0',
              fontSize: '14px',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            Mi nombre no aparece
          </Link>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
