'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

/* ── Types ─────────────────────────────────────────────── */
interface Jugador {
  id: string
  nombre: string
  user_id: string | null
  scores: Record<string, number>
}

interface RondaLibre {
  id: string
  codigo: string
  course_name: string
  tees: string
  holes: number
  fecha: string
  estado: string
  ronda_libre_jugadores: Jugador[]
}

/* ── Score helpers ─────────────────────────────────────── */
const scoreColor = (diff: number): string => {
  if (diff <= -2) return '#3b82f6'
  if (diff === -1) return '#22c55e'
  if (diff === 0)  return '#edeae4'
  if (diff === 1)  return '#c4992a'
  return '#dc2626'
}

const DEFAULT_PAR = 4

function computePlayerTotals(jugador: Jugador, holes: number): { gross: number; vsPar: number; holesPlayed: number } {
  let gross = 0, vsPar = 0, holesPlayed = 0
  for (let h = 1; h <= holes; h++) {
    const s = jugador.scores[String(h)] ?? jugador.scores[h]
    if (s != null) {
      gross += s
      vsPar += s - DEFAULT_PAR
      holesPlayed++
    }
  }
  return { gross, vsPar, holesPlayed }
}

export default function RondaLibrePage() {
  const params = useParams()
  const codigo = params.codigo as string

  const [ronda,     setRonda]     = useState<RondaLibre | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)
  const [countdown, setCountdown] = useState(15)
  const [copied,    setCopied]    = useState(false)

  const fetchRonda = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('rondas_libres')
      .select('id, codigo, course_name, tees, holes, fecha, estado, ronda_libre_jugadores(id, nombre, user_id, scores)')
      .eq('codigo', codigo)
      .single()

    if (!data) {
      setNotFound(true)
    } else {
      setRonda(data as unknown as RondaLibre)
    }
    setLoading(false)
  }, [codigo])

  // Initial load
  useEffect(() => { fetchRonda() }, [fetchRonda])

  // Polling every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRonda()
      setCountdown(15)
    }, 15000)
    return () => clearInterval(interval)
  }, [fetchRonda])

  // Countdown
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 15 : c - 1))
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  const handleCopy = () => {
    const url = `${window.location.origin}/ronda-libre/${codigo}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a8fa8' }}>
        Cargando ronda...
      </div>
    )
  }

  if (notFound || !ronda) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '64px' }}>🏌️</div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#edeae4', textAlign: 'center' }}>
          Ronda no encontrada
        </h1>
        <p style={{ color: '#7a8fa8', textAlign: 'center' }}>El código {codigo} no existe o fue eliminada.</p>
        <Link href="/dashboard" style={{ color: '#c4992a', textDecoration: 'none', fontSize: '14px' }}>← Volver al dashboard</Link>
      </div>
    )
  }

  const fechaDisplay = ronda.fecha
    ? new Date(ronda.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

  const isEnCurso = ronda.estado === 'en_curso'

  // Sort players by total score (fewer strokes = better)
  const sortedJugadores = [...ronda.ronda_libre_jugadores]
    .map((j) => ({ ...j, ...computePlayerTotals(j, ronda.holes) }))
    .sort((a, b) => {
      if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0
      if (a.holesPlayed === 0) return 1
      if (b.holesPlayed === 0) return -1
      return a.gross - b.gross
    })

  return (
    <div style={{ background: '#070d18', minHeight: '100vh' }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '20px 16px' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: '#edeae4', margin: '0 0 8px' }}>
                🏌️ Ronda Libre
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  background: isEnCurso ? 'rgba(34,197,94,0.12)' : 'rgba(122,143,168,0.12)',
                  color: isEnCurso ? '#22c55e' : '#7a8fa8',
                  border: `1px solid ${isEnCurso ? 'rgba(34,197,94,0.3)' : 'rgba(122,143,168,0.3)'}`,
                  padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                }}>
                  {isEnCurso ? '● EN CURSO' : '✓ FINALIZADA'}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: '#7a8fa8' }}>
                {ronda.course_name} · {fechaDisplay}
              </div>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>
                Código: <span style={{ fontFamily: 'monospace', color: '#c4992a', fontWeight: 700, fontSize: '14px' }}>{ronda.codigo}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Leaderboard ─────────────────────────────────── */}
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px' }}>

        <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.12)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 70px', padding: '10px 16px', background: 'rgba(196,153,42,0.05)', borderBottom: '1px solid rgba(196,153,42,0.1)' }}>
            <span style={{ fontSize: '11px', color: '#7a8fa8', textTransform: 'uppercase' }}>#</span>
            <span style={{ fontSize: '11px', color: '#7a8fa8', textTransform: 'uppercase' }}>Jugador</span>
            <span style={{ fontSize: '11px', color: '#7a8fa8', textTransform: 'uppercase', textAlign: 'center' }}>Score</span>
            <span style={{ fontSize: '11px', color: '#7a8fa8', textTransform: 'uppercase', textAlign: 'right' }}>Hoyos</span>
          </div>

          {sortedJugadores.map((j, idx) => {
            const color = j.holesPlayed > 0 ? scoreColor(j.vsPar) : '#7a8fa8'
            const vsParStr = j.holesPlayed > 0
              ? j.vsPar === 0 ? 'E' : j.vsPar > 0 ? `+${j.vsPar}` : String(j.vsPar)
              : '—'

            // Mini scorecard colors
            const holeNumbers = Array.from({ length: ronda.holes }, (_, i) => i + 1)

            return (
              <div key={j.id} style={{ borderBottom: '1px solid rgba(122,143,168,0.07)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 70px', padding: '12px 16px', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#7a8fa8', fontWeight: 600 }}>{idx + 1}</span>
                  <span style={{ fontSize: '15px', color: '#edeae4', fontWeight: 600 }}>{j.nombre}</span>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '16px', fontWeight: 700, color }}>
                      {j.holesPlayed > 0 ? j.gross : '—'}
                    </span>
                    <span style={{ fontSize: '12px', color, marginLeft: '5px' }}>{vsParStr}</span>
                  </div>
                  <span style={{ fontSize: '13px', color: '#7a8fa8', textAlign: 'right' }}>
                    {j.holesPlayed}/{ronda.holes}
                  </span>
                </div>

                {/* Mini scorecard */}
                {j.holesPlayed > 0 && (
                  <div style={{ padding: '0 16px 10px', display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                    {holeNumbers.map((h) => {
                      const s = j.scores[String(h)] ?? j.scores[h]
                      const diff = s != null ? s - DEFAULT_PAR : null
                      return (
                        <div
                          key={h}
                          style={{
                            minWidth: '24px',
                            textAlign: 'center',
                            background: diff != null ? `${scoreColor(diff)}22` : 'rgba(7,13,24,0.4)',
                            borderRadius: '4px',
                            padding: '3px 2px',
                            border: `1px solid ${diff != null ? scoreColor(diff) + '44' : 'transparent'}`,
                          }}
                        >
                          <div style={{ fontSize: '9px', color: '#7a8fa8' }}>{h}</div>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: diff != null ? scoreColor(diff) : '#3a4a5a' }}>
                            {s ?? '—'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Countdown */}
        <div style={{ textAlign: 'center', color: '#7a8fa8', fontSize: '12px', marginBottom: '20px' }}>
          ↻ Actualiza en {countdown}s
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
          <Link
            href={`/ronda-libre/${codigo}/score`}
            style={{ display: 'block', background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '15px', padding: '14px', borderRadius: '10px', textDecoration: 'none', textAlign: 'center' }}
          >
            Ingresar mi score
          </Link>
          <button
            onClick={handleCopy}
            style={{ background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.3)', color: '#c4992a', fontWeight: 600, fontSize: '15px', padding: '14px', borderRadius: '10px', cursor: 'pointer' }}
          >
            {copied ? '✓ Link copiado' : 'Copiar link'}
          </button>
        </div>
      </div>
    </div>
  )
}
