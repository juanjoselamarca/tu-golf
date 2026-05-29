import { describe, it, expect, vi } from 'vitest';
import { embedBatch, EMBED_DIM } from '../embed-gemini.mjs';

function fakeGemini(responsesQueue) {
  return {
    batchEmbedContents: vi.fn().mockImplementation(async () => {
      if (!responsesQueue.length) throw new Error('queue empty');
      return responsesQueue.shift();
    }),
  };
}

function embeddingsResp(n, fill = 0.1) {
  return {
    embeddings: Array(n)
      .fill(null)
      .map(() => ({ values: Array(EMBED_DIM).fill(fill) })),
  };
}

describe('embedBatch (Gemini)', () => {
  it('llama batchEmbedContents con outputDimensionality 1536', async () => {
    const client = fakeGemini([embeddingsResp(3)]);
    const texts = ['a', 'b', 'c'];
    const { embeddings, costUsd, tokens } = await embedBatch(client, texts);

    expect(embeddings.length).toBe(3);
    expect(embeddings[0].length).toBe(EMBED_DIM);
    expect(tokens).toBeGreaterThan(0);
    expect(costUsd).toBe(0); // free tier
    expect(client.batchEmbedContents).toHaveBeenCalledTimes(1);
    const call = client.batchEmbedContents.mock.calls[0][0];
    expect(call.requests).toHaveLength(3);
    expect(call.requests[0]).toEqual({
      content: { parts: [{ text: 'a' }] },
      outputDimensionality: EMBED_DIM,
    });
  });

  it('splittea batches > 100 en múltiples calls', async () => {
    const client = fakeGemini([embeddingsResp(100), embeddingsResp(50, 0.2)]);
    const texts = Array(150).fill('x');
    const { embeddings } = await embedBatch(client, texts);
    expect(embeddings.length).toBe(150);
    expect(client.batchEmbedContents).toHaveBeenCalledTimes(2);
  });

  it('preserva el orden de los embeddings del batch', async () => {
    const client = {
      batchEmbedContents: vi.fn().mockResolvedValue({
        embeddings: [
          { values: Array(EMBED_DIM).fill(0.1) },
          { values: Array(EMBED_DIM).fill(0.2) },
          { values: Array(EMBED_DIM).fill(0.3) },
        ],
      }),
    };
    const { embeddings } = await embedBatch(client, ['a', 'b', 'c']);
    expect(embeddings[0][0]).toBe(0.1);
    expect(embeddings[1][0]).toBe(0.2);
    expect(embeddings[2][0]).toBe(0.3);
  });

  it('retry exponencial 3x antes de fallar', async () => {
    const batchEmbedContents = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient 1'))
      .mockRejectedValueOnce(new Error('transient 2'))
      .mockResolvedValue({ embeddings: [{ values: Array(EMBED_DIM).fill(0.5) }] });
    const client = { batchEmbedContents };
    const { embeddings } = await embedBatch(client, ['hello']);
    expect(embeddings.length).toBe(1);
    expect(batchEmbedContents).toHaveBeenCalledTimes(3);
  }, 20_000);

  it('lanza después de 3 fallos consecutivos', async () => {
    const client = { batchEmbedContents: vi.fn().mockRejectedValue(new Error('permanent')) };
    await expect(embedBatch(client, ['x'])).rejects.toThrow(/failed after 3 attempts/);
  }, 20_000);

  it('input vacío devuelve embeddings vacíos', async () => {
    const client = fakeGemini([]);
    const { embeddings, costUsd } = await embedBatch(client, []);
    expect(embeddings).toEqual([]);
    expect(costUsd).toBe(0);
  });
});
