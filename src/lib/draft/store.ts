// src/lib/draft/store.ts
//
// Zustand store del editor de torneo. Maneja:
// - Config local optimista (con `deepMergeConfig` para cada cambio)
// - Cola de cambios pendientes (autosave debounceado 500ms)
// - Persistencia offline en localStorage vía `offline-queue.ts`
// - Reintento exponencial con backoff para errores transitorios
// - Cambios rechazados por el server (4xx): sin reintento, quedan marcados en
//   la cola hasta que el organizador corrija el campo
// - Detección de 409 conflict → recarga del server (sin perder cambios locales nuevos)
//
// Invariante (bug inbox c894c74c, "al escribir se borra texto"): lo que el
// organizador está editando es la fuente de verdad. Cualquier config que venga
// del server (respuesta del save, 409, carga inicial, asistente IA) entra SOLO
// a través de `reconcileWithServer`, que vuelve a aplicar encima los cambios
// locales todavía no confirmados. Nunca se pisa un campo editado después de
// que salió el PATCH.
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

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'conflict' | 'rejected' | 'saved'

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
  /**
   * Toma una config ya persistida por otro camino (asistente IA) sin perder lo
   * que el organizador tiene a medio escribir: los cambios pendientes se vuelven
   * a aplicar encima y siguen en cola para el próximo PATCH.
   */
  applyServerConfig: (config: TournamentConfig, version: number) => void
  /** Drena la cola. Si ya hay un drenaje en curso, devuelve esa misma promesa. */
  flush: () => Promise<void>
  reset: () => void
  setSyncStatus: (s: SyncStatus) => void
}

export type DraftStore = DraftStoreState & DraftStoreActions

const AUTOSAVE_DEBOUNCE_MS = 500
const CONFLICT_RETRY_MS = 500
const SAVED_FEEDBACK_MS = 2000

// Estado interno fuera del store (timers + drenaje en curso). Necesarios porque
// queremos timers persistentes entre renders sin re-render-on-write.
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
let _retryTimer: ReturnType<typeof setTimeout> | null = null
let _savedTimer: ReturnType<typeof setTimeout> | null = null
let _drain: Promise<void> | null = null

function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
  if (timer) clearTimeout(timer)
  return null
}

/**
 * Combina varios cambios en un solo partial con la MISMA semántica con la que
 * el server (y `applyChange`) los aplican: deep-merge, arrays por id. Así el
 * partial combinado aplicado una vez deja el mismo estado que los cambios
 * aplicados en secuencia — un cambio en `registration.mode` no se pierde
 * porque después llegó otro en `registration.max_players`.
 */
export function foldPartials(changes: PendingChange[]): {
  partial: TournamentConfigPartial
  hasAi: boolean
} {
  let combined: TournamentConfigPartial = {}
  let hasAi = false
  for (const c of changes) {
    combined = deepMergeConfig(combined as TournamentConfig, c.partial) as TournamentConfigPartial
    if (c.source === 'ai') hasAi = true
  }
  return { partial: combined, hasAi }
}

/**
 * Única puerta de entrada de una config del server al store: lo local pendiente
 * (lo que el organizador editó y todavía no se confirmó) va encima, siempre.
 */
export function reconcileWithServer(
  serverConfig: TournamentConfig,
  pending: PendingChange[],
): TournamentConfig {
  if (pending.length === 0) return serverConfig
  return deepMergeConfig(serverConfig, foldPartials(pending).partial)
}

/** ¿Un cambio nuevo corrige (toca alguna de las mismas keys que) uno rechazado? */
function touchesSameKeys(a: TournamentConfigPartial, b: TournamentConfigPartial): boolean {
  const keys = new Set(Object.keys(a))
  return Object.keys(b).some((k) => keys.has(k))
}

/** Estado del chip según lo que queda en cola después de un PATCH ok. */
function statusForQueue(pending: PendingChange[]): SyncStatus {
  if (pending.some((c) => !c.rejected)) return 'syncing'
  if (pending.length > 0) return 'rejected'
  return 'saved'
}

export const useDraftStore = create<DraftStore>((set, get) => {
  const scheduleRetry = (ms: number) => {
    _retryTimer = clearTimer(_retryTimer)
    _retryTimer = setTimeout(() => {
      _retryTimer = null
      void get().flush()
    }, ms)
  }

  const scheduleSavedToIdle = () => {
    _savedTimer = clearTimer(_savedTimer)
    _savedTimer = setTimeout(() => {
      _savedTimer = null
      if (get().syncStatus === 'saved' && get().pendingChanges.length === 0) {
        set({ syncStatus: 'idle' })
      }
    }, SAVED_FEEDBACK_MS)
  }

  // Un solo PATCH en vuelo por vez. Después de cada respuesta ok se vuelve a
  // mirar la cola: lo que entró durante el vuelo sale en el siguiente PATCH con
  // la versión nueva. Los errores transitorios cortan el drenaje y programan el
  // reintento; los rechazos marcan el cambio y siguen con el resto de la cola.
  const drainQueue = async (): Promise<void> => {
    for (;;) {
      const state = get()
      if (!state.draftId || !state.config) return

      // Lo rechazado no se reintenta: espera a que el organizador lo corrija.
      const batch = state.pendingChanges.filter((c) => !c.rejected)
      if (batch.length === 0) {
        if (state.pendingChanges.length > 0) set({ syncStatus: 'rejected' })
        return
      }
      const { partial, hasAi } = foldPartials(batch)

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

      // El store pudo resetearse o cambiar de borrador durante el vuelo: la
      // respuesta ya no le pertenece a nadie.
      const after = get()
      if (after.draftId !== state.draftId) return

      const sent = new Set(batch)

      if (result.kind === 'ok') {
        // Salen de la cola solo los cambios que viajaron en este PATCH. Los que
        // entraron durante el vuelo se quedan y van encima de la config del server.
        const remaining = after.pendingChanges.filter((c) => !sent.has(c))
        persist(state.draftId, remaining)
        set({
          config: reconcileWithServer(result.config, remaining),
          version: result.version,
          pendingChanges: remaining,
          syncStatus: statusForQueue(remaining),
          lastSyncedAt: Date.now(),
          consecutiveFailures: 0,
        })
        if (remaining.length === 0) {
          // "Guardado" dura 2s, después vuelve a "Sincronizado" (idle).
          scheduleSavedToIdle()
          return
        }
        continue
      }

      if (result.kind === 'rejected') {
        // El server no acepta este cambio. Queda en pantalla (el organizador
        // tiene que verlo para corregirlo) y en cola, marcado, sin reintento.
        // Lo que entró durante el vuelo se drena igual en la próxima vuelta.
        const marked = after.pendingChanges.map((c) =>
          sent.has(c) ? { ...c, rejected: result.message } : c,
        )
        persist(state.draftId, marked)
        set({ pendingChanges: marked, syncStatus: 'rejected', lastError: result.message })
        continue
      }

      if (result.kind === 'conflict') {
        // Otra pestaña, colaborador o la IA avanzaron la versión. Tomamos la
        // config del server, re-aplicamos lo local y reintentamos con esa versión.
        if (result.config && typeof result.version === 'number') {
          set({
            config: reconcileWithServer(result.config, after.pendingChanges),
            version: result.version,
            syncStatus: 'conflict',
            lastError: 'Otro colaborador editó al mismo tiempo. Reintentando...',
          })
          scheduleRetry(CONFLICT_RETRY_MS)
        } else {
          set({
            syncStatus: 'conflict',
            lastError: 'Conflicto de versión. Recarga la página.',
          })
        }
        return
      }

      // Error transitorio (5xx, 429, red): contar fallo, dejar cola y config
      // local intactas, reintentar con backoff.
      const nextFailures = after.consecutiveFailures + 1
      set({
        syncStatus: nextFailures >= OFFLINE_QUEUE_MAX_FAILURES_BEFORE_OFFLINE ? 'offline' : 'syncing',
        consecutiveFailures: nextFailures,
        lastError: result.message,
      })
      scheduleRetry(computeBackoffMs(nextFailures - 1))
      return
    }
  }

  return {
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
      // Si hay cola persistida (cambios que no llegaron al server), va encima
      // de la config del server y se reenvía ya.
      const queued = load(draftId)

      set({
        draftId,
        config: reconcileWithServer(initial.config, queued),
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
      // Un cambio rechazado se reemplaza cuando el organizador vuelve a tocar
      // alguna de sus keys: eso es "corregir el campo". Los demás quedan.
      const kept = state.pendingChanges.filter(
        (c) => !(c.rejected && touchesSameKeys(c.partial, partial)),
      )
      const nextPending = [...kept, change]
      persist(state.draftId, nextPending)

      set({
        config: nextConfig,
        pendingChanges: nextPending,
        syncStatus: state.syncStatus === 'offline' ? 'offline' : 'syncing',
      })

      // Debounce: si llegan más cambios en 500ms, cancelamos y reagendamos.
      _debounceTimer = clearTimer(_debounceTimer)
      _debounceTimer = setTimeout(() => {
        _debounceTimer = null
        void get().flush()
      }, AUTOSAVE_DEBOUNCE_MS)
    },

    applyServerConfig: (config, version) => {
      const state = get()
      if (!state.draftId) return
      set({
        config: reconcileWithServer(config, state.pendingChanges),
        version,
      })
    },

    flush: () => {
      if (_drain) return _drain
      _drain = drainQueue().finally(() => {
        _drain = null
      })
      return _drain
    },

    reset: () => {
      const state = get()
      if (state.draftId) clearQueue(state.draftId)
      _debounceTimer = clearTimer(_debounceTimer)
      _retryTimer = clearTimer(_retryTimer)
      _savedTimer = clearTimer(_savedTimer)
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
  }
})
