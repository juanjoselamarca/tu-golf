// src/lib/data/tournaments/publishDraft.ts
//
// Publicar un draft = materializar un `TournamentConfig` en las tablas del
// torneo: `tournaments` + `categories` + `tournament_prizes` +
// `tournament_rounds` (rondas 2..N). Es la única función que conoce el orden
// de los inserts, la compensación si alguno falla y la IDEMPOTENCIA del
// reintento.
//
// Antes vivía inline en `api/torneos/draft/[id]/create-tournament/route.ts`
// (regla "el que toca, ordena": el handler queda delgado — auth, gates,
// respuesta — y la orquestación de datos vive acá, testeable con un cliente
// falso y contra la base real en src/__tests__/integration/publish-draft.test.ts).
//
// Transacción simulada con compensación: si un insert posterior al de
// `tournaments` falla, se borra el torneo y el cascade FK (ON DELETE CASCADE
// en categories / tournament_prizes / tournament_rounds / players / rounds)
// limpia los hijos. Equivale a un rollback hasta que el cliente JS exponga
// BEGIN/COMMIT.
//
// Idempotencia (re-review #421): el id del torneo se genera ACÁ y se reserva
// en `tournament_drafts.pending_tournament_id` (columna SIN FK — `tournament_id`
// la tiene y no se puede escribir antes de que el torneo exista) con un lock
// compare-and-set sobre el status. Un reintento encuentra el torneo por ese id
// y cierra el draft en vez de duplicarlo o de rechazarlo para siempre.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TournamentConfig } from '@/lib/draft/types'
import { captureError } from '@/lib/error-tracking'
import { mapCategoryForInsert } from './categories'
import {
  genTournamentCode,
  genTournamentSlug,
  mapTournamentForInsert,
  type TournamentInsertRow,
} from './createTournament'
import { mapPrizeForInsert } from './prizes'
import { mapTournamentRoundsForInsert } from './rounds'

/** Cliente con permisos de escritura sobre las tablas del torneo (service role). */
type WriterClient = Pick<SupabaseClient, 'from'>

/** Error de un paso de la publicación, con el código Postgres si lo hubo. */
export class PublishError extends Error {
  constructor(
    message: string,
    /** `23505` = el torneo con ese id ya existe (otro intento lo creó). */
    public readonly code: string | null = null,
  ) {
    super(message)
    this.name = 'PublishError'
  }
}

const UNIQUE_VIOLATION = '23505'

export interface PublishDraftResult {
  tournamentId: string
  slug: string
}

export interface PublishDraftMeta {
  organizerId: string
  /**
   * Id del torneo, generado por el caller ANTES de insertar y anotado en el
   * draft: así un reintento puede saber si el torneo ya existe en vez de
   * crear un duplicado. Sin él, lo genera la base.
   */
  tournamentId?: string
  /** Inyectables para tests; en producción salen de los generadores. */
  slug?: string
  code?: string
}

/**
 * Inserta el torneo y sus hijos. Lanza `PublishError` con el paso que falló
 * (`categories: ...`, `tournament_rounds: ...`) después de compensar.
 */
export async function publishTournamentFromConfig(
  service: WriterClient,
  config: TournamentConfig,
  meta: PublishDraftMeta,
): Promise<PublishDraftResult> {
  const slug = meta.slug ?? genTournamentSlug(config.name)
  const code = meta.code ?? genTournamentCode()

  const fila: TournamentInsertRow & { id?: string } = mapTournamentForInsert(config, {
    organizerId: meta.organizerId,
    slug,
    code,
  })
  if (meta.tournamentId) fila.id = meta.tournamentId
  const { data: tour, error: tErr } = await service
    .from('tournaments')
    .insert(fila)
    .select('id, slug')
    .single()

  if (tErr || !tour) throw new PublishError(tErr?.message || 'Error creando tournament', tErr?.code ?? null)
  const tournamentId = (tour as { id: string; slug: string }).id
  const tournamentSlug = (tour as { id: string; slug: string }).slug

  try {
    // Categorías — mapeo centralizado: gender + default_tee_color ya no se
    // pierden entre el wizard y la tabla.
    const cats = config.categories.map((c) => mapCategoryForInsert(c, tournamentId))
    if (cats.length > 0) {
      const { error } = await service.from('categories').insert(cats)
      if (error) throw new PublishError(`categories: ${error.message}`, error.code ?? null)
    }

    const prizes = config.prizes.map((p) => mapPrizeForInsert(p, tournamentId, config.format))
    if (prizes.length > 0) {
      const { error } = await service.from('tournament_prizes').insert(prizes)
      if (error) throw new PublishError(`prizes: ${error.message}`, error.code ?? null)
    }

    // Rondas 2..N: cancha/fecha/hoyos PROPIOS de cada ronda. La ronda 1 ya
    // viajó en la fila de `tournaments`. (Antes esto iba a `rounds`, la tabla
    // de tarjetas por jugador, que no tiene esas columnas — bug P0 652707d2.)
    const extraRounds = mapTournamentRoundsForInsert(config, tournamentId)
    if (extraRounds.length > 0) {
      const { error } = await service.from('tournament_rounds').insert(extraRounds)
      if (error) throw new PublishError(`tournament_rounds: ${error.message}`, error.code ?? null)
    }
  } catch (err) {
    await compensate(service, tournamentId)
    throw err
  }

  return { tournamentId, slug: tournamentSlug }
}

/** Borra el torneo recién creado; el cascade FK limpia los hijos. */
async function compensate(service: WriterClient, tournamentId: string): Promise<void> {
  const { error } = await service.from('tournaments').delete().eq('id', tournamentId)
  if (error) {
    void captureError(error, {
      context: 'publishDraft.rollback',
      level: 'error',
      meta: { tournamentId, nota: 'torneo huérfano: el delete de compensación falló' },
    })
  }
}

// ═══════════════════════════════════════════════════════════
// Publicación IDEMPOTENTE con lock compare-and-set
// ═══════════════════════════════════════════════════════════

/** Lo que el orquestador necesita del draft (columnas de `tournament_drafts`). */
export interface DraftForPublish {
  id: string
  status: string
  tournament_id: string | null
  pending_tournament_id: string | null
  updated_at: string | null
}

/** Columnas del draft que hay que traer para `lockAndPublish`. Fuente única del SELECT. */
export const DRAFT_FOR_PUBLISH_SELECT = 'id, owner_id, config, status, tournament_id, pending_tournament_id, updated_at'

/**
 * Un draft en 'creating' más nuevo que esto tiene OTRO intento en curso
 * (un doble click, dos pestañas): se responde 409 y no se toca. Más viejo,
 * el intento anterior murió (deploy, timeout de Vercel) y se retoma.
 */
export const CREATING_STALE_MS = 60_000

export function creatingIsStale(draft: Pick<DraftForPublish, 'status' | 'updated_at'>, now: Date): boolean {
  if (draft.status !== 'creating') return false
  const t = draft.updated_at ? Date.parse(draft.updated_at) : NaN
  if (Number.isNaN(t)) return true
  return now.getTime() - t > CREATING_STALE_MS
}

export type PublishOutcome =
  | { kind: 'ok'; tournamentId: string; slug: string; recovered: boolean }
  /** El draft no está en un estado publicable. */
  | { kind: 'not_draft' }
  /** Otro intento está creando el torneo ahora mismo. */
  | { kind: 'in_progress' }
  /** El lock lo ganó otro intento entre el SELECT y el UPDATE. */
  | { kind: 'lock_lost' }

async function tournamentById(service: WriterClient, id: string): Promise<{ id: string; slug: string } | null> {
  const { data, error } = await service.from('tournaments').select('id, slug').eq('id', id).maybeSingle()
  if (error) throw new PublishError(`tournaments: ${error.message}`, error.code ?? null)
  return (data as { id: string; slug: string } | null) ?? null
}

/** Cierra el draft: 'created' + el id real (recién ahora satisface la FK). */
async function closeDraft(service: WriterClient, draftId: string, tournamentId: string): Promise<void> {
  const { error } = await service
    .from('tournament_drafts')
    .update({ status: 'created', tournament_id: tournamentId, pending_tournament_id: null })
    .eq('id', draftId)
  if (error) {
    // El torneo YA existe y es válido: se deja rastro y el próximo POST lo
    // encuentra por `pending_tournament_id` y termina el cierre.
    void captureError(error, {
      context: 'publishDraft.closeDraft',
      level: 'warning',
      meta: { draftId, tournamentId },
    })
  }
}

/**
 * ¿Un intento anterior ya dejó el torneo creado? Si el draft está 'created'
 * con su torneo, o 'creating' con el torneo reservado ya insertado, devuelve
 * ese torneo (y en el segundo caso cierra el draft). Va ANTES de validar el
 * config: un draft ya publicado no se vuelve a validar ni a publicar.
 */
export async function findRecoverableTournament(
  service: WriterClient,
  draft: DraftForPublish,
  now: Date = new Date(),
): Promise<PublishDraftResult | null> {
  if (draft.status === 'created' && draft.tournament_id) {
    const t = await tournamentById(service, draft.tournament_id)
    return t ? { tournamentId: t.id, slug: t.slug } : null
  }
  // Un 'creating' RECIENTE tiene otro intento en curso: no se le cierra el
  // draft por debajo (podría estar a mitad de los inserts hijos y compensar
  // después). El handler responde 409 y el cliente reintenta más tarde.
  if (draft.status === 'creating' && draft.pending_tournament_id && creatingIsStale(draft, now)) {
    const t = await tournamentById(service, draft.pending_tournament_id)
    if (!t) return null
    await closeDraft(service, draft.id, t.id)
    return { tournamentId: t.id, slug: t.slug }
  }
  return null
}

/**
 * Toma el lock (compare-and-set sobre el status que el caller LEYÓ), publica
 * con el id reservado y cierra el draft. Pura orquestación: el caller ya
 * validó el config y los gates.
 *
 *  - 'draft' → lock → publicar → 'created'.
 *  - 'creating' reciente → `in_progress` (409): hay otro intento en curso.
 *  - 'creating' viejo → se retoma con el MISMO id reservado; si el torneo
 *    aparece con 23505 (lo creó el otro intento después de todo), se recupera
 *    en vez de resetear el draft.
 *  - Cualquier otro status → `not_draft`.
 */
export async function lockAndPublish(
  service: WriterClient,
  draft: DraftForPublish,
  config: TournamentConfig,
  organizerId: string,
  opts: { now?: Date; tournamentId?: string } = {},
): Promise<PublishOutcome> {
  const now = opts.now ?? new Date()
  if (draft.status !== 'draft' && !creatingIsStale(draft, now)) {
    return draft.status === 'creating' ? { kind: 'in_progress' } : { kind: 'not_draft' }
  }

  const tournamentId = opts.tournamentId ?? draft.pending_tournament_id ?? crypto.randomUUID()

  // Lock CAS: sólo gana quien encuentra el draft EXACTAMENTE como lo leyó —
  // mismo status Y misma reserva (otro intento pudo haber reservado otro id
  // entre el SELECT y este UPDATE).
  let lock = service
    .from('tournament_drafts')
    .update({ status: 'creating', pending_tournament_id: tournamentId })
    .eq('id', draft.id)
    .eq('status', draft.status)
  lock = draft.pending_tournament_id
    ? lock.eq('pending_tournament_id', draft.pending_tournament_id)
    : lock.is('pending_tournament_id', null)
  const { data: locked, error: lockErr } = await lock.select('id')
  if (lockErr) throw new PublishError(`lock: ${lockErr.message}`, lockErr.code ?? null)
  if (!locked || (locked as unknown[]).length === 0) return { kind: 'lock_lost' }

  try {
    const { slug } = await publishTournamentFromConfig(service, config, { organizerId, tournamentId })
    await closeDraft(service, draft.id, tournamentId)
    return { kind: 'ok', tournamentId, slug, recovered: false }
  } catch (err) {
    // 23505 en el id reservado: el torneo YA existe (lo terminó el intento
    // anterior mientras este lo daba por muerto). NO se resetea el draft: se
    // cierra con ese torneo.
    if (err instanceof PublishError && err.code === UNIQUE_VIOLATION) {
      const t = await tournamentById(service, tournamentId)
      if (t) {
        await closeDraft(service, draft.id, t.id)
        return { kind: 'ok', tournamentId: t.id, slug: t.slug, recovered: true }
      }
    }
    // `publishTournamentFromConfig` ya compensó. Volver a 'draft' (sin
    // reserva) para que el organizador pueda reintentar — sólo si el draft
    // sigue siendo EL NUESTRO ('creating' con nuestra reserva): un intento
    // posterior que ya tomó el lock no se pisa.
    await service
      .from('tournament_drafts')
      .update({ status: 'draft', pending_tournament_id: null })
      .eq('id', draft.id)
      .eq('status', 'creating')
      .eq('pending_tournament_id', tournamentId)
    throw err
  }
}
