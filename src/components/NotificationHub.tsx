'use client'

import { useState, useEffect } from 'react'
import {
  isPushSupported,
  getPermissionState,
  setupPushNotifications,
  unsubscribePush,
  isSubscribedToPush,
} from '@/lib/push-notifications'

interface NotifPrefs {
  birdies: boolean
  eagles: boolean
  leader_changes: boolean
  round_updates: boolean
  round_finished: boolean
  marketing: boolean
}

const DEFAULT_PREFS: NotifPrefs = {
  birdies: true,
  eagles: true,
  leader_changes: true,
  round_updates: true,
  round_finished: true,
  marketing: false,
}

const PREF_ITEMS: { key: keyof NotifPrefs; label: string; desc: string }[] = [
  { key: 'eagles', label: 'Eagles', desc: 'Cuando un jugador hace eagle' },
  { key: 'birdies', label: 'Birdies', desc: 'Cuando un jugador hace birdie' },
  { key: 'leader_changes', label: 'Cambios de lider', desc: 'Cuando cambia el primer lugar' },
  { key: 'round_updates', label: 'Actualizaciones de ronda', desc: 'Score guardado, jugador termina' },
  { key: 'round_finished', label: 'Ronda finalizada', desc: 'Cuando todos terminan de jugar' },
  { key: 'marketing', label: 'Novedades de Golfers+', desc: 'Nuevas funciones y actualizaciones' },
]

export default function NotificationHub({ onClose }: { onClose: () => void }) {
  const [supported, setSupported] = useState(true)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS)
  const [savingPrefs, setSavingPrefs] = useState(false)

  useEffect(() => {
    setSupported(isPushSupported())
    setPermission(getPermissionState())
    isSubscribedToPush().then(setSubscribed)

    // Load server preferences
    fetch('/api/push/preferences')
      .then(r => r.ok ? r.json() : DEFAULT_PREFS)
      .then(data => setPrefs({ ...DEFAULT_PREFS, ...data }))
      .catch(() => {})
  }, [])

  const handleEnable = async () => {
    setLoading(true)
    const success = await setupPushNotifications()
    if (success) {
      setSubscribed(true)
      setPermission('granted')
    }
    setLoading(false)
  }

  const handleDisable = async () => {
    setLoading(true)
    await unsubscribePush()
    setSubscribed(false)
    setLoading(false)
  }

  const togglePref = async (key: keyof NotifPrefs) => {
    const updated = { ...prefs, [key]: !prefs[key] }
    setPrefs(updated)
    setSavingPrefs(true)
    await fetch('/api/push/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {})
    setSavingPrefs(false)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '480px',
          background: '#ffffff',
          borderRadius: '20px 20px 0 0',
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        {/* Handle */}
        <div style={{ padding: '12px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#d1d5db' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '0 20px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: 0, fontFamily: '"Playfair Display", serif' }}>
              Notificaciones
            </h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#9ca3af', cursor: 'pointer', padding: '8px' }}>
              ×
            </button>
          </div>
          <p style={{ fontSize: '13px', color: '#9ca3af', margin: '4px 0 0' }}>
            Recibe alertas de birdies, eagles y cambios de lider en tiempo real
          </p>
        </div>

        {/* Main toggle */}
        <div style={{ padding: '20px' }}>
          {!supported ? (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#92400e', marginBottom: '4px' }}>Navegador no compatible</div>
              <div style={{ fontSize: '12px', color: '#b45309' }}>
                Instala Golfers+ como app desde tu navegador para recibir notificaciones
              </div>
            </div>
          ) : permission === 'denied' ? (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#991b1b', marginBottom: '4px' }}>Notificaciones bloqueadas</div>
              <div style={{ fontSize: '12px', color: '#b91c1c' }}>
                Ve a la configuración de tu navegador y permite notificaciones para tu-golf.vercel.app
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px', borderRadius: '14px',
              background: subscribed ? '#f0fdf4' : '#f9fafb',
              border: `1px solid ${subscribed ? '#86efac' : '#e5e7eb'}`,
            }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>
                  {subscribed ? 'Notificaciones activas' : 'Activar notificaciones'}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  {subscribed ? 'Recibes alertas en tu telefono' : 'Recibe alertas aunque cierres la app'}
                </div>
              </div>
              <button
                onClick={subscribed ? handleDisable : handleEnable}
                disabled={loading}
                style={{
                  padding: '10px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  fontSize: '14px', fontWeight: 600,
                  background: subscribed ? '#dc2626' : '#c4992a',
                  color: subscribed ? '#ffffff' : '#070d18',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? '...' : subscribed ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          )}
        </div>

        {/* Preferences (only if subscribed) */}
        {subscribed && (
          <div style={{ padding: '0 20px 20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
              Tipos de notificacion {savingPrefs && <span style={{ color: '#c4992a' }}>· Guardando...</span>}
            </div>
            {PREF_ITEMS.map(item => (
              <div
                key={item.key}
                onClick={() => togglePref(item.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>{item.label}</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>{item.desc}</div>
                </div>
                {/* Toggle switch */}
                <div style={{
                  width: '44px', height: '26px', borderRadius: '13px', flexShrink: 0,
                  background: prefs[item.key] ? '#c4992a' : '#d1d5db',
                  position: 'relative', transition: 'background 0.2s',
                }}>
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%', background: '#ffffff',
                    position: 'absolute', top: '3px',
                    left: prefs[item.key] ? '21px' : '3px',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #f3f4f6', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          <p style={{ fontSize: '11px', color: '#d1d5db', textAlign: 'center', margin: 0 }}>
            Golfers+ · Las notificaciones se envian solo durante rondas activas
          </p>
        </div>
      </div>
    </div>
  )
}
