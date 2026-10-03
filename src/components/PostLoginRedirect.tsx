'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { sanitizeNext, DEFAULT_NEXT } from '@/lib/auth/login-url'

/**
 * Reads localStorage fallback for post-login redirect.
 * Used when WhatsApp WebView loses URL params during OAuth flow.
 * Mount this in dashboard layout or page.
 */
export function PostLoginRedirect() {
  const router = useRouter()

  useEffect(() => {
    try {
      const stored = localStorage.getItem('golfers_post_login_redirect')
      if (stored) {
        localStorage.removeItem('golfers_post_login_redirect')
        // sanitizeNext también rechaza '/\host' (el navegador lo lee como '//host').
        const destino = sanitizeNext(stored)
        if (destino !== DEFAULT_NEXT) router.replace(destino)
      }
    } catch {
      // localStorage not available
    }
  }, [router])

  return null
}
