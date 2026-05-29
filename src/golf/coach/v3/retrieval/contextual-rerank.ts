import { captureError } from '@/lib/error-tracking';
import type { ChunkCandidate, RerankedCandidate } from './types';

let rerankerInstance: any = null;
let rerankerLoadAttempted = false;

export function _setRerankerInstanceForTests(instance: any): void {
  rerankerInstance = instance;
  rerankerLoadAttempted = true;
}

export function _resetRerankerForTests(): void {
  rerankerInstance = null;
  rerankerLoadAttempted = false;
}

async function loadReranker(): Promise<any> {
  if (rerankerInstance) return rerankerInstance;
  if (rerankerLoadAttempted) return null;
  rerankerLoadAttempted = true;
  try {
    // @xenova/transformers — ONNX runtime local, sin dependencia externa
    const { pipeline } = await import('@xenova/transformers');
    rerankerInstance = await pipeline('text-classification', 'Xenova/bge-reranker-v2-m3');
    return rerankerInstance;
  } catch (e) {
    await captureError(e, { context: 'cerebro-v3.reranker.load-failed' });
    return null;
  }
}

function fallback(
  candidates: ChunkCandidate[],
  topK: number
): RerankedCandidate[] {
  return [...candidates]
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, topK)
    .map((c) => ({ ...c, rerankScore: c.hybridScore, rerankAvailable: false }));
}

/**
 * Re-rankea candidatos con bge-reranker-v2-m3 (ONNX local).
 * Si el modelo no está disponible (load fail o runtime error), degrada
 * graceful devolviendo top-K ordenado por hybridScore.
 */
export async function contextualRerank(
  candidates: ChunkCandidate[],
  query: string,
  topK: number = 5
): Promise<RerankedCandidate[]> {
  if (!candidates.length) return [];
  const model = await loadReranker();
  if (!model) return fallback(candidates, topK);
  try {
    const pairs = candidates.map((c) => ({ text: query, text_pair: c.content }));
    const results = await model(pairs);
    const scored: RerankedCandidate[] = candidates.map((c, i) => ({
      ...c,
      rerankScore: results[i]?.score ?? c.hybridScore,
      rerankAvailable: true,
    }));
    return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topK);
  } catch (e) {
    await captureError(e, { context: 'cerebro-v3.reranker.runtime-failed' });
    return fallback(candidates, topK);
  }
}
