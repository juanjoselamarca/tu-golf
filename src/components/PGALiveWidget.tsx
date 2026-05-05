'use client'
import { useEffect, useState, useRef } from 'react'

interface Player {
  position: string
  name:     string
  nameFull: string
  score:    string
  today:    string
  thru:     string
  flag:     string
  country:  string
  countryCode: string
  roundNum: number
  isTeam?:  boolean
}

const LATAM_CODES = new Set(['cl','ar','co','mx','br','ve','py','pr','pe','uy','ec','bo','cr','do','gt','hn','ni','pa','sv','cu'])

interface NextEvent { name: string; start: string; end: string; venue: string }

interface PGAData {
  active: boolean; live?: boolean; complete?: boolean
  tournament?: string; round?: string; course?: string
  players?: Player[]; next_event?: NextEvent
  isTeamEvent?: boolean
}

/**
 * True when the tournament exists on ESPN (active: true) but no player
 * has teed off yet for the current round. In that state ESPN returns
 * scores as 'E' and `thru` holding tee times (e.g. "7:30a") or '—'.
 * Rendering a table of `E / E / E / E / E` looks like a broken placeholder
 * (audit P9 / foto 22). We prefer a single "starts at…" card instead.
 */
function isPreStart(d: PGAData): boolean {
  if (!d.active) return false
  if (d.live || d.complete) return false
  const players = d.players || []
  if (players.length === 0) return true
  // Every player at E total, every player at E today, and nobody has played a hole.
  return players.every(p => {
    const onCourse = /^\d+$/.test(p.thru) || p.thru === 'F'
    return p.score === 'E' && p.today === 'E' && !onCourse
  })
}

/**
 * Format an ISO date + time guess into a LatAm-friendly start label.
 * The next_event schedule only carries dates, so we use "12:00 AM EDT"
 * as the PGA Tour's standard opening pre-announcement. Kept as a static
 * tail so visual hierarchy stays consistent.
 */
function formatStartLabel(startDate: string): string {
  const [y, m, day] = startDate.split('-').map(Number)
  const d = new Date(y, m - 1, day)
  const dayStr = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
  return `Empieza el ${dayStr} · 12:00 AM EDT`
}

function scoreColor(s: string): string {
  if (!s || s === 'E') return 'rgba(255,255,255,0.6)'
  return s.startsWith('-') ? '#00e676' : '#ff1744'
}

function thruColor(t: string): string {
  if (t === 'F') return '#00e676'
  if (t === '—') return 'rgba(255,255,255,0.15)'
  // Tee times contain 'a' or 'p' (e.g. "7:30a", "1p")
  if (/[ap]$/.test(t)) return 'rgba(255,255,255,0.25)'
  return 'rgba(255,255,255,0.4)'
}

function formatDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

const M = 'var(--font-dm-mono), monospace'
const REFRESH_MS = 30000

export default function PGALiveWidget() {
  const [data, setData] = useState<PGAData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [progress, setProgress] = useState(100) // countdown bar 100→0
  const [prevScores, setPrevScores] = useState<Record<string, string>>({})
  const [changedPlayers, setChangedPlayers] = useState<Set<string>>(new Set())
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/pga-live')
        const json = await res.json()

        // Detect score changes for flash animation
        if (data?.players) {
          const prev: Record<string, string> = {}
          data.players.forEach(p => { prev[p.nameFull] = p.score })
          setPrevScores(prev)

          const changed = new Set<string>()
          ;(json.players || []).forEach((p: Player) => {
            if (prev[p.nameFull] && prev[p.nameFull] !== p.score) changed.add(p.nameFull)
          })
          setChangedPlayers(changed)
          if (changed.size > 0) setTimeout(() => setChangedPlayers(new Set()), 2000)
        }

        setData(json)
        setProgress(100) // reset countdown
      } catch {
        setData({ active: false })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, REFRESH_MS)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Countdown progress bar
  useEffect(() => {
    if (!data?.live) return
    progressRef.current = setInterval(() => {
      setProgress(p => Math.max(0, p - (100 / (REFRESH_MS / 100))))
    }, 100)
    return () => { if (progressRef.current) clearInterval(progressRef.current) }
  }, [data?.live])

  if (loading) return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: '14px', padding: '24px', maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ height: '14px', width: '50%', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', marginBottom: '10px' }} />
      <div style={{ height: '10px', width: '30%', background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }} />
    </div>
  )

  if (!data?.active) {
    return (
      <div style={{ background: 'var(--bg-surface)', borderRadius: '14px', overflow: 'hidden', maxWidth: '680px', margin: '0 auto', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ background: '#0066cc', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.08em' }}>PGA TOUR</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Sin torneo activo</span>
        </div>
        {data?.next_event && (
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', fontFamily: M, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Próximo</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#c4992a', marginBottom: '4px' }}>{data.next_event.name}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontFamily: M }}>
              {data.next_event.venue} · {formatDate(data.next_event.start)}–{formatDate(data.next_event.end)}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Pre-start state: torneo confirmado pero aún no tee-off. Evita renderizar
  // una grilla de 'E / E / E / E / E' que parece placeholder roto (P9).
  if (isPreStart(data)) {
    const venue = data.course || data.next_event?.venue || ''
    const startLine = data.next_event?.start
      ? formatStartLabel(data.next_event.start)
      : 'Comienza pronto'
    return (
      <div style={{ background: 'var(--bg-surface)', borderRadius: '14px', overflow: 'hidden', maxWidth: '680px', margin: '0 auto', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ background: '#0066cc', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.08em' }}>PGA TOUR</span>
          <span style={{ background: 'rgba(196,153,42,0.15)', color: '#c4992a', fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.08em' }}>PRÓXIMO</span>
        </div>
        <div style={{ padding: '20px 16px' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#c4992a', marginBottom: '8px', lineHeight: 1.25 }}>
            {data.tournament || data.next_event?.name || 'Próximo torneo'}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', fontFamily: M, lineHeight: 1.6 }}>
            {startLine}
          </div>
          {venue && (
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', fontFamily: M, lineHeight: 1.6 }}>
              {venue}
            </div>
          )}
        </div>
        <div style={{
          padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.04)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', fontFamily: M }}>
            ESPN
          </span>
          <a href="https://www.pgatour.com" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', textDecoration: 'none', fontFamily: M }}>
            pgatour.com →
          </a>
        </div>
      </div>
    )
  }

  const allPlayers = data.players || []
  const visiblePlayers = expanded ? allPlayers : allPlayers.slice(0, 5)
  const roundNum = allPlayers[0]?.roundNum || 1

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: '14px', overflow: 'hidden', maxWidth: '680px', margin: '0 auto', border: '1px solid rgba(255,255,255,0.06)' }}>

      {/* Refresh countdown bar */}
      {data.live && (
        <div style={{ height: '2px', background: 'rgba(255,255,255,0.04)' }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: 'linear-gradient(90deg, #c4992a, #00e676)',
            transition: 'width 100ms linear',
          }} />
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span style={{ background: '#0066cc', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.08em' }}>PGA TOUR</span>
          {data.live && (
            <span style={{
              background: '#cc0000', color: '#fff', fontSize: '9px', fontWeight: 700,
              padding: '3px 10px', borderRadius: '4px',
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              animation: 'liveGlow 2s ease infinite',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff', animation: 'livePulse 1.5s ease-in-out infinite' }} />
              EN VIVO
            </span>
          )}
          {data.complete && (
            <span style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px' }}>FINALIZADO</span>
          )}
        </div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#c4992a', marginBottom: '2px' }}>{data.tournament}</div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontFamily: M }}>
          {data.course}{data.round ? ` · ${data.round}` : ''}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '32px 1fr 44px 40px 36px',
        padding: '8px 16px', background: 'rgba(255,255,255,0.02)',
      }}>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontFamily: M, textTransform: 'uppercase' }}>#</span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontFamily: M, textTransform: 'uppercase' }}>{data.isTeamEvent ? 'Equipo' : 'Jugador'}</span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontFamily: M, textTransform: 'uppercase', textAlign: 'right' }}>Tot</span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontFamily: M, textTransform: 'uppercase', textAlign: 'right' }}>Hoy</span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontFamily: M, textTransform: 'uppercase', textAlign: 'right' }}>Thru</span>
      </div>

      {/* Players */}
      {visiblePlayers.map((p, i) => {
        const isLeader = i === 0
        const justChanged = changedPlayers.has(p.nameFull)
        const isLatam = LATAM_CODES.has(p.countryCode)

        return (
          <div key={p.nameFull || i} className="pga-row" style={{
            display: 'grid', gridTemplateColumns: '32px 1fr 44px 40px 36px',
            padding: '9px 16px', alignItems: 'center',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            background: justChanged
              ? 'rgba(196,153,42,0.12)'
              : isLeader
                ? 'linear-gradient(90deg, rgba(196,153,42,0.08), rgba(196,153,42,0.02))'
                : 'transparent',
            borderLeft: isLatam ? '3px solid #c4992a' : isLeader ? '3px solid #c4992a' : '3px solid transparent',
            transition: 'background 0.3s ease',
          }}>
            <span style={{
              fontSize: '12px', fontFamily: M, fontWeight: isLeader ? 700 : 400,
              color: isLeader ? '#c4992a' : 'rgba(255,255,255,0.35)',
            }}>{p.position}</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              {/* Team events (Zurich Classic, etc.) no tienen un único país:
                  omitimos el slot de bandera por completo, no un placeholder gris. */}
              {!p.isTeam && (p.flag ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.flag}
                  alt={p.country}
                  width={18}
                  height={13}
                  style={{ borderRadius: '2px', flexShrink: 0, objectFit: 'cover' }}
                />
              ) : (
                <span style={{ width: '18px', height: '13px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
              ))}
              <span style={{
                fontSize: '13px', fontWeight: isLeader || isLatam ? 600 : 400,
                color: isLatam ? '#f3d37a' : 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{p.name}</span>
              {isLatam && (
                <span style={{
                  fontSize: '8px', fontWeight: 700, color: '#c4992a',
                  background: 'rgba(196,153,42,0.15)', padding: '1px 5px',
                  borderRadius: '3px', letterSpacing: '0.05em', flexShrink: 0,
                }}>LATAM</span>
              )}
            </div>

            <span style={{
              fontSize: isLeader ? '15px' : '14px', fontFamily: M, fontWeight: 700,
              color: scoreColor(p.score), textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}>{p.score}</span>

            <span style={{
              fontSize: '12px', fontFamily: M, fontWeight: 500,
              color: scoreColor(p.today), textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}>{p.today}</span>

            <span style={{
              fontSize: '11px', fontFamily: M,
              color: thruColor(p.thru), textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}>{p.thru}</span>
          </div>
        )
      })}

      {/* Expand / Collapse */}
      {allPlayers.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'block', width: '100%', padding: '10px 16px',
            background: 'none', border: 'none', borderTop: '1px solid rgba(255,255,255,0.04)',
            color: '#c4992a', fontSize: '11px', fontFamily: M, fontWeight: 600,
            cursor: 'pointer', textAlign: 'center',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {expanded ? 'Ver menos ▲' : `Ver top ${allPlayers.length} ▼`}
        </button>
      )}

      {/* Footer */}
      <div style={{
        padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', fontFamily: M }}>
          ESPN · R{roundNum}
        </span>
        <a href="https://www.pgatour.com" target="_blank" rel="noopener noreferrer"
          style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', textDecoration: 'none', fontFamily: M }}>
          pgatour.com →
        </a>
      </div>

      <style>{`
        .pga-row:hover { background: rgba(196,153,42,0.06) !important; }
        @keyframes liveGlow {
          0%, 100% { box-shadow: 0 0 4px rgba(204,0,0,0.4); }
          50% { box-shadow: 0 0 10px rgba(204,0,0,0.7); }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
