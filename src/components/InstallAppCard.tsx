'use client'

// src/components/InstallAppCard.tsx
//
// Card persistente en /perfil para instalar Golfers+ como PWA.
// Inbox 7ea72a78: el user quiere que los links se abran "siempre en la app
// si está instalada". La forma de lograr esto en una PWA es:
//
// - Android (Chrome 80+): si la PWA está instalada y el manifest tiene
//   `display: standalone` + `scope: /`, los links de golfersplus.vercel.app
//   se abren automáticamente en la PWA. Esto YA funciona.
// - iOS: NO existe deep linking automático para PWAs (limitación de Apple).
//   La única opción sería app nativa con Universal Links.
//
// Por eso este componente:
// - SIEMPRE visible si !isStandalone (no se dismissea por 7 días como el
//   PWAInstallBanner, que es para usuarios nuevos al inicio del flow).
// - En Android: dispara el beforeinstallprompt nativo.
// - En iOS: muestra instrucciones "Compartir → Agregar a inicio".
// - Si ya está instalada: la card no se renderiza (devuelve null).
//
// La instalación es el "auto-magic" más cercano disponible para una PWA.
// Documentación honesta sobre limitaciones iOS en el copy.

import { useEffect, useState } from 'react'
import { Smartphone, Check } from '@/components/icons'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallAppCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showIosInstructions, setShowIosInstructions] = useState(false)
  const [installedNow, setInstalledNow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Ya instalada en standalone mode → no mostrar nada.
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true
    setIsStandalone(standalone)
    if (standalone) return

    // iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(ios)

    // Android/Chrome
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (isIOS) {
      setShowIosInstructions(prev => !prev)
      return
    }
    if (!deferredPrompt) {
      // El browser no expuso beforeinstallprompt (puede que el user lo dismisseó
      // antes en este browser). Mostrar igualmente instrucciones genéricas.
      setShowIosInstructions(true)
      return
    }
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setInstalledNow(true)
    }
    setDeferredPrompt(null)
  }

  // Si ya está instalada o ya se instaló en esta sesión, no mostrar.
  if (isStandalone || installedNow) return null

  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid rgba(196,153,42,0.22)',
        borderRadius: '16px',
        padding: '14px 16px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        animation: 'profileIn 480ms cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      <div
        style={{
          width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
          background: 'rgba(196,153,42,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#c4992a',
        }}
        aria-hidden
      >
        <Smartphone size={20} strokeWidth={1.75} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px', fontWeight: 700, color: 'var(--text)',
          fontFamily: '"DM Sans", system-ui, sans-serif',
          marginBottom: '2px',
        }}>
          Usar Golfers+ como app
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-3)', lineHeight: 1.4 }}>
          {showIosInstructions
            ? (isIOS
                ? 'Tocá ⎘ Compartir en Safari → "Agregar a inicio".'
                : 'En tu browser: menú ⋮ → "Instalar app" / "Agregar a inicio".'
              )
            : 'Acceso directo, pantalla completa y los links se abren en la app.'}
        </div>
      </div>
      <button
        type="button"
        onClick={handleInstall}
        aria-label="Instalar Golfers+"
        style={{
          background: '#c4992a',
          color: 'var(--brand-dark, #0a1419)',
          border: 'none',
          borderRadius: '10px',
          padding: '10px 14px',
          fontSize: '12px',
          fontWeight: 700,
          fontFamily: '"DM Sans", system-ui, sans-serif',
          cursor: 'pointer',
          letterSpacing: '0.02em',
          flexShrink: 0,
          minHeight: '40px',
          display: 'inline-flex', alignItems: 'center', gap: '6px',
        }}
      >
        {showIosInstructions ? <><Check size={14} /> OK</> : 'Instalar'}
      </button>
    </div>
  )
}
