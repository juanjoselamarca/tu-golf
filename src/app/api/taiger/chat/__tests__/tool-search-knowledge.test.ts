import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del motor de retrieval v3 — handleToolUse no debe tocar Supabase/OpenAI real.
const searchKnowledgeChunks = vi.fn();
vi.mock('@/golf/coach/v3/retrieval', () => ({
  searchKnowledgeChunks: (...args: unknown[]) => searchKnowledgeChunks(...args),
}));

// captureError no debe hacer I/O en tests.
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

import { handleToolUse } from '@/golf/coach/v3/tools/handle-tool-use';

describe('handleToolUse search_knowledge_chunks', () => {
  beforeEach(() => {
    searchKnowledgeChunks.mockReset();
  });

  it('llama searchKnowledgeChunks y devuelve un tool_result con chunks', async () => {
    searchKnowledgeChunks.mockResolvedValue([
      {
        id: 'c1',
        sourceTitle: 'USGA Rules of Golf 2023',
        sourceJurisdiction: 'usga',
        breadcrumb: 'Regla 18.2b',
        content: 'penalty for OB...',
        scores: { final: 0.92 },
      },
    ]);

    const result = await handleToolUse(
      { tool_use_id: 'tu1', name: 'search_knowledge_chunks', input: { query: 'OB rule' } },
      { userId: 'user-123' },
    );

    expect(result.type).toBe('tool_result');
    expect(result.tool_use_id).toBe('tu1');
    const payload = JSON.parse(result.content);
    expect(payload).toHaveProperty('chunks');
    expect(payload.chunks).toHaveLength(1);
    expect(payload.chunks[0].breadcrumb).toBe('Regla 18.2b');
  });

  it('pasa jurisdictions y userId al motor de retrieval', async () => {
    searchKnowledgeChunks.mockResolvedValue([]);
    await handleToolUse(
      {
        tool_use_id: 'tu2',
        name: 'search_knowledge_chunks',
        input: { query: 'OB en torneo', jurisdictions: ['fedegolf_chile'] },
      },
      { userId: 'user-xyz' },
    );
    expect(searchKnowledgeChunks).toHaveBeenCalledWith(
      'OB en torneo',
      expect.objectContaining({ jurisdictions: ['fedegolf_chile'], userId: 'user-xyz', topK: 5 }),
    );
  });

  it('si el retrieval falla devuelve tool_result con chunks vacíos (no rompe el stream)', async () => {
    searchKnowledgeChunks.mockRejectedValue(new Error('embed timeout'));
    const result = await handleToolUse(
      { tool_use_id: 'tu3', name: 'search_knowledge_chunks', input: { query: 'x' } },
      { userId: 'u' },
    );
    expect(result.tool_use_id).toBe('tu3');
    const payload = JSON.parse(result.content);
    expect(payload.chunks).toEqual([]);
    expect(payload.error).toBe('search_failed');
  });

  it('lanza si la tool no es search_knowledge_chunks', async () => {
    await expect(
      handleToolUse({ tool_use_id: 'tu4', name: 'get_latest_round', input: {} }, {}),
    ).rejects.toThrow();
  });
});
