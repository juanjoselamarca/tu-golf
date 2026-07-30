'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Trophy } from '@/components/icons'
import { fetchTVBoardData, type TVTournamentInfo, type TVWithdrawnEntry } from '@/lib/data/tournaments/tvBoard'
import { buildLeaderboardFromLegacy } from '@/golf/leaderboard/build-from-legacy'
import { buildFallbackCourseHoles, sumParDedupByHole } from '@/lib/data/tournaments/leaderboard'
import { hasPlayData } from '@/golf/leaderboard/board-rules'
import type { TournamentLeaderboardContext } from '@/golf/leaderboard/types'

/* ── Types ─────────────────────────────────────────────── */
interface TVPlayer {
  id: string
  name: string
  handicap: number
  total_net: number
  holesPlayed: number
  netVsPar: number
  category: string
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
  const [tournament, setTournament] = useState<TVTournamentInfo | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [withdrawn,  setWithdrawn]  = useState<TVWithdrawnEntry[]>([])

  const fetchData = useCallback(async () => {
    const data = await fetchTVBoardData(createClient(), slug)
    if (!data) { setLoading(false); return }

    const { tournament: t, dbPlayers, courseHoles, withdrawn: wd } = data
    setTournament(t)
    setWithdrawn(wd)

    // El TV no calcula: delega en el MISMO motor que /torneo y /en-vivo. Antes
    // tenía su propio agregado (leía `rounds.total_net` almacenado y medía
    // contra el par de la vuelta completa), y por eso mostraba un ranking
    // distinto al de la landing durante la vuelta.
    const holes = courseHoles.length > 0 ? courseHoles : buildFallbackCourseHoles(t.hole_count)
    const ctx: TournamentLeaderboardContext = {
      parTotal: sumParDedupByHole(holes),
      totalHoyos: t.hole_count,
      modoJuego: t.modo_juego,
      formatoJuego: t.formato_juego,
      courseHoles: holes,
    }
    const board = buildLeaderboardFromLegacy(dbPlayers, ctx, t.total_rounds)

    setPlayers(
      board.playersByNeto.slice(0, 10).map((p) => ({
        id: p.id ?? p.name,
        name: p.name,
        handicap: p.hcpDisplay ?? p.hcp,
        total_net: p.netTotal ?? 0,
        holesPlayed: p.holes,
        netVsPar: p.total,
        category: p.cat && p.cat !== 'General' ? p.cat : '',
      })),
    )
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

      {/* El código del torneo NO se muestra al jugador: no existe pantalla para
          ingresarlo (media promesa). El camino de unirse es el link compartible.
          Decisión PM 2026-07-22. */}

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
              const color = hasPlayData({ holesPlayed: p.holesPlayed }) ? scoreColor(p.netVsPar) : '#94a8c0'
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
                      <div style={{ fontSize: '13px', color: '#94a8c0', marginTop: '2px' }}>{p.category}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: highlight ? '30px' : '24px', fontWeight: 700, color, fontFamily: '"Playfair Display", serif', lineHeight: 1 }}>
                      {hasPlayData({ holesPlayed: p.holesPlayed }) ? fmtVsPar(p.netVsPar) : '—'}
                    </div>
                    {hasPlayData({ holesPlayed: p.holesPlayed }) && (
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
