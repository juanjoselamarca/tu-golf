// src/lib/data/tournament-drafts.ts
//
// Acceso a datos del borrador de torneo desde el cliente.
//
// El borrador se escribe SIEMPRE a través de `/api/torneos/draft/*`: ahí viven
// el lock optimista por `version`, el deep-merge server-side y el log de
// eventos. Por eso esta capa envuelve `fetch` y no `supabase.from()`. El editor
// y el store ya no conocen URLs ni shapes de respuesta: piden conceptos.

import type { CollaboratorInfo, TournamentConfig, TournamentConfigPartial } from '@/lib/draft/types'

/** Borrador tal como lo necesita el store: config + version + colaboradores. */
export interface DraftRecord {
  id: string
  config: TournamentConfig
  version: number
  collaborators: CollaboratorInfo[]
}

interface DraftApiPayload {
  ok?: true
  error?: string
  draft?: {
    id: string
    config: TournamentConfig
    version: number
    tournament_draft_collaborators?: Array<{
      user_id: string
      role: 'owner' | 'collaborator'
      name?: string | null
    }>
  }
}

interface ApiErrorPayload {
  error?: string
  details?: Array<{ message?: string }>
}

/** Resultado de un autosave. Nunca lanza: el store decide qué hacer con cada caso. */
export type SaveDraftResult =
  | { kind: 'ok'; version: number; config: TournamentConfig }
  /** Otro cliente (pestaña, colaborador, IA) avanzó la versión. Si el server
   *  mandó su config actual, viene acá para reconciliar sin recargar. */
  | { kind: 'conflict'; version: number | null; config: TournamentConfig | null }
  /** El server no acepta este cambio (validación, permisos, no existe). Reintentar
   *  lo mismo da lo mismo: el organizador tiene que corregir. */
  | { kind: 'rejected'; status: number; message: string }
  /** Error transitorio: HTTP 5xx/429 (status > 0) o de red (status 0). Se reintenta. */
  | { kind: 'error'; status: number; message: string }

/** Respuestas que no cambian por reintentar: hay que corregir el pedido. */
const REJECTED_STATUSES = new Set([400, 401, 403, 404, 413, 422])

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * Mensaje de error legible a partir de una respuesta no-ok: `error` + los
 * `details[].message` de validación si vienen en JSON; el texto crudo si no es
 * JSON; `Error <status>` si no hay body. Única forma de armar el mensaje.
 */
async function errorMessage(res: Response): Promise<string> {
  let text = ''
  try {
    text = await res.text()
  } catch {
    /* sin body */
  }
  let body: ApiErrorPayload | null = null
  try {
    body = text ? (JSON.parse(text) as ApiErrorPayload) : null
  } catch {
    body = null
  }
  if (body && typeof body === 'object') {
    const detail =
      Array.isArray(body.details) && body.details.length > 0
        ? body.details
            .map((d) => d?.message)
            .filter(Boolean)
            .join('; ')
        : ''
    const joined = [body.error, detail].filter(Boolean).join(' · ')
    if (joined) return joined
  }
  return text.trim() || `Error ${res.status}`
}

function toDraftRecord(payload: DraftApiPayload | null): DraftRecord {
  const draft = payload?.draft
  if (!draft?.id || !draft.config) {
    throw new Error('Respuesta inesperada del servidor')
  }
  return {
    id: draft.id,
    config: draft.config,
    version: draft.version,
    collaborators: (draft.tournament_draft_collaborators ?? []).map((c) => ({
      user_id: c.user_id,
      role: c.role,
      name: c.name ?? undefined,
    })),
  }
}

async function draftRequest(url: string, init?: RequestInit): Promise<DraftRecord> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(await errorMessage(res))
  return toDraftRecord(await readJson<DraftApiPayload>(res))
}

/** Carga un borrador existente (GET). Lanza con el mensaje del server si falla. */
export function fetchDraft(draftId: string): Promise<DraftRecord> {
  return draftRequest(`/api/torneos/draft/${encodeURIComponent(draftId)}`, { method: 'GET' })
}

/** Crea un borrador vacío desde cero. */
export function createDraft(): Promise<DraftRecord> {
  return draftRequest('/api/torneos/draft', { method: 'POST' })
}

/** Crea un borrador copiando la configuración de un torneo ya jugado. */
export function duplicateDraftFromTournament(tournamentId: string): Promise<DraftRecord> {
  return draftRequest(`/api/torneos/draft/duplicate-from/${encodeURIComponent(tournamentId)}`, {
    method: 'POST',
  })
}

/** Convierte el borrador en torneo real. Devuelve el slug para navegar. */
export async function createTournamentFromDraft(
  draftId: string,
): Promise<{ tournament_id: string; slug: string }> {
  const res = await fetch(`/api/torneos/draft/${encodeURIComponent(draftId)}/create-tournament`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  const body = await readJson<{ ok: true; tournament_id: string; slug: string }>(res)
  if (!body?.slug) throw new Error('Respuesta inesperada del servidor')
  return { tournament_id: body.tournament_id, slug: body.slug }
}

/**
 * Autosave: manda un partial sobre `version`. El server hace el deep-merge y
 * devuelve la config resultante con la versión nueva.
 */
export async function saveDraftPartial(params: {
  draftId: string
  partial: TournamentConfigPartial
  version: number
  source: 'manual' | 'ai'
}): Promise<SaveDraftResult> {
  let res: Response
  try {
    res = await fetch(`/api/torneos/draft/${encodeURIComponent(params.draftId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config_partial: params.partial,
        version: params.version,
        source: params.source,
      }),
    })
  } catch (err) {
    return { kind: 'error', status: 0, message: err instanceof Error ? err.message : 'Error de red' }
  }

  if (res.ok) {
    const body = await readJson<DraftApiPayload>(res)
    if (!body?.draft) return { kind: 'error', status: res.status, message: 'Respuesta inesperada del servidor' }
    return { kind: 'ok', version: body.draft.version, config: body.draft.config }
  }

  if (res.status === 409) {
    const body = await readJson<{ current_version?: number; current_config?: TournamentConfig }>(res)
    return {
      kind: 'conflict',
      version: typeof body?.current_version === 'number' ? body.current_version : null,
      config: body?.current_config ?? null,
    }
  }

  if (REJECTED_STATUSES.has(res.status)) {
    return { kind: 'rejected', status: res.status, message: await errorMessage(res) }
  }

  return { kind: 'error', status: res.status, message: await errorMessage(res) }
}
