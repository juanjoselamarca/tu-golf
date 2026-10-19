'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PROFILE_COLS, type Profile } from '@/lib/data/perfil'
import { construirAvisoIndice } from '@/lib/fedegolf/aviso-indice'
import { SYNC_INDICE_COOLDOWN_LABEL } from '@/lib/fedegolf/sync-cooldown'
import { MENSAJE_NO_VINCULADO } from '@/lib/fedegolf/sincronizar-indice'
import { marcarAvisoMostrado } from '@/lib/fedegolf/aviso-local'
import type { CambioIndice } from '@/lib/fedegolf/persistencia-indice'

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
        | {
            ok?:              boolean
            indice?:          number
            indice_anterior?: number | null
            cambio?:          boolean
            cached?:          boolean
            degradado?:       boolean
            sin_indice?:      boolean
            ultimo_cambio?:   CambioIndice | null
            error?:           string
          }
        | null
      if (res.status === 404 || body?.error === MENSAJE_NO_VINCULADO) {
        setMsg({ kind: 'warn', text: 'Vincula tu cuenta FedeGolf primero.' })
      } else if (!res.ok || body?.ok === false) {
        setMsg({ kind: 'error', text: body?.error || 'No se pudo actualizar. Intenta más tarde.' })
      } else if (body?.sin_indice) {
        // FedeGolf respondió, pero no tiene índice vigente para el RUT: no es una caída.
        setMsg({
          kind: 'warn',
          text: body.indice == null
            ? 'FedeGolf no tiene un índice vigente para tu RUT.'
            : 'FedeGolf no tiene un índice vigente para tu RUT. Mantenemos tu último índice.',
        })
      } else if (body?.degradado) {
        // FedeGolf no respondió: el índice mostrado es el último conocido. No es
        // "ya está actualizado" (sería mentira) ni un error del usuario.
        setMsg({
          kind: 'warn',
          text: body.indice == null
            ? 'FedeGolf no está respondiendo. Intenta más tarde.'
            : 'FedeGolf no está respondiendo. Te mostramos tu último índice; intenta más tarde.',
        })
      } else if (body?.cached) {
        // NO prometer un plazo ("prueba en X horas"): el cooldown se cuenta desde
        // el último sync, no desde ahora, así que cualquier plazo que demos acá es
        // mentira para quien sincronizó hace 23h. Explicamos el ritmo, que sí es cierto.
        setMsg({
          kind: 'warn',
          text: `Ya está actualizado. Tu índice se sincroniza cada ${SYNC_INDICE_COOLDOWN_LABEL}.`,
        })
      } else if (body?.cambio === false) {
        setMsg({ kind: 'ok', text: 'Tu índice no cambió.' })
      } else {
        // Misma narración del cambio que el aviso automático (fuente única de la
        // copy): el usuario ve de dónde venía, no solo el valor nuevo.
        const aviso = construirAvisoIndice(body?.indice, body?.indice_anterior)
        // El usuario ya vio este cambio acá: el aviso automático no lo repite.
        if (body?.ultimo_cambio) marcarAvisoMostrado(profile.id, body.ultimo_cambio.fecha)
        setMsg({
          kind: 'ok',
          text: aviso
            ? `${aviso.title}. ${aviso.message}`
            : `Índice actualizado: ${body?.indice?.toFixed(1) ?? '—'}`,
        })
        const supabase = createClient()
        const { data: updated } = await supabase
          .from('profiles')
          .select(PROFILE_COLS)
          .eq('id', profile.id).single()
        if (updated) onProfile(updated as Profile)
      }
    } catch {
      setMsg({ kind: 'error', text: 'Error de red. Prueba de nuevo.' })
    } finally {
      setRefreshing(false)
      setTimeout(() => setMsg(null), 6000)
    }
  }

  return { refreshing, msg, refresh }
}
