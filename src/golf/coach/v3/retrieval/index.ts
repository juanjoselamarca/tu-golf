import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { embedQuery } from './embed-query';
import { hybridSearch } from './hybrid-search';
import { contextualRerank } from './contextual-rerank';
import { logRagQuery } from './query-logger';
import type {
  SearchKnowledgeOptions,
  RankedChunk,
  Jurisdiction,
  ChunkCandidate,
  RerankedCandidate,
} from './types';

const EMBED_MODEL = 'gemini-embedding-001';
const RERANKER_MODEL = 'bge-reranker-v2-m3';
// Gemini embeddings free tier → costo ~0. Si se pasa a tier pagado, actualizar.
const EMBED_COST_PER_1K = 0;

/**
 * Piso de relevancia y mínimo de chunks fuertes para el contrato
 * anti-hallucination (spec §6). Se ENFORCEAN en código (no se delega al LLM):
 * si no hay ≥MIN_CONFIDENT_CHUNKS sobre RELEVANCE_FLOOR, devolvemos [] y el
 * coach usa el disclaimer en vez de citar chunks débiles como reglas oficiales.
 */
export const RELEVANCE_FLOOR = 0.4;
export const MIN_CONFIDENT_CHUNKS = 2;

let sharedSb: SupabaseClient | null = null;
let embedQueryFn = embedQuery;
let hybridSearchFn = hybridSearch;
let contextualRerankFn = contextualRerank;

export function _setDepsForTests(deps: {
  sb?: SupabaseClient;
  embedQueryFn?: typeof embedQuery;
  hybridSearchFn?: typeof hybridSearch;
  contextualRerankFn?: typeof contextualRerank;
}): void {
  if (deps.sb !== undefined) sharedSb = deps.sb;
  if (deps.embedQueryFn) embedQueryFn = deps.embedQueryFn;
  if (deps.hybridSearchFn) hybridSearchFn = deps.hybridSearchFn;
  if (deps.contextualRerankFn) contextualRerankFn = deps.contextualRerankFn;
}

export function _resetDepsForTests(): void {
  sharedSb = null;
  embedQueryFn = embedQuery;
  hybridSearchFn = hybridSearch;
  contextualRerankFn = contextualRerank;
}

function getSb(): SupabaseClient {
  if (sharedSb) return sharedSb;
  sharedSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  );
  return sharedSb;
}

interface SourceRow {
  id: string;
  title: string;
  jurisdiction: string;
}

async function hydrateSources(
  sb: SupabaseClient,
  sourceIds: string[]
): Promise<Map<string, SourceRow>> {
  if (!sourceIds.length) return new Map();
  const { data } = await sb
    .from('knowledge_sources')
    .select('id, title, jurisdiction')
    .in('id', sourceIds);
  return new Map((data ?? []).map((s: any) => [s.id as string, s as SourceRow]));
}

/**
 * Pipeline completo de retrieval:
 *   1. Embed query (LRU cache 10min).
 *   2. Hybrid search via RPC search_chunks_hybrid (vector + BM25).
 *   3. Contextual rerank con bge-reranker-v2-m3 (ONNX local) o fallback.
 *   4. Hydrate sources (title, jurisdiction) para citas.
 *   5. Log async a rag_query_log (fire-and-forget).
 *
 * @returns top-K RankedChunk ordenados por rerank score.
 */
export async function searchKnowledgeChunks(
  query: string,
  opts: SearchKnowledgeOptions = {}
): Promise<RankedChunk[]> {
  const sb = getSb();
  const start = Date.now();
  const topK = opts.topK ?? 5;
  const topCandidates = opts.topCandidates ?? 20;
  const alpha = opts.alpha ?? 0.7;
  const blockKey = opts.blockKey ?? 'rules';

  let totalCost = 0;

  try {
    const { embedding, tokens } = await embedQueryFn(query);
    totalCost += (tokens / 1000) * EMBED_COST_PER_1K;

    const candidates: ChunkCandidate[] = await hybridSearchFn(sb, embedding, query, {
      alpha,
      topCandidates,
      jurisdictions: opts.jurisdictions,
      blockKey,
    });

    if (!candidates.length) {
      logRagQuery(sb, {
        userId: opts.userId,
        query,
        jurisdictionsFilter: opts.jurisdictions,
        topKRequested: topK,
        hybridAlpha: alpha,
        totalCandidates: 0,
        returnedCount: 0,
        citedChunkIds: [],
        latencyMs: Date.now() - start,
        costUsd: totalCost,
        embeddingModel: EMBED_MODEL,
        rerankerModel: RERANKER_MODEL,
        errorCode: 'no_results',
      });
      return [];
    }

    const reranked: RerankedCandidate[] = await contextualRerankFn(candidates, query, topK);

    const sourceIds = Array.from(new Set(reranked.map((r) => r.sourceId)));
    const srcMap = await hydrateSources(sb, sourceIds);

    const result: RankedChunk[] = reranked.map((r) => {
      const src = srcMap.get(r.sourceId);
      return {
        id: r.id,
        sourceId: r.sourceId,
        sourceTitle: src?.title ?? 'Unknown',
        sourceJurisdiction: (src?.jurisdiction ?? 'usga') as Jurisdiction,
        breadcrumb: r.breadcrumb,
        ruleAnchor: null,
        content: r.content,
        scores: {
          vec: r.vecScore,
          bm25: r.bm25Score,
          hybrid: r.hybridScore,
          rerank: r.rerankScore,
          final: r.rerankScore,
        },
      };
    });

    // Anti-hallucination enforcement (C2): el contrato exige ≥2 chunks sobre el
    // piso de relevancia. Lo aplicamos acá, no confiamos en que el LLM cuente y
    // compare scores. Sin evidencia fuerte → [] → disclaimer.
    const confident = result.filter((r) => r.scores.final > RELEVANCE_FLOOR);
    const finalChunks = confident.length >= MIN_CONFIDENT_CHUNKS ? confident : [];

    // Logging honesto (C1): el reranker ONNX solo corre si está habilitado y
    // cargó; si degradó a hybrid, no mentimos en rag_query_log.
    const rerankerUsed = reranked.some((r) => r.rerankAvailable);

    logRagQuery(sb, {
      userId: opts.userId,
      query,
      jurisdictionsFilter: opts.jurisdictions,
      topKRequested: topK,
      hybridAlpha: alpha,
      totalCandidates: candidates.length,
      returnedCount: finalChunks.length,
      topScore: result[0]?.scores.final,
      bottomScore: result[result.length - 1]?.scores.final,
      citedChunkIds: finalChunks.map((r) => r.id),
      latencyMs: Date.now() - start,
      costUsd: totalCost,
      embeddingModel: EMBED_MODEL,
      rerankerModel: rerankerUsed ? RERANKER_MODEL : 'hybrid-fallback',
      ...(finalChunks.length === 0 ? { errorCode: 'low_confidence' } : {}),
    });

    return finalChunks;
  } catch (e) {
    logRagQuery(sb, {
      userId: opts.userId,
      query,
      topKRequested: topK,
      hybridAlpha: alpha,
      totalCandidates: 0,
      returnedCount: 0,
      citedChunkIds: [],
      latencyMs: Date.now() - start,
      costUsd: totalCost,
      embeddingModel: EMBED_MODEL,
      rerankerModel: RERANKER_MODEL,
      errorCode: 'pipeline_error',
    });
    throw e;
  }
}

export type {
  RankedChunk,
  SearchKnowledgeOptions,
  Jurisdiction,
  ChunkCandidate,
  RerankedCandidate,
} from './types';
