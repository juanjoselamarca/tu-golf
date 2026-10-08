/**
 * Cache de cerebro_weights en memoria del proceso, con TTL de 60 s.
 *
 * Sin Supabase Realtime (incidente torneo Los Leones 04-oct-2026): antes cada
 * lambda abría un websocket service-role a `cerebro_weights` para invalidar al
 * instante, y cada arranque del tenant de Realtime hacía DDL que tumbaba
 * PostgREST. Un peso cambiado por el admin tarda a lo sumo TTL_MS en verse en
 * otros procesos; en el mismo proceso, `invalidateLocal()` lo aplica al tiro.
 *
 * Solo server-side.
 */
import { getAllWeights, type CerebroWeight } from './weights'

const TTL_MS = 60_000 // 60 segundos

let cache: { weights: CerebroWeight[]; loadedAt: number } | null = null

export async function getCachedWeights(): Promise<CerebroWeight[]> {
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

/** Solo para tests — resetea el cache. */
export function _resetCacheForTest(): void {
  cache = null
}
