import { GoogleGenerativeAI } from '@google/generative-ai';
import { captureError } from '@/lib/error-tracking';
import type { ChunkCandidate, RerankedCandidate } from './types';

/**
 * Reranker = filtro de calidad que re-puntúa los candidatos del hybrid search
 * según su relevancia REAL a la query, usando Gemini Flash como evaluador
 * (decisión Juanjo 2026-05-29: re-scoring con Gemini, no Cohere ni ONNX local).
 *
 * Por qué Gemini LLM y no el bge-reranker ONNX local: el ONNX descarga cientos
 * de MB a un FS read-only en Vercel → falla en el request. Gemini es una llamada
 * de red serverless-safe, sin bindings nativos.
 *
 * FORESIGHT — nunca puede tumbar al coach en vivo:
 *   • Timeout duro (RERANK_TIMEOUT_MS). Si Gemini tarda, se corta.
 *   • Cualquier error / timeout / parseo inválido / rate-limit → degrada al
 *     hybridScore (fallback). El coach jamás se queda colgado ni sin resultados.
 *   • temperature 0 para scores estables.
 */
// flash-lite: ~760ms/call vs ~3.2s de 2.5-flash (que trae "thinking" ON). Para
// un reranker queremos baja latencia en el request del coach. Medido 2026-05-29.
export const RERANK_MODEL = 'gemini-2.5-flash-lite';
const RERANK_TIMEOUT_MS = 10000;
const SNIPPET_CHARS = 500;

interface RerankModel {
  generateContent(prompt: string): Promise<{ response: { text(): string } }>;
}

let sharedModel: RerankModel | null = null;
let modelInitAttempted = false;

export function _setRerankModelForTests(model: RerankModel | null): void {
  sharedModel = model;
  modelInitAttempted = true;
}

export function _resetRerankForTests(): void {
  sharedModel = null;
  modelInitAttempted = false;
}

function getModel(): RerankModel | null {
  if (sharedModel) return sharedModel;
  if (modelInitAttempted) return null;
  modelInitAttempted = true;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const genAI = new GoogleGenerativeAI(key);
  sharedModel = genAI.getGenerativeModel({
    model: RERANK_MODEL,
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  }) as unknown as RerankModel;
  return sharedModel;
}

function fallback(candidates: ChunkCandidate[], topK: number): RerankedCandidate[] {
  return [...candidates]
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, topK)
    .map((c) => ({ ...c, rerankScore: c.hybridScore, rerankAvailable: false }));
}

function buildPrompt(query: string, candidates: ChunkCandidate[]): string {
  const items = candidates
    .map((c, i) => `[${i}] ${c.content.slice(0, SNIPPET_CHARS).replace(/\s+/g, ' ').trim()}`)
    .join('\n');
  return [
    'Sos un evaluador de relevancia para un corpus de golf (reglas, handicap, técnica).',
    'Puntuá qué tan relevante es cada fragmento para informar la consulta, de 0.0 (nada)',
    'a 1.0 (muy relevante). Sé estricto: fragmentos fuera de tema reciben < 0.2.',
    'Devolvé SOLO un array JSON: [{"i": <indice>, "score": <0.0-1.0>}, ...]. Sin texto extra.',
    '',
    `Consulta: "${query}"`,
    '',
    'Fragmentos:',
    items,
  ].join('\n');
}

function parseScores(raw: string, n: number): Map<number, number> {
  const scores = new Map<number, number>();
  let text = raw.trim();
  // Por si viene envuelto en fences ```json ... ```
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('rerank response no es array');
  for (const item of parsed) {
    const i = Number(item?.i);
    const s = Number(item?.score);
    if (Number.isInteger(i) && i >= 0 && i < n && Number.isFinite(s)) {
      scores.set(i, Math.max(0, Math.min(1, s)));
    }
  }
  return scores;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('rerank timeout')), ms)),
  ]);
}

/**
 * Re-rankea candidatos por relevancia real a la query (Gemini Flash).
 * Degrada a hybridScore ante cualquier problema (ver FORESIGHT arriba).
 */
export async function contextualRerank(
  candidates: ChunkCandidate[],
  query: string,
  topK: number = 5
): Promise<RerankedCandidate[]> {
  if (!candidates.length) return [];
  const model = getModel();
  if (!model) return fallback(candidates, topK);
  try {
    const result = await withTimeout(model.generateContent(buildPrompt(query, candidates)), RERANK_TIMEOUT_MS);
    const scores = parseScores(result.response.text(), candidates.length);
    if (scores.size === 0) return fallback(candidates, topK);
    const scored: RerankedCandidate[] = candidates.map((c, i) => ({
      ...c,
      // Si Gemini no puntuó un índice, usamos el hybridScore como respaldo.
      rerankScore: scores.has(i) ? (scores.get(i) as number) : c.hybridScore,
      rerankAvailable: true,
    }));
    return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topK);
  } catch (e) {
    await captureError(e, { context: 'cerebro-v3.reranker.gemini-failed' });
    return fallback(candidates, topK);
  }
}
