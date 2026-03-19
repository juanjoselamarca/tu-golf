'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getScoreColor, formatOverUnder } from '@/constants/golf'
import GWILeaderboard from '@/components/GWILeaderboard'
import { calcularGWI } from '@/lib/gwi'
import type { JugadorGWIInput, GWIResult } from '@/lib/gwi'
import type { ModoJuego } from '@/lib/scoring'

/* ── Types ──────────────────────────────────────────────────────────────── */
interface Jugador {
  id: string
  nombre: string
  user_id: string | null
  scores: Record<string, number>
}

interface CourseHole {
  numero: number
  par: number
  stroke_index: number
}

interface RondaLibre {
  id:                    string
  codigo:                string
  course_name:           string
  course_id:             string | null
  tees:                  string
  holes:                 number
  fecha:                 string
  estado:                string
  modo_juego:            ModoJuego
  ronda_libre_jugadores: Jugador[]
}

type Role = 'espectador' | 'jugador' | null
type TimelineEvent = {
  jugador: string
  hole: number
  score: number
  diff: number
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
const SS_KEY = (codigo: string) => `ronda-${codigo}-role`

function getVsPar(scores: Record<string, number>, holes: number, parMap: Record<number, number>): number {
  let total = 0
  for (let h = 1; h <= holes; h++) {
    const s = scores[String(h)] ?? scores[h]
    if (s != null) total += s - (parMap[h] ?? 4)
  }
  return total
}

function getHolesPlayed(scores: Record<string, number>, holes: number): number {
  let count = 0
  for (let h = 1; h <= holes; h++) {
    if ((scores[String(h)] ?? scores[h]) != null) count++
  }
  return count
}

function buildTimelineEvents(
  jugadores: Jugador[],
  holes: number,
  parMap: Record<number, number>
): TimelineEvent[] {
  return jugadores
    .map((jugador) => {
      for (let h = holes; h >= 1; h--) {
        const score = jugador.scores[String(h)] ?? jugador.scores[h]
        if (score != null) {
          const par = parMap[h] ?? 4
          return { jugador: jugador.nombre, hole: h, score, diff: score - par }
        }
      }
      return null
    })
    .filter((event): event is TimelineEvent => event !== null)
    .sort((a, b) => b.hole - a.hole)
    .slice(0, 4)
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function RondaLibrePage() {
  const params  = useParams()
  const router  = useRouter()
  const codigo  = params.codigo as string

  const [ronda,       setRonda]       = useState<RondaLibre | null>(null)
  const [parMap,      setParMap]      = useState<Record<number, number>>({})
  const [loading,     setLoading]     = useState(true)
  const [notFound,    setNotFound]    = useState(false)
  const [role,        setRole]        = useState<Role>(null)
  const [selectedJ,   setSelectedJ]   = useState<string>('')
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [countdown,   setCountdown]   = useState(15)
  const [copied,      setCopied]      = useState(false)
  const [gwiInputs,   setGwiInputs]   = useState<JugadorGWIInput[]>([])
  const [_gwiResults, setGwiResults]  = useState<GWIResult[]>([])

  /* ── Fetch GWI ── */
  const fetchGWI = useCallback(async () => {
    try {
      const res = await fetch(`/api/gwi/ronda-libre/${codigo}`)
      if (!res.ok) return
      const json = await res.json()
      if (json.inputs) {
        setGwiInputs(json.inputs)
        setGwiResults(calcularGWI(json.inputs, json.totalHoyos))
      }
    } catch {}
  }, [codigo])

  /* ── Fetch ronda ── */
  const fetchRonda = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('rondas_libres')
      .select('id, codigo, course_name, course_id, tees, holes, fecha, estado, modo_juego, ronda_libre_jugadores(id, nombre, user_id, scores)')
      .eq('codigo', codigo)
      .single()

    if (!data) {
      setNotFound(true)
    } else {
      setRonda(data as unknown as RondaLibre)
      // Fetch hole pars if course linked
      if ((data as unknown as RondaLibre).course_id) {
        const { data: holes } = await supabase
          .from('course_holes')
          .select('numero, par, stroke_index')
          .eq('course_id', (data as unknown as RondaLibre).course_id)
          .order('numero')
        if (holes) {
          const pm: Record<number, number> = {}
          ;(holes as CourseHole[]).forEach(h => { pm[h.numero] = h.par })
          setParMap(pm)
        }
      }
    }
    setLoading(false)
  }, [codigo])

  useEffect(() => { fetchRonda() }, [fetchRonda])

  // Restore role from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem(SS_KEY(codigo))
    if (saved === 'espectador' || saved === 'jugador') setRole(saved)
  }, [codigo])

  // Polling every 15s (spectator only)
  useEffect(() => {
    if (role !== 'espectador') return
    fetchGWI()
    const interval = setInterval(() => { fetchRonda(); fetchGWI(); setCountdown(15) }, 15000)
    return () => clearInterval(interval)
  }, [fetchRonda, fetchGWI, role])

  // Countdown tick
  useEffect(() => {
    if (role !== 'espectador') return
    const tick = setInterval(() => setCountdown(c => c <= 1 ? 15 : c - 1), 1000)
    return () => clearInterval(tick)
  }, [role])

  /* ── Handlers ── */
  const chooseRole = (r: Role) => {
    if (!r) return
    sessionStorage.setItem(SS_KEY(codigo), r)
    setRole(r)
    if (r === 'espectador') setCountdown(15)
  }

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/ronda-libre/${codigo}` : ''
  const shareText = ronda ? `Sigue mi ronda en ${ronda.course_name} en vivo` : 'Sigue la ronda en vivo'

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Golfers+ — Ronda en vivo', text: shareText, url: shareUrl })
      } catch { /* user cancelled */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`, '_blank')
    }
  }

  const handleGoScore = () => {
    if (!selectedJ) return
    router.push(`/ronda-libre/${codigo}/score?j=${selectedJ}`)
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a8c0', fontFamily: 'DM Sans, sans-serif' }}>
        Cargando ronda...
      </div>
    )
  }

  /* ── Not found ── */
  if (notFound || !ronda) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ fontSize: '64px' }}>🏌️</div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#edeae4', textAlign: 'center' }}>
          Ronda no encontrada
        </h1>
        <p style={{ color: '#94a8c0', textAlign: 'center' }}>El código <strong style={{ color: '#c4992a' }}>{codigo}</strong> no existe o fue eliminado.</p>
        <Link href="/dashboard" style={{ color: '#c4992a', textDecoration: 'none', fontSize: '14px' }}>← Volver al dashboard</Link>
      </div>
    )
  }

  const fechaDisplay = ronda.fecha
    ? new Date(ronda.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

  const isEnCurso = ronda.estado === 'en_curso'
  const hasCourse = Object.keys(parMap).length > 0
  const timelineEvents = buildTimelineEvents(ronda.ronda_libre_jugadores, ronda.holes, parMap)

  // Sorted leaderboard
  const leaderboard = [...ronda.ronda_libre_jugadores]
    .map(j => ({
      ...j,
      vsPar:       getVsPar(j.scores, ronda.holes, parMap),
      holesPlayed: getHolesPlayed(j.scores, ronda.holes),
    }))
    .sort((a, b) => {
      if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0
      if (a.holesPlayed === 0) return 1
      if (b.holesPlayed === 0) return -1
      return a.vsPar - b.vsPar
    })

  /* ─────────────────────────────────────────────────────────────────────── */
  /* ── WELCOME SCREEN ─────────────────────────────────────────────────── */
  /* ─────────────────────────────────────────────────────────────────────── */
  if (!role) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'DM Sans, sans-serif' }}>
        {/* Header */}
        <div style={{ background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '24px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '10px' }}>⛳</div>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '26px', color: '#edeae4', margin: '0 0 6px' }}>
            Ronda Libre
          </h1>
          <p style={{ color: '#94a8c0', fontSize: '14px', margin: 0 }}>
            {ronda.course_name} · {fechaDisplay}
          </p>
          <div style={{
            marginTop: '12px',
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            background: 'rgba(196,153,42,0.08)',
            border: '1px solid rgba(196,153,42,0.25)',
            borderRadius: '10px',
            padding: '8px 18px',
          }}>
            <span style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Codigo</span>
            <span style={{ fontFamily: 'monospace', color: '#c4992a', fontWeight: 700, fontSize: '22px', letterSpacing: '3px' }}>
              {ronda.codigo}
            </span>
          </div>
        </div>

        {/* Role selection */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', gap: '16px' }}>
          <div
            style={{
              width: '100%',
              maxWidth: '360px',
              background: 'rgba(14,28,47,0.9)',
              border: '1px solid rgba(196,153,42,0.16)',
              borderRadius: '16px',
              padding: '18px 18px 16px',
              marginBottom: '4px',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estado</div>
                <div style={{ fontSize: '14px', color: isEnCurso ? '#22c55e' : '#edeae4', fontWeight: 700 }}>
                  {isEnCurso ? 'En vivo ahora' : 'Ronda finalizada'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Jugadores</div>
                <div style={{ fontSize: '14px', color: '#edeae4', fontWeight: 700 }}>
                  {ronda.ronda_libre_jugadores.length}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recorrido</div>
                <div style={{ fontSize: '14px', color: '#edeae4', fontWeight: 700 }}>
                  {ronda.holes} hoyos
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Modo</div>
                <div style={{ fontSize: '14px', color: '#c4992a', fontWeight: 700, textTransform: 'capitalize' }}>
                  {ronda.modo_juego === 'stableford' ? 'Stableford' : ronda.modo_juego === 'neto' ? 'Neto' : 'Gross'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tees</div>
                <div style={{ fontSize: '14px', color: '#edeae4', fontWeight: 700, textTransform: 'capitalize' }}>
                  {ronda.tees}
                </div>
              </div>
            </div>
          </div>
          <p style={{ color: '#94a8c0', fontSize: '15px', marginBottom: '8px', textAlign: 'center' }}>
            ¿Cómo quieres unirte a esta ronda?
          </p>

          {/* M4: welcome buttons 80px, 20px font */}
          <button
            onClick={() => chooseRole('jugador')}
            style={{
              width: '100%', maxWidth: '360px', minHeight: '80px',
              background: '#c4992a', color: '#070d18',
              border: 'none', borderRadius: '16px',
              padding: '20px 24px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '20px',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: '32px', flexShrink: 0 }}>🏌️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '20px', marginBottom: '4px' }}>Soy jugador</div>
              <div style={{ fontSize: '14px', opacity: 0.8 }}>Ingresaré mi propio score</div>
            </div>
          </button>

          <button
            onClick={() => chooseRole('espectador')}
            style={{
              width: '100%', maxWidth: '360px', minHeight: '80px',
              background: 'rgba(14,28,47,0.8)', color: '#edeae4',
              border: '1px solid rgba(196,153,42,0.3)', borderRadius: '16px',
              padding: '20px 24px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '20px',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: '32px', flexShrink: 0 }}>👁</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '20px', marginBottom: '4px' }}>Solo ver</div>
              <div style={{ fontSize: '14px', color: '#94a8c0' }}>Seguiré el marcador en vivo</div>
            </div>
          </button>

          {/* Player count hint */}
          {ronda.ronda_libre_jugadores.length > 0 && (
            <p style={{ color: '#94a8c0', fontSize: '13px', marginTop: '8px', textAlign: 'center' }}>
              {ronda.ronda_libre_jugadores.length} jugador{ronda.ronda_libre_jugadores.length !== 1 ? 'es' : ''} en esta ronda
            </p>
          )}

          {/* WhatsApp share on welcome */}
          <button
            onClick={handleShare}
            style={{
              width: '100%', maxWidth: '360px', minHeight: '48px',
              marginTop: '8px',
              background: 'rgba(37,211,102,0.12)',
              border: '1px solid rgba(37,211,102,0.3)',
              color: '#25D366',
              borderRadius: '12px',
              padding: '12px 20px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Compartir por WhatsApp
          </button>
        </div>
      </div>
    )
  }

  /* ─────────────────────────────────────────────────────────────────────── */
  /* ── SHARED HEADER ──────────────────────────────────────────────────── */
  /* ─────────────────────────────────────────────────────────────────────── */
  const sharedHeader = (
    <div style={{ background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '16px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#edeae4', margin: '0 0 4px' }}>
              {role === 'espectador' ? 'Marcador en vivo' : 'Unirse a la ronda'}
            </h1>
            <div style={{ fontSize: '13px', color: '#94a8c0' }}>
              {ronda.course_name} · {fechaDisplay}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              background: isEnCurso ? 'rgba(34,197,94,0.12)' : 'rgba(122,143,168,0.12)',
              color: isEnCurso ? '#22c55e' : '#94a8c0',
              border: `1px solid ${isEnCurso ? 'rgba(34,197,94,0.3)' : 'rgba(122,143,168,0.3)'}`,
              padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
            }}>
              {isEnCurso ? '● EN CURSO' : '✓ FINALIZADA'}
            </span>
            <button
              onClick={() => { sessionStorage.removeItem(SS_KEY(codigo)); setRole(null) }}
              style={{ background: 'none', border: 'none', color: '#94a8c0', fontSize: '12px', cursor: 'pointer', padding: 0 }}
            >
              Cambiar rol
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  /* ─────────────────────────────────────────────────────────────────────── */
  /* ── SPECTATOR VIEW ─────────────────────────────────────────────────── */
  /* ─────────────────────────────────────────────────────────────────────── */
  if (role === 'espectador') {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
        {sharedHeader}

        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px' }}>
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(23,49,41,0.95) 0%, rgba(14,28,47,0.92) 100%)',
              border: '1px solid rgba(196,153,42,0.14)',
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Club</div>
                <div style={{ fontSize: '15px', color: '#edeae4', fontWeight: 700 }}>{ronda.course_name}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fecha</div>
                <div style={{ fontSize: '15px', color: '#edeae4', fontWeight: 700 }}>{fechaDisplay}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Jugadores</div>
                <div style={{ fontSize: '15px', color: '#edeae4', fontWeight: 700 }}>{ronda.ronda_libre_jugadores.length}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Formato</div>
                <div style={{ fontSize: '15px', color: '#edeae4', fontWeight: 700 }}>{ronda.holes} hoyos</div>
              </div>
            </div>
          </div>

          {timelineEvents.length > 0 && (
            <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.12)', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Momentos recientes</span>
                <span style={{ fontSize: '12px', color: '#c4992a' }}>Actualiza cada 15s</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {timelineEvents.map((event) => {
                  const label = event.diff <= -2 ? 'Eagle' : event.diff === -1 ? 'Birdie' : event.diff === 0 ? 'Par' : event.diff === 1 ? 'Bogey' : `+${event.diff}`
                  const color = event.diff <= -2 ? '#c8a55a' : event.diff === -1 ? '#22c55e' : event.diff === 0 ? '#edeae4' : '#dc2626'
                  return (
                    <div key={`${event.jugador}-${event.hole}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <div>
                        <div style={{ fontSize: '14px', color: '#edeae4', fontWeight: 700 }}>{event.jugador}</div>
                        <div style={{ fontSize: '12px', color: '#94a8c0' }}>Hoyo {event.hole} · {event.score} golpes</div>
                      </div>
                      <span style={{ color, fontSize: '13px', fontWeight: 700 }}>{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* GWI — solo si hay ≥ 2 jugadores y al menos 3 hoyos jugados */}
          {gwiInputs.length >= 2 && gwiInputs.some(j => j.hoyosCompletados >= 3) && (
            <GWILeaderboard
              jugadores={gwiInputs}
              hoyosRestantes={ronda.holes - Math.max(...gwiInputs.map(j => j.hoyosCompletados), 0)}
              totalHoyos={ronda.holes}
              modoJuego={ronda.modo_juego || 'gross'}
            />
          )}

          {/* Leaderboard */}
          <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.12)', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px' }}>

            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 72px 60px', padding: '10px 16px', background: 'rgba(196,153,42,0.05)', borderBottom: '1px solid rgba(196,153,42,0.1)' }}>
              <span style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase' }}>#</span>
              <span style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase' }}>Jugador</span>
              <span style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', textAlign: 'center' }}>
                {hasCourse ? '+/- Par' : 'Score'}
              </span>
              <span style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', textAlign: 'right' }}>Hoyos</span>
            </div>

            {leaderboard.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94a8c0', fontSize: '14px' }}>
                Aún no hay jugadores en esta ronda
              </div>
            )}

            {leaderboard.map((j, idx) => {
              const isExpanded = expanded === j.id
              const par    = hasCourse ? parMap[1] ?? 4 : 4  // fallback
              const color  = j.holesPlayed > 0
                ? getScoreColor(j.vsPar + par, par)  // use vsPar directly
                : '#94a8c0'

              // Correct color directly from vsPar
              const vsParColor = (() => {
                if (j.holesPlayed === 0) return '#94a8c0'
                if (j.vsPar <= -2) return '#c8a55a'
                if (j.vsPar === -1) return '#22c55e'
                if (j.vsPar === 0)  return '#edeae4'
                if (j.vsPar === 1)  return '#dc2626'
                return '#dc2626'
              })()

              const vsParStr = j.holesPlayed > 0 ? formatOverUnder(j.vsPar) : '—'
              const holeNums = Array.from({ length: ronda.holes }, (_, i) => i + 1)

              return (
                <div key={j.id} style={{ borderBottom: '1px solid rgba(122,143,168,0.07)' }}>
                  {/* Row */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : j.id)}
                    style={{
                      width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                      display: 'grid', gridTemplateColumns: '32px 1fr 72px 60px',
                      padding: '13px 16px', alignItems: 'center', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: '14px', color: '#94a8c0', fontWeight: 600 }}>{idx + 1}</span>
                    <span style={{ fontSize: '15px', color: '#edeae4', fontWeight: 600 }}>
                      {j.nombre}
                      {j.holesPlayed > 0 && (
                        <span style={{ fontSize: '11px', color: '#94a8c0', fontWeight: 400, marginLeft: '6px' }}>
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      )}
                    </span>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: '17px', fontWeight: 700, color: vsParColor }}>
                        {vsParStr}
                      </span>
                    </div>
                    <span style={{ fontSize: '13px', color: '#94a8c0', textAlign: 'right' }}>
                      {j.holesPlayed}/{ronda.holes}
                    </span>
                  </button>

                  {/* Expandable mini scorecard */}
                  {isExpanded && j.holesPlayed > 0 && (
                    <div style={{ padding: '4px 12px 14px', background: 'rgba(7,13,24,0.4)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      {/* Front 9 */}
                      <div style={{ fontSize: '9px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                        Front 9
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '2px', marginBottom: '8px' }}>
                        {holeNums.slice(0, 9).map(h => {
                          const s    = j.scores[String(h)] ?? (j.scores as Record<number, number>)[h]
                          const p    = parMap[h] ?? 4
                          const diff = s != null ? s - p : null
                          const bg   = diff != null ? `${getScoreColor(s!, p)}22` : 'rgba(7,13,24,0.4)'
                          const bdr  = diff != null ? `1px solid ${getScoreColor(s!, p)}44` : '1px solid transparent'
                          return (
                            <div key={h} style={{ textAlign: 'center', background: bg, borderRadius: '4px', padding: '3px 1px', border: bdr }}>
                              <div style={{ fontSize: '8px', color: '#94a8c0', lineHeight: 1 }}>{h}</div>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: diff != null ? getScoreColor(s!, p) : '#3a4a5a', lineHeight: 1.3 }}>
                                {s ?? '·'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {/* Back 9 */}
                      {ronda.holes > 9 && (
                        <>
                          <div style={{ fontSize: '9px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                            Back 9
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '2px' }}>
                            {holeNums.slice(9, 18).map(h => {
                              const s    = j.scores[String(h)] ?? (j.scores as Record<number, number>)[h]
                              const p    = parMap[h] ?? 4
                              const diff = s != null ? s - p : null
                              const bg   = diff != null ? `${getScoreColor(s!, p)}22` : 'rgba(7,13,24,0.4)'
                              const bdr  = diff != null ? `1px solid ${getScoreColor(s!, p)}44` : '1px solid transparent'
                              return (
                                <div key={h} style={{ textAlign: 'center', background: bg, borderRadius: '4px', padding: '3px 1px', border: bdr }}>
                                  <div style={{ fontSize: '8px', color: '#94a8c0', lineHeight: 1 }}>{h}</div>
                                  <div style={{ fontSize: '12px', fontWeight: 700, color: diff != null ? getScoreColor(s!, p) : '#3a4a5a', lineHeight: 1.3 }}>
                                    {s ?? '·'}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Countdown progress bar */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: '#94a8c0', fontSize: '13px', fontWeight: 600 }}>
                Actualiza en {countdown}s
              </span>
              <span style={{ color: '#c4992a', fontSize: '11px' }}>Auto-refresh</span>
            </div>
            <div style={{
              width: '100%', height: '4px',
              background: 'rgba(122,143,168,0.15)',
              borderRadius: '2px', overflow: 'hidden',
            }}>
              <div style={{
                width: `${(countdown / 15) * 100}%`,
                height: '100%',
                background: countdown <= 3 ? '#22c55e' : '#c4992a',
                borderRadius: '2px',
                transition: 'width 1s linear, background 0.3s',
              }} />
            </div>
          </div>

          {/* Share + Copy */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={handleShare}
              style={{ flex: 1, background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366', fontSize: '13px', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, minHeight: '44px' }}
            >
              Compartir
            </button>
            <button
              onClick={handleCopy}
              style={{ flex: 1, background: 'none', border: '1px solid rgba(196,153,42,0.25)', color: '#c4992a', fontSize: '13px', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, minHeight: '44px' }}
            >
              {copied ? '✓ Copiado' : 'Copiar link'}
            </button>
          </div>

          {/* Share results button */}
          {leaderboard.length > 0 && leaderboard.some(j => j.holesPlayed > 0) && (
            <button
              onClick={() => {
                const standingsText = leaderboard
                  .filter(j => j.holesPlayed > 0)
                  .map((j, i) => `${i + 1}. ${j.nombre} ${hasCourse ? formatOverUnder(j.vsPar) : ''} (${j.holesPlayed}/${ronda.holes})`)
                  .join('\n')
                const resultText = `${ronda.course_name} - ${fechaDisplay}\n\n${standingsText}\n\nSigue en vivo: ${shareUrl}`
                if (typeof navigator !== 'undefined' && navigator.share) {
                  navigator.share({ title: 'Resultado Golfers+', text: resultText }).catch(() => {})
                } else {
                  window.open(`https://wa.me/?text=${encodeURIComponent(resultText)}`, '_blank')
                }
              }}
              style={{
                width: '100%',
                background: 'rgba(196,153,42,0.06)',
                border: '1px solid rgba(196,153,42,0.15)',
                color: '#94a8c0',
                fontSize: '13px',
                padding: '10px 16px',
                borderRadius: '10px',
                cursor: 'pointer',
                minHeight: '44px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              <span style={{ fontSize: '14px' }}>📊</span> Compartir resultado actual
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ─────────────────────────────────────────────────────────────────────── */
  /* ── PLAYER VIEW ────────────────────────────────────────────────────── */
  /* ─────────────────────────────────────────────────────────────────────── */
  return (
    <div style={{ background: '#070d18', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
      {sharedHeader}

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 16px' }}>
        <p style={{ color: '#edeae4', fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
          ¿Cuál es tu nombre?
        </p>
        <p style={{ color: '#94a8c0', fontSize: '14px', marginBottom: '24px' }}>
          Selecciona tu nombre de la lista para ingresar tu score
        </p>

        {ronda.ronda_libre_jugadores.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a8c0', fontSize: '14px' }}>
            No hay jugadores registrados en esta ronda aún.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
            {ronda.ronda_libre_jugadores.map(j => {
              const hp       = getHolesPlayed(j.scores, ronda.holes)
              const vp       = getVsPar(j.scores, ronda.holes, parMap)
              const isSelected = selectedJ === j.id

              return (
                <label
                  key={j.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    background: isSelected ? 'rgba(196,153,42,0.1)' : '#0e1c2f',
                    border: `2px solid ${isSelected ? '#c4992a' : 'rgba(122,143,168,0.12)'}`,
                    borderRadius: '12px', padding: '16px', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Custom radio */}
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${isSelected ? '#c4992a' : '#3a4a5a'}`,
                    background: isSelected ? '#c4992a' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#070d18' }} />}
                  </div>
                  <input
                    type="radio"
                    name="jugador"
                    value={j.id}
                    checked={isSelected}
                    onChange={() => setSelectedJ(j.id)}
                    style={{ display: 'none' }}
                  />

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#edeae4' }}>{j.nombre}</div>
                    <div style={{ fontSize: '13px', color: '#94a8c0', marginTop: '2px' }}>
                      {hp === 0 ? 'Sin scores aún' : `${hp}/${ronda.holes} hoyos · ${formatOverUnder(vp)}`}
                    </div>
                  </div>

                  {/* Progress indicator */}
                  {hp > 0 && (
                    <div style={{
                      fontSize: '14px', fontWeight: 700,
                      color: (() => {
                        if (vp <= -2) return '#3b82f6'
                        if (vp === -1) return '#22c55e'
                        if (vp === 0)  return '#edeae4'
                        if (vp === 1)  return '#c4992a'
                        return '#dc2626'
                      })(),
                    }}>
                      {formatOverUnder(vp)}
                    </div>
                  )}
                </label>
              )
            })}
          </div>
        )}

        {/* Confirm button */}
        {ronda.ronda_libre_jugadores.length > 0 && (
          <button
            onClick={handleGoScore}
            disabled={!selectedJ}
            style={{
              width: '100%', padding: '18px',
              background: selectedJ ? '#c4992a' : 'rgba(196,153,42,0.25)',
              color: selectedJ ? '#070d18' : '#94a8c0',
              border: 'none', borderRadius: '12px',
              fontWeight: 700, fontSize: '16px',
              cursor: selectedJ ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
          >
            {selectedJ ? 'Ingresar mi score →' : 'Selecciona tu nombre'}
          </button>
        )}

        {/* Share + Copy */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
          <button
            onClick={handleShare}
            style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366', fontSize: '13px', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
          >
            Compartir por WhatsApp
          </button>
          <button
            onClick={handleCopy}
            style={{ background: 'none', border: '1px solid rgba(196,153,42,0.2)', color: '#94a8c0', fontSize: '13px', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer' }}
          >
            {copied ? '✓ Copiado' : 'Copiar link'}
          </button>
        </div>
      </div>
    </div>
  )
}
