import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const canRun = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!canRun)('rag_query_log schema', () => {
  let sb: SupabaseClient;
  const createdIds: string[] = [];

  beforeAll(() => {
    sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  });

  afterEach(async () => {
    if (createdIds.length === 0) return;
    await sb.from('rag_query_log').delete().in('id', createdIds);
    createdIds.length = 0;
  });

  it('tabla expone todas las columnas esperadas', async () => {
    const { error } = await sb
      .from('rag_query_log')
      .select(
        'id, user_id, query, jurisdictions_filter, top_k_requested, hybrid_alpha, total_candidates, returned_count, top_score, bottom_score, cited_chunk_ids, latency_ms, cost_usd, embedding_model, reranker_model, error_code, created_at'
      )
      .limit(0);
    expect(error).toBeNull();
  });

  it('insert con campos mínimos sin user_id ni query_embedding ni error_code', async () => {
    const { data, error } = await sb
      .from('rag_query_log')
      .insert({
        query: 'test query',
        top_k_requested: 5,
        hybrid_alpha: 0.7,
        total_candidates: 10,
        returned_count: 5,
        cited_chunk_ids: [],
        latency_ms: 123,
        cost_usd: 0.00001,
        embedding_model: 'text-embedding-3-small',
        reranker_model: 'bge-reranker-v2-m3',
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.error_code).toBeNull();
    expect(data?.user_id).toBeNull();
    expect(data?.query_embedding).toBeNull();
    createdIds.push(data!.id);
  });

  it('error_code se guarda cuando hay falla', async () => {
    const { data, error } = await sb
      .from('rag_query_log')
      .insert({
        query: 'nonsense',
        top_k_requested: 5,
        hybrid_alpha: 0.7,
        total_candidates: 0,
        returned_count: 0,
        cited_chunk_ids: [],
        latency_ms: 50,
        cost_usd: 0.000002,
        embedding_model: 'text-embedding-3-small',
        reranker_model: 'bge-reranker-v2-m3',
        error_code: 'no_results',
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.error_code).toBe('no_results');
    createdIds.push(data!.id);
  });

  it('cited_chunk_ids acepta arrays con uuids', async () => {
    const fakeUuids = [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ];
    const { data, error } = await sb
      .from('rag_query_log')
      .insert({
        query: 'test cite ids',
        top_k_requested: 2,
        hybrid_alpha: 0.7,
        total_candidates: 2,
        returned_count: 2,
        cited_chunk_ids: fakeUuids,
        latency_ms: 100,
        cost_usd: 0.00001,
        embedding_model: 'text-embedding-3-small',
        reranker_model: 'bge-reranker-v2-m3',
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.cited_chunk_ids).toEqual(fakeUuids);
    createdIds.push(data!.id);
  });
});
