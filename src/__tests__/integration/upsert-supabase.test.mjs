import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  upsertChunks,
  verificarCuentaDeLaFuente,
} from '../../../scripts/cerebro-v3/lib/upsert-supabase.mjs';

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

  it('el texto editado no deja viva la versión anterior', async () => {
    // El hash es sha256(breadcrumb + content), así que editar un chunk produce
    // un hash nuevo: el ON CONFLICT no lo reconoce, inserta otra fila y la vieja
    // sobrevive. Es lo que iba a pasar al re-ingestar el corpus del coach
    // reescrito a chileno (27-oct-2026): 96 chunks, la mitad en voseo, con
    // embeddings casi idénticos compitiendo en el RAG.
    const antes = [
      {
        breadcrumb: 'Psicología > Rutina',
        content: 'tomá aire y ejecutá',
        contentForEmbed: 'tomá aire y ejecutá',
        chunkHash: 'stale-viejo',
        tokenCount: 4,
      },
    ];
    const despues = [
      {
        breadcrumb: 'Psicología > Rutina',
        content: 'toma aire y ejecuta',
        contentForEmbed: 'toma aire y ejecuta',
        chunkHash: 'stale-nuevo',
        tokenCount: 4,
      },
    ];

    await upsertChunks(sb, sourceId, 'rules', antes);
    const { borrados } = await upsertChunks(sb, sourceId, 'rules', despues);
    expect(borrados).toBe(1);

    const { data } = await sb
      .from('knowledge_chunks')
      .select('chunk_hash')
      .eq('source_id', sourceId);
    expect(data.map((f) => f.chunk_hash)).toEqual(['stale-nuevo']);

    await sb.from('knowledge_chunks').delete().eq('source_id', sourceId);
  }, 30_000);

  it('una lista vacía NO vacía la fuente', async () => {
    // Un parse que falló devuelve []: eso es "no tengo nada que decir", no "la
    // fuente quedó vacía". Si el borrado se guiara por esa lista, un parse roto
    // dejaría al coach sin corpus en prod.
    const chunks = [
      {
        breadcrumb: 'Rule 9',
        content: 'no me borres',
        contentForEmbed: 'no me borres',
        chunkHash: 'vacio-h1',
        tokenCount: 3,
      },
    ];
    await upsertChunks(sb, sourceId, 'rules', chunks);

    const { inserted, borrados } = await upsertChunks(sb, sourceId, 'rules', []);
    expect([inserted, borrados]).toEqual([0, 0]);

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

  it('verificarCuentaDeLaFuente compara contra la TABLA, no contra el archivo', async () => {
    // Es la otra mitad del invariante, y la llaman los dos ingests antes de
    // marcar la fuente `ready`. Importa que mire la tabla: `chunk_count` se
    // escribe con el largo del archivo, así que un sobrante de la versión
    // anterior quedaba tapado por el propio contador de la fuente.
    const chunks = [
      {
        breadcrumb: 'Rule 10',
        content: 'uno',
        contentForEmbed: 'uno',
        chunkHash: 'cuenta-h1',
        tokenCount: 1,
      },
      {
        breadcrumb: 'Rule 11',
        content: 'dos',
        contentForEmbed: 'dos',
        chunkHash: 'cuenta-h2',
        tokenCount: 1,
      },
    ];
    await upsertChunks(sb, sourceId, 'rules', chunks);

    await expect(verificarCuentaDeLaFuente(sb, sourceId, 2, 'test-upsert-lib')).resolves.toBe(2);
    await expect(
      verificarCuentaDeLaFuente(sb, sourceId, 3, 'test-upsert-lib')
    ).rejects.toThrow(/quedó con 2 chunks y el archivo tiene 3/);

    await sb.from('knowledge_chunks').delete().eq('source_id', sourceId);
  }, 30_000);

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
