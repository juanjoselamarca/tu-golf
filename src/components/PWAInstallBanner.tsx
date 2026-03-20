'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    // Check if already installed as PWA
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true
    setIsStandalone(standalone)
    if (standalone) return

    // Check if dismissed recently
    const dismissed = localStorage.getItem('pwa-banner-dismissed')
    if (dismissed) {
      const dismissedAt = parseInt(dismissed)
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return // 7 days
    }

    // iOS detection
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(ios)

    // Android/Chrome install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Show banner for iOS after 3 seconds (no native prompt)
    if (ios) {
      setTimeout(() => setShowBanner(true), 3000)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setShowBanner(false)
      }
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    localStorage.setItem('pwa-banner-dismissed', String(Date.now()))
  }

  if (!showBanner || isStandalone) return null

  return (
    <div style={{
      position: 'fixed', bottom: '70px', left: '12px', right: '12px', zIndex: 200,
      background: '#ffffff', borderRadius: '16px',
      border: '1px solid #e5e7eb',
      boxShadow: '0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
      padding: '20px',
      animation: 'slideUpBanner 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        {/* Icon */}
        <div style={{
          width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
          background: '#070d18', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: '#c4992a', fontSize: '20px', fontWeight: 700, fontFamily: 'Georgia, serif' }}>G+</span>
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
            Golfers+ funciona mejor como app
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.4, marginBottom: '14px' }}>
            {isIOS
              ? 'Acceso directo, pantalla completa y notificaciones en vivo.'
              : 'Acceso directo, pantalla completa y notificaciones en vivo.'
            }
          </div>

          {isIOS ? (
            <div style={{
              fontSize: '12px', color: '#6b7280', lineHeight: 1.5,
              background: '#f9fafb', borderRadius: '10px', padding: '10px 12px',
              border: '1px solid #f3f4f6',
            }}>
              <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>Para instalar:</div>
              <div>1. Toca <span style={{ fontWeight: 600 }}>Compartir</span> (ícono ↑) en Safari</div>
              <div>2. Selecciona <span style={{ fontWeight: 600 }}>Agregar a pantalla de inicio</span></div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleInstall} style={{
                flex: 1, padding: '10px 16px', borderRadius: '10px',
                background: '#c4992a', color: '#070d18', border: 'none',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              }}>
                Instalar Golfers+
              </button>
              <button onClick={handleDismiss} style={{
                padding: '10px 16px', borderRadius: '10px',
                background: 'transparent', color: '#9ca3af', border: '1px solid #e5e7eb',
                fontSize: '14px', cursor: 'pointer',
              }}>
                Ahora no
              </button>
            </div>
          )}
        </div>

        {/* Close */}
        <button onClick={handleDismiss} aria-label="Cerrar banner de instalación" style={{
          background: 'none', border: 'none', color: '#d1d5db', fontSize: '20px',
          cursor: 'pointer', padding: '0', lineHeight: 1, flexShrink: 0,
        }}>×</button>
      </div>
    </div>
  )
}
