'use client'

// src/app/torneo/[slug]/en-vivo/LiveHeader.tsx
// Cabecera del marcador en vivo. Delega en <TorneoHeader> (fuente única de la
// identidad visual del torneo) — antes tenía su propia maqueta + FORMAT_LABEL
// hardcodeado (duplicaba src/golf/formats). Ahora solo aporta la "última
// actualización" y el vocabulario de organizador (quien corre el torneo).

import { useState, useEffect } from 'react'
import type { LiveTournament } from './types'
import { TorneoHeader } from '@/components/torneo/TorneoHeader'

/* ── ConnectionStatus — indicador de conectividad en vivo ── */
function ConnectionStatus() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    // Sync initial state on mount (SSR-safe: defaults to true)
    setOnline(navigator.onLine)
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      fontSize: '11px', fontWeight: 500, letterSpacing: '0.02em',
      color: online ? '#16a34a' : '#dc2626',
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: online ? '#16a34a' : '#dc2626',
        boxShadow: online ? '0 0 4px rgba(22,163,106,0.4)' : '0 0 4px rgba(220,38,38,0.4)',
        animation: online ? 'livePulse 2s ease-in-out infinite' : 'none',
      }} />
      {online ? 'En vivo' : 'Sin conexión'}
    </div>
  )
}

export interface LiveHeaderProps {
  tournament: LiveTournament
  lastUpdate: number
}

function formatLastUpdate(ts: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (diffSec < 5) return 'recién actualizado'
  if (diffSec < 60) return `actualizado hace ${diffSec}s`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `actualizado hace ${diffMin} min`
  const hh = String(new Date(ts).getHours()).padStart(2, '0')
  const mm = String(new Date(ts).getMinutes()).padStart(2, '0')
  return `actualizado ${hh}:${mm}`
}

export default function LiveHeader({ tournament, lastUpdate }: LiveHeaderProps) {
  return (
    <div>
      <TorneoHeader
        name={tournament.name}
        format={tournament.format}
        modo={tournament.modo}
        status={tournament.status}
        live={tournament.live}
        courseName={tournament.course_name}
        holeCount={tournament.hole_count}
        audience="organizer"
        note={formatLastUpdate(lastUpdate)}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 4px', marginTop: '4px' }}>
        <ConnectionStatus />
      </div>
    </div>
  )
}
