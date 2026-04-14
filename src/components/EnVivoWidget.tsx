'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Flag } from '@/components/icons'

interface RondaWidget {
  codigo: string
  course_name: string
  totalJugadores: number
  maxHolesCompleted: number
  jugadores: Array<{ nombre: string; totalGross: number; holesCompleted: number }>
}

/**
 * Widget compacto de rondas en vivo para el dashboard.
 * Retorna null si no hay rondas activas (no afecta layout).
 * Polling cada 30s.
 */
export default function EnVivoWidget() {
  const [rondas, setRondas] = useState<RondaWidget[]>([])

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/en-vivo')
      if (res.ok) {
        const json = await res.json()
        setRondas((json.rondas ?? []).slice(0, 3))
      }
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    cargar()
    const interval = setInterval(cargar, 30000)
    return () => clearInterval(interval)
  }, [cargar])

  if (rondas.length === 0) return null

  return (
    <div style={{ marginBottom: '20px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: '#4ade80',
            boxShadow: '0 0 6px rgba(74,222,128,0.6)',
            animation: 'livePulse 2s ease-in-out infinite',
          }} />
          <span style={{
            fontFamily: 'DM Mono, monospace', fontSize: '11px',
            color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
          }}>EN VIVO AHORA</span>
        </div>
        <Link href="/en-vivo" style={{
          fontSize: '12px', fontWeight: 600, color: 'var(--gold)',
          textDecoration: 'none',
        }}>Ver todas →</Link>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rondas.map(ronda => {
          const lider = ronda.jugadores
            .filter(j => j.holesCompleted > 0)
            .sort((a, b) => a.totalGross - b.totalGross)[0]

          return (
            <Link
              key={ronda.codigo}
              href={`/ronda-libre/${ronda.codigo}`}
              style={{ textDecoration: 'none' }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                transition: 'background 0.15s',
              }}>
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}><Flag size={20} strokeWidth={1.5} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px', fontWeight: 600, color: 'var(--ivory)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{ronda.course_name}</div>
                  <div style={{
                    fontSize: '11px', color: 'var(--text-3)', marginTop: '1px',
                  }}>
                    {ronda.totalJugadores} jugador{ronda.totalJugadores > 1 ? 'es' : ''}
                    {lider ? ` · Lider: ${lider.nombre.split(' ')[0]}` : ''}
                  </div>
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: 700, fontFamily: 'DM Mono, monospace',
                  padding: '3px 8px', borderRadius: '6px',
                  background: 'rgba(200,165,90,0.18)', color: 'var(--gold)',
                  letterSpacing: '0.04em', flexShrink: 0,
                }}>THRU {ronda.maxHolesCompleted}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
