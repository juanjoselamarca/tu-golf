import { GoogleGenerativeAI } from '@google/generative-ai';
import { createHash } from 'node:crypto';

/**
 * Embedding de queries del retrieval RAG (cerebro v3).
 *
 * Provider: Gemini `gemini-embedding-001` con `outputDimensionality: 1536`
 * (decisión Juanjo 2026-05-29 — usamos la GEMINI_API_KEY existente, free tier,
 * sin nueva relación de billing). 1536 dims mantiene la columna `vector(1536)`
 * sin migración de schema. El RPC usa cosine (`<=>`), magnitude-invariant, así
 * que no requiere normalización manual del vector truncado por MRL.
 */
export const EMBED_MODEL = 'gemini-embedding-001';
export const EMBED_DIM = 1536;

const CACHE_MAX = 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  embedding: number[];
  ts: number;
}

const cache = new Map<string, CacheEntry>();

/** Cliente mínimo de embeddings (lo que usamos del SDK de Gemini). Inyectable en tests. */
export interface EmbedClient {
  embedContent(req: {
    content: { parts: { text: string }[] };
    outputDimensionality?: number;
    taskType?: string;
  }): Promise<{ embedding: { values: number[] } }>;
}

let sharedClient: EmbedClient | null = null;

function hashKey(query: string): string {
  return createHash('sha256').update(query).digest('hex');
}

function pruneCache(): void {
  const now = Date.now();
  const expiredKeys: string[] = [];
  cache.forEach((v, k) => {
    if (now - v.ts > CACHE_TTL_MS) expiredKeys.push(k);
  });
  expiredKeys.forEach((k) => cache.delete(k));

  while (cache.size > CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) break;
    cache.delete(firstKey);
  }
}

export function _resetCacheForTests(): void {
  cache.clear();
  sharedClient = null;
}

function getClient(): EmbedClient {
  if (sharedClient) return sharedClient;
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
  sharedClient = genAI.getGenerativeModel({ model: EMBED_MODEL }) as unknown as EmbedClient;
  return sharedClient;
}

export interface EmbedQueryOpts {
  client?: EmbedClient;
  model?: string;
}

export interface EmbedQueryResult {
  embedding: number[];
  fromCache: boolean;
  tokens: number;
}

export async function embedQuery(
  query: string,
  opts: EmbedQueryOpts = {}
): Promise<EmbedQueryResult> {
  const key = hashKey(query);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts <= CACHE_TTL_MS) {
    return { embedding: hit.embedding, fromCache: true, tokens: 0 };
  }
  const client = opts.client ?? getClient();
  const res = await client.embedContent({
    content: { parts: [{ text: query }] },
    outputDimensionality: EMBED_DIM,
    // taskType RETRIEVAL_QUERY mejora la similitud query↔documento (sobre todo
    // cross-lingual: queries ES vs corpus EN). Debe parear con RETRIEVAL_DOCUMENT
    // en la ingesta (embed-gemini.mjs).
    taskType: 'RETRIEVAL_QUERY',
  });
  const embedding = res.embedding.values;
  // Gemini embedContent no devuelve uso de tokens; estimamos ~4 chars/token
  // para observabilidad (el costo real en free tier es ~0).
  const tokens = Math.ceil(query.length / 4);
  cache.set(key, { embedding, ts: Date.now() });
  pruneCache();
  return { embedding, fromCache: false, tokens };
}
