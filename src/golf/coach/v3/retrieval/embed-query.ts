import OpenAI from 'openai';
import { createHash } from 'node:crypto';

const CACHE_MAX = 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  embedding: number[];
  ts: number;
}

const cache = new Map<string, CacheEntry>();
let sharedClient: OpenAI | null = null;

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

export interface EmbedQueryOpts {
  client?: Pick<OpenAI, 'embeddings'>;
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
  const client =
    opts.client ??
    (sharedClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' }));
  const res = await client.embeddings.create({
    model: opts.model ?? 'text-embedding-3-small',
    input: [query],
  });
  const embedding = res.data[0].embedding;
  const tokens = res.usage?.total_tokens ?? 0;
  cache.set(key, { embedding, ts: Date.now() });
  pruneCache();
  return { embedding, fromCache: false, tokens };
}
