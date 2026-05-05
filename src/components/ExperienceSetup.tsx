'use client'

import { useState, useEffect } from 'react'
import { isPushSupported, getPermissionState, requestPermission, getNotifPrefs, setNotifPrefs } from '@/lib/push-notifications'
import { Flag, Eye } from '@/components/icons'

/**
 * Pop-up de primera vez: invita al usuario a personalizar su experiencia.
 * Se muestra una sola vez después del primer login.
 */
export function ExperiencePopup({ onSetup }: { onSetup: () => void }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem('golfers-experience-seen')
    if (!seen) {
      setTimeout(() => setShow(true), 2000) // Show after 2s
    }
  }, [])

  const handleSetup = () => {
    setShow(false)
    onSetup()
  }

  const handleDismiss = () => {
    setShow(false)
    localStorage.setItem('golfers-experience-seen', '1')
  }

  if (!show) return null

  return (
    <>
      {/* Overlay */}
      <div onClick={handleDismiss} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 300, animation: 'fadeIn 0.3s ease',
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', bottom: '0', left: '0', right: '0', zIndex: 301,
        background: '#ffffff', borderRadius: '20px 20px 0 0',
        padding: '28px 24px', paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.15)',
        animation: 'slideUpBanner 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
      }}>
        <div style={{ width: '36px', height: '4px', background: '#e5e7eb', borderRadius: '2px', margin: '0 auto 20px' }} />

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}><Flag size={36} strokeWidth={1.5} /></div>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
            Personaliza tu experiencia
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280', lineHeight: 1.5 }}>
            Configura alertas en vivo y optimiza cómo usas Golfers+ en la cancha.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={handleSetup} style={{
            width: '100%', padding: '14px', borderRadius: '12px',
            background: '#c4992a', color: 'var(--brand-dark)', border: 'none',
            fontSize: '16px', fontWeight: 700, cursor: 'pointer',
          }}>
            Personalizar ahora
          </button>
          <button onClick={handleDismiss} style={{
            width: '100%', padding: '12px', borderRadius: '12px',
            background: 'transparent', color: '#9ca3af', border: '1px solid #e5e7eb',
            fontSize: '14px', cursor: 'pointer',
          }}>
            Más tarde
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * Panel de configuración de experiencia.
 * Se puede usar inline en /perfil o como modal.
 */
export function ExperiencePanel({ onClose }: { onClose?: () => void }) {
  const [prefs, setPrefs] = useState(getNotifPrefs())
  const [permState, setPermState] = useState<NotificationPermission | 'unsupported'>('default')
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    setSupported(isPushSupported())
    setPermState(getPermissionState())
  }, [])

  const togglePref = async (key: 'spectator' | 'player') => {
    const newVal = !prefs[key]

    // If enabling and permission not granted, request it
    if (newVal && permState !== 'granted') {
      const granted = await requestPermission()
      setPermState(granted ? 'granted' : 'denied')
      if (!granted) return // Can't enable without permission
    }

    const updated = { ...prefs, [key]: newVal }
    setPrefs(updated)
    setNotifPrefs(updated)
    localStorage.setItem('golfers-experience-seen', '1')
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
            Tu experiencia
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
            Configura cómo Golfers+ te acompaña en la cancha
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#9ca3af',
            fontSize: '24px', cursor: 'pointer', padding: '4px',
          }}>×</button>
        )}
      </div>

      {!supported && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '12px',
          padding: '14px 16px', marginBottom: '16px', fontSize: '13px', color: '#92400e',
        }}>
          Tu navegador no soporta notificaciones. Para la mejor experiencia, agrega Golfers+ a tu pantalla de inicio.
        </div>
      )}

      {permState === 'denied' && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '12px',
          padding: '14px 16px', marginBottom: '16px', fontSize: '13px', color: '#991b1b',
        }}>
          Las notificaciones están bloqueadas en tu navegador. Ve a Configuración → Golfers+ → Permitir notificaciones.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Spectator toggle */}
        <div style={{
          background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '14px',
          padding: '16px', display: 'flex', alignItems: 'center', gap: '14px',
        }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
            background: prefs.spectator ? 'rgba(196,153,42,0.1)' : 'rgba(156,163,175,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px',
          }}><Eye size={22} strokeWidth={1.5} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>Alertas de espectador</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px', lineHeight: 1.4 }}>
              Birdies, eagles y cambios de posición cuando sigues una ronda en vivo
            </div>
          </div>
          <button
            onClick={() => togglePref('spectator')}
            disabled={!supported || permState === 'denied'}
            style={{
              width: '52px', height: '28px', borderRadius: '14px', flexShrink: 0,
              background: prefs.spectator ? '#c4992a' : '#d1d5db',
              border: 'none', cursor: supported ? 'pointer' : 'not-allowed',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%', background: '#ffffff',
              position: 'absolute', top: '3px',
              left: prefs.spectator ? '27px' : '3px',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }} />
          </button>
        </div>

        {/* Player toggle */}
        <div style={{
          background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '14px',
          padding: '16px', display: 'flex', alignItems: 'center', gap: '14px',
        }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
            background: prefs.player ? 'rgba(196,153,42,0.1)' : 'rgba(156,163,175,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px',
          }}><Flag size={22} strokeWidth={1.5} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>Scorecard inteligente</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px', lineHeight: 1.4 }}>
              Mantén tu ronda accesible y recibe un recordatorio si olvidas anotar un hoyo
            </div>
          </div>
          <button
            onClick={() => togglePref('player')}
            disabled={!supported || permState === 'denied'}
            style={{
              width: '52px', height: '28px', borderRadius: '14px', flexShrink: 0,
              background: prefs.player ? '#c4992a' : '#d1d5db',
              border: 'none', cursor: supported ? 'pointer' : 'not-allowed',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%', background: '#ffffff',
              position: 'absolute', top: '3px',
              left: prefs.player ? '27px' : '3px',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }} />
          </button>
        </div>
      </div>

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
        Las alertas de espectador se desactivan automáticamente al terminar la ronda
      </div>
    </div>
  )
}
