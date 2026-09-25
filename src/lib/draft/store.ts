// src/lib/draft/store.ts
//
// Zustand store del editor de torneo. Maneja:
// - Config local optimista (con `deepMergeConfig` para cada cambio)
// - Cola de cambios pendientes (autosave debounceado 500ms)
// - Persistencia offline en localStorage vía `offline-queue.ts`
// - Reintento exponencial con backoff
// - Detección de 409 conflict → recarga del server (sin perder cambios locales nuevos)
//
// El round-trip al server vive en `@/lib/data/tournament-drafts` (saveDraftPartial).

import { create } from 'zustand'
import type { CollaboratorInfo, TournamentConfig, TournamentConfigPartial } from './types'
import { deepMergeConfig } from './deep-merge-config'
import { saveDraftPartial, type SaveDraftResult } from '@/lib/data/tournament-drafts'
import {
  type PendingChange,
  persist,
  load,
  clear as clearQueue,
  computeBackoffMs,
  OFFLINE_QUEUE_MAX_FAILURES_BEFORE_OFFLINE,
} from './offline-queue'

export type { CollaboratorInfo } from './types'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'conflict' | 'saved'

interface DraftStoreState {
  draftId: string | null
  config: TournamentConfig | null
  version: number
  collaborators: CollaboratorInfo[]
  syncStatus: SyncStatus
  pendingChanges: PendingChange[]
  lastSyncedAt: number | null
  lastError: string | null
  consecutiveFailures: number
}

interface DraftStoreActions {
  init: (
    draftId: string,
    initial: { config: TournamentConfig; version: number; collaborators: CollaboratorInfo[] }
  ) => void
  applyChange: (partial: TournamentConfigPartial, source: 'manual' | 'ai') => void
  flush: () => Promise<void>
  reset: () => void
  setSyncStatus: (s: SyncStatus) => void
}

export type DraftStore = DraftStoreState & DraftStoreActions

const AUTOSAVE_DEBOUNCE_MS = 500

// Estado interno fuera del store (timers + abort). Necesarios porque
// queremos timers persistentes entre renders sin re-render-on-write.
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
let _flushInFlight: Promise<void> | null = null

function mergePartials(changes: PendingChange[]): {
  partial: TournamentConfigPartial
  hasAi: boolean
} {
  // Fold de izquierda a derecha: combinamos a un solo partial. Como el
  // server-side hace deepMerge sobre la config actual, esto es seguro.
  let combined: TournamentConfigPartial = {}
  let hasAi = false
  for (const c of changes) {
    combined = { ...combined, ...c.partial }
    if (c.source === 'ai') hasAi = true
  }
  return { partial: combined, hasAi }
}

export const useDraftStore = create<DraftStore>((set, get) => ({
  // ──── state ────
  draftId: null,
  config: null,
  version: 0,
  collaborators: [],
  syncStatus: 'idle',
  pendingChanges: [],
  lastSyncedAt: null,
  lastError: null,
  consecutiveFailures: 0,

  // ──── actions ────

  init: (draftId, initial) => {
    const queued = load(draftId)

    // Si hay cola persistida, la aplicamos optimistamente al config para no
    // perder cambios locales que no llegaron al server.
    let mergedConfig = initial.config
    if (queued.length > 0) {
      const { partial } = mergePartials(queued)
      mergedConfig = deepMergeConfig(initial.config, partial)
    }

    set({
      draftId,
      config: mergedConfig,
      version: initial.version,
      collaborators: initial.collaborators,
      syncStatus: queued.length > 0 ? 'offline' : 'idle',
      pendingChanges: queued,
      lastSyncedAt: queued.length > 0 ? null : Date.now(),
      lastError: null,
      consecutiveFailures: 0,
    })

    if (queued.length > 0) {
      // Replay inmediato en background (sin debounce, queremos sincronizar ya).
      void get().flush()
    }
  },

  applyChange: (partial, source) => {
    const state = get()
    if (!state.config || !state.draftId) return

    // Optimistic: aplicamos al config local de inmediato.
    const nextConfig = deepMergeConfig(state.config, partial)
    const change: PendingChange = { partial, source, timestamp: Date.now() }
    const nextPending = [...state.pendingChanges, change]
    persist(state.draftId, nextPending)

    set({
      config: nextConfig,
      pendingChanges: nextPending,
      syncStatus: state.syncStatus === 'offline' ? 'offline' : 'syncing',
    })

    // Debounce: si llegan más cambios en 500ms, cancelamos y reagendamos.
    if (_debounceTimer) clearTimeout(_debounceTimer)
    _debounceTimer = setTimeout(() => {
      void get().flush()
    }, AUTOSAVE_DEBOUNCE_MS)
  },

  flush: async () => {
    // Coalesce: si ya hay un flush en vuelo, esperar a que termine y reintentar.
    if (_flushInFlight) {
      await _flushInFlight
      // Re-evaluar: pueden haber cambios nuevos después del primer flush.
      if (get().pendingChanges.length === 0) return
    }

    _flushInFlight = (async () => {
      const state = get()
      if (!state.draftId || !state.config) return
      if (state.pendingChanges.length === 0) return

      const changesToFlush = state.pendingChanges
      const { partial, hasAi } = mergePartials(changesToFlush)

      set({ syncStatus: 'syncing', lastError: null })

      // saveDraftPartial no lanza (red → kind 'error'), pero cualquier excepción
      // inesperada cae al mismo camino de reintento: nunca una promesa rechazada
      // suelta desde un timer.
      let result: SaveDraftResult
      try {
        result = await saveDraftPartial({
          draftId: state.draftId,
          partial,
          version: state.version,
          source: hasAi ? 'ai' : 'manual',
        })
      } catch (err: unknown) {
        result = { kind: 'error', status: 0, message: err instanceof Error ? err.message : 'Error de red' }
      }

      if (result.kind === 'ok') {
        // Removemos del queue solo los cambios que estaban en el momento del flush.
        // Cambios nuevos que entraron durante la fetch se mantienen.
        const remaining = get().pendingChanges.slice(changesToFlush.length)
        persist(state.draftId, remaining)
        set({
          config: result.config,
          version: result.version,
          pendingChanges: remaining,
          syncStatus: remaining.length > 0 ? 'syncing' : 'saved',
          lastSyncedAt: Date.now(),
          consecutiveFailures: 0,
        })

        // Si quedaron cambios nuevos, reflushear inmediato.
        if (remaining.length > 0) {
          setTimeout(() => void get().flush(), 50)
        } else {
          // "Saved" feedback dura 2s, después vuelve a idle.
          setTimeout(() => {
            if (get().syncStatus === 'saved' && get().pendingChanges.length === 0) {
              set({ syncStatus: 'idle' })
            }
          }, 2000)
        }
        return
      }

      if (result.kind === 'conflict') {
        // Conflict: server tiene versión más nueva. Cargamos config server y
        // re-aplicamos nuestros cambios locales sobre eso.
        if (result.config && typeof result.version === 'number') {
          const { partial: localPartial } = mergePartials(get().pendingChanges)
          const reMerged = deepMergeConfig(result.config, localPartial)
          set({
            config: reMerged,
            version: result.version,
            syncStatus: 'conflict',
            lastError: 'Otro colaborador editó al mismo tiempo. Reintentando...',
          })
          // Reintento automático con la nueva versión.
          setTimeout(() => void get().flush(), 500)
        } else {
          set({
            syncStatus: 'conflict',
            lastError: 'Conflicto de versión. Recarga la página.',
          })
        }
        return
      }

      // Otros errores (HTTP o red): contar fallo, dejar pendingChanges intactos.
      const nextFailures = get().consecutiveFailures + 1
      set({
        syncStatus: nextFailures >= OFFLINE_QUEUE_MAX_FAILURES_BEFORE_OFFLINE ? 'offline' : 'syncing',
        consecutiveFailures: nextFailures,
        lastError: result.message,
      })
      // Retry exponencial.
      setTimeout(() => void get().flush(), computeBackoffMs(nextFailures - 1))
    })()

    try {
      await _flushInFlight
    } finally {
      _flushInFlight = null
    }
  },

  reset: () => {
    const state = get()
    if (state.draftId) clearQueue(state.draftId)
    if (_debounceTimer) {
      clearTimeout(_debounceTimer)
      _debounceTimer = null
    }
    set({
      draftId: null,
      config: null,
      version: 0,
      collaborators: [],
      syncStatus: 'idle',
      pendingChanges: [],
      lastSyncedAt: null,
      lastError: null,
      consecutiveFailures: 0,
    })
  },

  setSyncStatus: (s) => set({ syncStatus: s }),
}))
