import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchKnowledgeChunks, _setDepsForTests, _resetDepsForTests } from '../index';

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));

function makeFakeSb(sourceRows: any[] = []) {
  const insertedLogs: any[] = [];
  const sb = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'rag_query_log') {
        return {
          insert: vi.fn().mockImplementation((row: any) => {
            insertedLogs.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === 'knowledge_sources') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: sourceRows, error: null }),
          }),
        };
      }
      return { insert: vi.fn() };
    }),
  } as any;
  return { sb, insertedLogs };
}

describe('searchKnowledgeChunks', () => {
  beforeEach(() => _resetDepsForTests());

  it('happy path: embed → hybrid → rerank → hydrate → log', async () => {
    const { sb, insertedLogs } = makeFakeSb([
      { id: 's1', title: 'USGA Rules of Golf 2023', jurisdiction: 'usga' },
    ]);

    _setDepsForTests({
      sb,
      embedQueryFn: vi.fn().mockResolvedValue({
        embedding: Array(1536).fill(0.1),
        fromCache: false,
        tokens: 10,
      }),
      hybridSearchFn: vi.fn().mockResolvedValue([
        {
          id: 'c1',
          sourceId: 's1',
          breadcrumb: 'Rule 16',
          content: 'water hazard rule text',
          vecScore: 0.9,
          bm25Score: 0.5,
          hybridScore: 0.78,
          blockKey: 'rules',
        },
      ]),
      contextualRerankFn: vi.fn().mockImplementation(async (candidates: any[]) =>
        candidates.map((c) => ({ ...c, rerankScore: 0.95, rerankAvailable: true }))
      ),
    });

    const result = await searchKnowledgeChunks('what is a water hazard?', { topK: 5 });

    expect(result.length).toBe(1);
    expect(result[0].sourceTitle).toBe('USGA Rules of Golf 2023');
    expect(result[0].sourceJurisdiction).toBe('usga');
    expect(result[0].scores.rerank).toBe(0.95);
    expect(result[0].scores.final).toBe(0.95);

    // log inserted async
    await new Promise((r) => setImmediate(r));
    expect(insertedLogs.length).toBe(1);
    expect(insertedLogs[0].error_code).toBeNull();
    expect(insertedLogs[0].returned_count).toBe(1);
    expect(insertedLogs[0].total_candidates).toBe(1);
  });

  it('error_code=no_results cuando no hay candidates', async () => {
    const { sb, insertedLogs } = makeFakeSb([]);

    _setDepsForTests({
      sb,
      embedQueryFn: vi.fn().mockResolvedValue({
        embedding: Array(1536).fill(0.1),
        fromCache: false,
        tokens: 5,
      }),
      hybridSearchFn: vi.fn().mockResolvedValue([]),
      contextualRerankFn: vi.fn(),
    });

    const result = await searchKnowledgeChunks('nonsense', { topK: 5 });
    expect(result).toEqual([]);

    await new Promise((r) => setImmediate(r));
    expect(insertedLogs[0].error_code).toBe('no_results');
  });

  it('error_code=pipeline_error cuando hybrid throws', async () => {
    const { sb, insertedLogs } = makeFakeSb([]);

    _setDepsForTests({
      sb,
      embedQueryFn: vi.fn().mockResolvedValue({
        embedding: Array(1536).fill(0.1),
        fromCache: false,
        tokens: 5,
      }),
      hybridSearchFn: vi.fn().mockRejectedValue(new Error('rpc failed')),
      contextualRerankFn: vi.fn(),
    });

    await expect(searchKnowledgeChunks('q')).rejects.toThrow('rpc failed');

    await new Promise((r) => setImmediate(r));
    expect(insertedLogs[0].error_code).toBe('pipeline_error');
  });

  it('respeta opts.jurisdictions y topK', async () => {
    const { sb } = makeFakeSb([{ id: 's1', title: 'X', jurisdiction: 'fedegolf_chile' }]);
    const hybridFn = vi.fn().mockResolvedValue([
      {
        id: 'c1',
        sourceId: 's1',
        breadcrumb: 'X',
        content: 'y',
        vecScore: 0.9,
        bm25Score: 0.5,
        hybridScore: 0.78,
      },
    ]);
    const rerankFn = vi.fn().mockImplementation(async (cands: any[]) =>
      cands.map((c) => ({ ...c, rerankScore: 0.9, rerankAvailable: true }))
    );

    _setDepsForTests({
      sb,
      embedQueryFn: vi.fn().mockResolvedValue({
        embedding: Array(1536).fill(0.1),
        fromCache: false,
        tokens: 5,
      }),
      hybridSearchFn: hybridFn,
      contextualRerankFn: rerankFn,
    });

    await searchKnowledgeChunks('q', { jurisdictions: ['fedegolf_chile'], topK: 3 });

    expect(hybridFn).toHaveBeenCalledWith(
      sb,
      expect.any(Array),
      'q',
      expect.objectContaining({ jurisdictions: ['fedegolf_chile'] })
    );
    expect(rerankFn).toHaveBeenCalledWith(expect.any(Array), 'q', 3);
  });
});
