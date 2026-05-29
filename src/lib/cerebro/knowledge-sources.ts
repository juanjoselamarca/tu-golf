/**
 * Capa de datos de `knowledge_sources` (corpus RAG cerebro v3).
 *
 * Toda la lógica de acceso a la tabla vive acá (mismo patrón que
 * `weights.ts`): los endpoints `/api/admin/cerebro/sources/*` quedan delgados
 * y solo orquestan auth + estas funciones. Usa el cliente service-role porque
 * la tabla está protegida por RLS (solo service_role escribe).
 */
import { createAdminClient } from '@/lib/supabaseAdmin'

export type SourceStatus =
  | 'pending'
  | 'ingesting'
  | 'ready'
  | 'stale'
  | 'error'
  | 'unavailable'

export type Jurisdiction =
  | 'usga'
  | 'ra'
  | 'whs_global'
  | 'usga_committee'
  | 'fedegolf_chile'

export interface KnowledgeSourceRow {
  id: string
  slug: string
  title: string
  authors: string[]
  url_source: string
  url_local_pdf: string | null
  block_key: string
  jurisdiction: Jurisdiction
  priority_rank: number
  is_authoritative_for: string[]
  legal_basis: string
  source_hash: string | null
  ingested_at: string | null
  chunk_count: number
  ingest_cost_usd: number
  status: SourceStatus
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface AddSourceInput {
  slug: string
  title: string
  url_source: string
  block_key: string
  jurisdiction: Jurisdiction
  authors?: string[]
  priority_rank?: number
  is_authoritative_for?: string[]
  legal_basis?: string
}

export interface ChunkPreview {
  id: string
  breadcrumb: string
  content: string
  rule_anchor: string | null
  token_count: number
}

/** Campos que el admin puede editar vía PATCH. El resto es read-only o se
 *  recalcula durante la ingesta. */
export const PATCHABLE_FIELDS = [
  'priority_rank',
  'status',
  'is_authoritative_for',
  'legal_basis',
] as const

export async function listKnowledgeSources(): Promise<KnowledgeSourceRow[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('knowledge_sources')
    .select('*')
    .order('priority_rank', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as KnowledgeSourceRow[]
}

export async function addKnowledgeSource(input: AddSourceInput): Promise<KnowledgeSourceRow> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('knowledge_sources')
    .insert({
      slug: input.slug,
      title: input.title,
      authors: input.authors ?? [],
      url_source: input.url_source,
      block_key: input.block_key,
      jurisdiction: input.jurisdiction,
      priority_rank: input.priority_rank ?? 100,
      is_authoritative_for: input.is_authoritative_for ?? [],
      legal_basis: input.legal_basis ?? 'unknown',
      status: 'pending',
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as KnowledgeSourceRow
}

export async function updateKnowledgeSource(
  slug: string,
  patch: Partial<Pick<KnowledgeSourceRow, (typeof PATCHABLE_FIELDS)[number]>>,
): Promise<KnowledgeSourceRow> {
  const update: Record<string, unknown> = {}
  for (const k of PATCHABLE_FIELDS) {
    if (k in patch && patch[k] !== undefined) update[k] = patch[k]
  }
  if (Object.keys(update).length === 0) {
    throw new Error('no_fields')
  }
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('knowledge_sources')
    .update(update)
    .eq('slug', slug)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as KnowledgeSourceRow
}

/**
 * Marca una fuente para re-indexado. En sub-ola 1e solo cambia el status a
 * 'ingesting' y limpia error_message; la ingesta real la dispara el operador
 * vía `ingest-rules.mjs`. El cron automático (Vercel Queues) llega en sub-ola
 * posterior. Devuelve false si el slug no existe.
 */
export async function markSourceForReindex(slug: string): Promise<boolean> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('knowledge_sources')
    .update({ status: 'ingesting', error_message: null })
    .eq('slug', slug)
    .select('id')
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

/**
 * Preview de hasta `limit` chunks de una fuente (content truncado a 200 chars).
 * Devuelve null si el slug no existe.
 */
export async function getSourceChunksPreview(
  slug: string,
  limit = 10,
): Promise<ChunkPreview[] | null> {
  const sb = createAdminClient()
  const { data: source, error: srcErr } = await sb
    .from('knowledge_sources')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (srcErr) throw new Error(srcErr.message)
  if (!source) return null

  const { data: chunks, error: chErr } = await sb
    .from('knowledge_chunks')
    .select('id, breadcrumb, content, rule_anchor, token_count')
    .eq('source_id', (source as { id: string }).id)
    .limit(limit)
  if (chErr) throw new Error(chErr.message)

  return (chunks ?? []).map((c) => {
    const row = c as ChunkPreview
    return {
      ...row,
      content: row.content.slice(0, 200) + (row.content.length > 200 ? '...' : ''),
    }
  })
}
