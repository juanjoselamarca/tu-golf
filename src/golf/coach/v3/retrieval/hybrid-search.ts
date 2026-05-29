import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChunkCandidate, Jurisdiction } from './types';

export interface HybridSearchOpts {
  alpha?: number;
  topCandidates?: number;
  jurisdictions?: Jurisdiction[];
  blockKey?: string;
}

interface HybridRpcRow {
  id: string;
  source_id: string;
  breadcrumb: string;
  content: string;
  vec_score: number | string;
  bm25_score: number | string;
  final_score: number | string;
}

/**
 * Llama el RPC `search_chunks_hybrid` y normaliza los scores a number.
 */
export async function hybridSearch(
  sb: SupabaseClient,
  queryEmbedding: number[],
  queryText: string,
  opts: HybridSearchOpts = {}
): Promise<ChunkCandidate[]> {
  const { data, error } = await sb.rpc('search_chunks_hybrid', {
    query_embedding: queryEmbedding,
    query_text: queryText,
    alpha: opts.alpha ?? 0.7,
    top_k: opts.topCandidates ?? 20,
    jurisdictions: opts.jurisdictions ?? null,
    block_filter: opts.blockKey ?? null,
  });
  if (error) throw error;
  return ((data as HybridRpcRow[] | null) ?? []).map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    breadcrumb: r.breadcrumb,
    content: r.content,
    vecScore: Number(r.vec_score),
    bm25Score: Number(r.bm25_score),
    hybridScore: Number(r.final_score),
    blockKey: opts.blockKey,
  }));
}
