import { describe, it, expect, vi } from 'vitest';
import { hybridSearch } from '../hybrid-search';

function makeMockSb(rows: any[] = [], error: any = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rows, error }),
  };
}

describe('hybridSearch', () => {
  it('llama RPC search_chunks_hybrid con args correctos', async () => {
    const sb = makeMockSb([
      {
        id: 'c1',
        source_id: 's1',
        breadcrumb: 'Rule 16',
        content: 'cart path',
        vec_score: 0.9,
        bm25_score: 0.5,
        final_score: 0.78,
      },
    ]);

    const candidates = await hybridSearch(sb as any, Array(1536).fill(0.1), 'cart path', {
      alpha: 0.7,
      topCandidates: 20,
      jurisdictions: ['usga'],
      blockKey: 'rules',
    });

    expect(sb.rpc).toHaveBeenCalledWith('search_chunks_hybrid', {
      query_embedding: expect.any(Array),
      query_text: 'cart path',
      alpha: 0.7,
      top_k: 20,
      jurisdictions: ['usga'],
      block_filter: 'rules',
    });

    expect(candidates.length).toBe(1);
    expect(candidates[0].id).toBe('c1');
    expect(candidates[0].sourceId).toBe('s1');
    expect(candidates[0].hybridScore).toBe(0.78);
    expect(candidates[0].vecScore).toBe(0.9);
    expect(candidates[0].bm25Score).toBe(0.5);
    expect(candidates[0].blockKey).toBe('rules');
  });

  it('defaults aplican (alpha=0.7, topCandidates=20, jurisdictions=null, blockKey=null)', async () => {
    const sb = makeMockSb([]);
    await hybridSearch(sb as any, Array(1536).fill(0), 'query');
    expect(sb.rpc).toHaveBeenCalledWith('search_chunks_hybrid', {
      query_embedding: expect.any(Array),
      query_text: 'query',
      alpha: 0.7,
      top_k: 20,
      jurisdictions: null,
      block_filter: null,
    });
  });

  it('error de RPC propaga la excepción', async () => {
    const sb = makeMockSb(null as any, { message: 'rpc fail', code: 'XX000' });
    await expect(
      hybridSearch(sb as any, Array(1536).fill(0), 'q', {})
    ).rejects.toMatchObject({ message: 'rpc fail' });
  });

  it('data null devuelve []', async () => {
    const sb = makeMockSb(null as any);
    const result = await hybridSearch(sb as any, Array(1536).fill(0), 'q');
    expect(result).toEqual([]);
  });

  it('scores string (postgres numeric) se convierten a number', async () => {
    const sb = makeMockSb([
      {
        id: 'c2',
        source_id: 's2',
        breadcrumb: 'R',
        content: 'x',
        vec_score: '0.75',
        bm25_score: '0.42',
        final_score: '0.65',
      },
    ]);
    const candidates = await hybridSearch(sb as any, Array(1536).fill(0), 'q');
    expect(typeof candidates[0].vecScore).toBe('number');
    expect(candidates[0].vecScore).toBe(0.75);
    expect(candidates[0].hybridScore).toBe(0.65);
  });
});
