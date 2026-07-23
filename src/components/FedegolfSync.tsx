'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Sync silencioso de índice FedeGolf cuando el usuario tiene cuenta vinculada.
 * Se monta en TODAS las páginas (layout root) así que DEBE chequear sesión
 * antes de tocar el endpoint — si no, dispara 401 en consola para visitantes
 * pre-login (FTUE audit 22-may-2026).
 *
 * El gate es client-side via getSession() (lee cookie sin round-trip extra al
 * server). Si no hay sesión, no hace nada — usuario no logueado no puede tener
 * cuenta FedeGolf vinculada por definición.
 */
export default function FedegolfSync() {
  const synced = useRef(false)

  useEffect(() => {
    if (synced.current) return
    synced.current = true

    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return // sin sesión, no hay nada que sincronizar

      fetch('/api/fedegolf/sync-indice', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.ok && data.cambio) {
            console.log(`[FedegolfSync] Índice actualizado: ${data.indice}`)
          }
        })
        .catch(() => {
          // Silent — if it fails, nothing happens
        })

      // Sync de tarjetas del índice — INDEPENDIENTE (spec D4): no encadenado al
      // de índice, así uno no bloquea ni afecta al otro. Fire-and-forget, silencioso.
      fetch('/api/fedegolf/sync-tarjetas', { method: 'POST' }).catch(() => {
        // Silent — fail-soft
      })
    }).catch(() => {
      // Silent
    })
  }, [])

  return null
}
