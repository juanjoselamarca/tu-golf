#!/usr/bin/env node
/**
 * ingest-coaching.mjs — Ingesta del corpus de coaching (sub-olas 1c estrategia
 * + 1d psicología) del cerebro v3.
 *
 * A diferencia de ingest-rules.mjs (PDF → parse estructural → chunks), acá el
 * contenido ya viene curado y pre-chunkeado en JSON editorial propio (voz
 * Golfers+, cita el marco sin copiar el libro — ver
 * feedback_taiger_no_book_to_skill_v1). Cada objeto del array `chunks` YA es un
 * chunk auto-contenido.
 *
 * Pipeline por archivo:
 *   1. upsert knowledge_sources (status='ingesting')
 *   2. map chunks → shape de upsert (hash sha256, tokenCount ~4 chars/token)
 *   3. embed con Gemini gemini-embedding-001 dim=1536 taskType RETRIEVAL_DOCUMENT
 *      (MISMO pipeline que las reglas — reference_rag_embeddings_gemini)
 *   4. upsertChunks idempotente (UNIQUE source_id, chunk_hash)
 *   5. update knowledge_sources status='ready' + métricas
 *
 * Uso:
 *   node --env-file=.env.local scripts/cerebro-v3/ingest-coaching.mjs --all
 *   node --env-file=.env.local scripts/cerebro-v3/ingest-coaching.mjs --file=strategy.json
 *   node --env-file=.env.local scripts/cerebro-v3/ingest-coaching.mjs --all --dry-run
 */
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { embedBatch, EMBED_MODEL } from './lib/embed-gemini.mjs';
import { upsertChunks } from './lib/upsert-supabase.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, 'data/coaching');

const args = process.argv.slice(2);
const FILE_FILTER = args.find((a) => a.startsWith('--file='))?.split('=')[1];
const ALL = args.includes('--all');
const DRY_RUN = args.includes('--dry-run');

if (!FILE_FILTER && !ALL) {
  console.error('Usage: --all | --file=<archivo.json> [--dry-run]');
  process.exit(1);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const sb = DRY_RUN
  ? null
  : createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const genAI = DRY_RUN ? null : new GoogleGenerativeAI(requireEnv('GEMINI_API_KEY'));
const embedClient = genAI ? genAI.getGenerativeModel({ model: EMBED_MODEL }) : null;

function hashChunk(breadcrumb, content) {
  return createHash('sha256').update(`${breadcrumb}\n${content}`).digest('hex').slice(0, 16);
}
const estimateTokens = (s) => Math.ceil(s.length / 4);

async function resolveTargets() {
  if (FILE_FILTER) {
    // Defensa barata: solo un basename .json dentro de DATA_DIR (sin path traversal).
    if (!FILE_FILTER.endsWith('.json') || FILE_FILTER.includes('/') || FILE_FILTER.includes('\\')) {
      console.error(`--file debe ser un .json dentro de data/coaching (ej: strategy.json). Recibido: ${FILE_FILTER}`);
      process.exit(1);
    }
    return [FILE_FILTER];
  }
  const entries = await readdir(DATA_DIR);
  return entries.filter((e) => e.endsWith('.json')).sort();
}

const targets = await resolveTargets();
if (!targets.length) {
  console.error(`No hay archivos JSON en ${DATA_DIR}`);
  process.exit(1);
}

console.log(`\n══ Ingesta corpus coaching (1c/1d) ══`);
console.log(`Targets: ${targets.join(', ')}  |  Dry-run: ${DRY_RUN}\n`);

let grandTotalChunks = 0;
let grandTotalCost = 0;

for (const file of targets) {
  console.log(`\n── ${file} ──`);
  const raw = JSON.parse(await readFile(resolve(DATA_DIR, file), 'utf8'));
  const src = raw.source;
  const rawChunks = raw.chunks ?? [];

  if (!src?.slug || !src?.block_key) {
    console.error(`  ✗ ${file}: falta source.slug o source.block_key`);
    continue;
  }
  if (!rawChunks.length) {
    console.error(`  ✗ ${file}: sin chunks`);
    continue;
  }

  // Validación de unicidad de hash dentro del archivo (evita colisiones que el
  // ON CONFLICT colapsaría silenciosamente).
  const seen = new Set();
  const chunks = rawChunks.map((c) => {
    const breadcrumb = c.breadcrumb;
    const content = c.content;
    const chunkHash = hashChunk(breadcrumb, content);
    if (seen.has(chunkHash)) {
      throw new Error(`Hash duplicado en ${file}: "${breadcrumb}" (breadcrumb+content idénticos)`);
    }
    seen.add(chunkHash);
    return {
      breadcrumb,
      ruleAnchor: null,
      content,
      contextualPrefix: null,
      contentForEmbed: content, // curado y auto-contenido: no necesita prefix
      chunkHash,
      pageStart: null,
      pageEnd: null,
      tokenCount: estimateTokens(content),
    };
  });

  console.log(`  ⊟ ${chunks.length} chunks curados (block=${src.block_key})`);

  if (DRY_RUN) {
    const tokens = chunks.reduce((s, c) => s + c.tokenCount, 0);
    console.log(`  [DRY-RUN] embebería ${chunks.length} chunks (~${tokens.toLocaleString()} tokens)`);
    chunks.slice(0, 3).forEach((c) => console.log(`    • ${c.breadcrumb}`));
    grandTotalChunks += chunks.length;
    continue;
  }

  // 1. upsert source
  const { data: sourceRow, error: srcErr } = await sb
    .from('knowledge_sources')
    .upsert(
      {
        slug: src.slug,
        title: src.title,
        authors: src.authors ?? [],
        url_source: src.url_source,
        block_key: src.block_key,
        jurisdiction: src.jurisdiction,
        priority_rank: src.priority_rank ?? 50,
        is_authoritative_for: src.is_authoritative_for ?? [],
        legal_basis: src.legal_basis,
        status: 'ingesting',
        error_message: null,
      },
      { onConflict: 'slug' }
    )
    .select()
    .single();
  if (srcErr) {
    console.error(`  ✗ upsert source falló: ${srcErr.message}`);
    continue;
  }

  try {
    // 2. embed
    console.log(`  ⊡ Embedding con ${EMBED_MODEL}...`);
    const { embeddings, costUsd, tokens } = await embedBatch(
      embedClient,
      chunks.map((c) => c.contentForEmbed)
    );
    chunks.forEach((c, i) => {
      c.embedding = embeddings[i];
    });
    console.log(`  ⊡ Embedded (${tokens.toLocaleString()} tokens, $${costUsd.toFixed(4)})`);

    // 3. upsert chunks
    const { inserted, batches } = await upsertChunks(sb, sourceRow.id, src.block_key, chunks);
    console.log(`  ↑ Upserted ${inserted} chunks en ${batches} batch(es)`);

    // 4. mark ready
    await sb
      .from('knowledge_sources')
      .update({
        status: 'ready',
        ingested_at: new Date().toISOString(),
        chunk_count: chunks.length,
        ingest_cost_usd: costUsd,
        error_message: null,
      })
      .eq('id', sourceRow.id);

    console.log(`  ✓ ${src.slug} listo — ${chunks.length} chunks`);
    grandTotalChunks += chunks.length;
    grandTotalCost += costUsd;
  } catch (e) {
    console.error(`  ✗ FALLÓ ${src.slug}: ${e.message}`);
    await sb
      .from('knowledge_sources')
      .update({ status: 'error', error_message: e.message?.slice(0, 500) ?? 'unknown' })
      .eq('id', sourceRow.id);
  }
}

console.log(`\n══ Ingesta coaching completa ══`);
console.log(`Total chunks: ${grandTotalChunks.toLocaleString()}`);
console.log(`Total cost:   $${grandTotalCost.toFixed(4)}\n`);
