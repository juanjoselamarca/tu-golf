import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { upsertChunks } from '../upsert-supabase.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const canRun = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!canRun)('upsertChunks', () => {
  let sb;
  let sourceId;

  beforeAll(async () => {
    sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // cleanup defensivo
    await sb.from('knowledge_sources').delete().eq('slug', 'test-upsert-lib');

    const { data, error } = await sb
      .from('knowledge_sources')
      .insert({
        slug: 'test-upsert-lib',
        title: 'Test Upsert Lib',
        url_source: 'https://example.test',
        block_key: 'rules',
        jurisdiction: 'usga',
        legal_basis: 'test',
      })
      .select()
      .single();
    if (error) throw error;
    sourceId = data.id;
  }, 30_000);

  afterAll(async () => {
    if (sourceId) await sb.from('knowledge_sources').delete().eq('id', sourceId);
  }, 30_000);

  it('inserta chunks nuevos', async () => {
    const chunks = [
      {
        breadcrumb: 'Rule 1',
        ruleAnchor: '1',
        content: 'hello world',
        contextualPrefix: 'ctx',
        contentForEmbed: 'ctx\n\nhello world',
        chunkHash: 'upsert-h1',
        tokenCount: 3,
      },
      {
        breadcrumb: 'Rule 2',
        ruleAnchor: '2',
        content: 'foo bar',
        contentForEmbed: 'foo bar',
        chunkHash: 'upsert-h2',
        tokenCount: 2,
      },
    ];
    const { inserted, batches } = await upsertChunks(sb, sourceId, 'rules', chunks);
    expect(inserted).toBe(2);
    expect(batches).toBe(1);

    const { count } = await sb
      .from('knowledge_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', sourceId);
    expect(count).toBe(2);

    // cleanup
    await sb.from('knowledge_chunks').delete().eq('source_id', sourceId);
  }, 30_000);

  it('re-upsert idempotente — no duplica', async () => {
    const chunks = [
      {
        breadcrumb: 'Rule 1',
        content: 'idempotent test',
        contentForEmbed: 'idempotent test',
        chunkHash: 'idemp-h1',
        tokenCount: 2,
      },
    ];
    await upsertChunks(sb, sourceId, 'rules', chunks);
    await upsertChunks(sb, sourceId, 'rules', chunks);
    const { count } = await sb
      .from('knowledge_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', sourceId);
    expect(count).toBe(1);

    await sb.from('knowledge_chunks').delete().eq('source_id', sourceId);
  }, 30_000);

  it('input vacío devuelve inserted=0', async () => {
    const { inserted, batches } = await upsertChunks(sb, sourceId, 'rules', []);
    expect(inserted).toBe(0);
    expect(batches).toBe(0);
  });

  it('batchea > 200 chunks', async () => {
    const chunks = Array(250)
      .fill(null)
      .map((_, i) => ({
        breadcrumb: `Rule ${i}`,
        content: `content ${i}`,
        contentForEmbed: `content ${i}`,
        chunkHash: `batch-h${i}`,
        tokenCount: 2,
      }));
    const { inserted, batches } = await upsertChunks(sb, sourceId, 'rules', chunks);
    expect(inserted).toBe(250);
    expect(batches).toBe(2);

    await sb.from('knowledge_chunks').delete().eq('source_id', sourceId);
  }, 60_000);
});
