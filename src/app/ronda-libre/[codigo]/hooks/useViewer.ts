'use client'

// ─── Hook de identidad del espectador + banner de registro ──────────────────
// Extraído del componente monolítico [codigo]/page.tsx (job "Resultados v2").
// Maneja: sesión auth (anónimo / userId), banner de registro para anónimos,
// y el modal de auth contextual (requireAuth).

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export interface UseViewerResult {
  isAnonymous: boolean
  currentUserId: string | null
  showBanner: boolean
  dismissBanner: () => void
  showAuthModal: boolean
  authModalAction: string
  /** Abre el modal de auth si el usuario es anónimo. Devuelve true si lo abrió. */
  requireAuth: (action: string) => boolean
  closeAuthModal: () => void
}

export function useViewer(codigo: string): UseViewerResult {
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authModalAction, setAuthModalAction] = useState('')

  // Sesión auth.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAnonymous(!user)
      setCurrentUserId(user?.id ?? null)
    })
  }, [])

  // Banner de registro a los 8s o al primer scroll (anónimos).
  useEffect(() => {
    if (!isAnonymous || bannerDismissed) return
    const dismissed = sessionStorage.getItem(`banner-dismissed-${codigo}`)
    if (dismissed) { setBannerDismissed(true); return }
    const timer = setTimeout(() => setShowBanner(true), 8000)
    const handleScroll = () => { setShowBanner(true); window.removeEventListener('scroll', handleScroll) }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => { clearTimeout(timer); window.removeEventListener('scroll', handleScroll) }
  }, [isAnonymous, bannerDismissed, codigo])

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true)
    setShowBanner(false)
    sessionStorage.setItem(`banner-dismissed-${codigo}`, '1')
  }, [codigo])

  const requireAuth = useCallback((action: string) => {
    if (isAnonymous) {
      setAuthModalAction(action)
      setShowAuthModal(true)
      return true
    }
    return false
  }, [isAnonymous])

  const closeAuthModal = useCallback(() => setShowAuthModal(false), [])

  return {
    isAnonymous, currentUserId,
    showBanner, dismissBanner,
    showAuthModal, authModalAction, requireAuth, closeAuthModal,
  }
}
