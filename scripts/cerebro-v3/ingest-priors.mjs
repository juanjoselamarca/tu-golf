// scripts/cerebro-v3/ingest-priors.mjs
// Ingesta idempotente de priors externos (Ola 1b). Fetcher pluggable:
// hoy 'file'; mañana 'http'/'rss' se enchufan sin tocar normalize/load.
// La validación dura vive en las CHECK constraints de la migración
// (percentile 0-100, proportion 0-1) + la clave única (idempotencia).
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const TABLE = {
  A: 'external_priors_amateur_benchmarks',
  B: 'external_priors_handicap_dist',
  C: 'external_priors_course_norms',
};
const CONFLICT = {
  A: 'source_id,handicap_bucket,metric_key,percentile',
  B: 'source_id,region,gender,age_bucket,handicap_bin,year',
  C: 'source_id,course_external_id',
};

async function fetchSource(cfg) {
  if (cfg.fetcher === 'file') {
    return JSON.parse(await readFile(path.join(__dir, cfg.path), 'utf8'));
  }
  throw new Error(`fetcher no soportado aún: ${cfg.fetcher}`);
}

function normalize(layer, raw) {
  if (layer === 'C') {
    for (const r of raw) {
      if (!r.course_external_id) {
        r.course_external_id = `BAND:${r.region ?? 'GLOBAL'}:${r.par ?? 0}`;
      }
    }
  }
  if (layer === 'B') {
    const groups = new Map();
    for (const r of raw) {
      const k = `${r.region}|${r.gender ?? 'all'}|${r.age_bucket ?? 'all'}|${r.year}`;
      groups.set(k, (groups.get(k) ?? 0) + r.proportion);
    }
    for (const [k, sum] of groups) {
      if (Math.abs(sum - 1) > 0.02) {
        throw new Error(`Suma de proporciones del corte ${k} = ${sum.toFixed(3)}, debe ser ~1.0`);
      }
    }
  }
  return raw;
}

async function registerSource(cfg) {
  const row = {
    slug: cfg.source_key,
    title: cfg.title,
    authors: cfg.authors,
    url_source: cfg.url_source,
    block_key: 'priors',
    jurisdiction: cfg.jurisdiction,
    legal_basis: cfg.legal_basis,
    is_authoritative_for: [`prior_${cfg.layer.toLowerCase()}`],
    status: 'ready',
    ingested_at: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from('knowledge_sources')
    .upsert(row, { onConflict: 'slug' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function run() {
  const config = JSON.parse(await readFile(path.join(__dir, 'priors.config.json'), 'utf8'));
  for (const cfg of config) {
    const sourceId = await registerSource(cfg);
    const raw = await fetchSource(cfg);
    const rows = normalize(cfg.layer, raw).map((r) => ({ ...r, source_id: sourceId }));
    for (let i = 0; i < rows.length; i += 200) {
      const slice = rows.slice(i, i + 200);
      const { error } = await sb
        .from(TABLE[cfg.layer])
        .upsert(slice, { onConflict: CONFLICT[cfg.layer], ignoreDuplicates: false });
      if (error) throw error;
    }
    console.log(`[${cfg.layer}] ${cfg.source_key}: ${rows.length} filas`);
  }
}

run()
  .then(() => { console.log('Ingesta de priors OK'); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
