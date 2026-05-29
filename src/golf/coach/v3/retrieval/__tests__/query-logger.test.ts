import { describe, it, expect, vi } from 'vitest';
import { logRagQuery } from '../query-logger';

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));

function makeMockSb() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const sb = { from: vi.fn().mockReturnValue({ insert }) } as any;
  return { sb, insert };
}

describe('logRagQuery', () => {
  it('inserta en rag_query_log sin bloquear el caller', async () => {
    const { sb, insert } = makeMockSb();

    logRagQuery(sb, {
      query: 'cart path',
      topKRequested: 5,
      hybridAlpha: 0.7,
      totalCandidates: 10,
      returnedCount: 5,
      citedChunkIds: ['c1', 'c2'],
      latencyMs: 123,
      costUsd: 0.00001,
      embeddingModel: 'gemini-embedding-001',
      rerankerModel: 'bge-reranker-v2-m3',
    });

    // El caller no espera la promesa — verificamos que se llamó async
    await new Promise((r) => setImmediate(r));

    expect(sb.from).toHaveBeenCalledWith('rag_query_log');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'cart path',
        top_k_requested: 5,
        hybrid_alpha: 0.7,
        cited_chunk_ids: ['c1', 'c2'],
        embedding_model: 'gemini-embedding-001',
        error_code: null,
        user_id: null,
      })
    );
  });

  it('error_code se persiste cuando se pasa', async () => {
    const { sb, insert } = makeMockSb();

    logRagQuery(sb, {
      query: 'nonsense',
      topKRequested: 5,
      hybridAlpha: 0.7,
      totalCandidates: 0,
      returnedCount: 0,
      citedChunkIds: [],
      latencyMs: 50,
      costUsd: 0.000001,
      embeddingModel: 'gemini-embedding-001',
      rerankerModel: 'bge-reranker-v2-m3',
      errorCode: 'no_results',
    });

    await new Promise((r) => setImmediate(r));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'no_results' })
    );
  });

  it('userId opcional se mapea a user_id', async () => {
    const { sb, insert } = makeMockSb();

    logRagQuery(sb, {
      userId: 'user-123',
      query: 'q',
      topKRequested: 5,
      hybridAlpha: 0.7,
      totalCandidates: 0,
      returnedCount: 0,
      citedChunkIds: [],
      latencyMs: 10,
      costUsd: 0,
      embeddingModel: 'x',
      rerankerModel: 'y',
    });

    await new Promise((r) => setImmediate(r));

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-123' }));
  });
});
