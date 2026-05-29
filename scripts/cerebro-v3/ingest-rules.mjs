#!/usr/bin/env node
/**
 * ingest-rules.mjs — Orchestrator de ingesta para sub-ola 1e.
 *
 * Pipeline:
 *   1. Resolver fuentes desde sources.config.json (filtradas por --slug o --all)
 *   2. Para cada fuente:
 *      a. upsert knowledge_sources con status='ingesting'
 *      b. downloadPdf (con cache local)
 *      c. extraer texto con pdf-parse
 *      d. parseStructural → chunks con breadcrumb
 *      e. generar contextual prefix con Haiku (paralelo, batched)
 *      f. embed con OpenAI text-embedding-3-small (batched 100)
 *      g. upsertChunks (idempotente por chunk_hash)
 *      h. update knowledge_sources con status='ready' + métricas
 *   3. Report total cost + chunks ingestados.
 *
 * Uso:
 *   node --env-file=.env.local scripts/cerebro-v3/ingest-rules.mjs --all
 *   node --env-file=.env.local scripts/cerebro-v3/ingest-rules.mjs --slug=usga-rules-of-golf-2023
 *   node --env-file=.env.local scripts/cerebro-v3/ingest-rules.mjs --slug=... --dry-run
 *   node --env-file=.env.local scripts/cerebro-v3/ingest-rules.mjs --slug=... --skip-prefix
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';
import { downloadPdf } from './lib/download-pdf.mjs';
import { parseStructural } from './lib/parse-structural.mjs';
import { generateContextualPrefix } from './lib/contextual-prefix.mjs';
import { embedBatch } from './lib/embed-openai.mjs';
import { upsertChunks } from './lib/upsert-supabase.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const SLUG_FILTER = args.find((a) => a.startsWith('--slug='))?.split('=')[1];
const ALL = args.includes('--all');
const DRY_RUN = args.includes('--dry-run');
const SKIP_PREFIX = args.includes('--skip-prefix');
const CONCURRENT_PREFIXES = 5; // paralelismo de Haiku calls

if (!SLUG_FILTER && !ALL) {
  console.error('Usage: --all | --slug=<slug> [--dry-run] [--skip-prefix]');
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

function optionalEnv(name) {
  return process.env[name] ?? null;
}

// Supabase es siempre requerido (excepto en modos puramente dry sin BD writes)
const sb =
  DRY_RUN
    ? createClient(optionalEnv('NEXT_PUBLIC_SUPABASE_URL') ?? 'https://placeholder.invalid', optionalEnv('SUPABASE_SERVICE_ROLE_KEY') ?? 'placeholder')
    : createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

// Anthropic solo si se generan prefixes
const anthropic =
  SKIP_PREFIX || DRY_RUN
    ? null
    : new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });

// OpenAI solo si se hacen embeddings (no dry-run)
const openai = DRY_RUN ? null : new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') });

const configPath = resolve(__dirname, 'sources.config.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const targets = SLUG_FILTER ? config.filter((c) => c.slug === SLUG_FILTER) : config;

if (!targets.length) {
  console.error(`No matching sources for slug=${SLUG_FILTER}. Available:`);
  config.forEach((c) => console.error(`  - ${c.slug}`));
  process.exit(1);
}

console.log(`\n══ Ingesta sub-ola 1e ══`);
console.log(`Targets: ${targets.length}  |  Dry-run: ${DRY_RUN}  |  Skip prefix: ${SKIP_PREFIX}\n`);

async function runPrefixesConcurrent(chunks, docTitle) {
  let totalCost = 0;
  const errors = [];
  for (let i = 0; i < chunks.length; i += CONCURRENT_PREFIXES) {
    const slice = chunks.slice(i, i + CONCURRENT_PREFIXES);
    const results = await Promise.all(
      slice.map((c) =>
        generateContextualPrefix(anthropic, {
          docTitle,
          breadcrumb: c.breadcrumb,
          content: c.content,
        })
      )
    );
    results.forEach((r, idx) => {
      const c = slice[idx];
      c.contextualPrefix = r.prefix;
      c.contentForEmbed = r.prefix ? `${r.prefix}\n\n${c.content}` : c.content;
      totalCost += r.costUsd;
      if (r.error) errors.push({ breadcrumb: c.breadcrumb, error: r.error.message });
    });
    if ((i + CONCURRENT_PREFIXES) % 50 === 0) {
      console.log(`    ${Math.min(i + CONCURRENT_PREFIXES, chunks.length)}/${chunks.length} prefixes — running cost $${totalCost.toFixed(4)}`);
    }
  }
  return { totalCost, errors };
}

let grandTotalCost = 0;
let grandTotalChunks = 0;

for (const src of targets) {
  console.log(`\n── ${src.slug} ──`);

  let sourceRow;
  if (!DRY_RUN) {
    const { data, error } = await sb
      .from('knowledge_sources')
      .upsert(
        {
          slug: src.slug,
          title: src.title,
          authors: src.authors,
          url_source: src.url_source,
          block_key: src.block_key,
          jurisdiction: src.jurisdiction,
          priority_rank: src.priority_rank,
          is_authoritative_for: src.is_authoritative_for,
          legal_basis: src.legal_basis,
          status: 'ingesting',
          error_message: null,
        },
        { onConflict: 'slug' }
      )
      .select()
      .single();
    if (error) {
      console.error(`  ✗ Failed to upsert source row: ${error.message}`);
      continue;
    }
    sourceRow = data;
  }

  try {
    // 1. Download
    const { path, hash, fromCache, sizeBytes } = await downloadPdf(src.url_source);
    console.log(`  ↓ Downloaded (${fromCache ? 'cache' : 'fresh'}) ${(sizeBytes / 1024).toFixed(0)}KB hash=${hash.slice(0, 12)}`);

    // 2. Extract text (pdf-parse v2 API)
    const buf = await readFile(path);
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const textResult = await parser.getText();
    await parser.destroy();
    const fullText = textResult.text ?? textResult.pages?.map((p) => p.text).join('\n\n') ?? '';
    const numPages = textResult.pages?.length ?? textResult.total ?? 0;
    console.log(`  ⊟ Extracted ${fullText.length.toLocaleString()} chars from ${numPages} pages`);

    // 3. Parse structural
    const chunks = parseStructural(fullText, { docTitle: src.title });
    console.log(`  ⊟ Parsed ${chunks.length} chunks`);

    if (chunks.length === 0) {
      console.error(`  ✗ No chunks generated`);
      if (!DRY_RUN) {
        await sb.from('knowledge_sources').update({ status: 'error', error_message: 'No chunks generated' }).eq('id', sourceRow.id);
      }
      continue;
    }

    // 4. Contextual prefixes
    let prefixCost = 0;
    if (!SKIP_PREFIX) {
      console.log(`  ✎ Generating contextual prefixes (Haiku, concurrent=${CONCURRENT_PREFIXES})...`);
      const { totalCost, errors } = await runPrefixesConcurrent(chunks, src.title);
      prefixCost = totalCost;
      console.log(`  ✎ Prefixes done — ${chunks.length - errors.length}/${chunks.length} ok, cost $${prefixCost.toFixed(4)}`);
      if (errors.length) console.warn(`    ${errors.length} prefix failures (chunks embed sin prefix)`);
    } else {
      chunks.forEach((c) => {
        c.contextualPrefix = null;
        c.contentForEmbed = c.content;
      });
      console.log(`  ✎ Prefixes skipped (--skip-prefix)`);
    }

    if (DRY_RUN) {
      const estimatedTokens = chunks.reduce((s, c) => s + c.tokenCount, 0);
      const estEmbedCost = (estimatedTokens / 1000) * 0.00002;
      console.log(`  [DRY-RUN] would embed ${chunks.length} chunks (~${estimatedTokens.toLocaleString()} tokens, ~$${estEmbedCost.toFixed(4)})`);
      continue;
    }

    // 5. Embed
    console.log(`  ⊡ Embedding ${chunks.length} chunks with text-embedding-3-small...`);
    const { embeddings, costUsd: embedCost, tokens } = await embedBatch(openai, chunks.map((c) => c.contentForEmbed));
    chunks.forEach((c, i) => {
      c.embedding = embeddings[i];
    });
    console.log(`  ⊡ Embedded (${tokens.toLocaleString()} tokens, $${embedCost.toFixed(4)})`);

    // 6. Upsert
    const { inserted, batches } = await upsertChunks(sb, sourceRow.id, src.block_key, chunks);
    console.log(`  ↑ Upserted ${inserted} chunks in ${batches} batches`);

    // 7. Mark ready
    const totalCost = prefixCost + embedCost;
    await sb
      .from('knowledge_sources')
      .update({
        status: 'ready',
        ingested_at: new Date().toISOString(),
        chunk_count: chunks.length,
        ingest_cost_usd: totalCost,
        source_hash: hash,
        error_message: null,
      })
      .eq('id', sourceRow.id);

    console.log(`  ✓ ${src.slug} done — ${chunks.length} chunks, $${totalCost.toFixed(4)}`);
    grandTotalCost += totalCost;
    grandTotalChunks += chunks.length;
  } catch (e) {
    console.error(`  ✗ FAILED ${src.slug}: ${e.message}`);
    if (!DRY_RUN && sourceRow) {
      await sb
        .from('knowledge_sources')
        .update({ status: 'error', error_message: e.message?.slice(0, 500) ?? 'unknown' })
        .eq('id', sourceRow.id);
    }
  }
}

console.log(`\n══ Ingesta completa ══`);
console.log(`Total chunks: ${grandTotalChunks.toLocaleString()}`);
console.log(`Total cost:   $${grandTotalCost.toFixed(4)}\n`);
