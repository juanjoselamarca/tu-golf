'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Trophy } from '@/components/icons'

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
  codigo: string | null
  total_rounds: number
  hole_count: number
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
  codigo: string | null
  total_rounds: number | null
  hole_count: number | null
  courses: { nombre: string; par_total: number } | null
}

const TV_KEYFRAMES = `
@keyframes tvPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`

export default function TVPage() {
  const params = useParams()
  const slug   = params.slug as string

  const [players,    setPlayers]    = useState<TVPlayer[]>([])
  const [tournament, setTournament] = useState<TournamentInfo | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [withdrawn,  setWithdrawn]  = useState<Array<{ name: string; status: 'withdrawn' | 'disqualified'; reason: string | null }>>([])

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    const { data: rawT } = await supabase
      .from('tournaments')
      .select('name, date_start, codigo, total_rounds, hole_count, courses(nombre, par_total)')
      .eq('slug', slug)
      .single()

    if (!rawT) { setLoading(false); return }

    const t = rawT as unknown as DBTournamentRaw
    const parTotal = t.courses?.par_total ?? 72
    const totalRounds = t.total_rounds ?? 1

    setTournament({
      name: t.name,
      course_name: t.courses?.nombre ?? '',
      par_total: parTotal,
      date_start: t.date_start,
      codigo: t.codigo ?? null,
      total_rounds: totalRounds,
      hole_count: t.hole_count ?? 18,
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
      .in('status', ['pending', 'approved', 'waitlist'])

    // WD/DQ en paralelo — footer del TV con badge
    const { data: rawWithdrawn } = await supabase
      .from('players')
      .select('status, status_reason, profiles(name)')
      .eq('tournament_id', tournamentId)
      .in('status', ['withdrawn', 'disqualified'])
    setWithdrawn(
      ((rawWithdrawn as unknown) as Array<{ status: 'withdrawn' | 'disqualified'; status_reason: string | null; profiles: { name: string } | null }> | null)
        ?.filter(p => p.profiles?.name)
        .map(p => ({ name: p.profiles!.name, status: p.status, reason: p.status_reason })) || []
    )

    const dbPlayers = (rawPlayers as unknown as DBPlayerRaw[]) || []

    const mapped: TVPlayer[] = dbPlayers
      .filter((p) => p.rounds?.length > 0)
      .map((p) => {
        // Aggregate across all rounds (multi-round tournaments)
        const totalNet   = p.rounds.reduce((sum, r) => sum + r.total_net, 0)
        const totalGross = p.rounds.reduce((sum, r) => sum + r.total_gross, 0)
        const holesPlayed = p.rounds.reduce(
          (sum, r) => sum + (r.hole_scores || []).filter((hs) => hs.gross_score != null).length,
          0,
        )
        const roundsPlayed = p.rounds.length
        const netVsPar     = holesPlayed > 0 ? totalNet - (parTotal * roundsPlayed) : 0

        return {
          id:          p.id,
          name:        p.profiles?.name || 'Jugador',
          handicap:    p.handicap_at_registration ?? 0,
          total_net:   totalNet,
          total_gross: totalGross,
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

  // Inject keyframes
  useEffect(() => {
    const id = 'tv-keyframes'
    if (typeof document !== 'undefined' && !document.getElementById(id)) {
      const style = document.createElement('style')
      style.id = id
      style.textContent = TV_KEYFRAMES
      document.head.appendChild(style)
    }
  }, [])

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
    <div style={{ background: '#070d18', minHeight: '100vh', padding: '40px 32px', position: 'relative' }}>

      {/* ── Codigo badge (top-right) ────────────────────── */}
      {tournament?.codigo && (
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '24px',
          background: 'rgba(196,153,42,0.12)',
          border: '1px solid rgba(196,153,42,0.3)',
          borderRadius: '10px',
          padding: '10px 16px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '10px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            Código para unirse
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '22px', fontWeight: 700, color: '#c4992a', letterSpacing: '0.15em' }}>
            {tournament.codigo}
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '16px' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '36px', color: '#edeae4', fontWeight: 700 }}>Tu</span>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '36px', color: '#c4992a', fontWeight: 700 }}> Golf</span>
        </div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(28px, 4vw, 52px)', color: '#edeae4', margin: '0 0 12px', lineHeight: 1.1 }}>
          {tournament?.name || 'Torneo'}
        </h1>
        <p style={{ fontSize: '18px', color: '#94a8c0', margin: 0 }}>
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
          <span style={{ fontSize: '13px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pos</span>
          <span style={{ fontSize: '13px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nombre</span>
          <span style={{ fontSize: '13px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Score (net)</span>
          <span style={{ fontSize: '13px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Hcp</span>
          <span style={{ fontSize: '13px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Hoyos</span>
        </div>

        <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.12)', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
          {players.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a8c0', fontSize: '18px' }}>
              Sin jugadores con scores aún
            </div>
          ) : (
            players.map((p, idx) => {
              const color = p.holesPlayed > 0 ? scoreColor(p.netVsPar) : '#94a8c0'
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
                  <div style={{ fontSize: highlight ? '28px' : '22px', color: highlight ? '#c4992a' : '#94a8c0', fontWeight: 700, fontFamily: '"Playfair Display", serif' }}>
                    {idx === 0 ? <Trophy size={22} strokeWidth={1.5} /> : idx + 1}
                  </div>
                  <div>
                    <div style={{ fontFamily: '"Playfair Display", serif', fontSize: highlight ? '26px' : '20px', color: '#edeae4', fontWeight: 600, lineHeight: 1.2 }}>
                      {p.name}
                    </div>
                    {p.category && (
                      <div style={{ fontSize: '13px', color: '#94a8c0', marginTop: '2px' }}>Cat. {p.category}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: highlight ? '30px' : '24px', fontWeight: 700, color, fontFamily: '"Playfair Display", serif', lineHeight: 1 }}>
                      {p.holesPlayed > 0 ? fmtVsPar(p.netVsPar) : '—'}
                    </div>
                    {p.holesPlayed > 0 && (
                      <div style={{ fontSize: '13px', color: '#94a8c0', marginTop: '2px' }}>{p.total_net}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '18px', color: '#94a8c0' }}>
                    {p.handicap}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '16px', color: '#94a8c0' }}>
                    {p.holesPlayed}/{(tournament?.hole_count ?? 18) * (tournament?.total_rounds ?? 1)}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* WD/DQ section — transparencia USGA en TV mode */}
        {withdrawn.length > 0 && (
          <div style={{
            marginTop: '32px',
            background: 'rgba(30,41,59,0.5)',
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: '16px',
            padding: '20px 28px',
          }}>
            <div style={{
              fontSize: '14px',
              color: '#94a3b8',
              fontFamily: '"DM Mono", ui-monospace, monospace',
              letterSpacing: '0.12em',
              textTransform: 'uppercase' as const,
              fontWeight: 700,
              marginBottom: '14px',
            }}>
              No compiten por posición
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '12px 24px' }}>
              {withdrawn.map((wp, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '18px' }}>
                  <span style={{
                    background: wp.status === 'disqualified' ? 'rgba(239,68,68,0.2)' : 'rgba(148,163,184,0.2)',
                    color: wp.status === 'disqualified' ? '#fca5a5' : '#cbd5e1',
                    fontSize: '12px',
                    fontWeight: 700,
                    fontFamily: '"DM Mono", ui-monospace, monospace',
                    letterSpacing: '0.1em',
                    padding: '4px 10px',
                    borderRadius: '999px',
                  }}>
                    {wp.status === 'disqualified' ? 'DQ' : 'WD'}
                  </span>
                  <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{wp.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#94a8c0', fontSize: '14px' }}>
          <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#22c55e',
            animation: 'tvPulse 2s ease-in-out infinite',
          }} />
          <span>Auto-actualización cada 30s</span>
          <span>&nbsp;·&nbsp;</span>
          <span>Actualizado: {lastUpdate.toLocaleTimeString('es-CL')}</span>
        </div>
      </div>
    </div>
  )
}
