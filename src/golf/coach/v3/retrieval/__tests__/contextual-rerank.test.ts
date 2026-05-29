import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  contextualRerank,
  _setRerankerInstanceForTests,
  _resetRerankerForTests,
} from '../contextual-rerank';
import type { ChunkCandidate } from '../types';

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));

const fakeCandidates: ChunkCandidate[] = [
  {
    id: 'a',
    sourceId: 's',
    breadcrumb: 'R1',
    content: 'about water hazards',
    vecScore: 0.9,
    bm25Score: 0.5,
    hybridScore: 0.78,
  },
  {
    id: 'b',
    sourceId: 's',
    breadcrumb: 'R2',
    content: 'unrelated etiquette content',
    vecScore: 0.4,
    bm25Score: 0.1,
    hybridScore: 0.3,
  },
  {
    id: 'c',
    sourceId: 's',
    breadcrumb: 'R3',
    content: 'medium rule about putting',
    vecScore: 0.6,
    bm25Score: 0.4,
    hybridScore: 0.55,
  },
];

describe('contextualRerank', () => {
  beforeEach(() => _resetRerankerForTests());

  it('con modelo cargado, reordena por rerank score', async () => {
    // Mock: dar score alto a la primera candidate ('a')
    const fakeModel = async () => [{ score: 0.95 }, { score: 0.1 }, { score: 0.3 }];
    _setRerankerInstanceForTests(fakeModel);

    const result = await contextualRerank(fakeCandidates, 'water rule', 3);
    expect(result.length).toBe(3);
    expect(result[0].id).toBe('a');
    expect(result[0].rerankScore).toBe(0.95);
    expect(result[0].rerankAvailable).toBe(true);
  });

  it('sin modelo cargado, fallback devuelve top-K del hybridScore', async () => {
    // Simular load fail: instance null + load attempted
    _setRerankerInstanceForTests(null);

    const result = await contextualRerank(fakeCandidates, 'water rule', 2);
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('a'); // mayor hybridScore (0.78)
    expect(result[1].id).toBe('c'); // segundo mayor (0.55)
    expect(result[0].rerankAvailable).toBe(false);
    expect(result[0].rerankScore).toBe(0.78); // == hybridScore
  });

  it('runtime error del reranker cae a fallback', async () => {
    const broken = async () => {
      throw new Error('reranker exploded');
    };
    _setRerankerInstanceForTests(broken);

    const result = await contextualRerank(fakeCandidates, 'q', 3);
    expect(result.length).toBe(3);
    expect(result[0].rerankAvailable).toBe(false);
    expect(result[0].id).toBe('a'); // fallback by hybridScore
  });

  it('candidates vacíos devuelve []', async () => {
    const result = await contextualRerank([], 'q', 5);
    expect(result).toEqual([]);
  });

  it('topK respeta el límite', async () => {
    _setRerankerInstanceForTests(null);
    const result = await contextualRerank(fakeCandidates, 'q', 1);
    expect(result.length).toBe(1);
  });
});
