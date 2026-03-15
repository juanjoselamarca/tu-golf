'use client'
import { useEffect, useState } from 'react'

interface Player {
  position: string
  name:     string
  score:    string
  today:    string
  thru:     string | number
}

interface PGAData {
  active:      boolean
  tournament?: string
  round?:      string
  course?:     string
  players?:    Player[]
}

export default function PGALiveWidget() {
  const [data,    setData]    = useState<PGAData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const res  = await fetch('/api/pga-live')
      const json = await res.json()
      setData(json)
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
    <div style={{
      background:   '#0e1c2f',
      borderRadius: '12px',
      padding:      '24px',
      margin:       '0 auto',
      maxWidth:     '600px',
      textAlign:    'center',
      color:        '#7a8fa8',
    }}>
      Cargando PGA Tour...
    </div>
  )

  if (!data?.active) return (
    <div style={{
      background:   '#0e1c2f',
      borderRadius: '12px',
      padding:      '24px',
      margin:       '0 auto',
      maxWidth:     '600px',
      textAlign:    'center',
      color:        '#7a8fa8',
    }}>
      🏌️ Sin torneo activo esta semana en el PGA Tour
    </div>
  )

  const getScoreColor = (score: string) => {
    if (!score || score === 'E') return '#edeae4'
    if (score.startsWith('-')) return '#c4992a'
    if (score.startsWith('+')) return '#dc2626'
    return '#edeae4'
  }

  return (
    <div style={{
      background:   '#0e1c2f',
      borderRadius: '12px',
      overflow:     'hidden',
      maxWidth:     '600px',
      margin:       '0 auto',
    }}>
      {/* Header */}
      <div style={{
        background:     '#132540',
        padding:        '16px 20px',
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
      }}>
        <div>
          <div style={{
            color:      '#c4992a',
            fontFamily: 'Playfair Display, serif',
            fontSize:   '1.1rem',
            fontWeight: 700,
          }}>
            🏆 {data.tournament}
          </div>
          <div style={{ color: '#7a8fa8', fontSize: '0.8rem', marginTop: '2px' }}>
            {data.round} · {data.course}
          </div>
        </div>
        <div style={{
          background:    '#dc2626',
          color:         'white',
          fontSize:      '0.7rem',
          fontWeight:    700,
          padding:       '4px 8px',
          borderRadius:  '4px',
          letterSpacing: '0.05em',
        }}>
          ● EN VIVO
        </div>
      </div>

      {/* Tabla */}
      <div style={{ padding: '0 8px 8px' }}>
        {/* Headers */}
        <div style={{
          display:               'grid',
          gridTemplateColumns:   '40px 1fr 60px 60px 50px',
          padding:               '8px 12px',
          color:                 '#7a8fa8',
          fontSize:              '0.75rem',
          textTransform:         'uppercase',
          letterSpacing:         '0.05em',
        }}>
          <span>Pos</span>
          <span>Jugador</span>
          <span style={{ textAlign: 'center' }}>Total</span>
          <span style={{ textAlign: 'center' }}>Hoy</span>
          <span style={{ textAlign: 'center' }}>Hoyo</span>
        </div>

        {data.players?.map((p, i) => (
          <div key={i} style={{
            display:             'grid',
            gridTemplateColumns: '40px 1fr 60px 60px 50px',
            padding:             '10px 12px',
            borderTop:           '1px solid #132540',
            alignItems:          'center',
          }}>
            <span style={{
              color:      i === 0 ? '#c4992a' : '#7a8fa8',
              fontWeight: i === 0 ? 700 : 400,
              fontSize:   '0.85rem',
            }}>
              {p.position}
            </span>
            <span style={{
              color:         '#edeae4',
              fontSize:      '0.9rem',
              fontWeight:    i === 0 ? 600 : 400,
              whiteSpace:    'nowrap',
              overflow:      'hidden',
              textOverflow:  'ellipsis',
            }}>
              {p.name}
            </span>
            <span style={{
              color:      getScoreColor(p.score),
              textAlign:  'center',
              fontWeight: 700,
              fontSize:   '0.9rem',
            }}>
              {p.score}
            </span>
            <span style={{
              color:     getScoreColor(p.today),
              textAlign: 'center',
              fontSize:  '0.85rem',
            }}>
              {p.today}
            </span>
            <span style={{
              color:     '#7a8fa8',
              textAlign: 'center',
              fontSize:  '0.8rem',
            }}>
              {p.thru}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding:   '8px 20px 12px',
        textAlign: 'center',
        color:     '#7a8fa8',
        fontSize:  '0.72rem',
        borderTop: '1px solid #132540',
      }}>
        ↻ Actualiza cada 60s · Datos ESPN
      </div>
    </div>
  )
}
