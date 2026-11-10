'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { trackPageView } from '@/lib/analytics'

/** Registra la visita a un scorer: sin esto, quien anota por el grupo era invisible en analytics. */
export function useScorerPageView(pagina: string, codigo: string) {
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      trackPageView(supabase, data.session?.user?.id ?? null, pagina, { codigo })
    })
  }, [pagina, codigo])
}
