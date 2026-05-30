import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const canRun = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

// Embedding sintético determinístico (no llamamos a OpenAI en tests)
function fakeEmbedding(seed: number): number[] {
  return Array(1536)
    .fill(0)
    .map((_, i) => Math.sin((i + seed) / 100));
}

describe.skipIf(!canRun)('search_chunks_hybrid RPC', () => {
  let sb: SupabaseClient;
  let sourceId: string;

  beforeAll(async () => {
    sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // limpieza defensiva por si quedó de un run previo abortado
    await sb.from('knowledge_sources').delete().eq('slug', 'test-hybrid-rpc');

    // crear source de prueba
    const { data: src, error: e1 } = await sb
      .from('knowledge_sources')
      .insert({
        slug: 'test-hybrid-rpc',
        title: 'Test Hybrid RPC',
        url_source: 'https://example.test',
        block_key: 'rules',
        jurisdiction: 'usga',
        legal_basis: 'test',
        status: 'ready',
      })
      .select()
      .single();
    if (e1) throw e1;
    sourceId = src!.id;

    // insertar 3 chunks con embeddings y contenido diferenciado
    const { error: e2 } = await sb.from('knowledge_chunks').insert([
      {
        source_id: sourceId,
        block_key: 'rules',
        breadcrumb: 'Rule 16',
        content: 'free relief from cart path immovable obstruction',
        content_for_embed: 'free relief from cart path immovable obstruction',
        chunk_hash: 'h-cart-path',
        token_count: 6,
        embedding: fakeEmbedding(1),
      },
      {
        source_id: sourceId,
        block_key: 'rules',
        breadcrumb: 'Rule 17',
        content: 'water hazard penalty drop stroke',
        content_for_embed: 'water hazard penalty drop stroke',
        chunk_hash: 'h-water',
        token_count: 5,
        embedding: fakeEmbedding(2),
      },
      {
        source_id: sourceId,
        block_key: 'rules',
        breadcrumb: 'Rule 18',
        content: 'out of bounds lost ball provisional',
        content_for_embed: 'out of bounds lost ball provisional',
        chunk_hash: 'h-ob',
        token_count: 5,
        embedding: fakeEmbedding(3),
      },
    ]);
    if (e2) throw e2;
  }, 60_000);

  afterAll(async () => {
    if (sourceId) await sb.from('knowledge_sources').delete().eq('id', sourceId);
  }, 30_000);

  it('devuelve chunks con vec/bm25/final scores', async () => {
    const { data, error } = await sb.rpc('search_chunks_hybrid', {
      query_embedding: fakeEmbedding(1),
      query_text: 'cart path relief',
      alpha: 0.7,
      top_k: 5,
      jurisdictions: null,
      block_filter: 'rules',
    });
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBeGreaterThan(0);
    expect(data![0]).toHaveProperty('vec_score');
    expect(data![0]).toHaveProperty('bm25_score');
    expect(data![0]).toHaveProperty('final_score');
    expect(data![0]).toHaveProperty('breadcrumb');
    expect(data![0]).toHaveProperty('content');
  });

  it('respeta filtro block_filter (NONEXISTENT devuelve vacío)', async () => {
    const { data, error } = await sb.rpc('search_chunks_hybrid', {
      query_embedding: fakeEmbedding(1),
      query_text: 'whatever',
      alpha: 0.7,
      top_k: 5,
      jurisdictions: null,
      block_filter: 'NONEXISTENT',
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('respeta top_k limit', async () => {
    const { data, error } = await sb.rpc('search_chunks_hybrid', {
      query_embedding: fakeEmbedding(1),
      query_text: 'rule',
      alpha: 0.7,
      top_k: 2,
      jurisdictions: null,
      block_filter: 'rules',
    });
    expect(error).toBeNull();
    expect(data!.length).toBeLessThanOrEqual(2);
  });

  it('respeta filtro jurisdictions (lista vacía pero válida)', async () => {
    const { data, error } = await sb.rpc('search_chunks_hybrid', {
      query_embedding: fakeEmbedding(1),
      query_text: 'cart path',
      alpha: 0.7,
      top_k: 5,
      jurisdictions: ['usga'],
      block_filter: 'rules',
    });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('chunks BM25-only (sin embedding similar) entran cuando query_text matchea', async () => {
    // query_embedding muy distinto a todos los chunks, pero query_text matchea uno via BM25
    const { data, error } = await sb.rpc('search_chunks_hybrid', {
      query_embedding: fakeEmbedding(999), // muy diferente
      query_text: 'water hazard penalty',
      alpha: 0.2, // peso bajo a vec, alto a BM25
      top_k: 5,
      jurisdictions: null,
      block_filter: 'rules',
    });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    // El chunk de water hazard debe estar en el top
    const top = data![0] as any;
    expect(top.content.toLowerCase()).toContain('water');
  });
});
