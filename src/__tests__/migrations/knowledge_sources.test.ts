import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const canRun = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!canRun)('knowledge_sources schema', () => {
  let sb: SupabaseClient;
  const createdSlugs: string[] = [];

  beforeAll(() => {
    sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  });

  afterEach(async () => {
    if (createdSlugs.length === 0) return;
    await sb.from('knowledge_sources').delete().in('slug', createdSlugs);
    createdSlugs.length = 0;
  });

  it('tabla expone todas las columnas esperadas', async () => {
    const { error } = await sb
      .from('knowledge_sources')
      .select(
        'id, slug, title, authors, url_source, url_local_pdf, block_key, jurisdiction, priority_rank, is_authoritative_for, legal_basis, source_hash, ingested_at, chunk_count, ingest_cost_usd, status, error_message, created_at, updated_at'
      )
      .limit(0);
    expect(error).toBeNull();
  });

  it('CHECK jurisdiction rechaza valores fuera del enum', async () => {
    const { error } = await sb.from('knowledge_sources').insert({
      slug: 'test-invalid-jur',
      title: 'X',
      url_source: 'https://x',
      block_key: 'rules',
      jurisdiction: 'INVALID',
      legal_basis: 'x',
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23514'); // CHECK violation
  });

  it('CHECK status rechaza valores fuera del enum', async () => {
    const { error } = await sb.from('knowledge_sources').insert({
      slug: 'test-invalid-status',
      title: 'X',
      url_source: 'https://x',
      block_key: 'rules',
      jurisdiction: 'usga',
      legal_basis: 'x',
      status: 'WHATEVER',
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23514');
  });

  it('UNIQUE slug rechaza duplicados', async () => {
    createdSlugs.push('test-dup-slug');
    const { error: e1 } = await sb.from('knowledge_sources').insert({
      slug: 'test-dup-slug',
      title: 'X',
      url_source: 'https://x',
      block_key: 'rules',
      jurisdiction: 'usga',
      legal_basis: 'x',
    });
    expect(e1).toBeNull();

    const { error: e2 } = await sb.from('knowledge_sources').insert({
      slug: 'test-dup-slug',
      title: 'Y',
      url_source: 'https://y',
      block_key: 'rules',
      jurisdiction: 'usga',
      legal_basis: 'y',
    });
    expect(e2).not.toBeNull();
    expect(e2?.code).toBe('23505'); // UNIQUE violation
  });

  it('defaults aplican correctamente', async () => {
    createdSlugs.push('test-defaults');
    const { data, error } = await sb
      .from('knowledge_sources')
      .insert({
        slug: 'test-defaults',
        title: 'X',
        url_source: 'https://x',
        block_key: 'rules',
        jurisdiction: 'usga',
        legal_basis: 'x',
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe('pending');
    expect(data?.priority_rank).toBe(100);
    expect(data?.chunk_count).toBe(0);
    expect(Number(data?.ingest_cost_usd)).toBe(0);
    expect(data?.authors).toEqual([]);
    expect(data?.is_authoritative_for).toEqual([]);
  });

  it('trigger updated_at se ejecuta en UPDATE', async () => {
    createdSlugs.push('test-trigger');
    const { data: created } = await sb
      .from('knowledge_sources')
      .insert({
        slug: 'test-trigger',
        title: 'X',
        url_source: 'https://x',
        block_key: 'rules',
        jurisdiction: 'usga',
        legal_basis: 'x',
      })
      .select()
      .single();
    const originalUpdatedAt = created?.updated_at as string;

    await new Promise((r) => setTimeout(r, 50));

    const { data: updated } = await sb
      .from('knowledge_sources')
      .update({ title: 'Y' })
      .eq('slug', 'test-trigger')
      .select()
      .single();

    expect(updated?.updated_at).not.toBe(originalUpdatedAt);
    expect(new Date(updated?.updated_at as string).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime()
    );
  });
});
