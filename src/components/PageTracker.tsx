'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { trackPageView } from '@/lib/analytics'

/**
 * Client component invisible que trackea page_view.
 * Usar en server components que no pueden usar useEffect directamente.
 *
 * Uso: <PageTracker page="/dashboard" />
 */
export function PageTracker({ page, extra }: { page: string; extra?: Record<string, unknown> }) {
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      trackPageView(supabase, data.session?.user?.id ?? null, page, extra)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  return null
}
