'use client'

import { useState } from 'react'
import { CheckCircle, Bell } from '@/components/icons'

/**
 * Banner dismissible para activar notificaciones push de la ronda en vivo.
 * Extraído de src/app/ronda-libre/[codigo]/page.tsx (T5 Sprint 1).
 */
export function NotifBanner({ onEnable }: { onEnable: () => void }) {
  const [dismissed, setDismissed] = useState(false)
  const [activated, setActivated] = useState(false)

  const handleActivate = async () => {
    await onEnable()
    setActivated(true)
    setTimeout(() => setDismissed(true), 2000)
  }

  if (dismissed) return null

  return (
    <div style={{
      background: activated ? 'rgba(22,163,74,0.08)' : '#ffffff',
      border: activated ? '1px solid rgba(22,163,74,0.2)' : '1px solid #e5e7eb',
      borderRadius: '12px', padding: '14px 16px', marginBottom: '12px',
      display: 'flex', alignItems: 'center', gap: '12px',
      transition: 'all 0.3s',
    }}>
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{activated ? <CheckCircle size={20} /> : <Bell size={20} />}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: activated ? '#16a34a' : '#111827' }}>
          {activated ? 'Alertas activadas' : 'Sigue la ronda en vivo'}
        </div>
        <div style={{ fontSize: '11px', color: '#6b7280' }}>
          {activated ? 'Te avisaremos de birdies y cambios' : 'Recibe alertas de birdies y cambios de posición'}
        </div>
      </div>
      {!activated && (
        <>
          <button onClick={handleActivate} style={{
            background: '#c4992a', color: '#1a1a2e', border: 'none', borderRadius: '8px',
            padding: '10px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
            minHeight: '44px',
          }}>Activar</button>
          <button onClick={() => setDismissed(true)} style={{
            background: 'none', border: 'none', color: '#d1d5db', fontSize: '18px', cursor: 'pointer',
            padding: '4px 8px', flexShrink: 0, minHeight: '44px', minWidth: '44px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </>
      )}
    </div>
  )
}
