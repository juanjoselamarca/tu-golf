'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Trophy } from '@/components/icons'
import { fetchTVBoardData, type TVTournamentInfo, type TVWithdrawnEntry } from '@/lib/data/tournaments/tvBoard'
import { buildLeaderboardFromLegacy } from '@/golf/leaderboard/build-from-legacy'
import { parDeLaRondaDelTorneo } from '@/golf/core/course-handicap'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { hasPlayData } from '@/golf/leaderboard/board-rules'
import { captureError } from '@/lib/error-tracking'
import type { TournamentLeaderboardContext } from '@/golf/leaderboard/types'
import {
  scoreLabelFor,
  primaryScoreText,
  primaryScoreColor,
  secondaryScoreText,
} from './score-display'

/* ── Types ─────────────────────────────────────────────── */
interface TVPlayer {
  id: string
  name: string
  handicap: number
  holesPlayed: number
  category: string
  /** Score a par en la unidad del ranking (puntos en stableford). */
  vsPar: number
  grossTotal: number
  netTotal: number
  stablefordTotal: number
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

  const [allPlayers, setAllPlayers]  = useState<TVPlayer[]>([])
  const [tournament, setTournament] = useState<TVTournamentInfo | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [withdrawn,  setWithdrawn]  = useState<TVWithdrawnEntry[]>([])
  const [currentPage, setCurrentPage] = useState(0)

  const fetchData = useCallback(async () => {
    // Si la carga falla no se pinta nada nuevo: se deja el board anterior (o la
    // pantalla de "Cargando" en el primer intento) y se reintenta en 30s. Un
    // board con números viejos es recuperable; uno con el handicap degradado a
    // índice crudo se ve normal y miente en una pantalla pública.
    let data: Awaited<ReturnType<typeof fetchTVBoardData>>
    try {
      data = await fetchTVBoardData(createClient(), slug)
    } catch (e) {
      void captureError(e, { context: 'tv.fetchData', meta: { slug } })
      return
    }
    if (!data) { setLoading(false); return }

    const { tournament: t, dbPlayers, courseHoles, withdrawn: wd, hcp } = data
    setTournament(t)
    setWithdrawn(wd)

    // El TV no calcula: delega en el MISMO motor que /torneo y /en-vivo. Antes
    // tenía su propio agregado (leía `rounds.total_net` almacenado y medía
    // contra el par de la vuelta completa), y por eso mostraba un ranking
    // distinto al de la landing durante la vuelta.
    const holes = hoyosDeLaVuelta(courseHoles, t.hole_count)
    const ctx: TournamentLeaderboardContext = {
      // Fuente única compartida con /torneo, /en-vivo y el Resumen del
      // organizador. La suma cruda de `holes` no acotaba a los hoyos jugados:
      // un torneo de 9 sobre una cancha de 18 medía contra par 72.
      parTotal: parDeLaRondaDelTorneo(courseHoles, t.hole_count, t.par_total),
      totalHoyos: t.hole_count,
      modoJuego: t.modo_juego,
      formatoJuego: t.formato_juego,
      courseHoles: holes,
      // Golpes de handicap con la cuenta del scorer (course handicap por tee,
      // mitad en 9h). Sin esto la pantalla grande mostraba un neto distinto al
      // de la landing y al de la tarjeta del jugador.
      hcp,
    }
    const board = buildLeaderboardFromLegacy(dbPlayers, ctx, t.total_rounds)

    // Ranking PRIMARIO (el del modo/formato del torneo), no uno fijo por neto:
    // si el torneo se juega gross o stableford, un podio por neto en la pantalla
    // grande contradice al de la landing. Sin límite de 10: el ciclo de páginas
    // se encarga de paginar si hay más.
    setAllPlayers(
      board.players.map((p) => ({
        id: p.id ?? p.name,
        name: p.name,
        handicap: p.hcpDisplay ?? p.hcp,
        holesPlayed: p.holes,
        category: p.cat && p.cat !== 'General' ? p.cat : '',
        vsPar: p.total,
        grossTotal: p.grossTotal ?? 0,
        netTotal: p.netTotal ?? 0,
        stablefordTotal: p.stablefordTotal ?? 0,
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

  // Auto-refresh every 30s — pausa cuando el tab no es visible (ahorro de
  // bandwidth en TVs con pantalla en standby). Resume + fetch inmediato al volver.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (interval) clearInterval(interval)
      interval = setInterval(() => { fetchData() }, 30000)
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchData() // fetch inmediato al volver
        startPolling()
      } else {
        if (interval) { clearInterval(interval); interval = null }
      }
    }

    // Iniciar sólo si visible
    if (document.visibilityState === 'visible') startPolling()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (interval) clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchData])

  // Paginación: ciclo automático cada 8s si hay más de 10 jugadores
  const PAGE_SIZE = 10
  const totalPages = Math.max(1, Math.ceil(allPlayers.length / PAGE_SIZE))
  const players = allPlayers.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  useEffect(() => {
    if (totalPages <= 1) return
    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages)
    }, 8000)
    return () => clearInterval(interval)
  }, [totalPages])

  if (loading) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: 'var(--brand-on-bg)' }}>
          Cargando...
        </div>
      </div>
    )
  }

  const dateDisplay = tournament?.date_start
    ? new Date(tournament.date_start).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '40px 32px', position: 'relative' }}>

      {/* El código del torneo NO se muestra al jugador: no existe pantalla para
          ingresarlo (media promesa). El camino de unirse es el link compartible.
          Decisión PM 2026-07-22. */}

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', marginBottom: '16px' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '36px', color: 'var(--text)', fontWeight: 700 }}>Golfers</span>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '36px', color: 'var(--brand-gold)', fontWeight: 700 }}>+</span>
        </div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(28px, 4vw, 52px)', color: 'var(--text)', margin: '0 0 12px', lineHeight: 1.1 }}>
          {tournament?.name || 'Torneo'}
        </h1>
        <p style={{ fontSize: '18px', color: 'var(--text-2)', margin: 0 }}>
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
          <span style={{ fontSize: '13px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pos</span>
          <span style={{ fontSize: '13px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nombre</span>
          <span style={{ fontSize: '13px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>{tournament ? scoreLabelFor(tournament) : 'Score'}</span>
          <span style={{ fontSize: '13px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Hcp</span>
          <span style={{ fontSize: '13px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Hoyos</span>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.12)', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
          {players.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-2)', fontSize: '18px' }}>
              Sin jugadores con scores aún
            </div>
          ) : (
            players.map((p, idx) => {
              const played = hasPlayData({ holesPlayed: p.holesPlayed })
              const color = played && tournament
                ? primaryScoreColor(p, tournament)
                : '#94a8c0'
              const secundario = played && tournament ? secondaryScoreText(p, tournament) : null
              const highlight = idx === 0
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1fr 120px 80px 100px',
                    padding: '20px 24px',
                    borderBottom: '1px solid rgba(122,143,168,0.08)',
                    background: highlight ? 'rgba(196,153,42,0.08)' : 'transparent',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontSize: highlight ? '28px' : '22px', color: highlight ? 'var(--brand-on-bg)' : '#94a8c0', fontWeight: 700, fontFamily: '"Playfair Display", serif' }}>
                    {idx === 0 ? <Trophy size={22} strokeWidth={1.5} /> : idx + 1}
                  </div>
                  <div>
                    <div style={{ fontFamily: '"Playfair Display", serif', fontSize: highlight ? '26px' : '20px', color: 'var(--text)', fontWeight: 600, lineHeight: 1.2 }}>
                      {p.name}
                    </div>
                    {p.category && (
                      <div style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '2px' }}>{p.category}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: highlight ? '30px' : '24px', fontWeight: 700, color, fontFamily: '"Playfair Display", serif', lineHeight: 1 }}>
                      {played && tournament ? primaryScoreText(p, tournament) : '—'}
                    </div>
                    {secundario !== null && (
                      <div style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '2px' }}>{secundario}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '18px', color: 'var(--text-2)' }}>
                    {p.handicap}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '16px', color: 'var(--text-2)' }}>
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
              color: 'var(--text-3)',
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
                  <span style={{ color: 'var(--text)', fontWeight: 500 }}>{wp.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Indicador de página */}
        {totalPages > 1 && (
          <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <span
                key={i}
                style={{
                  width: currentPage === i ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: currentPage === i ? 'var(--brand-gold)' : 'rgba(148,168,192,0.3)',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
            <span style={{ marginLeft: '8px', fontSize: '13px', color: 'var(--text-2)' }}>
              {currentPage + 1}/{totalPages}
            </span>
          </div>
        )}

        {/* Footer — solo info de actualización, sin branding del sitio web */}
        <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-2)', fontSize: '14px' }}>
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
