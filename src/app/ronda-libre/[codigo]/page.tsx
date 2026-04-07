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
            background: '#c4992a', color: '#1a1a2e', border: 'none', borderRadius: '8px',
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
  recorridos?:           string[] | null
  ronda_libre_jugadores: Jugador[]
}

type Role = 'espectador' | null
type TimelineEvent = {
  jugador: string
  hole: number
  score: number
  diff: number
  timestamp?: number // epoch ms approximation for relative time
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
          background: '#ffffff',
          borderRadius: '24px',
          border: '1px solid #e2e8f0',
          padding: '40px 32px 32px',
          maxWidth: '400px', width: '100%',
          textAlign: 'center',
          boxShadow: '0 25px 50px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
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
          fontSize: '24px', fontWeight: 700, color: '#1a1a2e',
          marginBottom: '8px', lineHeight: 1.3,
        }}>
          {action}
        </h2>
        <p style={{
          fontSize: '14px', color: '#4a5568', marginBottom: '28px',
          lineHeight: 1.6, maxWidth: '300px', margin: '0 auto 28px',
        }}>
          Crea tu cuenta gratis en Golfers+ para acceder a todas las funciones.
        </p>
        <Link
          href={`/login?next=/ronda-libre/${codigo}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            width: '100%', padding: '14px 20px',
            background: '#c4992a', color: '#1a1a2e',
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
            color: '#4a5568', fontSize: '14px',
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
  const [secSinceUpdate, setSecSinceUpdate] = useState(0)
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
        .select('id, codigo, course_name, course_id, tees, holes, fecha, estado, modo_juego, admin_mode, admin_user_id, creador_id, recorridos, ronda_libre_jugadores(id, nombre, user_id, scores)')
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
        setSecSinceUpdate(0)
        setRonda(data as unknown as RondaLibre)
        // Fetch hole pars if course linked
        if ((data as unknown as RondaLibre).course_id) {
          const r = data as unknown as RondaLibre
          let holeQuery = supabase
            .from('course_holes')
            .select('numero, par, stroke_index, recorrido')
            .eq('course_id', r.course_id!)
          // Multi-loop: filter by selected recorridos
          const recorridos = r.recorridos as string[] | null
          if (recorridos && recorridos.length > 0) {
            holeQuery = holeQuery.in('recorrido', recorridos)
          }
          const { data: holes } = await holeQuery.order('recorrido').order('numero')
          if (holes) {
            const pm: Record<number, number> = {}
            const isMultiLoop = recorridos && recorridos.length > 1
            let holeNum = 1
            ;(holes as CourseHole[]).forEach(h => {
              const num = isMultiLoop ? holeNum : h.numero
              pm[num] = h.par
              holeNum++
            })
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
    if (!isAnonymous || bannerDismissed) return
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

  // Always spectator — this page is read-only leaderboard
  useEffect(() => {
    sessionStorage.setItem(SS_KEY(codigo), 'espectador')
    setRole('espectador')
  }, [codigo])

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

  // Countdown tick + time since update (counter-based, no client clock dependency)
  useEffect(() => {
    if (role !== 'espectador') return
    const tick = setInterval(() => {
      setCountdown(c => c <= 1 ? 15 : c - 1)
      setSecSinceUpdate(s => s + 1)
    }, 1000)
    return () => clearInterval(tick)
  }, [role])

  // Derived label from counter (no client clock needed)
  const timeSinceUpdate = secSinceUpdate < 5 ? 'Justo ahora' : secSinceUpdate < 60 ? `Actualizado hace ${secSinceUpdate}s` : `Actualizado hace ${Math.floor(secSinceUpdate / 60)}m`

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


  // Track active ronda for live indicator on role set
  useEffect(() => {
    if (role === 'espectador' && ronda && ronda.estado === 'en_curso' && !isAnonymous) {
      setActiveRondaSession(codigo, ronda.course_name)
    }
  }, [role, ronda, isAnonymous, codigo])

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://golfersplus.vercel.app')
  const shareUrl = `${siteUrl}/ronda-libre/${codigo}`
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
      <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5568', fontFamily: 'DM Sans, sans-serif' }}>
        Cargando ronda...
      </div>
    )
  }

  /* ── Fetch error — show retry UI instead of blank screen ── */
  if (fetchError && !ronda) {
    return (
      <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'DM Sans, sans-serif', padding: '24px' }}>
        <div style={{ fontSize: '48px' }}>⛳</div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: '#1a1a2e', textAlign: 'center' }}>
          Error al cargar la ronda
        </h1>
        <p style={{ color: '#4a5568', textAlign: 'center', maxWidth: '320px', fontSize: '14px' }}>
          No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.
        </p>
        <button
          onClick={() => { setFetchError(false); setLoading(true); fetchRonda() }}
          style={{
            background: '#c4992a', color: '#1a1a2e', fontWeight: 700,
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
      <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'DM Sans, sans-serif', padding: '24px' }}>
        <div style={{ fontSize: '64px' }}>🏌️</div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#1a1a2e', textAlign: 'center' }}>
          Ronda no encontrada
        </h1>
        <p style={{ color: '#4a5568', textAlign: 'center', maxWidth: '320px', lineHeight: 1.5 }}>
          El código <strong style={{ color: '#c4992a' }}>{codigo}</strong> no existe o fue eliminado.
          Verifica que el código sea exacto (mayúsculas y minúsculas importan).
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
          <Link href="/ronda-libre/nueva" style={{
            background: '#c4992a', color: '#1a1a2e', textDecoration: 'none',
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
  /* ── WELCOME SCREEN — removed, page is always spectator ─────────────── */
  /* ─────────────────────────────────────────────────────────────────────── */

  /* ─────────────────────────────────────────────────────────────────────── */
  /* ── SPECTATOR VIEW ─────────────────────────────────────────────────── */
  /* ─────────────────────────────────────────────────────────────────────── */
  const isCreator = !!(currentUserId && ronda.creador_id === currentUserId)
  const isAdmin = ronda.admin_mode && ronda.admin_user_id === currentUserId
  const isAdminRound = !!ronda.admin_mode
  const adminPlayerName = isAdminRound
    ? ronda.ronda_libre_jugadores.find(j => j.user_id === ronda.admin_user_id)?.nombre ?? 'El admin'
    : null

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
                {/* 9.2 — Last update timestamp */}
                {!isFinished && timeSinceUpdate && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    {timeSinceUpdate}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                {/* 9.1 — Live indicator badge */}
                {isEnCurso ? (
                  <span className="live-badge-pulse" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: 'rgba(34,197,94,0.15)',
                    color: '#22c55e',
                    border: '1px solid rgba(34,197,94,0.4)',
                    padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                    letterSpacing: '0.05em',
                  }}>
                    <span className="live-dot" style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: '#22c55e', display: 'inline-block', flexShrink: 0,
                    }} />
                    EN VIVO
                  </span>
                ) : (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    background: 'rgba(196,153,42,0.12)',
                    color: '#c4992a',
                    border: '1px solid rgba(196,153,42,0.35)',
                    padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                    letterSpacing: '0.05em',
                  }}>
                    FINALIZADA
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px' }}>

          {/* ── Admin mode info banner for non-admin members ── */}
          {isAdminRound && !isAdmin && currentUserId && adminPlayerName && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.2)',
              borderRadius: '12px', padding: '12px 16px', marginBottom: '16px',
            }}>
              <span style={{ fontSize: '18px', flexShrink: 0 }}>📋</span>
              <span style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.4 }}>
                <strong style={{ color: '#374151' }}>{adminPlayerName}</strong> lleva el score del grupo
              </span>
            </div>
          )}

          {/* ── Winner celebration + podium + share CTA (finished rounds) ── */}
          {isFinished && leaderboard.length > 0 && leaderboard[0].holesPlayed > 0 && (() => {
            const isTie = leaderboard.length > 1 && leaderboard[0].vsPar === leaderboard[1].vsPar
            const winnerScore = leaderboard[0].vsPar
            const scoreColor = winnerScore < 0 ? '#16a34a' : winnerScore === 0 ? '#374151' : '#dc2626'
            const playedPlayers = leaderboard.filter(j => j.holesPlayed > 0)
            return (
              <div style={{ marginBottom: '16px' }}>
                {/* Winner card — white, gold border */}
                <div style={{
                  background: '#ffffff', borderRadius: '16px',
                  border: '2px solid #c4992a',
                  overflow: 'hidden',
                  boxShadow: '0 4px 24px rgba(196,153,42,0.15)',
                }}>
                  {/* Gold accent bar */}
                  <div style={{ height: '4px', background: 'linear-gradient(90deg, #c4992a, #d4a843, #c4992a)' }} />
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

                  {/* Final leaderboard with positions */}
                  {playedPlayers.length > 1 && (
                    <div style={{ padding: '0 20px 16px' }}>
                      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                        {playedPlayers.map((j, idx) => {
                          const posLabel = idx === 0 ? '1°' : idx === 1 ? '2°' : idx === 2 ? '3°' : `${idx + 1}°`
                          const posColor = idx === 0 ? '#c4992a' : idx === 1 ? '#94a8c0' : idx === 2 ? '#b87333' : '#9ca3af'
                          const isWinner = idx === 0
                          const jScoreColor = j.vsPar < 0 ? '#16a34a' : j.vsPar === 0 ? '#374151' : '#dc2626'
                          return (
                            <div key={j.id} style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '8px 0',
                              borderBottom: idx < playedPlayers.length - 1 ? '1px solid #f3f4f6' : 'none',
                            }}>
                              <span style={{
                                fontSize: '15px', fontWeight: 800, color: posColor,
                                minWidth: '28px', textAlign: 'center',
                              }}>{posLabel}</span>
                              <span style={{
                                flex: 1, fontSize: '14px', color: '#111827',
                                fontWeight: isWinner ? 700 : 500,
                              }}>{j.nombre}</span>
                              <span style={{
                                fontSize: '15px', fontWeight: 700, color: jScoreColor,
                              }}>{formatOverUnder(j.vsPar)}</span>
                              <span style={{ fontSize: '12px', color: '#9ca3af', minWidth: '40px', textAlign: 'right' }}>
                                {j.holesPlayed}/{ronda.holes}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Share button — "Compartir resultados" CTA */}
                  <div style={{ padding: '0 20px 20px' }}>
                    <button
                      onClick={async () => {
                        const shareData: LeaderboardShareData = {
                          players: playedPlayers.map(j => ({
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
                      Compartir resultados
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
                <span style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Momentos recientes</span>
                {!isFinished && timeSinceUpdate && (
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>{timeSinceUpdate}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {timelineEvents.map((event, idx) => {
                  const label = event.diff <= -2 ? 'Eagle' : event.diff === -1 ? 'Birdie' : event.diff === 0 ? 'Par' : event.diff === 1 ? 'Bogey' : `+${event.diff}`
                  const color = event.diff <= -2 ? '#c8a55a' : event.diff === -1 ? '#16a34a' : event.diff === 0 ? '#6b7280' : '#dc2626'
                  const bgColor = event.diff <= -2 ? 'rgba(200,165,90,0.08)' : event.diff === -1 ? 'rgba(22,163,74,0.06)' : event.diff >= 2 ? 'rgba(220,38,38,0.04)' : 'transparent'
                  // Approximate relative time: most recent event ~now, each previous ~15s*poll interval ago
                  const approxMinAgo = idx === 0 ? 0 : idx
                  const timeLabel = approxMinAgo === 0 ? 'ahora' : approxMinAgo === 1 ? 'hace ~1 min' : `hace ~${approxMinAgo} min`
                  return (
                    <div key={`${event.jugador}-${event.hole}`} style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '8px 10px', borderRadius: '8px',
                      background: bgColor,
                    }}>
                      {/* Hole number prominent */}
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        background: '#f3f4f6', border: '1px solid #e5e7eb',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#374151' }}>{event.hole}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', color: '#111827', fontWeight: 700 }}>{event.jugador}</div>
                        <div style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>Hoyo {event.hole} · {event.score} golpes</span>
                          <span style={{ color: '#d1d5db' }}>·</span>
                          <span style={{ fontStyle: 'italic' }}>{timeLabel}</span>
                        </div>
                      </div>
                      <span style={{
                        color, fontSize: '13px', fontWeight: 700,
                        padding: '2px 8px', borderRadius: '6px',
                        background: event.diff <= -1 ? `${color}12` : event.diff >= 1 ? `${color}12` : 'transparent',
                        flexShrink: 0,
                      }}>
                        {label}
                      </span>
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
              <span style={{ fontSize: '11px', color: '#4a5568' }}>Probabilidad de ganar en tiempo real</span>
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

        {/* ── Admin: return to scoring bar ── */}
        {isAdmin && ronda.estado === 'en_curso' && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
            background: '#ffffff', borderTop: '1px solid #e2e8f0',
            padding: '12px 20px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
            display: 'flex', justifyContent: 'center',
          }}>
            <Link href={`/ronda-libre/${codigo}/score-grupo`} style={{
              background: '#c4992a', color: '#ffffff', fontWeight: 700,
              fontSize: '15px', padding: '14px 32px', borderRadius: '12px',
              textDecoration: 'none', textAlign: 'center', width: '100%', maxWidth: '400px',
              display: 'block',
            }}>
              Volver a scorear
            </Link>
          </div>
        )}

        {/* ── Registration Banner (anonymous spectators, after 30s or scroll) ── */}
        {showBanner && isAnonymous && !bannerDismissed && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            borderTop: '1px solid #e2e8f0',
            padding: '14px 16px',
            animation: 'slideUpBanner 0.4s ease-out',
          }}>
            <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a2e' }}>
                  Registra tu propio score
                </div>
                <div style={{ fontSize: '12px', color: '#4a5568' }}>
                  Crea tu cuenta gratis y juega con Golfers+
                </div>
              </div>
              <Link
                href={`/register?next=/ronda-libre/${codigo}`}
                style={{
                  background: '#c4992a', color: '#1a1a2e', fontWeight: 700,
                  fontSize: '13px', padding: '10px 18px', borderRadius: '8px',
                  textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                Unirme gratis
              </Link>
              <button
                onClick={dismissBanner}
                style={{
                  background: 'none', border: 'none', color: '#4a5568',
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
                >{'−'}</button>
                <div style={{ fontSize: '40px', fontWeight: 700, color: '#111827', minWidth: '60px', textAlign: 'center' }}>
                  {editScoreValue}
                </div>
                <button
                  onClick={() => setEditScoreValue(v => Math.min(19, v + 1))}
                  style={{
                    width: '48px', height: '48px', borderRadius: '12px',
                    background: '#c4992a', border: 'none',
                    fontSize: '24px', fontWeight: 600, color: '#1a1a2e',
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
                    fontSize: '14px', fontWeight: 700, color: '#1a1a2e', cursor: 'pointer',
                  }}
                >Guardar</button>
              </div>
            </div>
          </div>
        )}

        {/* Banner animation + live badge pulse */}
        <style>{`
          @keyframes slideUpBanner {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes livePulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          .live-dot {
            animation: livePulse 1.5s ease-in-out infinite;
          }
          .live-badge-pulse {
            animation: liveBadgePulse 3s ease-in-out infinite;
          }
          @keyframes liveBadgePulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.3); }
            50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
          }
        `}</style>
      </div>
    )
  }

  // Unreachable — role is always 'espectador', handled above
  return null
}

export default function RondaLibrePage() {
  return (
    <Suspense fallback={<div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5568', fontFamily: 'DM Sans, sans-serif' }}>Cargando ronda...</div>}>
      <RondaLibrePageContent />
    </Suspense>
  )
}
