// src/lib/draft/offline-queue.ts
//
// Cola offline persistida en localStorage para draft autosave.
// Cada draft tiene una cola separada bajo la key `draft:{id}:queue`.
//
// API:
// - persist(draftId, queue) -> escribe la cola completa
// - load(draftId)           -> carga la cola desde storage (o [] si vac��a)
// - clear(draftId)          -> borra la cola
// - computeBackoffMs(attempt) -> backoff exponencial 1s, 2s, 4s, 8s, max 30s
//
// Cada PendingChange lleva un `partial`, `source`, `timestamp`. El consumidor
// (zustand store) decide cuǭndo flushear (merger de varios partials en una
// sola PATCH al server).

import type { TournamentConfigPartial } from './types'

export interface PendingChange {
  partial: TournamentConfigPartial
  source: 'manual' | 'ai'
  timestamp: number
}

function key(draftId: string): string {
  return `draft:${draftId}:queue`
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function persist(draftId: string, queue: PendingChange[]): void {
  if (!isBrowser()) return
  try {
    if (queue.length === 0) {
      window.localStorage.removeItem(key(draftId))
    } else {
      window.localStorage.setItem(key(draftId), JSON.stringify(queue))
    }
  } catch {
    // Quota / privacy mode: silenciamos. La memoria en el store sigue siendo la fuente.
  }
}

export function load(draftId: string): PendingChange[] {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(key(draftId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as PendingChange[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is PendingChange =>
        p != null &&
        typeof p === 'object' &&
        typeof (p as PendingChange).timestamp === 'number' &&
        ((p as PendingChange).source === 'manual' || (p as PendingChange).source === 'ai')
    )
  } catch {
    return []
  }
}

export function clear(draftId: string): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(key(draftId))
  } catch {
    /* ignore */
  }
}

/**
 * Backoff exponencial: 1s, 2s, 4s, 8s, 16s, max 30s.
 * `attempt` 0-indexed (primer reintento => attempt=0 => 1000ms).
 */
export function computeBackoffMs(attempt: number): number {
  const ms = 1000 * Math.pow(2, attempt)
  return Math.min(ms, 30000)
}

export const OFFLINE_QUEUE_MAX_FAILURES_BEFORE_OFFLINE = 3
