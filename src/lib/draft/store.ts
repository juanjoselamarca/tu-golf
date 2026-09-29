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
import { deepMergeConfig, mergePartials } from './deep-merge-config'
import { validatePartial } from './validate-partial'
import { tournamentConfigSchema } from './schema'
import { issueRootKey, type FieldIssue } from './field-labels'
import { saveDraftPartial, type SaveDraftResult } from '@/lib/data/tournament-drafts'
import {
  type PendingChange,
  persist,
  load,
  persistInvalid,
  loadInvalid,
  clear as clearQueue,
  computeBackoffMs,
  OFFLINE_QUEUE_MAX_FAILURES_BEFORE_OFFLINE,
} from './offline-queue'

export type { CollaboratorInfo } from './types'

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'auth'
  | 'conflict'
  | 'rejected'
  | 'invalid'
  | 'saved'

/** Un partial que no pasa el schema: se muestra, no se guarda. */
export interface InvalidChange {
  partial: TournamentConfigPartial
  message: string
  issues: FieldIssue[]
  timestamp: number
}

interface DraftStoreState {
  draftId: string | null
  /** Última config confirmada por el server (carga, 200 no viejo, 409, IA). */
  serverConfig: TournamentConfig | null
  /**
   * Config válida: SIEMPRE `reconcileWithServer(serverConfig, pendingChanges)`,
   * recalculada en cada commit. Nunca se setea a mano: así "Descartar" es
   * filtrar la cola y recalcular, sin GET ni carreras con el drenaje.
   */
  config: TournamentConfig | null
  /** Lo que ve el organizador: `config` + partials inválidos encima. */
  displayConfig: TournamentConfig | null
  version: number
  collaborators: CollaboratorInfo[]
  syncStatus: SyncStatus
  pendingChanges: PendingChange[]
  invalidChanges: InvalidChange[]
  /**
   * Issues del schema completo sobre `serverConfig`: la base del borrador ya
   * viene inválida (formato legacy, key que la UI no edita). Se muestran desde
   * el principio bajo su sección; un PATCH ok que arregle la key los limpia.
   */
  baseIssues: FieldIssue[]
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
   * Salida garantizada: descarta lo inválido y lo rechazado/bloqueado que había
   * al hacer click y recalcula desde la última config confirmada por el server
   * con los cambios válidos pendientes encima. Espera el drenaje en curso.
   */
  discardUnsaved: () => Promise<void>
  /**
   * Borra lo persistido en este navegador (cola + inválidos). Solo cuando el
   * borrador dejó de existir como tal: se creó el torneo. Navegar fuera del
   * editor NO borra nada: `init()` lo reenvía al volver.
   */
  forgetPersisted: () => void
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
/** Cambios que viajan en el PATCH en vuelo. La compactación nunca los toca:
 *  la rama ok los saca de la cola por identidad (`sent`). */
let _inFlight: Set<PendingChange> = new Set()

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
    combined = mergePartials(combined, c.partial)
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
 * "corrección" para sub-objetos, que las secciones mandan completos
 * (`{ registration: { ...reg, patch } }`). En LISTAS ya no vale como
 * reemplazo: un cambio posterior puede ser un patch parcial (una lápida o un
 * `_replace` de un solo item, ver `list-markers.ts`), así que quien descarta
 * algo por este predicado tiene que plegar el cambio nuevo, no asumir que lo
 * contiene (ver `applyChange`).
 */
export function touchesSameKeys(a: TournamentConfigPartial, b: TournamentConfigPartial): boolean {
  const keys = new Set(Object.keys(a))
  return Object.keys(b).some((k) => keys.has(k))
}

/**
 * Un rechazo queda superado en cuanto exista un cambio POSTERIOR sobre alguna
 * de sus keys raíz (enviado o no): esa es la corrección del organizador. Se
 * aplica al marcar y antes de sacar de la cola lo enviado, para que un
 * rechazado viejo nunca vuelva a pisar en pantalla la corrección.
 */
export function dropSupersededRejected(pending: PendingChange[]): PendingChange[] {
  return pending.filter((c, i) => {
    if (!c.rejected) return true
    return !pending.slice(i + 1).some((later) => !later.rejected && touchesSameKeys(c.partial, later.partial))
  })
}

/**
 * Parte un partial KEY RAÍZ POR KEY RAÍZ con la misma validación que el PATCH
 * del server (schema parcial + config completa resultante). Las keys válidas
 * vuelven juntas; cada inválida es su propio InvalidChange. Es seguro partir
 * porque los schemas validan por key y `deepMergeConfig` mergea por key.
 */
function splitByValidity(
  partial: TournamentConfigPartial,
  base: TournamentConfig,
): { valid: TournamentConfigPartial | null; invalid: InvalidChange[] } {
  const record = partial as Record<string, unknown>
  const valid: Record<string, unknown> = {}
  const invalid: InvalidChange[] = []
  for (const k of Object.keys(record)) {
    if (record[k] === undefined) continue
    const single = { [k]: record[k] } as TournamentConfigPartial
    const validation = validatePartial(single, base)
    if (validation.ok) valid[k] = record[k]
    else invalid.push({ partial: single, message: validation.message, issues: validation.issues, timestamp: Date.now() })
  }
  return { valid: Object.keys(valid).length > 0 ? (valid as TournamentConfigPartial) : null, invalid }
}

/** Reemplaza (por key raíz) los inválidos previos que los nuevos vuelven a tocar. */
function mergeInvalid(previous: InvalidChange[], incoming: InvalidChange[]): InvalidChange[] {
  return [
    ...previous.filter((prev) => !incoming.some((next) => touchesSameKeys(prev.partial, next.partial))),
    ...incoming,
  ]
}

/** Issues del schema completo sobre la config confirmada por el server. */
function issuesOfBase(serverConfig: TournamentConfig | null): FieldIssue[] {
  if (!serverConfig) return []
  const result = tournamentConfigSchema.safeParse(serverConfig)
  return result.success ? [] : (result.error.issues as unknown as FieldIssue[])
}

/** Lo que ve el organizador: config válida + partials inválidos encima. */
function computeDisplayConfig(
  config: TournamentConfig | null,
  invalid: InvalidChange[],
): TournamentConfig | null {
  if (!config) return null
  return invalid.reduce((acc, i) => deepMergeConfig(acc, i.partial), config)
}

/** ¿Puede viajar en el próximo PATCH? Ni rechazado ni bloqueado por la base. */
export function isDrainable(c: PendingChange): boolean {
  return !c.rejected && !c.blocked
}

/** Motivo del rechazo/bloqueo vigente, derivado de la cola (no de un lastError volátil). */
export function selectRejectionMessage(state: Pick<DraftStoreState, 'pendingChanges'>): string | null {
  const c = state.pendingChanges.find((p) => p.rejected || p.blocked)
  return c?.rejected ?? c?.blocked?.message ?? null
}

/** Estado del chip según lo que queda en cola y sin validar. */
function statusForQueue(pending: PendingChange[], invalid: InvalidChange[]): SyncStatus {
  if (pending.some(isDrainable)) return 'syncing'
  if (pending.length > 0) return 'rejected'
  if (invalid.length > 0) return 'invalid'
  return 'saved'
}

export const useDraftStore = create<DraftStore>((set, get) => {
  // Todo cambio de `serverConfig`, `pendingChanges` o `invalidChanges` pasa por
  // acá: `config` y `displayConfig` se derivan siempre, nunca se setean a mano.
  const commit = (patch: Partial<Omit<DraftStoreState, 'config' | 'displayConfig' | 'baseIssues'>>) => {
    const next = { ...get(), ...patch }
    const config = next.serverConfig ? reconcileWithServer(next.serverConfig, next.pendingChanges) : null
    const baseIssues = patch.serverConfig !== undefined ? issuesOfBase(patch.serverConfig) : get().baseIssues
    set({ ...patch, config, baseIssues, displayConfig: computeDisplayConfig(config, next.invalidChanges) })
    // Lo inválido también sobrevive a una recarga (init lo vuelve a validar).
    if (patch.invalidChanges !== undefined && next.draftId) {
      persistInvalid(
        next.draftId,
        patch.invalidChanges.map((i) => ({ partial: i.partial, timestamp: i.timestamp })),
      )
    }
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
    // Tras un rechazo sin path sobre un lote de varias keys, se reenvía por
    // grupo de key raíz para marcar solo lo que el server no acepta.
    let splitByKey = false
    for (;;) {
      const state = get()
      if (!state.draftId || !state.config) return

      // Lo rechazado no se reintenta (espera la corrección); lo bloqueado por
      // una base inválida espera a que un PATCH ok toque esas keys.
      let batch = state.pendingChanges.filter(isDrainable)
      if (splitByKey && batch.length > 1) {
        const first = batch[0]
        batch = batch.filter((c) => touchesSameKeys(first.partial, c.partial))
      }
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
      _inFlight = new Set(batch)
      try {
        result = await saveDraftPartial({
          draftId: state.draftId,
          partial,
          version: state.version,
          source: hasAi ? 'ai' : 'manual',
        })
      } catch (err: unknown) {
        result = { kind: 'error', status: 0, message: err instanceof Error ? err.message : 'Error de red' }
      } finally {
        _inFlight = new Set()
      }

      // El store pudo resetearse o cambiar de borrador durante el vuelo: la
      // respuesta ya no le pertenece a nadie. Se descarta y se vuelve a mirar
      // el estado: si hay otro borrador con cola, se drena; si no, se sale.
      const after = get()
      if (after.draftId !== state.draftId) {
        // El borrador cambió (reset) mientras volaba: lo que se guardó bien sale
        // igual de la cola persistida del borrador viejo, para que al volver no
        // se reenvíe un valor ya superado.
        if (result.kind === 'ok') {
          const sentKeys = new Set(batch.map((c) => `${c.timestamp}:${JSON.stringify(c.partial)}`))
          persist(state.draftId, load(state.draftId).filter((c) => !sentKeys.has(`${c.timestamp}:${JSON.stringify(c.partial)}`)))
        }
        continue
      }

      const sent = new Set(batch)

      if (result.kind === 'ok') {
        // Salen de la cola solo los cambios que viajaron en este PATCH. Los que
        // entraron durante el vuelo se quedan y van encima de la config del server.
        // Antes, los rechazados que este mismo lote corrigió se descartan: si no,
        // al sacar lo enviado volverían a pisar la corrección en pantalla.
        // Un PATCH ok que tocó las keys de una base inválida la arregló: lo que
        // estaba bloqueado por esas keys vuelve a poder viajar.
        const sentKeys = new Set(Object.keys(partial))
        const remaining = dropSupersededRejected(after.pendingChanges)
          .filter((c) => !sent.has(c))
          .map((c) => {
            if (!c.blocked || !c.blocked.keys.some((k) => sentKeys.has(k))) return c
            const { blocked: _blocked, ...unblocked } = c
            return unblocked
          })
        persist(state.draftId, remaining)
        // Una respuesta con versión ≤ la del store es más vieja que lo que ya
        // tenemos (otro camino — la IA — avanzó mientras volaba): se descarta
        // la config, pero lo enviado sí salió de la cola.
        const stale = result.version <= after.version
        commit({
          serverConfig: stale ? after.serverConfig : result.config,
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
        // El server no acepta algo de este lote. Se aísla por key raíz: si vino
        // `details[].path`, se marca solo lo que toca esas keys y el resto del
        // lote se reenvía en la próxima vuelta; si no vino path y el lote tenía
        // varias keys (400 de contenido), se reenvía por grupo de key antes de
        // marcar. Lo marcado queda en pantalla y en cola, sin reintento, hasta
        // que un cambio posterior sobre sus keys lo supere o se descarte.
        const batchKeys = new Set(batch.flatMap((c) => Object.keys(c.partial)))
        const issueKeys = new Set(result.issues.map(issueRootKey).filter((k) => batchKeys.has(k)))
        const isContent = result.status === 400 || result.status === 422
        if (result.issues.length > 0 && issueKeys.size === 0) {
          // Todos los issues caen en keys que el lote NO toca: la config base
          // del borrador es inválida (p. ej. un formato copiado sin validar).
          // No se culpa al lote: queda bloqueado hasta que un PATCH ok toque
          // esas keys. El drenaje corta acá sin loop (nada drenable).
          const baseKeys = Array.from(new Set(result.issues.map(issueRootKey)))
          const blocked = after.pendingChanges.map((c) =>
            sent.has(c) ? { ...c, blocked: { keys: baseKeys, message: result.message } } : c,
          )
          persist(state.draftId, blocked)
          commit({ pendingChanges: blocked, syncStatus: statusForQueue(blocked, after.invalidChanges), lastError: result.message })
          continue
        }
        if (isContent && issueKeys.size === 0 && batchKeys.size > 1 && !splitByKey) {
          splitByKey = true
          continue
        }
        // Un cambio multi-key del lote se parte: sus keys rechazadas quedan
        // marcadas; las demás siguen como cambio válido y se reenvían.
        const split = (c: PendingChange): PendingChange[] => {
          if (!sent.has(c)) return [c]
          if (issueKeys.size === 0) return [{ ...c, rejected: result.message }]
          const bad: Record<string, unknown> = {}
          const good: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(c.partial)) (issueKeys.has(k) ? bad : good)[k] = v
          const out: PendingChange[] = []
          if (Object.keys(good).length > 0) out.push({ ...c, partial: good as TournamentConfigPartial })
          if (Object.keys(bad).length > 0) {
            out.push({
              ...c,
              partial: bad as TournamentConfigPartial,
              rejected: result.message,
              rejectedIssues: result.issues.filter((i) => issueRootKey(i) in bad),
            })
          }
          return out
        }
        const marked = dropSupersededRejected(after.pendingChanges.flatMap(split))
        persist(state.draftId, marked)
        commit({
          pendingChanges: marked,
          syncStatus: marked.some(isDrainable) ? 'syncing' : 'rejected',
          lastError: result.message,
        })
        continue
      }

      if (result.kind === 'conflict') {
        // Otra pestaña, colaborador o la IA avanzaron la versión. Tomamos la
        // config del server, re-aplicamos lo local y reintentamos YA con esa
        // versión, dentro del mismo drenaje (quien hizo `await flush()` — crear
        // torneo — ve la cola vacía al final, no un falso "no se pudo guardar").
        // Solo avanza: una config con versión ≤ la del store no se toma.
        conflicts += 1
        if (result.version > after.version) {
          commit({
            serverConfig: result.config,
            version: result.version,
            syncStatus: 'conflict',
            lastError: 'Otro colaborador editó al mismo tiempo. Reintentando...',
          })
        } else {
          set({ syncStatus: 'conflict', lastError: 'Otro colaborador editó al mismo tiempo. Reintentando...' })
        }
        if (conflicts < MAX_IMMEDIATE_CONFLICT_RETRIES) continue
        scheduleRetry(computeBackoffMs(0))
        return
      }

      // 409 por carrera del UPDATE (sin config): la versión del store sigue
      // siendo válida; se reintenta en el acto como un conflicto más.
      if (result.status === 409) {
        conflicts += 1
        if (conflicts < MAX_IMMEDIATE_CONFLICT_RETRIES) continue
      }

      // Error transitorio (5xx, 429, red, sesión vencida): contar fallo, dejar
      // cola y config local intactas, reintentar con backoff.
      const nextFailures = after.consecutiveFailures + 1
      set({
        syncStatus:
          result.status === 401
            ? 'auth'
            : nextFailures >= OFFLINE_QUEUE_MAX_FAILURES_BEFORE_OFFLINE
              ? 'offline'
              : 'syncing',
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
    serverConfig: null,
    config: null,
    displayConfig: null,
    version: 0,
    collaborators: [],
    syncStatus: 'idle',
    pendingChanges: [],
    invalidChanges: [],
    baseIssues: [],
    lastSyncedAt: null,
    lastError: null,
    consecutiveFailures: 0,

    // ──── actions ────

    init: (draftId, initial) => {
      // Cola persistida (cambios que no llegaron al server) y partials
      // inválidos persistidos (en pantalla, sin guardar): los dos se vuelven a
      // validar contra la config cargada, key por key. Lo que sigue válido va
      // encima de la config y se reenvía ya; lo inválido (también lo que dejó
      // un cliente viejo en la cola) queda en pantalla con su error. Las marcas
      // de rechazo/bloqueo no se cargan: se vuelve a intentar (si sigue mal, el
      // server lo vuelve a decir).
      let base = initial.config
      const pending: PendingChange[] = []
      let invalid: InvalidChange[] = []
      const take = (partial: TournamentConfigPartial, source: PendingChange['source'], timestamp: number) => {
        const split = splitByValidity(partial, base)
        if (split.valid) {
          pending.push({ partial: split.valid, source, timestamp })
          base = deepMergeConfig(base, split.valid)
        }
        invalid = mergeInvalid(invalid, split.invalid)
      }
      for (const c of load(draftId)) take(c.partial, c.source, c.timestamp)
      for (const p of loadInvalid(draftId)) take(p.partial, 'manual', p.timestamp)
      persist(draftId, pending)

      commit({
        draftId,
        serverConfig: initial.config,
        version: initial.version,
        collaborators: initial.collaborators,
        // Con cola: se reenvía ya → "Sincronizando...", no "Sin conexión".
        syncStatus: pending.length > 0 ? 'syncing' : invalid.length > 0 ? 'invalid' : 'idle',
        pendingChanges: pending,
        invalidChanges: invalid,
        lastSyncedAt: pending.length > 0 ? null : Date.now(),
        lastError: null,
        consecutiveFailures: 0,
      })

      if (pending.length > 0) {
        // Replay inmediato en background (sin debounce, queremos sincronizar ya).
        void get().flush()
      }
    },

    applyChange: (partial, source) => {
      const state = get()
      if (!state.config || !state.draftId) return

      // Misma validación que el PATCH del server, KEY RAÍZ POR KEY RAÍZ: un
      // partial multi-key (`{format, modo, prizes}` al cambiar de formato) no se
      // acepta ni se rechaza en bloque. Las keys válidas se encolan juntas; cada
      // key inválida queda como su propio InvalidChange, en pantalla
      // (displayConfig) pero sin viajar: el organizador la corrige con el error
      // a la vista, y el server nunca recibe un 400 de contenido.
      const record = partial as Record<string, unknown>
      const keys = Object.keys(record).filter((k) => record[k] !== undefined)
      if (keys.length === 0) return
      const split = splitByValidity(partial, state.config)
      let validPartial = split.valid
      const newInvalid = split.invalid
      // Un inválido previo sobre una key que este cambio vuelve a tocar NO se
      // descarta: se le pliega el cambio nuevo y se revalida.
      // - Si el pliegue sigue inválido (lápida del premio 2 mientras el 1 tiene un
      //   hoyo inválido), la edición a medio corregir sigue en pantalla.
      // - Si queda válido, viaja el pliegue ENTERO de esa key y no solo el patch:
      //   trae las ediciones válidas de otras filas que estaban atrapadas en el
      //   mismo inválido (editar el premio 2 y después borrar el 1 con error).
      const carried: InvalidChange[] = []
      for (const i of state.invalidChanges) {
        if (!touchesSameKeys(i.partial, partial)) continue
        const folded = splitByValidity(mergePartials(i.partial, partial), state.config)
        carried.push(...folded.invalid)
        const foldedValid = folded.valid as Record<string, unknown> | null
        for (const k of Object.keys(i.partial)) {
          if (foldedValid && k in foldedValid) {
            validPartial = { ...(validPartial ?? {}), [k]: foldedValid[k] } as TournamentConfigPartial
          }
        }
      }
      // El pliegue ya contiene el cambio nuevo: si ambos quedan inválidos sobre
      // la misma key, gana el pliegue (un solo error por campo).
      const invalidChanges = mergeInvalid(
        state.invalidChanges.filter((i) => !touchesSameKeys(i.partial, partial)),
        [...carried, ...newInvalid.filter((n) => !carried.some((c) => touchesSameKeys(c.partial, n.partial)))],
      )

      if (!validPartial) {
        commit({
          invalidChanges,
          syncStatus: state.pendingChanges.some(isDrainable)
            ? state.syncStatus
            : statusForQueue(state.pendingChanges, invalidChanges),
        })
        return
      }

      // Optimistic: entra a la cola y `config` se recalcula encima del server.
      // Compactación por key raíz: si ya hay un cambio pendiente NO enviado (ni
      // en vuelo, ni rechazado/bloqueado) que toque alguna de las mismas keys,
      // el nuevo se mergea sobre él en su misma posición (mismo deep-merge que
      // el server: la última tecla gana por key) en vez de acumularse. 500
      // teclas offline en `name` son un solo cambio; el orden relativo con los
      // demás pendientes se conserva.
      const change: PendingChange = { partial: validPartial, source, timestamp: Date.now() }
      // Solo se compacta sobre el ÚLTIMO cambio que toca esas keys, y solo si es
      // elegible. Si el último es un rechazado, un bloqueado o uno en vuelo, el
      // nuevo va al final: fusionarlo en uno anterior lo dejaría antes del
      // rechazado (que ya no quedaría superado y volvería a pisar la pantalla)
      // o antes del que viaja (mostrando el valor viejo durante el vuelo).
      let target = -1
      for (let i = state.pendingChanges.length - 1; i >= 0; i--) {
        const c = state.pendingChanges[i]
        if (!touchesSameKeys(c.partial, validPartial)) continue
        if (isDrainable(c) && !_inFlight.has(c)) target = i
        break
      }
      const queued =
        target >= 0
          ? state.pendingChanges.map((c, i) =>
              i === target
                ? {
                    partial: mergePartials(c.partial, validPartial),
                    source: c.source === 'ai' || source === 'ai' ? ('ai' as const) : ('manual' as const),
                    timestamp: change.timestamp,
                  }
                : c,
            )
          : [...state.pendingChanges, change]
      // Un cambio rechazado queda superado cuando el organizador vuelve a tocar
      // alguna de sus keys: eso es "corregir el campo". Los demás quedan.
      const nextPending = dropSupersededRejected(queued)
      persist(state.draftId, nextPending)

      commit({
        pendingChanges: nextPending,
        invalidChanges,
        syncStatus: state.syncStatus === 'offline' || state.syncStatus === 'auth' ? state.syncStatus : 'syncing',
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
      commit({ serverConfig: config, version })
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
      // Se descarta solo lo que había al hacer click (inválidos y rechazados/
      // bloqueados): lo que el organizador tipee mientras tanto no se pierde.
      const invalidAtClick = new Set(state.invalidChanges)
      const undrainableAtClick = new Set(state.pendingChanges.filter((c) => !isDrainable(c)))

      // Nunca competir con un PATCH en vuelo: se espera a que el drenaje
      // termine y recién ahí se filtra la cola. `config` se recalcula desde la
      // última config confirmada por el server: sin GET, sin carreras.
      while (_drain) await _drain
      const settled = get()
      if (settled.draftId !== draftId) return

      const pending = settled.pendingChanges.filter((c) => !undrainableAtClick.has(c))
      const invalid = settled.invalidChanges.filter((i) => !invalidAtClick.has(i))
      persist(draftId, pending)
      const keepsStatus = settled.syncStatus === 'auth' || settled.syncStatus === 'offline'
      commit({
        pendingChanges: pending,
        invalidChanges: invalid,
        syncStatus: keepsStatus ? settled.syncStatus : statusForQueue(pending, invalid),
      })
      if (pending.some(isDrainable) && !keepsStatus) void get().flush()
      else if (pending.length === 0 && invalid.length === 0 && !keepsStatus) scheduleSavedToIdle()
    },

    forgetPersisted: () => {
      const state = get()
      if (state.draftId) clearQueue(state.draftId)
    },

    reset: () => {
      // Salir del editor (navegación interna) no pierde nada: la cola y los
      // inválidos ya están persistidos y `init()` los retoma al volver. Solo
      // se cancelan los timers del store que se va.
      _debounceTimer = clearTimer(_debounceTimer)
      _retryTimer = clearTimer(_retryTimer)
      _savedTimer = clearTimer(_savedTimer)
      set({
        draftId: null,
        serverConfig: null,
        config: null,
        displayConfig: null,
        version: 0,
        collaborators: [],
        syncStatus: 'idle',
        pendingChanges: [],
        invalidChanges: [],
        baseIssues: [],
        lastSyncedAt: null,
        lastError: null,
        consecutiveFailures: 0,
      })
    },

    setSyncStatus: (s) => set({ syncStatus: s }),
  }
})
