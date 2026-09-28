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
  /**
   * El server rechazó este cambio (4xx de validación/permisos) con este
   * mensaje. No se reintenta: queda en cola, marcado, hasta que el organizador
   * corrija el campo (el cambio nuevo sobre la misma key lo reemplaza).
   */
  rejected?: string
  /**
   * El server rechazó el PATCH por un problema en keys que este cambio NO toca
   * (la config base del borrador es inválida, p. ej. un formato copiado sin
   * validar). No es culpa del cambio: queda bloqueado, sin marcar como
   * rechazado, hasta que un PATCH ok toque alguna de esas keys.
   */
  blocked?: { keys: string[]; message: string }
}

function key(draftId: string): string {
  return `draft:${draftId}:queue`
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

/** Objeto plano (no null, no array): lo único que puede ser un partial. Un
 *  dato corrupto en localStorage no puede dejar el borrador inabrible. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
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
        isPlainObject(p) &&
        isPlainObject(p.partial) &&
        typeof p.timestamp === 'number' &&
        (p.source === 'manual' || p.source === 'ai')
    )
  } catch {
    return []
  }
}

export function clear(draftId: string): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(key(draftId))
    window.localStorage.removeItem(invalidKey(draftId))
  } catch {
    /* ignore */
  }
}

// ── Partials inválidos (en pantalla, no en cola) ───────────────────────
//
// Lo que el organizador tipeó y no pasa el schema también sobrevive a una
// recarga: se guarda aparte, bajo `draft:{id}:invalid`, y `init()` lo vuelve a
// validar contra la config cargada.

export interface PersistedInvalid {
  partial: TournamentConfigPartial
  timestamp: number
}

function invalidKey(draftId: string): string {
  return `draft:${draftId}:invalid`
}

export function persistInvalid(draftId: string, items: PersistedInvalid[]): void {
  if (!isBrowser()) return
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(invalidKey(draftId))
    } else {
      window.localStorage.setItem(invalidKey(draftId), JSON.stringify(items))
    }
  } catch {
    // Quota / privacy mode: silenciamos. La memoria en el store sigue siendo la fuente.
  }
}

export function loadInvalid(draftId: string): PersistedInvalid[] {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(invalidKey(draftId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as PersistedInvalid[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is PersistedInvalid => isPlainObject(p) && isPlainObject(p.partial) && typeof p.timestamp === 'number',
    )
  } catch {
    return []
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
