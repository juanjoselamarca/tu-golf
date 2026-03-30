/* eslint-disable @next/next/no-img-element */
'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import {
  PAR, HOLE_STYLE, FLAG,
  type Player, type Category, type HoleResult,
  getInitials, formatScore, scoreColor, holeResult,
} from '@/lib/golf-data'
import { GWICell } from '@/components/GWICell'

// GWI demo data keyed by player name
function generateGWISeries(indice: number, seed: number): number[] {
  const s: number[] = []
  for (let i = 0; i < 10; i++) {
    const base = 100 - (indice * 3.2)
    const v = Math.sin(seed * 13.7 + i * 7.3) * 6
    s.push(Math.round(Math.max(20, Math.min(98, base + v + i * 0.4)) * 10) / 10)
  }
  return s
}
const GWI_DATA: Record<string, { gwi: number; delta: number; series: number[]; level: string }> = Object.fromEntries(
  [
    { name: 'Carlos Méndez', indice: 2 },
    { name: 'Roberto Silva', indice: 4 },
    { name: 'Andrés Torres', indice: 1 },
    { name: 'Felipe García', indice: 6 },
    { name: 'Miguel Ríos', indice: 3 },
    { name: 'Sebastián López', indice: 5 },
    { name: 'Diego Vargas', indice: 7 },
    { name: 'Martín Pérez', indice: 8 },
    { name: 'Alejandro Cruz', indice: 9 },
    { name: 'Valentina Mora', indice: 12 },
  ].map((p, i) => {
    const series = generateGWISeries(p.indice, i + 1)
    const gwi = series[series.length - 1]
    const delta = Math.round((series[series.length - 1] - series[series.length - 2]) * 10) / 10
    const level = gwi >= 85 ? 'ÉLITE' : gwi >= 70 ? 'AVANZADO' : gwi >= 50 ? 'INTERMEDIO' : 'BÁSICO'
    return [p.name, { gwi, delta, series, level }]
  })
)

// ─────────────────────────────────────────────────────────
// TOAST SYSTEM
// ─────────────────────────────────────────────────────────

type ToastType = 'birdie' | 'eagle' | 'leader' | 'rise'

interface ToastItem {
  id:      number
  type:    ToastType
  icon:    string
  title:   string
  sub:     string
  visible: boolean
}

const TOAST_BORDER: Record<ToastType, string> = {
  birdie: '#16a34a',
  eagle:  '#2563eb',
  leader: '#c4992a',
  rise:   '#1a4fd6',
}

const AUTO_TOASTS: Omit<ToastItem, 'id' | 'visible'>[] = [
  { type: 'birdie', icon: '🟡', title: 'Birdie · Carlos Méndez',      sub: 'Hoyo 12 · -9 total'            },
  { type: 'eagle',  icon: '🔵', title: 'Eagle · Roberto Silva',        sub: 'Hoyo 7 · -7 total'             },
  { type: 'leader', icon: '🏆', title: 'Nuevo líder · C. Méndez',      sub: '-8 · TPC Sawgrass Amateur'      },
  { type: 'rise',   icon: '⬆️', title: 'Subió 2 puestos · F. García',  sub: 'Posición 4 · -2 total'          },
]

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

function playTick(interacted: boolean) {
  if (!interacted) return
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx  = new Ctx()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(900, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.06)
    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22)
    osc.start()
    osc.stop(ctx.currentTime + 0.22)
    setTimeout(() => ctx.close(), 400)
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────
// SCORECARD COMPONENT
// ─────────────────────────────────────────────────────────

function Scorecard({
  player,
  onShare,
}: {
  player: Player
  onShare: (p: Player) => void
}) {
  const front = player.scores.slice(0, 9)
  const back  = player.scores.slice(9, 18)

  function sumGroup(scores: (number | null)[], pars: number[]) {
    let s = 0, p = 0
    scores.forEach((sc, i) => { if (sc !== null) { s += sc; p += pars[i] } })
    return { score: s, par: p, vsPar: s - p, anyPlayed: scores.some(sc => sc !== null) }
  }

  const frontStats = sumGroup(front, PAR.slice(0, 9))
  const backStats  = sumGroup(back,  PAR.slice(9))

  function renderGroup(scores: (number | null)[], startIdx: number) {
    return (
      <div className="flex gap-1.5" style={{ flexWrap: 'nowrap' }}>
        {scores.map((score, i) => {
          const hNum   = startIdx + i + 1
          const par    = PAR[startIdx + i]
          const played = score !== null
          const diff   = played ? score! - par : 0
          const isAce  = score === 1

          // PGA format: circle for under par, square for over par
          const isCircle = played && diff < 0
          const isSquare = played && diff > 0
          const isDouble = played && Math.abs(diff) >= 2
          const shapeColor = isCircle ? '#c4992a' : '#EF4444'

          return (
            <div
              key={hNum}
              className="flex flex-col items-center justify-between flex-shrink-0"
              style={{ width: 50, height: 62, padding: '5px 3px' }}
            >
              <span style={{ fontSize: 9, color: '#94a8c0', lineHeight: 1 }}>H.{hNum}</span>
              <span style={{ fontSize: 9, color: '#94a8c0', lineHeight: 1 }}>par {par}</span>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {isDouble && (isCircle || isSquare) && (
                  <div style={{
                    position: 'absolute', inset: '-4px',
                    border: `1px solid ${shapeColor}`,
                    borderRadius: isCircle ? '50%' : '3px',
                  }} />
                )}
                <span
                  className="font-sans font-bold"
                  style={{
                    fontSize: 18, lineHeight: 1,
                    color: isAce ? '#c4992a' : played ? 'rgba(255,255,255,0.85)' : '#3a4a5a',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: isCircle ? '28px' : 'auto', height: isCircle ? '28px' : 'auto',
                    padding: isSquare ? '1px 4px' : '0',
                    border: (isCircle || isSquare) ? `1.5px solid ${shapeColor}` : 'none',
                    borderRadius: isCircle ? '50%' : isSquare ? '3px' : '0',
                  }}
                >
                  {played ? score : '—'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="px-5 py-4" style={{ background: '#0a1525', borderTop: '1px solid rgba(196,153,42,0.1)' }}>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 520 }}>

          <div className="mb-3">
            <p className="font-sans mb-2" style={{ fontSize: 10, letterSpacing: '0.08em', color: '#94a8c0', textTransform: 'uppercase' }}>
              Front 9 — par 35
            </p>
            {renderGroup(front, 0)}
          </div>

          <div className="mb-4">
            <p className="font-sans mb-2" style={{ fontSize: 10, letterSpacing: '0.08em', color: '#94a8c0', textTransform: 'uppercase' }}>
              Back 9 — par 37
            </p>
            {renderGroup(back, 9)}
          </div>

          {/* Totals + share button */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 pt-3"
            style={{ borderTop: '1px solid rgba(196,153,42,0.15)' }}
          >
            <div className="flex flex-wrap gap-x-5 gap-y-1 font-sans text-sm">
              {[
                { label: 'Front 9', stats: frontStats },
                { label: 'Back 9',  stats: backStats  },
                { label: 'Total',   stats: { score: frontStats.score + backStats.score, vsPar: player.today, anyPlayed: true } },
              ].map(({ label, stats }) => stats.anyPlayed && (
                <span key={label}>
                  <span style={{ color: '#94a8c0' }}>{label}: </span>
                  <span style={{ color: scoreColor(stats.vsPar), fontWeight: 700 }}>
                    {stats.score} ({formatScore(stats.vsPar)})
                  </span>
                </span>
              ))}
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); onShare(player) }}
              className="font-sans font-semibold text-xs px-4 py-2 transition-all duration-200 hover:brightness-110 flex items-center gap-1.5 flex-shrink-0"
              style={{ background: 'rgba(196,153,42,0.15)', color: '#c4992a', borderRadius: 4, border: '1px solid rgba(196,153,42,0.35)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              Compartir resultado
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// POSITION BADGE
// ─────────────────────────────────────────────────────────

function PosBadge({ pos }: { pos: number }) {
  if (pos > 3) return <span className="font-sans font-bold text-lg text-ivory">{pos}</span>
  const bg   = pos === 1 ? '#c4992a' : pos === 2 ? '#9ca3af' : '#b45309'
  const text = pos === 3 ? '#ffffff' : '#070d18'
  return (
    <span
      className="inline-flex items-center justify-center font-sans font-bold text-sm"
      style={{ width: 28, height: 28, borderRadius: '50%', background: bg, color: text, flexShrink: 0 }}
    >
      {pos}
    </span>
  )
}

// ─────────────────────────────────────────────────────────
// SHARE CARD  (off-screen, captured by html2canvas)
// ─────────────────────────────────────────────────────────

function ShareCard({
  cardRef,
  player,
}: {
  cardRef: React.RefObject<HTMLDivElement | null>
  player: Player | null
}) {
  if (!player) return null
  return (
    <div
      ref={cardRef as React.RefObject<HTMLDivElement>}
      style={{
        position:        'fixed',
        top:             0,
        left:            '-9999px',
        width:           600,
        height:          315,
        backgroundColor: '#070d18',
        color:           '#edeae4',
        fontFamily:      '"DM Sans", system-ui, sans-serif',
        padding:         '26px 30px',
        boxSizing:       'border-box',
        border:          '2px solid rgba(196,153,42,0.4)',
        overflow:        'hidden',
        zIndex:          -1,
      }}
    >
      {/* Decorative L corner */}
      <div style={{ position: 'absolute', top: 12, left: 12, width: 28, height: 28, borderTop: '2px solid #c4992a', borderLeft: '2px solid #c4992a' }} />
      <div style={{ position: 'absolute', bottom: 12, right: 12, width: 28, height: 28, borderBottom: '2px solid #c4992a', borderRight: '2px solid #c4992a' }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 17, fontWeight: 700, color: '#c4992a' }}>Golfers+</div>
        <div style={{ fontSize: 17 }}>⛳</div>
      </div>

      {/* Gold line */}
      <div style={{ height: 1, backgroundColor: 'rgba(196,153,42,0.5)', marginBottom: 12 }} />

      {/* Player */}
      <div style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 22, fontWeight: 700, color: '#edeae4', marginBottom: 3 }}>
        {player.name}
      </div>
      <div style={{ fontSize: 12, color: '#94a8c0', marginBottom: 14 }}>TPC Sawgrass Amateur 2025</div>

      {/* Score row */}
      <div style={{ display: 'flex', gap: 22, marginBottom: 16 }}>
        {[
          { label: 'Posición', value: `#${player.pos}`,              color: '#c4992a'               },
          { label: 'Score',    value: formatScore(player.today),      color: scoreColor(player.today) },
          { label: 'Cat.',     value: player.cat,                     color: '#edeae4'               },
          { label: 'Ronda',    value: '1',                            color: '#edeae4'               },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: '#94a8c0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Hole grid */}
      <div style={{ display: 'flex', gap: 3 }}>
        {player.scores.map((score, i) => {
          const par    = PAR[i]
          const played = score !== null
          const result = played ? holeResult(score!, par) : 'par'
          const hs     = played ? HOLE_STYLE[result] : { border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }
          return (
            <div
              key={i}
              style={{
                width: 27, height: 36,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                borderRadius: 3, ...hs,
              }}
            >
              <span style={{ fontSize: 8, color: '#94a8c0', lineHeight: 1 }}>H{i + 1}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: played ? scoreColor(score! - par) : '#3a4a5a', lineHeight: 1.3 }}>
                {played ? score : '—'}
              </span>
            </div>
          )
        })}
      </div>

      {/* URL */}
      <div style={{ position: 'absolute', bottom: 22, left: 30, fontSize: 11, color: '#94a8c0' }}>
        tugolf.app/torneo/tpc-sawgrass-amateur-2025
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// SHARE MODAL
// ─────────────────────────────────────────────────────────

function ShareModal({
  imageUrl,
  onClose,
}: {
  imageUrl: string
  onClose: () => void
}) {
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/torneo/tpc-sawgrass-amateur-2025`
    : '/torneo/tpc-sawgrass-amateur-2025'

  const [copied, setCopied] = useState(false)

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="glass-card rounded-xl p-5 w-full"
        style={{ maxWidth: 520 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-ivory text-lg">Compartir resultado</h3>
          <button onClick={onClose} className="text-gray-soft hover:text-ivory transition-colors text-xl leading-none">×</button>
        </div>

        <img src={imageUrl} alt="Scorecard" className="w-full rounded-lg mb-5" style={{ border: '1px solid rgba(196,153,42,0.2)' }} />

        <div className="flex gap-3">
          <a
            href={imageUrl}
            download="scorecard-golfersplus.png"
            className="flex-1 flex items-center justify-center gap-2 font-sans font-semibold text-sm py-3 transition-all hover:brightness-110"
            style={{ background: '#c4992a', color: '#070d18', borderRadius: 4 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Descargar imagen
          </a>
          <button
            onClick={copyLink}
            className="flex-1 font-sans font-semibold text-sm py-3 transition-all hover:bg-gold/10"
            style={{ border: '1px solid rgba(196,153,42,0.4)', color: copied ? '#16a34a' : '#c4992a', borderRadius: 4 }}
          >
            {copied ? '✓ Link copiado' : 'Copiar link del torneo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// TOAST STACK RENDERER
// ─────────────────────────────────────────────────────────

function ToastStack({
  toasts,
  onRemove,
}: {
  toasts: ToastItem[]
  onRemove: (id: number) => void
}) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2" style={{ pointerEvents: 'none' }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="glass-card flex items-start gap-3 p-3.5"
          style={{
            width:       280,
            borderLeft:  `3px solid ${TOAST_BORDER[toast.type]}`,
            transform:   toast.visible ? 'translateX(0)' : 'translateX(115%)',
            opacity:     toast.visible ? 1 : 0,
            transition:  'transform 300ms ease, opacity 300ms ease',
            pointerEvents: 'all',
          }}
        >
          <span className="text-xl leading-none flex-shrink-0 mt-0.5">{toast.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="font-sans font-semibold text-ivory" style={{ fontSize: 13 }}>{toast.title}</p>
            <p className="font-sans text-gray-soft mt-0.5" style={{ fontSize: 12 }}>{toast.sub}</p>
          </div>
          <button
            onClick={() => onRemove(toast.id)}
            className="flex-shrink-0 text-gray-soft hover:text-ivory transition-colors mt-0.5"
            style={{ fontSize: 16, lineHeight: 1, padding: 2 }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────

export default function LeaderboardTable({ players, modoJuego }: { players: Player[]; modoJuego?: string }) {
  const [activeTab,   setActiveTab]   = useState<Category>('General')
  const [expandedId,  setExpandedId]  = useState<number | null>(null)
  const [toasts,      setToasts]      = useState<ToastItem[]>([])
  const [sharePlayer, setSharePlayer] = useState<Player | null>(null)
  const [shareImage,  setShareImage]  = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const shareCardRef = useRef<HTMLDivElement | null>(null)
  const hasInteracted = useRef(false)

  // Track user interaction for Web Audio
  useEffect(() => {
    const mark = () => { hasInteracted.current = true }
    document.addEventListener('click',      mark, { once: true })
    document.addEventListener('touchstart', mark, { once: true })
    return () => {
      document.removeEventListener('click',      mark)
      document.removeEventListener('touchstart', mark)
    }
  }, [])

  // ── Toast management ──────────────────────────────────
  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 380)
  }, [])

  const addToast = useCallback((data: Omit<ToastItem, 'id' | 'visible'>) => {
    const id = Date.now()
    setToasts(prev => {
      const limited = prev.length >= 2 ? prev.slice(-1) : prev
      return [...limited, { ...data, id, visible: false }]
    })
    // Animate in (double rAF to allow initial render)
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: true } : t))
      )
    )
    playTick(hasInteracted.current)
    // Auto-remove
    const t1 = setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t)), 4000)
    const t2 = setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4450)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Auto-rotating toasts
  useEffect(() => {
    let idx = 0
    let interval: ReturnType<typeof setInterval>
    const first = setTimeout(() => {
      addToast(AUTO_TOASTS[idx % AUTO_TOASTS.length]); idx++
      interval = setInterval(() => { addToast(AUTO_TOASTS[idx % AUTO_TOASTS.length]); idx++ }, 8000)
    }, 3000)
    return () => { clearTimeout(first); clearInterval(interval) }
  }, [addToast])

  // ── Share / html2canvas ───────────────────────────────
  const handleShare = async (player: Player) => {
    setSharePlayer(player)
    setIsCapturing(true)
    await new Promise(r => setTimeout(r, 180))
    try {
      await document.fonts.ready
      const html2canvas = (await import('html2canvas')).default
      const el = shareCardRef.current
      if (!el) return
      const canvas = await html2canvas(el, {
        scale:           2,
        useCORS:         true,
        backgroundColor: '#070d18',
        logging:         false,
      })
      setShareImage(canvas.toDataURL('image/png'))
    } catch (e) {
      console.error('html2canvas error:', e)
    } finally {
      setIsCapturing(false)
    }
  }

  const closeShare = () => {
    setShareImage(null)
    setSharePlayer(null)
  }

  // ── Filter ────────────────────────────────────────────
  const filtered = players.filter(p => {
    if (activeTab === 'General')     return true
    if (activeTab === 'Categoría A') return p.cat === 'Cat. A'
    return p.cat === 'Cat. B'
  })

  const handleToggle = (pos: number) =>
    setExpandedId(prev => prev === pos ? null : pos)

  const leader = filtered[0] ?? null
  const liveCount = filtered.filter((player) => player.status !== 'F').length

  // ─────────────────────────────────────────────────────
  return (
    <>
      <div
        className="glass-card rounded-xl p-4 mb-5"
        style={{ background: 'linear-gradient(135deg, rgba(23,49,41,0.96) 0%, rgba(10,21,37,0.92) 100%)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-sans text-[11px] uppercase tracking-[0.18em]" style={{ color: '#9fb4aa' }}>
              Broadcast leaderboard
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#9ae6b4', border: '1px solid rgba(34,197,94,0.24)' }}
              >
                <span className="live-dot inline-block h-2 w-2 rounded-full bg-green-400" />
                {liveCount > 0 ? `${liveCount} en cancha` : 'Ronda cerrada'}
              </span>
              {leader && (
                <span className="font-sans text-sm" style={{ color: '#f3efe6' }}>
                  Lider: <strong style={{ color: '#c8a55a' }}>{leader.name}</strong> {formatScore(leader.total)}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-sans text-sm" style={{ color: '#9fb4aa' }}>
            <span>{filtered.length} jugadores</span>
            <span>Tap en jugador para tarjeta</span>
          </div>
        </div>
      </div>

      {/* ── Category Tabs ──────────────────────────────── */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {(['General', 'Categoría A', 'Categoría B'] as Category[]).map(tab => {
          const active = tab === activeTab
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="font-sans text-sm px-4 py-2 transition-all duration-200"
              style={{
                background:   active ? '#c4992a' : 'transparent',
                color:        active ? '#070d18' : '#94a8c0',
                border:       active ? 'none'    : '1px solid rgba(196,153,42,0.4)',
                fontWeight:   active ? 600 : 400,
                borderRadius: '4px',
              }}
            >
              {tab}
            </button>
          )
        })}
      </div>

      {/* ── Table ────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(196,153,42,0.13)' }}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 660, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(196,153,42,0.08)', borderBottom: '1px solid rgba(196,153,42,0.28)' }}>
                {[
                  { label: 'POS',    align: 'center', w: 60  },
                  { label: 'JUGADOR',align: 'left',   w: 'auto' },
                  { label: 'HCP',    align: 'center', w: 60  },
                  { label: 'PAR',    align: 'center', w: 70  },
                  { label: modoJuego === 'stableford' ? 'PTS' : 'HOY',   align: 'center', w: 80  },
                  { label: modoJuego === 'stableford' ? 'TOTAL PTS' : 'TOTAL', align: 'center', w: 80  },
                  { label: 'HOYO',   align: 'center', w: 110 },
                  { label: 'GWI™',   align: 'right',  w: 100 },
                ].map(col => (
                  <th
                    key={col.label}
                    className="font-sans py-3 px-4"
                    style={{
                      fontSize:      11,
                      letterSpacing: '0.1em',
                      color:         '#94a8c0',
                      textTransform: 'uppercase',
                      fontWeight:    600,
                      textAlign:     col.align as 'center' | 'left',
                      width:         col.w,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(player => {
                const isLeader   = player.pos === 1
                const isExpanded = expandedId === player.pos
                const rowBg      = isLeader ? 'rgba(196,153,42,0.05)' : '#070d18'
                const currentHoleLabel = player.status === 'F' ? 'F' : `${player.holes}/18`
                const parState = player.today === 0 ? 'E' : player.today > 0 ? `+${player.today}` : `${player.today}`

                return (
                  <Fragment key={player.pos}>
                    {/* Player row */}
                    <tr
                      className="cursor-pointer"
                      style={{
                        background:   rowBg,
                        borderLeft:   isLeader ? '3px solid #c4992a' : '3px solid transparent',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        transition:   'background 140ms ease',
                      }}
                      onClick={() => handleToggle(player.pos)}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#132540' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = rowBg }}
                    >
                      {/* POS */}
                      <td className="py-3.5 px-4 text-center"><PosBadge pos={player.pos} /></td>

                      {/* JUGADOR */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex-shrink-0 flex items-center justify-center font-sans font-bold text-white rounded-full"
                            style={{ width: 36, height: 36, fontSize: 13, background: 'linear-gradient(135deg, #1a4fd6 0%, #c4992a 100%)' }}
                          >
                            {getInitials(player.name)}
                          </div>
                          <div>
                            <div className="font-sans font-semibold text-ivory" style={{ fontSize: 15 }}>{player.name}</div>
                            <div className="font-sans mt-0.5" style={{ fontSize: 12, color: '#94a8c0' }}>
                              {FLAG[player.country]} {player.cat}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* HCP */}
                      <td className="py-3.5 px-4 text-center font-sans text-sm text-gray-soft">{player.hcp}</td>

                      {/* PAR */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className="inline-flex min-w-[46px] items-center justify-center rounded-full px-2.5 py-1 font-sans text-xs font-semibold"
                          style={{
                            background: 'rgba(243,239,230,0.06)',
                            color: scoreColor(player.today),
                            border: `1px solid ${player.today === 0 ? 'rgba(243,239,230,0.12)' : 'rgba(200,165,90,0.18)'}`,
                          }}
                        >
                          {parState}
                        </span>
                      </td>

                      {/* HOY */}
                      <td className="py-3.5 px-4 text-center font-sans font-bold"
                        style={{ fontSize: 18, color: scoreColor(player.today) }}>
                        {formatScore(player.today)}
                      </td>

                      {/* TOTAL */}
                      <td className="py-3.5 px-4 text-center font-sans font-bold"
                        style={{ fontSize: 18, color: scoreColor(player.total) }}>
                        {formatScore(player.total)}
                      </td>

                      {/* HOYOS */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col items-center gap-1.5">
                          {player.status === 'F' ? (
                            <span className="font-sans text-sm text-gray-soft">F</span>
                          ) : (
                            <>
                              <span className="font-sans font-semibold text-sm" style={{ color: '#c4992a' }}>
                                {currentHoleLabel}
                              </span>
                              <div className="rounded-full overflow-hidden" style={{ width: 56, height: 3, background: '#132540' }}>
                                <div
                                  className="h-full rounded-full animate-pulse"
                                  style={{ width: `${(player.holes / 18) * 100}%`, background: '#c4992a' }}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </td>

                      {/* GWI™ */}
                      <td className="py-3.5 px-4">
                        {(() => {
                          const gd = GWI_DATA[player.name]
                          if (!gd) return <span style={{ color: '#3a4a5a', fontSize: 12 }}>—</span>
                          return <GWICell gwi={gd.gwi} delta={gd.delta} series={gd.series} level={gd.level} />
                        })()}
                      </td>
                    </tr>

                    {/* Accordion */}
                    <tr style={{ background: '#0a1525' }}>
                      <td colSpan={8} style={{ padding: 0 }}>
                        <div style={{ display: 'grid', gridTemplateRows: isExpanded ? '1fr' : '0fr', transition: 'grid-template-rows 300ms ease' }}>
                          <div style={{ overflow: 'hidden' }}>
                            <Scorecard player={player} onShare={handleShare} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-14 text-center font-sans text-gray-soft">
                    No hay jugadores en esta categoría.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Hint */}
        <div className="px-5 py-2.5 font-sans text-[11px] text-gray-soft text-right"
          style={{ background: 'rgba(196,153,42,0.04)', borderTop: '1px solid rgba(196,153,42,0.08)' }}>
          Haz clic en un jugador para ver su scorecard
        </div>
      </div>

      {/* ── Legend ─────────────────────────────────────── */}
      <div className="mt-8">
        <div className="gold-divider mb-5" />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
          <span className="font-sans font-medium text-gray-soft" style={{ fontSize: 12 }}>Leyenda:</span>
          {([
            { label: 'Eagle',  result: 'eagle'  as HoleResult },
            { label: 'Birdie', result: 'birdie' as HoleResult },
            { label: 'Par',    result: 'par'    as HoleResult },
            { label: 'Bogey',  result: 'bogey'  as HoleResult },
            { label: 'Doble+', result: 'double' as HoleResult },
          ]).map(({ label, result }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="rounded-sm flex-shrink-0" style={{ width: 14, height: 14, ...HOLE_STYLE[result] }} />
              <span className="font-sans text-gray-soft" style={{ fontSize: 12 }}>{label}</span>
            </div>
          ))}
          <span className="font-sans text-gray-soft" style={{ fontSize: 12 }}>· F = Finalizado · Número = Hoyo en curso</span>
        </div>
      </div>

      {/* ── Off-screen share card ─────────────────────── */}
      <ShareCard cardRef={shareCardRef} player={sharePlayer} />

      {/* ── Capturing overlay ────────────────────────── */}
      {isCapturing && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="glass-card px-8 py-5 font-sans text-ivory text-sm flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-gold border-t-transparent rounded-full animate-spin" />
            Generando imagen…
          </div>
        </div>
      )}

      {/* ── Share modal ──────────────────────────────── */}
      {shareImage && <ShareModal imageUrl={shareImage} onClose={closeShare} />}

      {/* ── Toast stack ──────────────────────────────── */}
      <ToastStack toasts={toasts} onRemove={removeToast} />
    </>
  )
}
