'use client'
import { useEffect, useState } from 'react'
import { adminColors, adminFonts } from './admin-tokens'

interface LiveStatus {
  supabaseOk: boolean
  activeUsers: number
  liveRounds: number
  lastUpdate: string
}

export function AdminTopBar({ compact }: { compact?: boolean } = {}) {
  const [status, setStatus] = useState<LiveStatus>({
    supabaseOk: true, activeUsers: 0, liveRounds: 0, lastUpdate: '',
  })

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/admin/live')
        if (res.ok) {
          const data = await res.json()
          setStatus({
            supabaseOk: data.supabaseOk ?? true,
            activeUsers: data.activeUsers ?? 0,
            liveRounds: data.liveRounds ?? 0,
            lastUpdate: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          })
        }
      } catch { /* keep last state */ }
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 10_000)
    return () => clearInterval(interval)
  }, [])

  // Compact mode for mobile header — just status dot + key numbers
  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: status.supabaseOk ? adminColors.green : adminColors.red,
          boxShadow: status.supabaseOk ? `0 0 4px ${adminColors.green}` : 'none',
          flexShrink: 0,
        }} />
        <span style={{ ...adminFonts.mono, fontSize: '10px', color: adminColors.gray }}>
          {status.activeUsers}{'\uD83D\uDC64'} {status.liveRounds}{'\u26F3'}
        </span>
      </div>
    )
  }

  // Full mode for desktop
  return (
    <div style={{
      height: '40px', background: adminColors.bgDeep,
      borderBottom: `1px solid ${adminColors.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', gap: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: status.supabaseOk ? adminColors.green : adminColors.red,
            boxShadow: status.supabaseOk ? `0 0 6px ${adminColors.green}` : 'none',
          }} />
          <span style={{ ...adminFonts.mono, fontSize: '11px' }}>
            {status.supabaseOk ? 'Sistemas OK' : 'Error detectado'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '12px' }}>{'\uD83D\uDC64'}</span>
          <span style={{ ...adminFonts.mono, fontSize: '11px', color: adminColors.ivory }}>{status.activeUsers}</span>
          <span style={{ ...adminFonts.mono, fontSize: '11px' }}>activos</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '12px' }}>{'\u26F3'}</span>
          <span style={{ ...adminFonts.mono, fontSize: '11px', color: adminColors.ivory }}>{status.liveRounds}</span>
          <span style={{ ...adminFonts.mono, fontSize: '11px' }}>rondas en vivo</span>
        </div>
      </div>
      <span style={{ ...adminFonts.mono, fontSize: '10px', color: adminColors.grayDim }}>
        {status.lastUpdate && `Actualizado ${status.lastUpdate}`}
      </span>
    </div>
  )
}
