'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getScoreColor, formatOverUnder } from '@/constants/golf'
import { notifyScoreEvent, getNotifPrefs, setNotifPrefs, isPushSupported, requestPermission } from '@/lib/push-notifications'
import { setActiveRondaSession, clearActiveRondaSession } from '@/components/LiveRoundIndicator'
import { compartirLeaderboard } from '@/lib/share-card'
import type { LeaderboardShareData } from '@/lib/share-card'
import { addToast } from '@/hooks/useToast'

function NotifBanner({ onEnable }: { onEnable: () => void }) {
  const [dismissed, setDismissed] = useState(false)
  const [activated, setActivated] = useState(false)

  const handleActivate = async () => {
    await onEnable()
    setActivated(true)
    setTimeout(() => setDismissed(true), 2000)
  }

  if (dismissed) return null

  return (
    <div style={{
      background: activated ? 'rgba(22,163,74,0.08)' : '#ffffff',
      border: activated ? '1px solid rgba(22,163,74,0.2)' : '1px solid #e5e7eb',
      borderRadius: '12px', padding: '14px 16px', marginBottom: '12px',
      display: 'flex', alignItems: 'center', gap: '12px',
      transition: 'all 0.3s',
    }}>
      <span style={{ fontSize: '20px', flexShrink: 0 }}>{activated ? '✅' : '🔔'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: activated ? '#16a34a' : '#111827' }}>
          {activated ? 'Alertas activadas' : 'Sigue la ronda en vivo'}
        </div>
        <div style={{ fontSize: '11px', color: '#6b7280' }}>
          {activated ? 'Te avisaremos de birdies y cambios' : 'Recibe alertas de birdies y cambios de posición'}
        </div>
      </div>
      {!activated && (
        <>
          <button onClick={handleActivate} style={{
            background: '#c4992a', color: '#070d18', border: 'none', borderRadius: '8px',
            padding: '10px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
            minHeight: '44px',
          }}>Activar</button>
          <button onClick={() => setDismissed(true)} style={{
            background: 'none', border: 'none', color: '#d1d5db', fontSize: '18px', cursor: 'pointer',
            padding: '4px 8px', flexShrink: 0, minHeight: '44px', minWidth: '44px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </>
      )}
    </div>
  )
}
import GWILeaderboard from '@/components/GWILeaderboard'
import { calcularGWI } from '@/golf/stats/gwi'
import type { JugadorGWIInput, GWIResult } from '@/golf/stats/gwi'
import type { ModoJuego } from '@/golf/core/rules'
import { Suspense } from 'react'

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
  hoyo_inicio?:          number | null
  admin_mode?:           boolean
  admin_user_id?:        string
  creador_id:            string
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

/* ── Auth Modal Component ──────────────────────────────────────────────── */
function AuthModal({ action, codigo, onClose }: { action: string; codigo: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(165deg, #111827 0%, #0a1628 100%)',
          borderRadius: '24px',
          border: '1px solid rgba(196,153,42,0.15)',
          padding: '40px 32px 32px',
          maxWidth: '400px', width: '100%',
          textAlign: 'center',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(196,153,42,0.08)',
        }}
      >
        {/* Logo */}
        <div style={{
          width: '64px', height: '64px', borderRadius: '16px',
          background: 'rgba(196,153,42,0.1)',
          border: '1px solid rgba(196,153,42,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: '28px',
        }}>
          ⛳
        </div>
        <h2 style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '24px', fontWeight: 700, color: '#edeae4',
          marginBottom: '8px', lineHeight: 1.3,
        }}>
          {action}
        </h2>
        <p style={{
          fontSize: '14px', color: '#94a8c0', marginBottom: '28px',
          lineHeight: 1.6, maxWidth: '300px', margin: '0 auto 28px',
        }}>
          Crea tu cuenta gratis en Golfers+ para acceder a todas las funciones.
        </p>
        <Link
          href={`/login?next=/ronda-libre/${codigo}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            width: '100%', padding: '14px 20px',
            background: '#c4992a', color: '#070d18',
            fontWeight: 700, fontSize: '15px',
            borderRadius: '12px', textDecoration: 'none',
            marginBottom: '8px',
            transition: 'opacity 0.15s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuar con Google
        </Link>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none',
            color: '#94a8c0', fontSize: '14px',
            cursor: 'pointer', padding: '12px 16px',
            width: '100%',
          }}
        >
          Ahora no
        </button>
      </div>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────────────────────── */
function RondaLibrePageContent() {
  const params  = useParams()
  const router  = useRouter()
  const searchParams = useSearchParams()
  const codigo  = params.codigo as string
  const finishedParam = searchParams.get('finished') === 'true'

  const [ronda,       setRonda]       = useState<RondaLibre | null>(null)
  const [parMap,      setParMap]      = useState<Record<number, number>>({})
  const [loading,     setLoading]     = useState(true)
  const [notFound,    setNotFound]    = useState(false)
  const [fetchError,  setFetchError]  = useState(false)
  const [role,        setRole]        = useState<Role>(null)
  const [selectedJ,   setSelectedJ]   = useState<string>('')
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const prevLeaderRef = useRef<string | null>(null)
  const prevScoresRef = useRef<Record<string, number>>({})
  const [countdown,   setCountdown]   = useState(15)
  const [copied,      setCopied]      = useState(false)
  const [gwiInputs,   setGwiInputs]   = useState<JugadorGWIInput[]>([])
  const [_gwiResults, setGwiResults]  = useState<GWIResult[]>([])
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showBanner,  setShowBanner]  = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authModalAction, setAuthModalAction] = useState('')
  // Admin score editing
  const [editingScore, setEditingScore] = useState<{ jugadorId: string; hole: number; currentScore: number } | null>(null)
  const [editScoreValue, setEditScoreValue] = useState<number>(0)

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
    } catch (err) {
      console.error('[GWI fetch error]', err)
    }
  }, [codigo])

  /* ── Fetch ronda ── */
  const fetchRonda = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('rondas_libres')
        .select('id, codigo, course_name, course_id, tees, holes, fecha, estado, modo_juego, admin_mode, admin_user_id, creador_id, ronda_libre_jugadores(id, nombre, user_id, scores)')
        .eq('codigo', codigo)
        .single()

      if (!data) {
        // Only set notFound on actual 404, not on network/auth errors
        if (error?.code === 'PGRST116' || (!error && !data)) {
          setNotFound(true)
        }
        // On transient errors (network, auth), silently retry on next poll
      } else {
        setFetchError(false)
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
    } catch (err) {
      console.error('[fetchRonda error]', err)
      setFetchError(true)
    }
    setLoading(false)
  }, [codigo])

  useEffect(() => { fetchRonda() }, [fetchRonda])

  // Check if user has an active session
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAnonymous(!user)
      setCurrentUserId(user?.id ?? null)
    })
  }, [])

  // Show registration banner after 30s for anonymous users (welcome screen or spectator view)
  useEffect(() => {
    if (!isAnonymous || bannerDismissed || role === 'jugador') return
    const dismissed = sessionStorage.getItem(`banner-dismissed-${codigo}`)
    if (dismissed) { setBannerDismissed(true); return }
    const timer = setTimeout(() => setShowBanner(true), 8000)
    const handleScroll = () => { setShowBanner(true); window.removeEventListener('scroll', handleScroll) }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => { clearTimeout(timer); window.removeEventListener('scroll', handleScroll) }
  }, [isAnonymous, bannerDismissed, role, codigo])

  // Re-fetch when screen turns back on (fixes "ronda no encontrada" after screen off)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        fetchRonda()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [fetchRonda])

  // Restore role from sessionStorage — override to espectador for finished rounds
  useEffect(() => {
    if (finishedParam || ronda?.estado === 'finalizada') {
      // Clear stale jugador role and force espectador
      sessionStorage.setItem(SS_KEY(codigo), 'espectador')
      setRole('espectador')
      return
    }
    const saved = sessionStorage.getItem(SS_KEY(codigo))
    if (saved === 'espectador' || saved === 'jugador') setRole(saved)
  }, [codigo, finishedParam, ronda?.estado])

  // Polling every 15s (spectator only)
  // Spectator: detect score events and send notifications
  const checkScoreEvents = useCallback(() => {
    if (!ronda || !getNotifPrefs().spectator) return
    const lb = [...ronda.ronda_libre_jugadores]
      .map(j => ({ nombre: j.nombre, vsPar: getVsPar(j.scores, ronda.holes, parMap), hp: getHolesPlayed(j.scores, ronda.holes) }))
      .filter(j => j.hp > 0)
      .sort((a, b) => a.vsPar - b.vsPar)

    if (lb.length === 0) return
    const leader = lb[0]

    // Detect leader change
    if (prevLeaderRef.current && prevLeaderRef.current !== leader.nombre) {
      notifyScoreEvent(leader.nombre, 'leader_change', `Toma el liderato con ${formatOverUnder(leader.vsPar)}`, `/ronda-libre/${codigo}`)
    }
    prevLeaderRef.current = leader.nombre

    // Detect birdies/eagles (compare with previous scores)
    for (const j of ronda.ronda_libre_jugadores) {
      for (let h = 1; h <= ronda.holes; h++) {
        const s = j.scores[String(h)] ?? (j.scores as Record<number, number>)[h]
        const prevKey = `${j.id}-${h}`
        if (s != null && !prevScoresRef.current[prevKey]) {
          const p = parMap[h] ?? 4
          const diff = s - p
          if (diff <= -2) notifyScoreEvent(j.nombre, 'eagle', `Eagle en hoyo ${h}`, `/ronda-libre/${codigo}`)
          else if (diff === -1) notifyScoreEvent(j.nombre, 'birdie', `Birdie en hoyo ${h}`, `/ronda-libre/${codigo}`)
          prevScoresRef.current[prevKey] = s
        }
      }
    }
  }, [ronda, parMap, codigo])

  useEffect(() => {
    if (role !== 'espectador') return
    fetchGWI()
    const interval = setInterval(() => {
      fetchRonda().then(() => checkScoreEvents())
      fetchGWI()
      setCountdown(15)
    }, 15000)
    return () => clearInterval(interval)
  }, [fetchRonda, fetchGWI, role, checkScoreEvents])

  // Countdown tick
  useEffect(() => {
    if (role !== 'espectador') return
    const tick = setInterval(() => setCountdown(c => c <= 1 ? 15 : c - 1), 1000)
    return () => clearInterval(tick)
  }, [role])

  /* ── Handlers ── */
  const dismissBanner = () => {
    setBannerDismissed(true)
    setShowBanner(false)
    sessionStorage.setItem(`banner-dismissed-${codigo}`, '1')
  }

  const requireAuth = (action: string) => {
    if (isAnonymous) {
      setAuthModalAction(action)
      setShowAuthModal(true)
      return true
    }
    return false
  }

  const chooseRole = (r: Role) => {
    if (!r) return
    sessionStorage.setItem(SS_KEY(codigo), r)
    setRole(r)
    if (r === 'espectador') setCountdown(15)
    // Track active ronda for live indicator — only for authenticated users
    // Anonymous spectators don't navigate the app, so no pulse needed
    if (ronda && isEnCurso && !isAnonymous) {
      setActiveRondaSession(codigo, ronda.course_name)
    }
  }

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/ronda-libre/${codigo}` : ''
  const shareText = (() => {
    if (!ronda) return 'Sigue la ronda en vivo en Golfers+'
    const jugadores = ronda.ronda_libre_jugadores
    if (jugadores.length === 0) return `Ronda en ${ronda.course_name} — Golfers+`
    const leader = [...jugadores]
      .map(j => {
        let gross = 0, parTotal = 0, holesPlayed = 0
        for (let h = 1; h <= ronda.holes; h++) {
          const s = j.scores?.[String(h)] ?? j.scores?.[h]
          if (s != null) { gross += s; parTotal += parMap[h] ?? 4; holesPlayed++ }
        }
        const vsPar = gross - parTotal
        return { nombre: j.nombre, gross, vsPar, holesPlayed }
      })
      .filter(j => j.holesPlayed > 0)
      .sort((a, b) => a.vsPar - b.vsPar)[0]

    if (!leader) return `Ronda en vivo en ${ronda.course_name} — Golfers+`
    const vsParStr = leader.vsPar > 0 ? `+${leader.vsPar}` : leader.vsPar === 0 ? 'E' : String(leader.vsPar)
    return `${leader.nombre} va ${leader.gross} (${vsParStr}) en ${ronda.course_name} — Seguila en vivo`
  })()

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

  // Admin score editing — save updated score to supabase
  const handleAdminScoreSave = useCallback(async () => {
    if (!editingScore || !ronda) return
    const { jugadorId, hole } = editingScore
    const newScore = Math.max(1, Math.min(19, editScoreValue))
    const jugador = ronda.ronda_libre_jugadores.find(j => j.id === jugadorId)
    if (!jugador) return

    const updatedScores = { ...jugador.scores, [String(hole)]: newScore }
    const supabase = createClient()
    const { error } = await supabase.from('ronda_libre_jugadores').update({ scores: updatedScores }).eq('id', jugadorId)
    if (error) {
      addToast({ type: 'error', title: 'Error', message: 'No se pudo actualizar el score', duration: 4000 })
    } else {
      addToast({ type: 'success', title: 'Score actualizado', message: `Hoyo ${hole}: ${newScore} golpes`, duration: 3000 })
      // Update local state
      setRonda(prev => {
        if (!prev) return prev
        return {
          ...prev,
          ronda_libre_jugadores: prev.ronda_libre_jugadores.map(j =>
            j.id === jugadorId ? { ...j, scores: updatedScores } : j
          ),
        }
      })
    }
    setEditingScore(null)
  }, [editingScore, editScoreValue, ronda])

  /* ── Loading ── */
  if (loading) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a8c0', fontFamily: 'DM Sans, sans-serif' }}>
        Cargando ronda...
      </div>
    )
  }

  /* ── Fetch error — show retry UI instead of blank screen ── */
  if (fetchError && !ronda) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'DM Sans, sans-serif', padding: '24px' }}>
        <div style={{ fontSize: '48px' }}>⛳</div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: '#edeae4', textAlign: 'center' }}>
          Error al cargar la ronda
        </h1>
        <p style={{ color: '#94a8c0', textAlign: 'center', maxWidth: '320px', fontSize: '14px' }}>
          No pudimos conectar con el servidor. Revisa tu conexion e intenta de nuevo.
        </p>
        <button
          onClick={() => { setFetchError(false); setLoading(true); fetchRonda() }}
          style={{
            background: '#c4992a', color: '#070d18', fontWeight: 700,
            fontSize: '14px', padding: '12px 24px', borderRadius: '10px',
            border: 'none', cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
        <Link href="/" style={{ color: '#c4992a', textDecoration: 'none', fontSize: '13px' }}>
          Ir al inicio
        </Link>
      </div>
    )
  }

  /* ── Not found ── */
  if (notFound || !ronda) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'DM Sans, sans-serif', padding: '24px' }}>
        <div style={{ fontSize: '64px' }}>🏌️</div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#edeae4', textAlign: 'center' }}>
          Ronda no encontrada
        </h1>
        <p style={{ color: '#94a8c0', textAlign: 'center', maxWidth: '320px', lineHeight: 1.5 }}>
          El código <strong style={{ color: '#c4992a' }}>{codigo}</strong> no existe o fue eliminado.
          Verifica que el código sea exacto (mayúsculas y minúsculas importan).
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
          <Link href="/ronda-libre/nueva" style={{
            background: '#c4992a', color: '#070d18', textDecoration: 'none',
            fontWeight: 600, fontSize: '15px', padding: '12px 24px', borderRadius: '10px',
            display: 'inline-block',
          }}>
            Crear nueva ronda
          </Link>
          <Link href="/" style={{ color: 'var(--text-2)', textDecoration: 'none', fontSize: '14px' }}>← Ir al inicio</Link>
        </div>
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
  /* ── FINISHED ROUND — auto-set role to espectador, skip welcome ────── */
  /* ─────────────────────────────────────────────────────────────────────── */
  // Handled in the useEffect above — finishedParam or estado=finalizada
  // automatically sets role='espectador', so no separate screen needed.
  const isFinished = finishedParam || ronda.estado === 'finalizada'

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
          {ronda.estado === 'finalizada' ? (
            <>
              <p style={{ color: '#94a8c0', fontSize: '15px', marginBottom: '8px', textAlign: 'center' }}>
                Esta ronda ya finalizó
              </p>
              <button
                onClick={() => chooseRole('espectador')}
                aria-label="Ver resultados"
                style={{
                  width: '100%', maxWidth: '360px', minHeight: '80px',
                  background: '#c4992a', color: '#070d18',
                  border: 'none', borderRadius: '16px',
                  padding: '20px 24px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '20px',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '32px', flexShrink: 0 }}>📊</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '20px', marginBottom: '4px' }}>Ver resultados</div>
                  <div style={{ fontSize: '14px', opacity: 0.8 }}>Revisa el marcador final</div>
                </div>
              </button>
            </>
          ) : (
            <>
              <p style={{ color: '#94a8c0', fontSize: '15px', marginBottom: '8px', textAlign: 'center' }}>
                ¿Cómo quieres unirte a esta ronda?
              </p>

              {/* M4: welcome buttons 80px, 20px font */}
              <button
                onClick={() => {
                  if (requireAuth('Ingresa tu score en la ronda')) return
                  chooseRole('jugador')
                }}
                aria-label="Soy jugador"
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
                aria-label="Solo ver"
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
            </>
          )}

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

        {/* ── Registration Banner on Welcome Screen ── */}
        {showBanner && isAnonymous && !bannerDismissed && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: 'rgba(17,24,39,0.92)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            borderTop: '1px solid rgba(196,153,42,0.2)',
            padding: '14px 16px',
            animation: 'slideUpBanner 0.4s ease-out',
          }}>
            <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#edeae4' }}>Registr&aacute; tu propio score</div>
                <div style={{ fontSize: '12px', color: '#94a8c0' }}>Crea tu cuenta gratis y jug&aacute; con Golfers+</div>
              </div>
              <Link href={`/register?next=/ronda-libre/${codigo}`} style={{
                background: '#c4992a', color: '#070d18', fontWeight: 700,
                fontSize: '13px', padding: '10px 18px', borderRadius: '8px',
                textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              }}>Unirme gratis</Link>
              <button onClick={dismissBanner} style={{
                background: 'none', border: 'none', color: '#94a8c0',
                fontSize: '20px', cursor: 'pointer', padding: '4px 8px', flexShrink: 0,
                minHeight: '44px', minWidth: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>×</button>
            </div>
          </div>
        )}
        <style>{`@keyframes slideUpBanner { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

        {/* ── Auth Modal on Welcome Screen ── */}
        {showAuthModal && (
          <AuthModal action={authModalAction} codigo={codigo} onClose={() => setShowAuthModal(false)} />
        )}
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
  const isCreator = !!(currentUserId && ronda.creador_id === currentUserId)

  if (role === 'espectador') {
    // White theme score colors
    const whiteThemeScoreColor = (vsPar: number, played: number) => {
      if (played === 0) return '#9ca3af'
      if (vsPar < 0) return '#16a34a'
      if (vsPar === 0) return '#374151'
      return '#dc2626'
    }

    return (
      <div style={{ background: '#f3f4f6', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
        {/* Header — dark bar at top */}
        <div style={{ background: '#111827', borderBottom: '1px solid #e5e7eb', padding: '16px' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#ffffff', margin: '0 0 4px' }}>
                  {isFinished ? 'Resultado final' : 'Marcador en vivo'}
                </h1>
                <div style={{ fontSize: '13px', color: '#9ca3af' }}>
                  {ronda.course_name} · {fechaDisplay}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  background: isEnCurso ? 'rgba(34,197,94,0.12)' : 'rgba(122,143,168,0.12)',
                  color: isEnCurso ? '#22c55e' : '#9ca3af',
                  border: `1px solid ${isEnCurso ? 'rgba(34,197,94,0.3)' : 'rgba(122,143,168,0.3)'}`,
                  padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                }}>
                  {isEnCurso ? '● EN CURSO' : '✓ FINALIZADA'}
                </span>
                {!isFinished && (
                  <button
                    onClick={() => { sessionStorage.removeItem(SS_KEY(codigo)); setRole(null) }}
                    style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '12px', cursor: 'pointer', padding: 0 }}
                  >
                    Cambiar rol
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px' }}>

          {/* ── Winner celebration + share CTA (finished rounds) ── */}
          {isFinished && leaderboard.length > 0 && leaderboard[0].holesPlayed > 0 && (() => {
            const isTie = leaderboard.length > 1 && leaderboard[0].vsPar === leaderboard[1].vsPar
            const winnerScore = leaderboard[0].vsPar
            const scoreColor = winnerScore < 0 ? '#16a34a' : winnerScore === 0 ? '#374151' : '#dc2626'
            return (
              <div style={{ marginBottom: '16px' }}>
                {/* Winner card — white, clean */}
                <div style={{
                  background: '#ffffff', borderRadius: '16px',
                  border: '1px solid #e5e7eb',
                  overflow: 'hidden',
                }}>
                  {/* Gold accent bar */}
                  <div style={{ height: '3px', background: 'linear-gradient(90deg, #c4992a, #d4a843, #c4992a)' }} />
                  <div style={{ padding: '24px 20px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '4px' }}>{isTie ? '🤝' : '🏆'}</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px' }}>
                      {isTie ? 'Empate' : 'Ganador'}
                    </div>
                    <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '26px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
                      {isTie
                        ? leaderboard.filter(j => j.vsPar === winnerScore).map(j => j.nombre.split(' ')[0]).join(' y ')
                        : leaderboard[0].nombre}
                    </div>
                    <div style={{ fontSize: '36px', fontWeight: 900, color: scoreColor, lineHeight: 1 }}>
                      {formatOverUnder(winnerScore)}
                    </div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '6px' }}>{ronda.course_name} · {fechaDisplay}</div>
                  </div>

                  {/* Share button — PROMINENT inside the card */}
                  <div style={{ padding: '0 20px 20px' }}>
                    <button
                      onClick={async () => {
                        const shareData: LeaderboardShareData = {
                          players: leaderboard.filter(j => j.holesPlayed > 0).map(j => ({
                            nombre: j.nombre, vsPar: j.vsPar, holesPlayed: j.holesPlayed, totalHoles: ronda.holes,
                          })),
                          courseName: ronda.course_name, fecha: fechaDisplay, rondaCodigo: codigo, isFinished: true,
                        }
                        await compartirLeaderboard(shareData)
                      }}
                      style={{
                        width: '100%', padding: '16px',
                        background: 'linear-gradient(135deg, #c4992a 0%, #d4a843 50%, #b8972f 100%)',
                        color: '#0a1419', fontWeight: 700, fontSize: '16px',
                        border: 'none', borderRadius: '12px', cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(196,153,42,0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      }}
                    >
                      Compartir leaderboard
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Descubrir Golfers+ — only for non-finished */}
          {!isFinished && (
            <Link href="/" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '10px 16px', borderRadius: '10px', marginBottom: '12px',
              background: 'rgba(196,153,42,0.06)', border: '1px solid rgba(196,153,42,0.12)',
              textDecoration: 'none',
            }}>
              <span style={{ fontSize: '13px', color: '#c4992a', fontWeight: 600 }}>Descubrir Golfers+</span>
              <span style={{ color: '#c4992a', fontSize: '12px' }}>→</span>
            </Link>
          )}

          {/* Notification banner for spectators */}
          {isEnCurso && !getNotifPrefs().spectator && (
            <NotifBanner onEnable={async () => {
              if (requireAuth('Activa alertas en vivo')) return
              if (!isPushSupported()) {
                // Fallback: still save preference, notifications just won't show
                setNotifPrefs({ spectator: true })
                setCountdown(c => c)
                return
              }
              try {
                const granted = await requestPermission()
                if (granted) {
                  setNotifPrefs({ spectator: true })
                  setCountdown(c => c)
                }
              } catch {
                // Permission request failed — save pref anyway for polling-based alerts
                setNotifPrefs({ spectator: true })
                setCountdown(c => c)
              }
            }} />
          )}

          {/* Course info card — white */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Club</div>
                <div style={{ fontSize: '15px', color: '#111827', fontWeight: 700 }}>{ronda.course_name}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fecha</div>
                <div style={{ fontSize: '15px', color: '#111827', fontWeight: 700 }}>{fechaDisplay}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Jugadores</div>
                <div style={{ fontSize: '15px', color: '#111827', fontWeight: 700 }}>{ronda.ronda_libre_jugadores.length}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Formato</div>
                <div style={{ fontSize: '15px', color: '#111827', fontWeight: 700 }}>{ronda.holes} hoyos</div>
              </div>
            </div>
          </div>

          {timelineEvents.length > 0 && (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Momentos recientes</span>
                {!isFinished && <span style={{ fontSize: '12px', color: '#c4992a' }}>Actualiza cada 15s</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {timelineEvents.map((event) => {
                  const label = event.diff <= -2 ? 'Eagle' : event.diff === -1 ? 'Birdie' : event.diff === 0 ? 'Par' : event.diff === 1 ? 'Bogey' : `+${event.diff}`
                  const color = event.diff <= -2 ? '#c8a55a' : event.diff === -1 ? '#16a34a' : event.diff === 0 ? '#374151' : '#dc2626'
                  return (
                    <div key={`${event.jugador}-${event.hole}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <div>
                        <div style={{ fontSize: '14px', color: '#111827', fontWeight: 700 }}>{event.jugador}</div>
                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>Hoyo {event.hole} · {event.score} golpes</div>
                      </div>
                      <span style={{ color, fontSize: '13px', fontWeight: 700 }}>{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* GWI — solo si hay >= 2 jugadores y al menos 3 hoyos jugados */}
          {gwiInputs.length >= 2 && gwiInputs.some(j => j.hoyosCompletados >= 3) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', fontFamily: '"DM Mono", monospace', letterSpacing: '0.08em' }}>GWI&trade;</span>
              <span style={{ fontSize: '11px', color: '#94a8c0' }}>Probabilidad de ganar en tiempo real</span>
              <a href="/indices" style={{ fontSize: '10px', color: 'rgba(196,153,42,0.6)', textDecoration: 'none', marginLeft: 'auto' }}>Saber m&aacute;s</a>
            </div>
          )}
          {gwiInputs.length >= 2 && gwiInputs.some(j => j.hoyosCompletados >= 3) && (
            <GWILeaderboard
              jugadores={gwiInputs}
              hoyosRestantes={ronda.holes - Math.max(...gwiInputs.map(j => j.hoyosCompletados), 0)}
              totalHoyos={ronda.holes}
              modoJuego={ronda.modo_juego || 'gross'}
            />
          )}

          {/* Leaderboard — white theme */}
          <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px' }}>

            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 72px 60px', padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' }}>#</span>
              <span style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' }}>Jugador</span>
              <span style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', textAlign: 'center' }}>
                {hasCourse ? '+/- Par' : 'Score'}
              </span>
              <span style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', textAlign: 'right' }}>Hoyos</span>
            </div>

            {leaderboard.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                Aun no hay jugadores en esta ronda
              </div>
            )}

            {leaderboard.map((j, idx) => {
              const isExpanded = expanded === j.id
              const vsParColor = whiteThemeScoreColor(j.vsPar, j.holesPlayed)
              const vsParStr = j.holesPlayed > 0 ? formatOverUnder(j.vsPar) : '—'
              const holeNums = Array.from({ length: ronda.holes }, (_, i) => i + 1)

              return (
                <div key={j.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {/* Row */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : j.id)}
                    aria-label={isExpanded ? `Colapsar scorecard de ${j.nombre}` : `Expandir scorecard de ${j.nombre}`}
                    style={{
                      width: '100%', background: '#ffffff', border: 'none', cursor: 'pointer',
                      display: 'grid', gridTemplateColumns: '32px 1fr 72px 60px',
                      padding: '13px 16px', alignItems: 'center', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: '14px', color: '#9ca3af', fontWeight: 600 }}>{idx + 1}</span>
                    <span style={{ fontSize: '15px', color: '#111827', fontWeight: 600 }}>
                      {j.nombre}
                      {j.holesPlayed > 0 && (
                        <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginLeft: '6px' }}>
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      )}
                    </span>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: '17px', fontWeight: 700, color: vsParColor }}>
                        {vsParStr}
                      </span>
                    </div>
                    <span style={{ fontSize: '13px', color: '#9ca3af', textAlign: 'right' }}>
                      {j.holesPlayed}/{ronda.holes}
                    </span>
                  </button>

                  {/* Expandable scorecard — PGA format with circles/squares */}
                  {isExpanded && j.holesPlayed > 0 && (() => {
                    const getS = (h: number) => j.scores[String(h)] ?? (j.scores as Record<number, number>)[h] ?? null
                    const front9T = holeNums.slice(0, 9).reduce((sum, h) => sum + (getS(h) ?? 0), 0)
                    const back9T = holeNums.slice(9, 18).reduce((sum, h) => sum + (getS(h) ?? 0), 0)

                    const scoreCell = (h: number) => {
                      const s = getS(h)
                      if (s == null) return <span style={{ color: '#d1d5db', fontSize: '11px' }}>·</span>
                      const d = s - (parMap[h] ?? 4)
                      const isAce = s === 1
                      const color = isAce ? '#c4992a' : '#374151'
                      if (d <= -2) return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', border: '1.5px solid #c4992a', position: 'relative' }}>
                          <span style={{ position: 'absolute', inset: '-4px', borderRadius: '50%', border: '1px solid #c4992a' }} />
                          <span style={{ fontSize: '11px', fontWeight: 600, color, lineHeight: 1 }}>{s}</span>
                        </span>
                      )
                      if (d === -1) return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', border: '1.5px solid #c4992a' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color, lineHeight: 1 }}>{s}</span>
                        </span>
                      )
                      if (d === 0) return <span style={{ fontSize: '11px', fontWeight: 600, color, lineHeight: 1 }}>{s}</span>
                      if (d === 1) return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '1px 3px', borderRadius: '2px', border: '1.5px solid #EF4444' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color, lineHeight: 1 }}>{s}</span>
                        </span>
                      )
                      return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '1px 3px', borderRadius: '2px', border: '1.5px solid #EF4444', position: 'relative' }}>
                          <span style={{ position: 'absolute', inset: '-4px', borderRadius: '3px', border: '1px solid #EF4444' }} />
                          <span style={{ fontSize: '11px', fontWeight: 600, color, lineHeight: 1 }}>{s}</span>
                        </span>
                      )
                    }

                    const renderHalf = (holes: number[], label: string, total: number) => (
                      <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '8px' }}>
                        <div style={{ flex: 1, display: 'flex' }}>
                          {holes.map(h => {
                            const hScore = getS(h)
                            return (
                            <div key={h} style={{ flex: 1, textAlign: 'center', minWidth: 0, cursor: isCreator ? 'pointer' : 'default' }}
                              onClick={isCreator ? (e) => {
                                e.stopPropagation()
                                setEditingScore({ jugadorId: j.id, hole: h, currentScore: hScore ?? (parMap[h] ?? 4) })
                                setEditScoreValue(hScore ?? (parMap[h] ?? 4))
                              } : undefined}
                            >
                              <div style={{ fontSize: '8px', color: '#9ca3af', marginBottom: '2px' }}>{h}</div>
                              <div style={{ minHeight: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{scoreCell(h)}</div>
                            </div>
                            )
                          })}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '32px', flexShrink: 0, borderLeft: '1px solid #e5e7eb', paddingLeft: '4px', marginLeft: '4px' }}>
                          <div style={{ fontSize: '8px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const }}>{label}</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>{total}</div>
                        </div>
                      </div>
                    )

                    return (
                      <div style={{ padding: '4px 8px 10px', background: '#f9fafb' }}>
                        {renderHalf(holeNums.slice(0, 9), 'OUT', front9T)}
                        {ronda.holes > 9 && renderHalf(holeNums.slice(9, 18), 'IN', back9T)}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb', paddingTop: '4px' }}>
                          {isCreator && (
                            <div style={{ fontSize: '9px', color: '#c4992a', fontWeight: 500 }}>
                              Toca un score para editarlo
                            </div>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '32px', marginLeft: 'auto' }}>
                            <div style={{ fontSize: '8px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const }}>TOT</div>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: '#111827' }}>{front9T + back9T}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>

          {/* Countdown progress bar — only if not finished */}
          {!isFinished && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#6b7280', fontSize: '13px', fontWeight: 600 }}>
                  Actualiza en {countdown}s
                </span>
                <span style={{ color: '#c4992a', fontSize: '11px' }}>Auto-refresh</span>
              </div>
              <div style={{
                width: '100%', height: '4px',
                background: '#e5e7eb',
                borderRadius: '2px', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${(countdown / 15) * 100}%`,
                  height: '100%',
                  background: countdown <= 3 ? '#16a34a' : '#c4992a',
                  borderRadius: '2px',
                  transition: 'width 1s linear, background 0.3s',
                }} />
              </div>
            </div>
          )}

          {/* Share + Copy */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={handleShare}
              aria-label="Compartir ronda"
              style={{ flex: 1, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366', fontSize: '13px', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, minHeight: '44px' }}
            >
              Compartir
            </button>
            <button
              onClick={handleCopy}
              aria-label="Copiar enlace de la ronda"
              style={{ flex: 1, background: '#ffffff', border: '1px solid #e5e7eb', color: '#374151', fontSize: '13px', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, minHeight: '44px' }}
            >
              {copied ? '✓ Copiado' : 'Copiar link'}
            </button>
          </div>

          {/* Share leaderboard (only when in progress — finished has prominent button above) */}
          {!isFinished && leaderboard.length > 0 && leaderboard.some(j => j.holesPlayed > 0) && (
            <button
              onClick={async () => {
                const shareData: LeaderboardShareData = {
                  players: leaderboard.filter(j => j.holesPlayed > 0).map(j => ({
                    nombre: j.nombre,
                    vsPar: j.vsPar,
                    holesPlayed: j.holesPlayed,
                    totalHoles: ronda.holes,
                  })),
                  courseName: ronda.course_name,
                  fecha: fechaDisplay,
                  rondaCodigo: codigo,
                  isFinished,
                }
                await compartirLeaderboard(shareData)
              }}
              style={{
                width: '100%',
                background: isFinished ? 'linear-gradient(135deg, #c9a84c 0%, #b8972f 100%)' : '#ffffff',
                border: isFinished ? 'none' : '1px solid #e5e7eb',
                color: isFinished ? '#0a1419' : '#374151',
                fontSize: isFinished ? '15px' : '13px',
                fontWeight: isFinished ? 700 : 600,
                padding: isFinished ? '14px 16px' : '10px 16px',
                borderRadius: isFinished ? '14px' : '10px',
                cursor: 'pointer',
                minHeight: '44px',
                marginBottom: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                boxShadow: isFinished ? '0 4px 20px rgba(201,168,76,0.4)' : 'none',
              }}
            >
              {isFinished ? 'Compartir leaderboard' : 'Compartir resultado actual'}
            </button>
          )}

          {/* Post-ronda links — only for finished rounds */}
          {isFinished && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginTop: '8px', paddingBottom: '24px' }}>
              {isAnonymous ? (
                <button
                  onClick={() => requireAuth('Ve tus estadísticas de golf')}
                  style={{
                    background: 'none', border: 'none',
                    color: '#c4992a', textDecoration: 'none', fontSize: '15px',
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Ver mis estadísticas →
                </button>
              ) : (
                <Link
                  href="/perfil/stats"
                  style={{
                    color: '#c4992a', textDecoration: 'none', fontSize: '15px',
                    fontWeight: 600,
                  }}
                >
                  Ver mis estadísticas →
                </Link>
              )}
            </div>
          )}

          {/* Explorar link is at the top of spectator view */}
        </div>

        {/* ── Registration Banner (anonymous spectators, after 30s or scroll) ── */}
        {showBanner && isAnonymous && !bannerDismissed && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: 'rgba(17,24,39,0.92)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            borderTop: '1px solid rgba(196,153,42,0.2)',
            padding: '14px 16px',
            animation: 'slideUpBanner 0.4s ease-out',
          }}>
            <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#edeae4' }}>
                  Registr&aacute; tu propio score
                </div>
                <div style={{ fontSize: '12px', color: '#94a8c0' }}>
                  Crea tu cuenta gratis y jug&aacute; con Golfers+
                </div>
              </div>
              <Link
                href={`/register?next=/ronda-libre/${codigo}`}
                style={{
                  background: '#c4992a', color: '#070d18', fontWeight: 700,
                  fontSize: '13px', padding: '10px 18px', borderRadius: '8px',
                  textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                Unirme gratis
              </Link>
              <button
                onClick={dismissBanner}
                style={{
                  background: 'none', border: 'none', color: '#94a8c0',
                  fontSize: '20px', cursor: 'pointer', padding: '4px 8px',
                  flexShrink: 0, minHeight: '44px', minWidth: '44px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* ── Auth Modal (contextual registration prompt) ── */}
        {showAuthModal && (
          <AuthModal action={authModalAction} codigo={codigo} onClose={() => setShowAuthModal(false)} />
        )}

        {/* ── Admin score edit modal ── */}
        {editingScore && isCreator && (
          <div
            onClick={() => setEditingScore(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '24px',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#ffffff', borderRadius: '16px',
                padding: '24px', maxWidth: '320px', width: '100%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              }}
            >
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                Editar score — Hoyo {editingScore.hole}
              </div>
              <div style={{ fontSize: '14px', color: '#374151', fontWeight: 600, marginBottom: '16px' }}>
                {ronda.ronda_libre_jugadores.find(j => j.id === editingScore.jugadorId)?.nombre ?? 'Jugador'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '20px' }}>
                <button
                  onClick={() => setEditScoreValue(v => Math.max(1, v - 1))}
                  style={{
                    width: '48px', height: '48px', borderRadius: '12px',
                    background: '#f3f4f6', border: '1px solid #e5e7eb',
                    fontSize: '24px', fontWeight: 300, color: '#374151',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >{'\u2212'}</button>
                <div style={{ fontSize: '40px', fontWeight: 700, color: '#111827', minWidth: '60px', textAlign: 'center' }}>
                  {editScoreValue}
                </div>
                <button
                  onClick={() => setEditScoreValue(v => Math.min(19, v + 1))}
                  style={{
                    width: '48px', height: '48px', borderRadius: '12px',
                    background: '#c4992a', border: 'none',
                    fontSize: '24px', fontWeight: 600, color: '#070d18',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >+</button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setEditingScore(null)}
                  style={{
                    flex: 1, padding: '12px', background: '#f3f4f6',
                    border: '1px solid #e5e7eb', borderRadius: '10px',
                    fontSize: '14px', fontWeight: 600, color: '#374151', cursor: 'pointer',
                  }}
                >Cancelar</button>
                <button
                  onClick={handleAdminScoreSave}
                  style={{
                    flex: 1, padding: '12px', background: '#c4992a',
                    border: 'none', borderRadius: '10px',
                    fontSize: '14px', fontWeight: 700, color: '#070d18', cursor: 'pointer',
                  }}
                >Guardar</button>
              </div>
            </div>
          </div>
        )}

        {/* Banner animation */}
        <style>{`
          @keyframes slideUpBanner {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  /* ─────────────────────────────────────────────────────────────────────── */
  /* ── PLAYER VIEW ────────────────────────────────────────────────────── */
  /* ─────────────────────────────────────────────────────────────────────── */
  const isAdmin = ronda.admin_mode && ronda.admin_user_id === currentUserId
  const isAdminRound = !!ronda.admin_mode

  // Admin mode: admin goes to score-grupo, others see "tu grupo lleva tu score"
  if (isAdminRound && !isAdmin && currentUserId) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
        {sharedHeader}
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: '#edeae4', marginBottom: '8px' }}>
            Tu grupo lleva tu score
          </h2>
          <p style={{ color: '#94a8c0', fontSize: '14px', marginBottom: '24px', lineHeight: 1.6 }}>
            Un miembro de tu grupo esta anotando el score de todos. Puedes seguir el marcador en vivo.
          </p>
          <button
            onClick={() => chooseRole('espectador')}
            style={{
              width: '100%', maxWidth: '320px', padding: '16px',
              background: '#c4992a', color: '#070d18',
              border: 'none', borderRadius: '12px',
              fontWeight: 700, fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            Ver marcador en vivo
          </button>
        </div>
      </div>
    )
  }

  if (isAdmin) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
        {sharedHeader}
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: '#edeae4', marginBottom: '8px' }}>
            Score en grupo
          </h2>
          <p style={{ color: '#94a8c0', fontSize: '14px', marginBottom: '24px', lineHeight: 1.6 }}>
            Llevas el score de {ronda.ronda_libre_jugadores.length} jugador{ronda.ronda_libre_jugadores.length !== 1 ? 'es' : ''} en esta ronda.
          </p>
          <button
            onClick={() => router.push(`/ronda-libre/${codigo}/score-grupo`)}
            style={{
              width: '100%', maxWidth: '320px', padding: '16px',
              background: '#c4992a', color: '#070d18',
              border: 'none', borderRadius: '12px',
              fontWeight: 700, fontSize: '16px',
              cursor: 'pointer', marginBottom: '12px',
            }}
          >
            Anotar score de grupo {'\u2192'}
          </button>
          <button
            onClick={() => chooseRole('espectador')}
            style={{
              width: '100%', maxWidth: '320px', padding: '14px',
              background: 'transparent', color: '#94a8c0',
              border: '1px solid rgba(196,153,42,0.2)', borderRadius: '12px',
              fontWeight: 500, fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Ver marcador
          </button>
        </div>
      </div>
    )
  }

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

export default function RondaLibrePage() {
  return (
    <Suspense fallback={<div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a8c0', fontFamily: 'DM Sans, sans-serif' }}>Cargando ronda...</div>}>
      <RondaLibrePageContent />
    </Suspense>
  )
}
