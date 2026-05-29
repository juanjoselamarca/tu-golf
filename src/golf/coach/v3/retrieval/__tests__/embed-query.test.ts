import { describe, it, expect, vi, beforeEach } from 'vitest';
import { embedQuery, _resetCacheForTests, EMBED_DIM } from '../embed-query';

function makeMockClient(values: number[] = Array(EMBED_DIM).fill(0.1)) {
  return {
    embedContent: vi.fn().mockResolvedValue({ embedding: { values } }),
  };
}

describe('embedQuery (Gemini)', () => {
  beforeEach(() => _resetCacheForTests());

  it('cache miss → llama Gemini con outputDimensionality 1536', async () => {
    const client = makeMockClient();
    const { embedding, fromCache, tokens } = await embedQuery('test query', {
      client: client as any,
    });
    expect(fromCache).toBe(false);
    expect(embedding.length).toBe(EMBED_DIM);
    expect(tokens).toBeGreaterThan(0);
    expect(client.embedContent).toHaveBeenCalledTimes(1);
    expect(client.embedContent).toHaveBeenCalledWith({
      content: { parts: [{ text: 'test query' }] },
      outputDimensionality: EMBED_DIM,
    });
  });

  it('cache hit → no llama Gemini', async () => {
    const client = makeMockClient();
    await embedQuery('same query', { client: client as any });
    const result = await embedQuery('same query', { client: client as any });
    expect(result.fromCache).toBe(true);
    expect(result.tokens).toBe(0);
    expect(client.embedContent).toHaveBeenCalledTimes(1);
  });

  it('queries distintos generan cache entries separadas', async () => {
    const client = makeMockClient();
    await embedQuery('query A', { client: client as any });
    await embedQuery('query B', { client: client as any });
    expect(client.embedContent).toHaveBeenCalledTimes(2);
  });

  it('devuelve los valores del embedding del provider', async () => {
    const vals = Array(EMBED_DIM).fill(0.42);
    const client = makeMockClient(vals);
    const { embedding } = await embedQuery('x', { client: client as any });
    expect(embedding[0]).toBe(0.42);
  });
});
