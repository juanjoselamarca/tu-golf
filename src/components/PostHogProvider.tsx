'use client'

import { useEffect } from 'react'

/**
 * PostHog cargado de forma diferida: posthog-js NO entra al bundle JS inicial
 * de la app (antes se importaba a nivel de módulo en el root layout, así que
 * pesaba en CADA página). Ahora se importa dinámicamente tras la hidratación y
 * solo si hay token configurado.
 *
 * Nada en la app usa el hook usePostHog(), por lo que no hace falta el
 * <PostHogProvider> context wrapper de posthog-js/react — autocapture +
 * capture_pageview siguen funcionando igual una vez inicializado.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    if (!token) return

    let cancelled = false
    import('posthog-js').then(({ default: posthog }) => {
      if (cancelled) return
      posthog.init(token, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
        autocapture: true,
        capture_pageview: true,
        capture_pageleave: true,
        respect_dnt: true,
        ip: false,
        persistence: 'localStorage',
        loaded: (ph) => {
          if (process.env.NODE_ENV === 'development') ph.debug()
        },
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  return <>{children}</>
}
