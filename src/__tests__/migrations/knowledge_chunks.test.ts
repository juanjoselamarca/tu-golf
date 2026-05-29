import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const canRun = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!canRun)('knowledge_chunks schema', () => {
  let sb: SupabaseClient;
  const createdSourceIds: string[] = [];

  beforeAll(() => {
    sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  });

  afterEach(async () => {
    if (createdSourceIds.length === 0) return;
    // CASCADE elimina chunks
    await sb.from('knowledge_sources').delete().in('id', createdSourceIds);
    createdSourceIds.length = 0;
  });

  async function createTestSource(slug: string): Promise<string> {
    const { data, error } = await sb
      .from('knowledge_sources')
      .insert({
        slug,
        title: 'Test source',
        url_source: 'https://example.test',
        block_key: 'rules',
        jurisdiction: 'usga',
        legal_basis: 'test',
      })
      .select()
      .single();
    if (error) throw error;
    createdSourceIds.push(data!.id);
    return data!.id;
  }

  it('tabla expone todas las columnas esperadas', async () => {
    const { error } = await sb
      .from('knowledge_chunks')
      .select(
        'id, source_id, block_key, breadcrumb, rule_anchor, content, contextual_prefix, content_for_embed, embedding, chunk_hash, page_start, page_end, token_count, created_at'
      )
      .limit(0);
    expect(error).toBeNull();
  });

  it('UNIQUE (source_id, chunk_hash) rechaza duplicados', async () => {
    const sourceId = await createTestSource('test-chunks-dup');
    const chunk = {
      source_id: sourceId,
      block_key: 'rules',
      breadcrumb: 'Rule 1',
      content: 'hello',
      content_for_embed: 'hello',
      chunk_hash: 'h-dup-1',
      token_count: 1,
    };
    const { error: e1 } = await sb.from('knowledge_chunks').insert(chunk);
    expect(e1).toBeNull();

    const { error: e2 } = await sb.from('knowledge_chunks').insert(chunk);
    expect(e2).not.toBeNull();
    expect(e2?.code).toBe('23505');
  });

  it('ON DELETE CASCADE elimina chunks al borrar source', async () => {
    const sourceId = await createTestSource('test-chunks-cascade');
    await sb.from('knowledge_chunks').insert({
      source_id: sourceId,
      block_key: 'rules',
      breadcrumb: 'Rule 1',
      content: 'cascade test',
      content_for_embed: 'cascade test',
      chunk_hash: 'h-cascade',
      token_count: 2,
    });

    // borrar source (CASCADE)
    await sb.from('knowledge_sources').delete().eq('id', sourceId);
    createdSourceIds.length = 0;

    const { data: orphans } = await sb
      .from('knowledge_chunks')
      .select('id')
      .eq('source_id', sourceId);
    expect(orphans).toEqual([]);
  });

  it('tsvector se genera automáticamente desde content', async () => {
    const sourceId = await createTestSource('test-chunks-tsv');
    await sb.from('knowledge_chunks').insert({
      source_id: sourceId,
      block_key: 'rules',
      breadcrumb: 'Rule 1',
      content: 'free relief from cart path',
      content_for_embed: 'free relief from cart path',
      chunk_hash: 'h-tsv-1',
      token_count: 6,
    });

    // RPC para verificar tsvector via función SQL nativa
    // Usamos un raw SQL via supabase.rpc no es directo - hacemos search
    // simple via FTS asegurándonos que matchea
    const { data } = await sb
      .from('knowledge_chunks')
      .select('id, content')
      .eq('source_id', sourceId)
      .textSearch('tsv', 'cart & path');

    expect(data).not.toBeNull();
    expect(data!.length).toBe(1);
  });

  it('embedding vector(1536) acepta arrays de 1536 floats', async () => {
    const sourceId = await createTestSource('test-chunks-embedding');
    const fakeEmbedding = Array(1536).fill(0).map((_, i) => Math.sin(i) / 100);
    const { error } = await sb.from('knowledge_chunks').insert({
      source_id: sourceId,
      block_key: 'rules',
      breadcrumb: 'Rule 1',
      content: 'test embed',
      content_for_embed: 'test embed',
      chunk_hash: 'h-emb-1',
      token_count: 2,
      embedding: fakeEmbedding,
    });
    expect(error).toBeNull();
  });
});
