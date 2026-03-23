'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
      if (stored && stored.startsWith('/') && !stored.startsWith('//')) {
        localStorage.removeItem('golfers_post_login_redirect')
        router.replace(stored)
      }
    } catch {
      // localStorage not available
    }
  }, [router])

  return null
}
