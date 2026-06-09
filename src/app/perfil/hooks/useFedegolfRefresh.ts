'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PROFILE_COLS, type Profile } from '@/lib/data/perfil'

type FedegolfMsg = { kind: 'ok' | 'warn' | 'error'; text: string } | null

export function useFedegolfRefresh(profile: Profile, onProfile: (p: Profile) => void) {
  const [refreshing, setRefreshing] = useState(false)
  const [msg, setMsg] = useState<FedegolfMsg>(null)

  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    setMsg(null)
    try {
      const res = await fetch('/api/fedegolf/sync-indice', { method: 'POST' })
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; indice?: number; cambio?: boolean; cached?: boolean; error?: string }
        | null
      if (res.status === 404 || body?.error === 'No hay cuenta FedeGolf vinculada') {
        setMsg({ kind: 'warn', text: 'Vinculá tu cuenta FedeGolf primero.' })
      } else if (!res.ok) {
        setMsg({ kind: 'error', text: body?.error || 'No se pudo actualizar. Intentá más tarde.' })
      } else if (body?.cached) {
        setMsg({ kind: 'warn', text: 'Ya está actualizado. Probá de nuevo en 4 horas.' })
      } else if (body?.cambio === false) {
        setMsg({ kind: 'ok', text: 'Tu índice no cambió.' })
      } else {
        setMsg({ kind: 'ok', text: `Índice actualizado: ${body?.indice?.toFixed(1) ?? '—'}` })
        const supabase = createClient()
        const { data: updated } = await supabase
          .from('profiles')
          .select(PROFILE_COLS)
          .eq('id', profile.id).single()
        if (updated) onProfile(updated as Profile)
      }
    } catch {
      setMsg({ kind: 'error', text: 'Error de red. Probá de nuevo.' })
    } finally {
      setRefreshing(false)
      setTimeout(() => setMsg(null), 6000)
    }
  }

  return { refreshing, msg, refresh }
}
