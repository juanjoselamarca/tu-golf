import { describe, it, expect, vi, beforeEach } from 'vitest';
import { embedQuery, _resetCacheForTests } from '../embed-query';

function makeMockClient(embedding: number[] = Array(1536).fill(0.1)) {
  return {
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding, index: 0 }],
        usage: { total_tokens: 5 },
      }),
    },
  };
}

describe('embedQuery', () => {
  beforeEach(() => _resetCacheForTests());

  it('cache miss → llama OpenAI', async () => {
    const client = makeMockClient();
    const { embedding, fromCache, tokens } = await embedQuery('test query', {
      client: client as any,
    });
    expect(fromCache).toBe(false);
    expect(embedding.length).toBe(1536);
    expect(tokens).toBe(5);
    expect(client.embeddings.create).toHaveBeenCalledTimes(1);
  });

  it('cache hit → no llama OpenAI', async () => {
    const client = makeMockClient();
    await embedQuery('same query', { client: client as any });
    const result = await embedQuery('same query', { client: client as any });
    expect(result.fromCache).toBe(true);
    expect(result.tokens).toBe(0);
    expect(client.embeddings.create).toHaveBeenCalledTimes(1);
  });

  it('queries distintos generan cache entries separadas', async () => {
    const client = makeMockClient();
    await embedQuery('query A', { client: client as any });
    await embedQuery('query B', { client: client as any });
    expect(client.embeddings.create).toHaveBeenCalledTimes(2);
  });

  it('llama con model esperado', async () => {
    const client = makeMockClient();
    await embedQuery('x', { client: client as any });
    expect(client.embeddings.create).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: ['x'],
    });
  });

  it('respeta model custom', async () => {
    const client = makeMockClient();
    await embedQuery('x', { client: client as any, model: 'text-embedding-3-large' });
    expect(client.embeddings.create).toHaveBeenCalledWith({
      model: 'text-embedding-3-large',
      input: ['x'],
    });
  });
});
