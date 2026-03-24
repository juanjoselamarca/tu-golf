'use client'
import { useEffect, useState, useRef } from 'react'
import { adminColors, adminFonts, adminCard } from './admin-tokens'

interface FeedEvent {
  id: string
  time: string
  icon: string
  message: string
  type: 'score' | 'register' | 'tournament' | 'taiger' | 'system' | 'round'
}

const typeColors: Record<string, string> = {
  score: adminColors.green,
  register: adminColors.blue,
  tournament: adminColors.gold,
  taiger: '#f97316',
  system: adminColors.yellow,
  round: adminColors.green,
}

export function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchFeed = async () => {
      try {
        const res = await fetch('/api/admin/feed')
        if (res.ok) {
          const data = await res.json()
          setEvents(data.events ?? [])
        }
      } catch { /* keep last state */ }
      finally { setLoading(false) }
    }
    fetchFeed()
    const interval = setInterval(fetchFeed, 10_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{ ...adminCard, padding: '16px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={adminFonts.label}>ACTIVIDAD EN VIVO</span>
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: adminColors.green, animation: 'pulse 2s infinite',
        }} />
      </div>
      <div ref={containerRef} style={{
        flex: 1, minHeight: '200px', maxHeight: '400px', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: '2px',
      }}>
        {loading ? (
          <div style={{ color: adminColors.grayDim, fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
            Cargando feed...
          </div>
        ) : events.length === 0 ? (
          <div style={{ color: adminColors.grayDim, fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
            Sin actividad reciente
          </div>
        ) : (
          events.map(e => (
            <div key={e.id} style={{
              display: 'flex', gap: '10px', padding: '6px 8px',
              borderRadius: '6px', alignItems: 'flex-start',
              fontSize: '12px',
            }}>
              <span style={{ ...adminFonts.mono, fontSize: '10px', color: adminColors.grayDim, flexShrink: 0, marginTop: '2px' }}>
                {e.time}
              </span>
              <span style={{ fontSize: '14px', flexShrink: 0 }}>{e.icon}</span>
              <span style={{
                color: adminColors.ivory, fontSize: '12px', lineHeight: 1.4,
                borderLeft: `2px solid ${typeColors[e.type] || adminColors.gray}`,
                paddingLeft: '8px',
              }}>
                {e.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
