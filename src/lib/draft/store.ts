// src/lib/draft/store.ts
//
// Zustand store del editor de torneo. Maneja:
// - Config local optimista (con `deepMergeConfig` para cada cambio)
// - Validación en cliente de cada partial con el schema del server: lo inválido
//   NO se encola ni se envía; queda en pantalla (`displayConfig`) con su error
//   hasta que el organizador lo corrija
// - Cola de cambios pendientes (autosave debounceado 500ms)
// - Persistencia offline en localStorage vía `offline-queue.ts`
// - Reintento exponencial con backoff para errores transitorios
// - Cambios rechazados por el server (reglas solo-server, permisos): sin
//   reintento, marcados en cola, superados por la corrección o descartables
// - Detección de 409 conflict → recarga del server (sin perder cambios locales nuevos)
//
// Invariante (bug inbox c894c74c, "al escribir se borra texto"): lo que el
// organizador está editando es la fuente de verdad. Cualquier config que venga
// del server (respuesta del save, 409, carga inicial, asistente IA) entra SOLO
// a través de `reconcileWithServer`, que vuelve a aplicar encima los cambios
// locales todavía no confirmados. Nunca se pisa un campo editado después de
// que salió el PATCH.
//
// El round-trip al server vive en `@/lib/data/tournament-drafts`.

import { create } from 'zustand'
import type { CollaboratorInfo, TournamentConfig, TournamentConfigPartial } from './types'
import { deepMergeConfig } from './deep-merge-config'
import { validatePartial } from './validate-partial'
import type { FieldIssue } from './field-labels'
import { fetchDraft, saveDraftPartial, type SaveDraftResult } from '@/lib/data/tournament-drafts'
import {
  type PendingChange,
  persist,
  load,
  clear as clearQueue,
  computeBackoffMs,
  OFFLINE_QUEUE_MAX_FAILURES_BEFORE_OFFLINE,
} from './offline-queue'

export type { CollaboratorInfo } from './types'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'conflict' | 'rejected' | 'invalid' | 'saved'

/** Un partial que no pasa el schema: se muestra, no se guarda. */
export interface InvalidChange {
  partial: TournamentConfigPartial
  message: string
  issues: FieldIssue[]
  timestamp: number
}

interface DraftStoreState {
  draftId: string | null
  /** Config válida: server + cambios pendientes (todos pasaron el schema). */
  config: TournamentConfig | null
  /** Lo que ve el organizador: `config` + partials inválidos encima. */
  displayConfig: TournamentConfig | null
  version: number
  collaborators: CollaboratorInfo[]
  syncStatus: SyncStatus
  pendingChanges: PendingChange[]
  invalidChanges: InvalidChange[]
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
   * a aplicar encima y siguen en cola para el próximo PATCH. Se ignora si
   * `version` no supera la del store (sería más vieja que lo ya guardado).
   */
  applyServerConfig: (config: TournamentConfig, version: number) => void
  /** Drena la cola. Si ya hay un drenaje en curso, devuelve esa misma promesa. */
  flush: () => Promise<void>
  /**
   * Salida garantizada: descarta lo inválido y lo rechazado, y vuelve a la
   * config del server (recargada) con los cambios válidos pendientes encima.
   */
  discardUnsaved: () => Promise<void>
  reset: () => void
  setSyncStatus: (s: SyncStatus) => void
}

export type DraftStore = DraftStoreState & DraftStoreActions

const AUTOSAVE_DEBOUNCE_MS = 500
const SAVED_FEEDBACK_MS = 2000
/**
 * Un 409 reconciliable se reintenta en el acto (misma llamada a `flush()`, así
 * "Crear torneo" no ve la cola a medio guardar). Si otro cliente gana la
 * carrera 3 veces seguidas, se corta el ciclo y se reintenta con backoff.
 */
const MAX_IMMEDIATE_CONFLICT_RETRIES = 3

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

/**
 * ¿Dos partials tocan alguna de las mismas keys raíz? Es la unidad de
 * "corrección": las secciones mandan el sub-objeto o el array COMPLETO bajo su
 * key raíz (`{ registration: { ...reg, patch } }`, `{ prizes: [...] }`), así que
 * un cambio posterior sobre la misma key raíz siempre reemplaza al anterior.
 */
export function touchesSameKeys(a: TournamentConfigPartial, b: TournamentConfigPartial): boolean {
  const keys = new Set(Object.keys(a))
  return Object.keys(b).some((k) => keys.has(k))
}

/** Lo que ve el organizador: config válida + partials inválidos encima. */
function computeDisplayConfig(
  config: TournamentConfig | null,
  invalid: InvalidChange[],
): TournamentConfig | null {
  if (!config) return null
  return invalid.reduce((acc, i) => deepMergeConfig(acc, i.partial), config)
}

/** Motivo del rechazo vigente, derivado de la cola (no de un lastError volátil). */
export function selectRejectionMessage(state: Pick<DraftStoreState, 'pendingChanges'>): string | null {
  return state.pendingChanges.find((c) => c.rejected)?.rejected ?? null
}

/** Estado del chip según lo que queda en cola y sin validar. */
function statusForQueue(pending: PendingChange[], invalid: InvalidChange[]): SyncStatus {
  if (pending.some((c) => !c.rejected)) return 'syncing'
  if (pending.some((c) => c.rejected)) return 'rejected'
  if (invalid.length > 0) return 'invalid'
  return 'saved'
}

export const useDraftStore = create<DraftStore>((set, get) => {
  // Todo cambio de `config` o `invalidChanges` pasa por acá para que
  // `displayConfig` nunca quede desfasado.
  const commit = (patch: Partial<DraftStoreState>) => {
    const next = { ...get(), ...patch }
    set({ ...patch, displayConfig: computeDisplayConfig(next.config, next.invalidChanges) })
  }

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
    let conflicts = 0
    for (;;) {
      const state = get()
      if (!state.draftId || !state.config) return

      // Lo rechazado no se reintenta: espera a que el organizador lo corrija.
      const batch = state.pendingChanges.filter((c) => !c.rejected)
      if (batch.length === 0) {
        // Nada que mandar (p. ej. el debounce disparó después de un flush
        // manual). Solo se corrige un "Sincronizando..." que quedó colgado; un
        // "Guardado"/"Sincronizado" vigente no se toca ni se re-agenda.
        if (state.syncStatus === 'syncing') {
          set({ syncStatus: statusForQueue(state.pendingChanges, state.invalidChanges) })
        }
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
      // respuesta ya no le pertenece a nadie. Se descarta y se vuelve a mirar
      // el estado: si hay otro borrador con cola, se drena; si no, se sale.
      const after = get()
      if (after.draftId !== state.draftId) continue

      const sent = new Set(batch)

      if (result.kind === 'ok') {
        // Salen de la cola solo los cambios que viajaron en este PATCH. Los que
        // entraron durante el vuelo se quedan y van encima de la config del server.
        const remaining = after.pendingChanges.filter((c) => !sent.has(c))
        persist(state.draftId, remaining)
        // Una respuesta con versión ≤ la del store es más vieja que lo que ya
        // tenemos (otro camino — la IA — avanzó mientras volaba): se descarta
        // la config, pero lo enviado sí salió de la cola.
        const stale = result.version <= after.version
        commit({
          config: stale ? after.config : reconcileWithServer(result.config, remaining),
          version: stale ? after.version : result.version,
          pendingChanges: remaining,
          syncStatus: statusForQueue(remaining, after.invalidChanges),
          lastSyncedAt: Date.now(),
          consecutiveFailures: 0,
        })
        conflicts = 0
        if (remaining.length === 0) {
          // "Guardado" dura 2s, después vuelve a "Sincronizado" (idle).
          if (after.invalidChanges.length === 0) scheduleSavedToIdle()
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
        // config del server, re-aplicamos lo local y reintentamos YA con esa
        // versión, dentro del mismo drenaje (quien hizo `await flush()` — crear
        // torneo — ve la cola vacía al final, no un falso "no se pudo guardar").
        conflicts += 1
        commit({
          config: reconcileWithServer(result.config, after.pendingChanges),
          version: result.version,
          syncStatus: 'conflict',
          lastError: 'Otro colaborador editó al mismo tiempo. Reintentando...',
        })
        if (conflicts < MAX_IMMEDIATE_CONFLICT_RETRIES) continue
        scheduleRetry(computeBackoffMs(0))
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
    displayConfig: null,
    version: 0,
    collaborators: [],
    syncStatus: 'idle',
    pendingChanges: [],
    invalidChanges: [],
    lastSyncedAt: null,
    lastError: null,
    consecutiveFailures: 0,

    // ──── actions ────

    init: (draftId, initial) => {
      // Si hay cola persistida (cambios que no llegaron al server), va encima
      // de la config del server y se reenvía ya. Las marcas de rechazo no se
      // cargan: se vuelve a intentar (si sigue mal, el server lo vuelve a decir).
      const queued = load(draftId).map((c) => {
        if (!c.rejected) return c
        const { rejected: _rejected, ...rest } = c
        return rest
      })

      commit({
        draftId,
        config: reconcileWithServer(initial.config, queued),
        version: initial.version,
        collaborators: initial.collaborators,
        syncStatus: queued.length > 0 ? 'offline' : 'idle',
        pendingChanges: queued,
        invalidChanges: [],
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

      // Misma validación que el PATCH del server. Lo inválido se muestra
      // (displayConfig) pero no entra a la cola ni viaja: el organizador lo
      // corrige con el error a la vista, y el server nunca recibe un 400 de
      // contenido que envenene la cola.
      const validation = validatePartial(partial)
      const invalidKept = state.invalidChanges.filter((i) => !touchesSameKeys(i.partial, partial))
      if (!validation.ok) {
        const invalidChanges = [
          ...invalidKept,
          { partial, message: validation.message, issues: validation.issues, timestamp: Date.now() },
        ]
        commit({
          invalidChanges,
          syncStatus: state.pendingChanges.some((c) => !c.rejected) ? state.syncStatus : 'invalid',
        })
        return
      }

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

      commit({
        config: nextConfig,
        pendingChanges: nextPending,
        invalidChanges: invalidKept,
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
      // Solo avanza: una config con versión ≤ la del store es anterior a lo que
      // ya se guardó (revertiría un autosave posterior).
      if (version <= state.version) return
      commit({
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

    discardUnsaved: async () => {
      const state = get()
      if (!state.draftId) return
      const draftId = state.draftId
      const kept = state.pendingChanges.filter((c) => !c.rejected)
      const hadRejected = kept.length !== state.pendingChanges.length
      persist(draftId, kept)
      if (!hadRejected) {
        // Solo había inválidos: la config válida ya es la buena.
        commit({ invalidChanges: [], pendingChanges: kept, syncStatus: statusForQueue(kept, []) })
        return
      }
      // Había rechazados aplicados de forma optimista sobre `config`: no se
      // pueden "desaplicar", así que se recarga el server y se reconcilia con
      // los cambios válidos que quedan.
      set({ syncStatus: 'syncing', lastError: null })
      try {
        const draft = await fetchDraft(draftId)
        if (get().draftId !== draftId) return
        const pending = get().pendingChanges.filter((c) => !c.rejected)
        commit({
          config: reconcileWithServer(draft.config, pending),
          version: Math.max(draft.version, get().version),
          pendingChanges: pending,
          invalidChanges: [],
          syncStatus: statusForQueue(pending, []),
          lastError: null,
        })
        if (pending.length > 0) void get().flush()
      } catch (err: unknown) {
        set({
          syncStatus: 'rejected',
          lastError: err instanceof Error ? err.message : 'No se pudo recargar el borrador',
        })
      }
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
        displayConfig: null,
        version: 0,
        collaborators: [],
        syncStatus: 'idle',
        pendingChanges: [],
        invalidChanges: [],
        lastSyncedAt: null,
        lastError: null,
        consecutiveFailures: 0,
      })
    },

    setSyncStatus: (s) => set({ syncStatus: s }),
  }
})
