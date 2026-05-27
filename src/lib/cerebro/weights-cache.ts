/**
 * Cache distribuido de cerebro_weights.
 *
 * Estrategia 2 capas:
 *  1. TTL local de 60s en memoria del proceso. Seguro y simple.
 *  2. Supabase Realtime sobre la tabla `cerebro_weights` para invalidación
 *     cross-process inmediata cuando admin cambia un peso. Si Realtime no
 *     está disponible (tests, CI, errores transitorios), la app sigue
 *     funcionando con el TTL como safety net.
 *
 * Solo server-side: el cliente service_role no debe exponerse al browser.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getAllWeights, type CerebroWeight } from './weights'

const TTL_MS = 60_000 // 60 segundos

let cache: { weights: CerebroWeight[]; loadedAt: number } | null = null
let realtimeClient: SupabaseClient | null = null
let channelSubscribed = false

function ensureChannelSubscribed(): void {
  if (channelSubscribed) return
  if (typeof window !== 'undefined') return // no browser
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return
  try {
    realtimeClient = realtimeClient ?? createClient(url, key)
    realtimeClient
      .channel('cerebro_weights_listener')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cerebro_weights' },
        () => {
          cache = null
        },
      )
      .subscribe()
    channelSubscribed = true
  } catch {
    // Realtime no disponible — el TTL es el safety net.
  }
}

export async function getCachedWeights(): Promise<CerebroWeight[]> {
  ensureChannelSubscribed()
  const now = Date.now()
  if (cache && now - cache.loadedAt < TTL_MS) {
    return cache.weights
  }
  const weights = await getAllWeights()
  cache = { weights, loadedAt: now }
  return weights
}

/** Invalida la copia local del cache. Llamar después de setWeight() en el mismo proceso. */
export function invalidateLocal(): void {
  cache = null
}

/** Solo para tests — resetea estado del cache y la subscripción. */
export function _resetCacheForTest(): void {
  cache = null
  channelSubscribed = false
  realtimeClient = null
}
