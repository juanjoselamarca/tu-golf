'use client'
import { useEffect, useState } from 'react'

interface Player {
  position: string
  name:     string
  score:    string
  today:    string
  thru:     string | number
  country?: string
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

const TOURNAMENT_COLORS: Record<string, { accent: string; bg: string }> = {
  'THE PLAYERS':      { accent: '#ffd700', bg: '#004d2c' },
  'MASTERS':          { accent: '#ffcc00', bg: '#005a30' },
  'US OPEN':          { accent: '#ffffff', bg: '#002868' },
  'THE OPEN':         { accent: '#ffffff', bg: '#00205b' },
  'PGA CHAMPIONSHIP': { accent: '#d4af37', bg: '#1a1a2e' },
}

function getMajorColors(name?: string) {
  if (!name) return null
  const upper = name.toUpperCase()
  for (const [key, val] of Object.entries(TOURNAMENT_COLORS)) {
    if (upper.includes(key)) return val
  }
  return null
}

function getCountryCode(country: string): string {
  const codes: Record<string, string> = {
    'United States': 'us', 'England': 'gb-eng', 'Scotland': 'gb-sct',
    'Wales': 'gb-wls', 'Northern Ireland': 'gb-nir', 'Ireland': 'ie',
    'Sweden': 'se', 'Spain': 'es', 'Germany': 'de', 'France': 'fr',
    'Australia': 'au', 'Canada': 'ca', 'Japan': 'jp', 'South Korea': 'kr',
    'South Africa': 'za', 'Argentina': 'ar', 'Chile': 'cl', 'Colombia': 'co',
    'Mexico': 'mx', 'Austria': 'at', 'Belgium': 'be', 'Denmark': 'dk',
    'Norway': 'no', 'Finland': 'fi', 'Netherlands': 'nl', 'Italy': 'it',
    'New Zealand': 'nz', 'China': 'cn', 'Thailand': 'th', 'Philippines': 'ph',
    'Singapore': 'sg', 'Zimbabwe': 'zw', 'Fiji': 'fj', 'Venezuela': 've',
    'Czech Republic': 'cz', 'Portugal': 'pt', 'Brazil': 'br', 'Taiwan': 'tw',
  }
  return codes[country] || ''
}

function getScoreColor(score: string) {
  if (!score || score === 'E') return '#edeae4'
  if (score.startsWith('-')) return '#c4992a'
  if (score.startsWith('+')) return '#dc2626'
  return '#edeae4'
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export default function PGALiveWidget() {
  const [data,       setData]       = useState<PGAData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [lastUpdate, setLastUpdate] = useState<number>(0)

  const fetchData = async () => {
    try {
      const res  = await fetch('/api/pga-live')
      const json = await res.json()
      setData(json)
      setLastUpdate(Date.now())
    } catch {
      setData({ active: false })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return (
    <div style={{ background: '#0e1c2f', borderRadius: '12px', padding: '24px', maxWidth: '680px', margin: '0 auto', textAlign: 'center', color: '#94a8c0' }}>
      <div className="skeleton" style={{ height: '16px', width: '60%', margin: '0 auto 8px' }} />
      <div className="skeleton" style={{ height: '12px', width: '40%', margin: '0 auto' }} />
    </div>
  )

  const majorColors = getMajorColors(data?.tournament)
  const headerBg    = majorColors ? majorColors.bg : '#132540'
  const accentColor = majorColors ? majorColors.accent : '#c4992a'

  // No active tournament
  if (!data?.active) {
    return (
      <div style={{ background: '#0e1c2f', borderRadius: '12px', overflow: 'hidden', maxWidth: '680px', margin: '0 auto' }}>
        <div style={{ background: headerBg, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#003087', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '3px 8px', fontSize: '0.65rem', fontWeight: 900, color: 'white', letterSpacing: '0.08em', flexShrink: 0 }}>
            PGA TOUR
          </div>
          <span style={{ color: '#94a8c0', fontSize: '0.9rem' }}>Sin torneo activo esta semana</span>
        </div>
        {data?.next_event && (
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '0.72rem', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Próximo torneo</div>
            <div style={{ color: accentColor, fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>
              🏆 {data.next_event.name}
            </div>
            <div style={{ color: '#94a8c0', fontSize: '0.82rem' }}>
              {data.next_event.venue} · {formatDate(data.next_event.start)} – {formatDate(data.next_event.end)}
            </div>
          </div>
        )}
      </div>
    )
  }

  const badge = data.live
    ? { bg: '#dc2626', color: 'white',   text: '● EN VIVO'    }
    : data.complete
    ? { bg: '#1a2a3a', color: '#94a8c0', text: '✓ FINALIZADO' }
    : { bg: '#c4992a', color: '#070d18', text: 'PRÓXIMAMENTE' }

  const hasCountry = data.players?.some(p => p.country)

  return (
    <div style={{ background: '#0e1c2f', borderRadius: '12px', overflow: 'hidden', width: '100%', maxWidth: '680px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ background: headerBg, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
          <div style={{ background: '#003087', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '3px', padding: '3px 7px', fontSize: '9px', fontWeight: 900, color: 'white', letterSpacing: '0.1em', flexShrink: 0 }}>
            PGA TOUR
          </div>
          <div style={{ background: badge.bg, color: badge.color, fontSize: '0.68rem', fontWeight: 700, padding: '4px 8px', borderRadius: '4px', letterSpacing: '0.05em', flexShrink: 0 }}>
            {badge.text}
          </div>
        </div>
        <div style={{ color: accentColor, fontFamily: 'Playfair Display, serif', fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
          {data.tournament}
        </div>
        <div style={{ color: '#94a8c0', fontSize: '0.78rem' }}>
          {data.course} · {data.round}
        </div>
      </div>

      {/* Table */}
      <div style={{ padding: '0 4px 8px' }}>
        {/* Headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: hasCountry ? '36px 22px 1fr 48px 48px 42px' : '36px 1fr 48px 48px 42px',
          padding: '8px 10px',
          color: '#94a8c0', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <span>Pos</span>
          {hasCountry && <span className="pga-col-flag" />}
          <span>Jugador</span>
          <span style={{ textAlign: 'center' }}>Total</span>
          <span className="pga-col-hoy" style={{ textAlign: 'center' }}>Hoy</span>
          <span style={{ textAlign: 'center' }}>Hoyo</span>
        </div>

        {data.players?.map((p, i) => {
          const isLeader    = i === 0
          const isSeparator = i === 3
          const code        = p.country ? getCountryCode(p.country) : ''

          return (
            <div key={i}>
              {isSeparator && (
                <div style={{ height: '1px', background: 'rgba(196,153,42,0.2)', margin: '2px 10px' }} />
              )}
              <div style={{
                display: 'grid',
                gridTemplateColumns: hasCountry ? '36px 22px 1fr 48px 48px 42px' : '36px 1fr 48px 48px 42px',
                padding: '10px 10px',
                borderTop: '1px solid #132540',
                alignItems: 'center',
                background: isLeader ? 'rgba(196,153,42,0.07)' : 'transparent',
                borderLeft: isLeader ? '3px solid #c4992a' : '3px solid transparent',
              }}>
                <span style={{ color: isLeader ? '#c4992a' : '#94a8c0', fontWeight: isLeader ? 700 : 400, fontSize: '0.85rem' }}>
                  {p.position}
                </span>
                {hasCountry && (
                  <span className="pga-col-flag">
                    {code && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://flagcdn.com/20x15/${code}.png`}
                        width="18" height="13"
                        alt={p.country}
                        style={{ borderRadius: '2px', verticalAlign: 'middle' }}
                      />
                    )}
                  </span>
                )}
                <span style={{ color: '#edeae4', fontSize: '0.85rem', fontWeight: isLeader ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                <span style={{ color: getScoreColor(p.score), textAlign: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
                  {p.score}
                </span>
                <span className="pga-col-hoy" style={{ color: getScoreColor(p.today), textAlign: 'center', fontSize: '0.85rem' }}>
                  {p.today}
                </span>
                <span style={{ color: '#94a8c0', textAlign: 'center', fontSize: '0.78rem' }}>
                  {p.thru}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #132540', flexWrap: 'wrap', gap: '4px' }}>
        <span style={{ color: '#94a8c0', fontSize: '0.72rem' }}>
          Datos: ESPN · ↻ hace {lastUpdate ? Math.round((Date.now() - lastUpdate) / 1000) : '—'}s
        </span>
        <a
          href="https://www.pgatour.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#94a8c0', fontSize: '0.72rem', textDecoration: 'none' }}
        >
          Ver en pgatour.com →
        </a>
      </div>
    </div>
  )
}
