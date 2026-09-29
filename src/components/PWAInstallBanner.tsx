'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Evento con el que cualquier pantalla pide abrir ESTE banner con una línea de
 * contexto (ej. "Seguir" una ronda en iPhone sin la app instalada). El camino
 * de instalación en iOS vive acá y en ningún otro aviso — nunca dos a la vez.
 */
export const PWA_INSTALL_REQUEST_EVENT = 'golfers:pwa-install'

export function requestPwaInstall(reason: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PWA_INSTALL_REQUEST_EVENT, { detail: { reason } }))
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

function detectIOS(): boolean {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  // Sólo se leen en el browser y el banner rinde null hasta que algo lo abre:
  // sin desajuste de hidratación ni setState dentro del efecto.
  const [isIOS] = useState(detectIOS)
  const [isStandalone] = useState(detectStandalone)
  const [reason, setReason] = useState<string | null>(null)

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const standalone = detectStandalone()
    const ios = detectIOS()

    // Pedido explícito de otra pantalla: se muestra aunque se haya descartado antes.
    const onRequest = (e: Event) => {
      if (standalone) return
      setReason((e as CustomEvent<{ reason?: string }>).detail?.reason ?? null)
      setShowBanner(true)
    }
    window.addEventListener(PWA_INSTALL_REQUEST_EVENT, onRequest)

    if (standalone) return () => window.removeEventListener(PWA_INSTALL_REQUEST_EVENT, onRequest)

    // Check if dismissed recently
    const dismissed = localStorage.getItem('pwa-banner-dismissed')
    const recentlyDismissed = dismissed != null && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000 // 7 days

    // Android/Chrome install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      if (!recentlyDismissed) setShowBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Show banner for iOS after 3 seconds (no native prompt)
    let timer: ReturnType<typeof setTimeout> | null = null
    if (ios && !recentlyDismissed) {
      timer = setTimeout(() => setShowBanner(true), 3000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener(PWA_INSTALL_REQUEST_EVENT, onRequest)
      if (timer) clearTimeout(timer)
    }
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
    setReason(null)
    localStorage.setItem('pwa-banner-dismissed', String(Date.now()))
  }

  if (!showBanner || isStandalone) return null

  return (
    <div style={{
      position: 'fixed', bottom: 'calc(70px + env(safe-area-inset-bottom, 0px))', left: '12px', right: '12px', zIndex: 200,
      maxHeight: 'calc(100dvh - 90px - env(safe-area-inset-bottom, 0px))', overflowY: 'auto', boxSizing: 'border-box',
      background: 'var(--bg-surface)', borderRadius: '16px',
      border: '1px solid var(--border)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
      padding: '20px',
      animation: 'slideUpBanner 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        {/* Icon */}
        <div style={{
          width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
          background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: 'var(--brand-on-bg)', fontSize: '20px', fontWeight: 700, fontFamily: 'Georgia, serif' }}>G+</span>
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            {reason ? 'Instala Golfers+ para seguir la ronda' : 'Golfers+ funciona mejor como app'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.4, marginBottom: '14px' }}>
            {reason ?? 'Acceso directo, pantalla completa y notificaciones en vivo.'}
          </div>

          {isIOS ? (
            <div style={{
              fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.5,
              background: 'var(--bg-surface)', borderRadius: '10px', padding: '10px 12px',
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>Para instalar:</div>
              <div>1. Toca <span style={{ fontWeight: 600 }}>Compartir</span> (ícono ↑) en Safari</div>
              <div>2. Selecciona <span style={{ fontWeight: 600 }}>Agregar a pantalla de inicio</span></div>
              {reason && <div>3. Ábrela desde el ícono y toca <span style={{ fontWeight: 600 }}>Seguir</span></div>}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleInstall} style={{
                flex: 1, padding: '10px 16px', borderRadius: '10px',
                background: 'var(--brand)', color: 'var(--brand-dark)', border: 'none',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              }}>
                Instalar Golfers+
              </button>
              <button onClick={handleDismiss} style={{
                padding: '10px 16px', borderRadius: '10px',
                background: 'transparent', color: 'var(--text-3)', border: '1px solid var(--border)',
                fontSize: '14px', cursor: 'pointer',
              }}>
                Ahora no
              </button>
            </div>
          )}
        </div>

        {/* Close */}
        <button onClick={handleDismiss} aria-label="Cerrar banner de instalación" style={{
          background: 'none', border: 'none', color: 'var(--text-3)', fontSize: '20px',
          cursor: 'pointer', padding: '0', lineHeight: 1, flexShrink: 0,
        }}>×</button>
      </div>
    </div>
  )
}
