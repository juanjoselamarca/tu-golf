import { describe, it, expect, vi } from 'vitest';
import { embedBatch } from '../embed-openai.mjs';

function fakeOpenAI(responsesQueue) {
  return {
    embeddings: {
      create: vi.fn().mockImplementation(async () => {
        if (!responsesQueue.length) throw new Error('queue empty');
        return responsesQueue.shift();
      }),
    },
  };
}

describe('embedBatch', () => {
  it('llama OpenAI con model + input correctos', async () => {
    const client = fakeOpenAI([
      {
        data: Array(3)
          .fill(null)
          .map((_, i) => ({ embedding: Array(1536).fill(0.1), index: i })),
        usage: { total_tokens: 30 },
      },
    ]);

    const texts = ['a', 'b', 'c'];
    const { embeddings, costUsd, tokens } = await embedBatch(client, texts);

    expect(embeddings.length).toBe(3);
    expect(embeddings[0].length).toBe(1536);
    expect(tokens).toBe(30);
    expect(costUsd).toBeCloseTo((30 / 1000) * 0.00002, 8);

    expect(client.embeddings.create).toHaveBeenCalledTimes(1);
    expect(client.embeddings.create).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: texts,
    });
  });

  it('splittea batches > 100 en múltiples calls', async () => {
    const batch1 = {
      data: Array(100)
        .fill(null)
        .map((_, i) => ({ embedding: Array(1536).fill(0.1), index: i })),
      usage: { total_tokens: 1000 },
    };
    const batch2 = {
      data: Array(50)
        .fill(null)
        .map((_, i) => ({ embedding: Array(1536).fill(0.2), index: i })),
      usage: { total_tokens: 500 },
    };

    const client = fakeOpenAI([batch1, batch2]);
    const texts = Array(150).fill('x');
    const { embeddings } = await embedBatch(client, texts);

    expect(embeddings.length).toBe(150);
    expect(client.embeddings.create).toHaveBeenCalledTimes(2);
  });

  it('re-ordena por index aunque OpenAI devuelva fuera de orden', async () => {
    const client = fakeOpenAI([
      {
        data: [
          { embedding: Array(1536).fill(0.3), index: 2 },
          { embedding: Array(1536).fill(0.1), index: 0 },
          { embedding: Array(1536).fill(0.2), index: 1 },
        ],
        usage: { total_tokens: 10 },
      },
    ]);

    const { embeddings } = await embedBatch(client, ['a', 'b', 'c']);
    expect(embeddings[0][0]).toBe(0.1);
    expect(embeddings[1][0]).toBe(0.2);
    expect(embeddings[2][0]).toBe(0.3);
  });

  it('retry exponencial 3x antes de fallar', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient 1'))
      .mockRejectedValueOnce(new Error('transient 2'))
      .mockResolvedValue({
        data: [{ embedding: Array(1536).fill(0.5), index: 0 }],
        usage: { total_tokens: 5 },
      });
    const client = { embeddings: { create } };

    const { embeddings } = await embedBatch(client, ['hello']);
    expect(embeddings.length).toBe(1);
    expect(create).toHaveBeenCalledTimes(3);
  }, 20_000);

  it('lanza después de 3 fallos consecutivos', async () => {
    const client = {
      embeddings: { create: vi.fn().mockRejectedValue(new Error('permanent')) },
    };
    await expect(embedBatch(client, ['x'])).rejects.toThrow(/failed after 3 attempts/);
  }, 20_000);

  it('input vacío devuelve embeddings vacíos', async () => {
    const client = fakeOpenAI([]);
    const { embeddings, costUsd } = await embedBatch(client, []);
    expect(embeddings).toEqual([]);
    expect(costUsd).toBe(0);
  });
});
