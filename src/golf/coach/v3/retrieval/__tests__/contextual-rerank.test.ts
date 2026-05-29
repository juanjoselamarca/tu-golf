import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  contextualRerank,
  _setRerankModelForTests,
  _resetRerankForTests,
} from '../contextual-rerank';
import type { ChunkCandidate } from '../types';

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));

const fakeCandidates: ChunkCandidate[] = [
  { id: 'a', sourceId: 's', breadcrumb: 'R1', content: 'about water hazards', vecScore: 0.9, bm25Score: 0.5, hybridScore: 0.78 },
  { id: 'b', sourceId: 's', breadcrumb: 'R2', content: 'unrelated etiquette content', vecScore: 0.4, bm25Score: 0.1, hybridScore: 0.3 },
  { id: 'c', sourceId: 's', breadcrumb: 'R3', content: 'medium rule about putting', vecScore: 0.6, bm25Score: 0.4, hybridScore: 0.55 },
];

/** Mock del modelo Gemini: devuelve un JSON de scores por índice. */
function fakeModel(scoresByIndex: Record<number, number>) {
  return {
    generateContent: vi.fn().mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify(Object.entries(scoresByIndex).map(([i, score]) => ({ i: Number(i), score }))),
      },
    }),
  };
}

describe('contextualRerank (Gemini)', () => {
  beforeEach(() => _resetRerankForTests());

  it('con modelo, reordena por rerank score y filtra ruido', async () => {
    // 'b' (etiqueta irrelevante) recibe score bajo → cae al fondo.
    _setRerankModelForTests(fakeModel({ 0: 0.95, 1: 0.05, 2: 0.4 }));
    const result = await contextualRerank(fakeCandidates, 'water rule', 3);
    expect(result.length).toBe(3);
    expect(result[0].id).toBe('a');
    expect(result[0].rerankScore).toBe(0.95);
    expect(result[0].rerankAvailable).toBe(true);
    expect(result[2].id).toBe('b'); // el de menor relevancia LLM
  });

  it('índice sin score del LLM usa hybridScore de respaldo', async () => {
    // Solo puntúa el 0; 1 y 2 caen a su hybridScore.
    _setRerankModelForTests(fakeModel({ 0: 0.9 }));
    const result = await contextualRerank(fakeCandidates, 'q', 3);
    const c = result.find((r) => r.id === 'c');
    expect(c?.rerankScore).toBe(0.55); // hybridScore de 'c'
  });

  it('sin modelo (sin GEMINI_API_KEY) → fallback por hybridScore', async () => {
    _setRerankModelForTests(null);
    const result = await contextualRerank(fakeCandidates, 'water rule', 2);
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('c');
    expect(result[0].rerankAvailable).toBe(false);
    expect(result[0].rerankScore).toBe(0.78);
  });

  it('error del modelo → fallback (no rompe)', async () => {
    _setRerankModelForTests({
      generateContent: vi.fn().mockRejectedValue(new Error('gemini 429')),
    });
    const result = await contextualRerank(fakeCandidates, 'q', 3);
    expect(result.length).toBe(3);
    expect(result[0].rerankAvailable).toBe(false);
    expect(result[0].id).toBe('a');
  });

  it('respuesta no-JSON / basura → fallback', async () => {
    _setRerankModelForTests({
      generateContent: vi.fn().mockResolvedValue({ response: { text: () => 'no soy json' } }),
    });
    const result = await contextualRerank(fakeCandidates, 'q', 3);
    expect(result[0].rerankAvailable).toBe(false);
  });

  it('candidates vacíos devuelve []', async () => {
    const result = await contextualRerank([], 'q', 5);
    expect(result).toEqual([]);
  });

  it('topK respeta el límite', async () => {
    _setRerankModelForTests(null);
    const result = await contextualRerank(fakeCandidates, 'q', 1);
    expect(result.length).toBe(1);
  });
});
