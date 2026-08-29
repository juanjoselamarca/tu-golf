'use client'

// src/app/torneo/[slug]/en-vivo/LiveHeader.tsx
// Cabecera del marcador en vivo. Delega en <TorneoHeader> (fuente única de la
// identidad visual del torneo) — antes tenía su propia maqueta + FORMAT_LABEL
// hardcodeado (duplicaba src/golf/formats). Ahora solo aporta la "última
// actualización" y el vocabulario de organizador (quien corre el torneo).

import { useState, useEffect, useCallback } from 'react'
import type { LiveTournament } from './types'
import { TorneoHeader } from '@/components/torneo/TorneoHeader'
import { useShare } from '@/components/share/useShare'
import { SITE_URL } from '@/lib/site-url'

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

function LiveShareButton({ tournament }: { tournament: LiveTournament }) {
  const { share, isSharing } = useShare()
  const [toast, setToast] = useState(false)

  const handleShare = useCallback(async () => {
    const url = `${SITE_URL}/torneo/${tournament.slug}/en-vivo`
    const text = `Mira el leaderboard en vivo de ${tournament.name} en Golfers+`
    const result = await share({ title: tournament.name, text, url })
    if (result.ok && (result.method === 'clipboard' || result.method === 'download')) {
      setToast(true)
      setTimeout(() => setToast(false), 2000)
    }
  }, [share, tournament.slug, tournament.name])

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={isSharing}
      aria-label="Compartir leaderboard"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: toast ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.08)',
        border: `1px solid ${toast ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.12)'}`,
        color: toast ? '#4ade80' : 'rgba(255,255,255,0.8)',
        padding: '10px',
        borderRadius: '10px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: isSharing ? 'wait' : 'pointer',
        transition: 'all 200ms',
        minWidth: '44px',
        minHeight: '44px',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
    </button>
  )
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
        right={<LiveShareButton tournament={tournament} />}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 4px', marginTop: '4px' }}>
        <ConnectionStatus />
      </div>
    </div>
  )
}
