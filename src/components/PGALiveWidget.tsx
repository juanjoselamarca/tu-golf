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
  roundNum: number
}

interface NextEvent { name: string; start: string; end: string; venue: string }

interface PGAData {
  active: boolean; live?: boolean; complete?: boolean
  tournament?: string; round?: string; course?: string
  players?: Player[]; next_event?: NextEvent
}

function scoreColor(s: string): string {
  if (!s || s === 'E') return 'rgba(255,255,255,0.6)'
  return s.startsWith('-') ? '#00e676' : '#ff1744'
}

function thruColor(t: string): string {
  if (t === 'F') return '#00e676'
  if (t === '—') return 'rgba(255,255,255,0.15)'
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
    <div style={{ background: '#0e1c2f', borderRadius: '14px', padding: '24px', maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ height: '14px', width: '50%', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', marginBottom: '10px' }} />
      <div style={{ height: '10px', width: '30%', background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }} />
    </div>
  )

  if (!data?.active) {
    return (
      <div style={{ background: '#0e1c2f', borderRadius: '14px', overflow: 'hidden', maxWidth: '680px', margin: '0 auto', border: '1px solid rgba(255,255,255,0.06)' }}>
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

  const allPlayers = data.players || []
  const visiblePlayers = expanded ? allPlayers : allPlayers.slice(0, 5)
  const roundNum = allPlayers[0]?.roundNum || 1

  return (
    <div style={{ background: '#0e1c2f', borderRadius: '14px', overflow: 'hidden', maxWidth: '680px', margin: '0 auto', border: '1px solid rgba(255,255,255,0.06)' }}>

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
        display: 'grid', gridTemplateColumns: '32px 1fr 44px 36px',
        padding: '8px 16px', background: 'rgba(255,255,255,0.02)',
      }}>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontFamily: M, textTransform: 'uppercase' }}>#</span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontFamily: M, textTransform: 'uppercase' }}>Jugador</span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontFamily: M, textTransform: 'uppercase', textAlign: 'right' }}>Tot</span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontFamily: M, textTransform: 'uppercase', textAlign: 'right' }}>Thru</span>
      </div>

      {/* Players */}
      {visiblePlayers.map((p, i) => {
        const isLeader = i === 0
        const justChanged = changedPlayers.has(p.nameFull)

        return (
          <div key={p.nameFull || i} style={{
            display: 'grid', gridTemplateColumns: '32px 1fr 44px 36px',
            padding: '9px 16px', alignItems: 'center',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            background: justChanged
              ? 'rgba(196,153,42,0.12)'
              : isLeader
                ? 'linear-gradient(90deg, rgba(196,153,42,0.08), rgba(196,153,42,0.02))'
                : 'transparent',
            borderLeft: isLeader ? '3px solid #c4992a' : '3px solid transparent',
            transition: 'background 0.6s ease',
          }}>
            <span style={{
              fontSize: '12px', fontFamily: M, fontWeight: isLeader ? 700 : 400,
              color: isLeader ? '#c4992a' : 'rgba(255,255,255,0.35)',
            }}>{p.position}</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <span style={{ fontSize: '14px', flexShrink: 0 }}>{p.flag}</span>
              <span style={{
                fontSize: '13px', fontWeight: isLeader ? 600 : 400, color: '#edeae4',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{p.name}</span>
            </div>

            <span style={{
              fontSize: isLeader ? '15px' : '14px', fontFamily: M, fontWeight: 700,
              color: scoreColor(p.score), textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}>{p.score}</span>

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
    </div>
  )
}
