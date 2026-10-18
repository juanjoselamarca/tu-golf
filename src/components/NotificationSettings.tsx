/**
 * NotificationSettings — notification preferences panel.
 *
 * Clean toggle UI for enabling/disabling notification types.
 * Stores in localStorage (instant) and syncs to Supabase (background).
 * Accessible from profile settings.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell } from '@/components/icons'
import { Toggle } from '@/components/ui/Toggle'
import {
  isPushSupported,
  getPushSupportStatus,
  setupPushNotifications,
  unsubscribePush,
  isSubscribedToPush,
  getNotifPrefs,
  setNotifPrefs,
} from '@/lib/push-notifications'

interface NotifToggleProps {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

function NotifToggle({ label, description, checked, onChange, disabled }: NotifToggleProps) {
  // Switch canónico (ui/Toggle): un solo ON dorado (DESIGN.md §3/§6) y pista apagada visible
  // en ambos temas. La fila completa sigue siendo tocable: el label activa el mismo switch.
  return (
    <div
      onClick={(e) => {
        // El switch maneja su propio click; la fila solo responde fuera de él.
        if (disabled || (e.target as HTMLElement).closest('button')) return
        onChange(!checked)
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        width: '100%', padding: '10px 0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* La atenuación va solo en el texto: el Toggle deshabilitado ya se atenúa solo. */}
      <div style={{ flex: 1, minWidth: 0, opacity: disabled ? 0.4 : 1 }}>
        <div style={{
          fontSize: '14px', fontWeight: 600, color: 'var(--text)',
          fontFamily: 'var(--font-dm-sans)',
        }}>{label}</div>
        <div style={{
          fontSize: '12px', color: 'var(--text-3)', marginTop: '2px',
          fontFamily: 'var(--font-dm-sans)', lineHeight: 1.4,
        }}>{description}</div>
      </div>
      <Toggle
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        ariaLabel={label}
      />
    </div>
  )
}

export default function NotificationSettings() {
  const [supported, setSupported] = useState(true)
  const [subscribed, setSubscribed] = useState(false)
  const [prefs, setPrefs] = useState({ enabled: false, player: false, spectator: false })
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const status = getPushSupportStatus()
    setSupported(status.supported)
    if (!status.supported) {
      const reasons: Record<string, string> = {
        no_browser_api: 'Tu navegador no soporta notificaciones push',
        ios_too_old: 'Requiere iOS 16.4 o superior',
        ios_not_pwa: 'Instala la app en tu pantalla de inicio primero',
      }
      setUnsupportedReason(reasons[status.reason] ?? 'No soportado')
    }

    setPrefs(getNotifPrefs())
    void isSubscribedToPush().then(setSubscribed)
  }, [])

  const handleMasterToggle = useCallback(async (enabled: boolean) => {
    setLoading(true)
    try {
      if (enabled) {
        const ok = await setupPushNotifications()
        if (!ok) return
        setSubscribed(true)
        const newPrefs = { enabled: true, player: true, spectator: true }
        setNotifPrefs(newPrefs)
        setPrefs(newPrefs)
        // Sync to server
        void fetch('/api/push/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ round_updates: true }),
        })
      } else {
        await unsubscribePush()
        setSubscribed(false)
        const newPrefs = { enabled: false, player: false, spectator: false }
        setNotifPrefs(newPrefs)
        setPrefs(newPrefs)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const handlePrefChange = useCallback((key: 'player' | 'spectator', val: boolean) => {
    const newPrefs = { ...prefs, [key]: val }
    setNotifPrefs(newPrefs)
    setPrefs(newPrefs)
  }, [prefs])

  if (!supported) {
    return (
      <div style={{
        padding: '20px', background: 'var(--bg-surface)',
        borderRadius: '14px', border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Bell size={20} />
          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>Notificaciones</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
          {unsupportedReason}
        </p>
      </div>
    )
  }

  return (
    <div style={{
      padding: '20px', background: 'var(--bg-surface)',
      borderRadius: '14px', border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <Bell size={20} />
        <span style={{
          fontSize: '16px', fontWeight: 700, color: 'var(--text)',
          fontFamily: 'var(--font-playfair)',
        }}>Notificaciones</span>
      </div>

      <NotifToggle
        label="Notificaciones push"
        description={subscribed ? 'Recibes notificaciones en este dispositivo' : 'Activa para recibir alertas durante la ronda'}
        checked={prefs.enabled && subscribed}
        onChange={handleMasterToggle}
        disabled={loading}
      />

      <NotifToggle
        label="Mientras scoreo"
        description="Notificación fija con el hoyo actual para volver rápido al scorer"
        checked={prefs.player}
        onChange={(v) => handlePrefChange('player', v)}
        disabled={!prefs.enabled || !subscribed}
      />

      <NotifToggle
        label="Rondas que sigo"
        description="Tabla de jugadores actualizada en tiempo real cuando sigues una ronda"
        checked={prefs.spectator}
        onChange={(v) => handlePrefChange('spectator', v)}
        disabled={!prefs.enabled || !subscribed}
      />
    </div>
  )
}
