'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/* ── Types ─────────────────────────────────────────────── */
interface TVPlayer {
  id: string
  name: string
  handicap: number
  total_net: number
  total_gross: number
  holesPlayed: number
  netVsPar: number
  category: string
}

interface TournamentInfo {
  name: string
  course_name: string
  par_total: number
  date_start: string | null
}

/* ── Score helpers ─────────────────────────────────────── */
const scoreColor = (diff: number): string => {
  if (diff <= -2) return '#3b82f6'
  if (diff === -1) return '#22c55e'
  if (diff === 0)  return '#edeae4'
  if (diff === 1)  return '#c4992a'
  return '#dc2626'
}

const fmtVsPar = (n: number): string => {
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : String(n)
}

interface DBPlayerRaw {
  id: string
  handicap_at_registration: number | null
  profiles: { name: string } | null
  categories: { name: string } | null
  rounds: {
    total_net: number
    total_gross: number
    hole_scores: { hole_number: number; gross_score: number | null }[]
  }[]
}

interface DBTournamentRaw {
  name: string
  date_start: string | null
  courses: { nombre: string; par_total: number } | null
}

export default function TVPage() {
  const params = useParams()
  const slug   = params.slug as string

  const [players,    setPlayers]    = useState<TVPlayer[]>([])
  const [tournament, setTournament] = useState<TournamentInfo | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    const { data: rawT } = await supabase
      .from('tournaments')
      .select('name, date_start, courses(nombre, par_total)')
      .eq('slug', slug)
      .single()

    if (!rawT) { setLoading(false); return }

    const t = rawT as unknown as DBTournamentRaw
    const parTotal = t.courses?.par_total ?? 72

    setTournament({
      name: t.name,
      course_name: t.courses?.nombre ?? '',
      par_total: parTotal,
      date_start: t.date_start,
    })

    // Get tournament id
    const { data: rawId } = await supabase
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!rawId) { setLoading(false); return }
    const tournamentId = (rawId as { id: string }).id

    const { data: rawPlayers } = await supabase
      .from('players')
      .select(`
        id, handicap_at_registration,
        profiles(name),
        categories(name),
        rounds(total_net, total_gross, hole_scores(hole_number, gross_score))
      `)
      .eq('tournament_id', tournamentId)

    const dbPlayers = (rawPlayers as unknown as DBPlayerRaw[]) || []

    const mapped: TVPlayer[] = dbPlayers
      .filter((p) => p.rounds?.length > 0)
      .map((p) => {
        const round        = p.rounds[0]
        const holesPlayed  = (round.hole_scores || []).filter((hs) => hs.gross_score != null).length
        const netVsPar     = holesPlayed > 0 ? round.total_net - parTotal : 0

        return {
          id:          p.id,
          name:        p.profiles?.name || 'Jugador',
          handicap:    p.handicap_at_registration ?? 0,
          total_net:   round.total_net,
          total_gross: round.total_gross,
          holesPlayed,
          netVsPar,
          category:    p.categories?.name || '',
        }
      })
      .sort((a, b) => {
        if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0
        if (a.holesPlayed === 0) return 1
        if (b.holesPlayed === 0) return -1
        return a.total_net - b.total_net
      })
      .slice(0, 10)

    setPlayers(mapped)
    setLastUpdate(new Date())
    setLoading(false)
  }, [slug])

  // Initial load
  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => { fetchData() }, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: '#c4992a' }}>
          Cargando...
        </div>
      </div>
    )
  }

  const dateDisplay = tournament?.date_start
    ? new Date(tournament.date_start).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <div style={{ background: '#070d18', minHeight: '100vh', padding: '40px 32px' }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '16px' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '36px', color: '#edeae4', fontWeight: 700 }}>Tu</span>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '36px', color: '#c4992a', fontWeight: 700 }}> Golf</span>
        </div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(28px, 4vw, 52px)', color: '#edeae4', margin: '0 0 12px', lineHeight: 1.1 }}>
          {tournament?.name || 'Torneo'}
        </h1>
        <p style={{ fontSize: '18px', color: '#7a8fa8', margin: 0 }}>
          {tournament?.course_name}
          {dateDisplay && ` · ${dateDisplay}`}
          {tournament && ` · Par ${tournament.par_total}`}
        </p>
      </div>

      {/* ── Top 10 Table ─────────────────────────────────── */}
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '60px 1fr 120px 80px 100px',
          padding: '14px 24px',
          background: 'rgba(196,153,42,0.08)',
          border: '1px solid rgba(196,153,42,0.2)',
          borderRadius: '10px 10px 0 0',
          marginBottom: '2px',
        }}>
          <span style={{ fontSize: '13px', color: '#7a8fa8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pos</span>
          <span style={{ fontSize: '13px', color: '#7a8fa8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nombre</span>
          <span style={{ fontSize: '13px', color: '#7a8fa8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Score (net)</span>
          <span style={{ fontSize: '13px', color: '#7a8fa8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Hcp</span>
          <span style={{ fontSize: '13px', color: '#7a8fa8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Hoyos</span>
        </div>

        <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.12)', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
          {players.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#7a8fa8', fontSize: '18px' }}>
              Sin jugadores con scores aún
            </div>
          ) : (
            players.map((p, idx) => {
              const color = p.holesPlayed > 0 ? scoreColor(p.netVsPar) : '#7a8fa8'
              const highlight = idx === 0
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1fr 120px 80px 100px',
                    padding: '20px 24px',
                    borderBottom: '1px solid rgba(122,143,168,0.08)',
                    background: highlight ? 'rgba(196,153,42,0.06)' : 'transparent',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontSize: highlight ? '28px' : '22px', color: highlight ? '#c4992a' : '#7a8fa8', fontWeight: 700, fontFamily: '"Playfair Display", serif' }}>
                    {idx === 0 ? '🏆' : idx + 1}
                  </div>
                  <div>
                    <div style={{ fontFamily: '"Playfair Display", serif', fontSize: highlight ? '26px' : '20px', color: '#edeae4', fontWeight: 600, lineHeight: 1.2 }}>
                      {p.name}
                    </div>
                    {p.category && (
                      <div style={{ fontSize: '13px', color: '#7a8fa8', marginTop: '2px' }}>Cat. {p.category}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: highlight ? '30px' : '24px', fontWeight: 700, color, fontFamily: '"Playfair Display", serif', lineHeight: 1 }}>
                      {p.holesPlayed > 0 ? fmtVsPar(p.netVsPar) : '—'}
                    </div>
                    {p.holesPlayed > 0 && (
                      <div style={{ fontSize: '13px', color: '#7a8fa8', marginTop: '2px' }}>{p.total_net}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '18px', color: '#7a8fa8' }}>
                    {p.handicap}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '16px', color: '#7a8fa8' }}>
                    {p.holesPlayed}/18
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '32px', textAlign: 'center', color: '#7a8fa8', fontSize: '14px' }}>
          Actualizado: {lastUpdate.toLocaleTimeString('es-CL')} &nbsp;·&nbsp; Auto-refresca cada 30s
        </div>
      </div>
    </div>
  )
}
