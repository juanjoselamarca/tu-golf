import type { SupabaseClient } from '@supabase/supabase-js';
import { captureError } from '@/lib/error-tracking';

export interface RagLogPayload {
  userId?: string;
  query: string;
  jurisdictionsFilter?: string[];
  topKRequested: number;
  hybridAlpha: number;
  totalCandidates: number;
  returnedCount: number;
  topScore?: number;
  bottomScore?: number;
  citedChunkIds: string[];
  latencyMs: number;
  costUsd: number;
  embeddingModel: string;
  rerankerModel: string;
  errorCode?: string;
}

/**
 * Fire-and-forget log a `rag_query_log`. Nunca bloquea el caller.
 * Errores van a captureError (Sentry).
 */
export function logRagQuery(sb: SupabaseClient, p: RagLogPayload): void {
  sb.from('rag_query_log')
    .insert({
      user_id: p.userId ?? null,
      query: p.query,
      jurisdictions_filter: p.jurisdictionsFilter ?? null,
      top_k_requested: p.topKRequested,
      hybrid_alpha: p.hybridAlpha,
      total_candidates: p.totalCandidates,
      returned_count: p.returnedCount,
      top_score: p.topScore ?? null,
      bottom_score: p.bottomScore ?? null,
      cited_chunk_ids: p.citedChunkIds,
      latency_ms: p.latencyMs,
      cost_usd: p.costUsd,
      embedding_model: p.embeddingModel,
      reranker_model: p.rerankerModel,
      error_code: p.errorCode ?? null,
    })
    .then(({ error }) => {
      if (error) {
        void captureError(error, { context: 'cerebro-v3.rag-query-log.insert-failed' });
      }
    });
}
