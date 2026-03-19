'use client'
import { useEffect, useState } from 'react'

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

interface NextEvent {
  name:  string
  start: string
  end:   string
  venue: string
}

interface PGAData {
  active:      boolean
  live?:       boolean
  complete?:   boolean
  tournament?: string
  round?:      string
  course?:     string
  players?:    Player[]
  next_event?: NextEvent
}

function scoreColor(score: string): string {
  if (!score || score === 'E') return 'rgba(255,255,255,0.6)'
  if (score.startsWith('-')) return '#00e676'
  if (score.startsWith('+')) return '#ff1744'
  return 'rgba(255,255,255,0.6)'
}

function thruColor(thru: string): string {
  if (thru === 'F') return '#00e676'
  if (thru === '—') return 'rgba(255,255,255,0.2)'
  return 'rgba(255,255,255,0.4)'
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

const MONO = 'var(--font-dm-mono), monospace'

export default function PGALiveWidget() {
  const [data, setData] = useState<PGAData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/pga-live')
        setData(await res.json())
      } catch {
        setData({ active: false })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return (
    <div style={{ background: '#0e1c2f', borderRadius: '14px', padding: '24px', maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ height: '14px', width: '50%', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', marginBottom: '10px' }} />
      <div style={{ height: '10px', width: '30%', background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }} />
    </div>
  )

  // No active tournament — show next event
  if (!data?.active) {
    return (
      <div style={{ background: '#0e1c2f', borderRadius: '14px', overflow: 'hidden', maxWidth: '680px', margin: '0 auto', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ background: '#0066cc', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.08em' }}>PGA TOUR</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Sin torneo activo</span>
        </div>
        {data?.next_event && (
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Próximo</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#c4992a', marginBottom: '4px' }}>{data.next_event.name}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontFamily: MONO }}>
              {data.next_event.venue} · {formatDate(data.next_event.start)}–{formatDate(data.next_event.end)}
            </div>
          </div>
        )}
      </div>
    )
  }

  const players = data.players || []
  const roundNum = players[0]?.roundNum || 1

  return (
    <div style={{ background: '#0e1c2f', borderRadius: '14px', overflow: 'hidden', maxWidth: '680px', margin: '0 auto', border: '1px solid rgba(255,255,255,0.06)' }}>

      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span style={{ background: '#0066cc', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.08em' }}>PGA TOUR</span>
          {data.live && (
            <span style={{ background: '#cc0000', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff', animation: 'livePulse 2s infinite' }} />
              EN VIVO
            </span>
          )}
          {data.complete && (
            <span style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px' }}>FINALIZADO</span>
          )}
        </div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#c4992a', marginBottom: '2px' }}>{data.tournament}</div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontFamily: MONO }}>
          {data.course}{data.round ? ` · ${data.round}` : ''}
        </div>
      </div>

      {/* Table header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '32px 1fr 44px 36px',
        padding: '8px 16px', alignItems: 'center',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontFamily: MONO, textTransform: 'uppercase' }}>#</span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontFamily: MONO, textTransform: 'uppercase' }}>Jugador</span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontFamily: MONO, textTransform: 'uppercase', textAlign: 'right' }}>Tot</span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontFamily: MONO, textTransform: 'uppercase', textAlign: 'right' }}>Thru</span>
      </div>

      {/* Players */}
      {players.map((p, i) => {
        const isLeader = i === 0
        return (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '32px 1fr 44px 36px',
            padding: '9px 16px', alignItems: 'center',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            background: isLeader ? 'rgba(196,153,42,0.05)' : 'transparent',
            borderLeft: isLeader ? '3px solid #c4992a' : '3px solid transparent',
          }}>
            {/* Position */}
            <span style={{
              fontSize: '12px', fontFamily: MONO, fontWeight: isLeader ? 700 : 400,
              color: isLeader ? '#c4992a' : 'rgba(255,255,255,0.35)',
            }}>
              {p.position}
            </span>

            {/* Flag + Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <span style={{ fontSize: '14px', flexShrink: 0 }}>{p.flag}</span>
              <span style={{
                fontSize: '13px', fontWeight: isLeader ? 600 : 400, color: '#edeae4',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {p.name}
              </span>
            </div>

            {/* Total score */}
            <span style={{
              fontSize: '14px', fontFamily: MONO, fontWeight: 700,
              color: scoreColor(p.score), textAlign: 'right',
            }}>
              {p.score}
            </span>

            {/* Thru */}
            <span style={{
              fontSize: '11px', fontFamily: MONO,
              color: thruColor(p.thru), textAlign: 'right',
            }}>
              {p.thru}
            </span>
          </div>
        )
      })}

      {/* Footer */}
      <div style={{
        padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', fontFamily: MONO }}>
          Datos: ESPN · R{roundNum}
        </span>
        <a href="https://www.pgatour.com" target="_blank" rel="noopener noreferrer"
          style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', textDecoration: 'none', fontFamily: MONO }}>
          pgatour.com →
        </a>
      </div>
    </div>
  )
}
