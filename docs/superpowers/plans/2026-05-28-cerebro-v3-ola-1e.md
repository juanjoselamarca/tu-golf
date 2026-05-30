# Cerebro V3 — Sub-Ola 1e: Reglas Oficiales en `knowledge_chunks` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingerir las reglas oficiales del golf (USGA + R&A + WHS + FedeGolf Chile) en una base RAG vectorial con hybrid search + contextual retrieval + re-ranking, accesible al coach v3 vía tool call.

**Architecture:** 5 capas — Admin UI → Pipeline de ingesta → Postgres (knowledge_sources/chunks/log) → Retrieval engine (hybrid + rerank) → Coach v3 tool call. Pipeline build-time + admin UI re-indexado. Anti-hallucination contract estricto.

**Tech Stack:** Next.js 14 App Router, Supabase Postgres + pgvector + pg_trgm, OpenAI `text-embedding-3-small`, Anthropic Haiku 4.5, `@xenova/transformers` (ONNX) con `bge-reranker-v2-m3`, vitest, Playwright (e2e).

**Spec de referencia:** `docs/superpowers/specs/2026-05-28-cerebro-v3-ola-1e-design.md` (commit `2fad0bc`).

**Worktree destino:** `.claude/worktrees/cerebro-v3-ola-1e/` en branch `chore/cerebro-v3-ola-1e-claude`.

---

## File Structure

### Created

```
supabase/migrations/
├── 20260528_ola1e_knowledge_base.sql       # tablas + RLS + triggers
└── 20260528_ola1e_search_chunks_hybrid.sql # función SQL

scripts/cerebro-v3/
├── sources.config.json                     # catálogo de fuentes
├── ingest-rules.mjs                        # CLI entrypoint
├── smoke-rag.mjs                           # smoke test pre-merge
├── eval-rag-bench.mjs                      # banco de 20 preguntas
└── lib/
    ├── download-pdf.mjs
    ├── parse-structural.mjs
    ├── contextual-prefix.mjs
    ├── embed-openai.mjs
    └── upsert-supabase.mjs

src/golf/coach/v3/retrieval/
├── types.ts
├── embed-query.ts
├── hybrid-search.ts
├── contextual-rerank.ts
├── weighted-scoring.ts
├── query-logger.ts
├── index.ts
└── __tests__/
    ├── embed-query.test.ts
    ├── hybrid-search.test.ts
    ├── contextual-rerank.test.ts
    ├── weighted-scoring.test.ts
    ├── query-logger.test.ts
    └── search-knowledge-chunks.test.ts

src/app/api/admin/cerebro/sources/
├── route.ts                          # GET list, POST add
├── [slug]/route.ts                   # PATCH update
├── [slug]/reindex/route.ts           # POST enqueue
└── [slug]/chunks/route.ts            # GET sample

src/app/admin/cerebro/fuentes/
└── page.tsx                          # admin UI

src/__tests__/
├── canary-rag-retrieval.test.ts
└── integration/rag-pipeline-e2e.test.ts
```

### Modified

```
src/app/api/taiger/chat/route.ts        # registrar tool search_knowledge_chunks
src/golf/coach/v3/prompts/system.ts     # agregar sección RAG anti-hallucination
src/golf/coach/v3/llm-models.ts         # añadir 'reranker' role si aplica
vercel.json                              # memory: 3008 en functions del coach
package.json                             # @xenova/transformers
.env.local.example                       # documentar OPENAI_API_KEY + flags
```

---

## FASE A — Setup + Schema (Día 1)

### Task 1: Worktree dedicado + baseline verde

**Files:**
- N/A (setup ambiental)

- [ ] **Step 1: Crear worktree dedicado**

```bash
node scripts/setup-worktree.mjs cerebro-v3-ola-1e chore
```

Expected output: worktree creado en `.claude/worktrees/cerebro-v3-ola-1e/` en branch `chore/cerebro-v3-ola-1e-claude` desde `origin/main`. Script copia `.env.local`.

- [ ] **Step 2: Verificar baseline verde en el worktree**

```bash
cd .claude/worktrees/cerebro-v3-ola-1e
npx tsc --noEmit
npm test
npm run build
```

Expected: tsc 0 errores, ≥1800 tests pass, build OK. Si falla algo: fix antes de avanzar (no se trabaja sobre baseline rojo).

- [ ] **Step 3: Anchor commit empty**

```bash
git commit --allow-empty -m "chore(cerebro-v3): anchor Ola 1e — reglas oficiales RAG"
```

- [ ] **Step 4: Instalar dependencia transformers.js**

```bash
npm install @xenova/transformers
```

Expected: `package.json` updated, sin errores de install.

- [ ] **Step 5: Commit dependencia**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): @xenova/transformers para bge-reranker-v2-m3 ONNX local"
```

---

### Task 2: `sources.config.json` con verificación de URLs

**Files:**
- Create: `scripts/cerebro-v3/sources.config.json`
- Create: `scripts/cerebro-v3/verify-sources.mjs` (one-shot verificación URLs)

- [ ] **Step 1: Crear `scripts/cerebro-v3/sources.config.json`**

```json
[
  {
    "slug": "usga-rules-2023",
    "title": "Rules of Golf 2023-2026 Edition",
    "authors": ["USGA", "R&A"],
    "url_source": "https://www.usga.org/content/dam/usga/pdf/rules/2023-Rules-of-Golf.pdf",
    "block_key": "rules",
    "jurisdiction": "usga",
    "priority_rank": 100,
    "is_authoritative_for": ["rules_global", "rules_official"],
    "legal_basis": "public_domain_official_publication"
  },
  {
    "slug": "usga-clarifications",
    "title": "Clarifications to the Rules of Golf",
    "authors": ["USGA", "R&A"],
    "url_source": "https://www.usga.org/content/dam/usga/pdf/rules/Clarifications.pdf",
    "block_key": "rules",
    "jurisdiction": "usga",
    "priority_rank": 95,
    "is_authoritative_for": ["rules_clarification"],
    "legal_basis": "public_domain_official_publication"
  },
  {
    "slug": "usga-players-edition",
    "title": "Player's Edition of the Rules of Golf",
    "authors": ["USGA", "R&A"],
    "url_source": "https://www.usga.org/content/dam/usga/pdf/rules/players-edition.pdf",
    "block_key": "rules",
    "jurisdiction": "usga",
    "priority_rank": 80,
    "is_authoritative_for": [],
    "legal_basis": "public_domain_official_publication"
  },
  {
    "slug": "usga-committee-procedures",
    "title": "Committee Procedures (Local Rules Model)",
    "authors": ["USGA", "R&A"],
    "url_source": "https://www.usga.org/content/dam/usga/pdf/rules/committee-procedures.pdf",
    "block_key": "rules",
    "jurisdiction": "usga_committee",
    "priority_rank": 85,
    "is_authoritative_for": ["committee_procedures", "local_rules_model"],
    "legal_basis": "public_domain_official_publication"
  },
  {
    "slug": "whs-manual-2024",
    "title": "World Handicap System Manual 2024",
    "authors": ["USGA", "R&A"],
    "url_source": "https://www.usga.org/content/dam/usga/pdf/handicap/whs-manual.pdf",
    "block_key": "rules",
    "jurisdiction": "whs_global",
    "priority_rank": 90,
    "is_authoritative_for": ["handicap_global"],
    "legal_basis": "public_domain_official_publication"
  },
  {
    "slug": "fedegolf-chile-reglamento",
    "title": "Reglamento FedeGolf Chile",
    "authors": ["FedeGolf Chile"],
    "url_source": "https://fedegolfchile.cl/reglamento.pdf",
    "block_key": "rules",
    "jurisdiction": "fedegolf_chile",
    "priority_rank": 110,
    "is_authoritative_for": ["handicap_chile", "tournament_rules_chile"],
    "legal_basis": "public_official_publication"
  }
]
```

- [ ] **Step 2: Crear `scripts/cerebro-v3/verify-sources.mjs`**

```javascript
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const configPath = resolve('scripts/cerebro-v3/sources.config.json');
const sources = JSON.parse(await readFile(configPath, 'utf8'));

console.log(`Verifying ${sources.length} sources...\n`);
const results = [];
for (const s of sources) {
  try {
    const res = await fetch(s.url_source, { method: 'HEAD', redirect: 'follow' });
    const ok = res.ok && (res.headers.get('content-type')?.includes('pdf') || res.headers.get('content-length'));
    results.push({ slug: s.slug, status: res.status, ok });
    console.log(`${ok ? '✓' : '✗'} ${s.slug}  ${res.status}`);
  } catch (e) {
    results.push({ slug: s.slug, status: 'NETWORK_ERROR', ok: false, err: e.message });
    console.log(`✗ ${s.slug}  NETWORK_ERROR  ${e.message}`);
  }
}

const failed = results.filter(r => !r.ok);
if (failed.length) {
  console.log(`\n${failed.length}/${results.length} fuentes fallaron:`);
  failed.forEach(f => console.log(`  - ${f.slug}: ${f.status}`));
  process.exit(1);
}
console.log(`\n${results.length}/${results.length} URLs verificadas OK.`);
```

- [ ] **Step 3: Correr verify-sources**

```bash
node scripts/cerebro-v3/verify-sources.mjs
```

Expected: 5-6 URLs OK. Si `fedegolf-chile-reglamento` falla con 404, no es bloqueante — marcar manualmente `status='unavailable'` después de la migración y documentar en commit.

- [ ] **Step 4: Commit**

```bash
git add scripts/cerebro-v3/sources.config.json scripts/cerebro-v3/verify-sources.mjs
git commit -m "feat(cerebro-v3): sources.config.json con 6 fuentes oficiales + verify script"
```

---

### Task 3: Migration `knowledge_sources`

**Files:**
- Create: `supabase/migrations/20260528_ola1e_knowledge_sources.sql`
- Create: `src/__tests__/migrations/knowledge_sources.test.ts`

- [ ] **Step 1: Test failing — verificar tabla, RLS, índices, CHECK**

```typescript
// src/__tests__/migrations/knowledge_sources.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe('knowledge_sources schema', () => {
  it('tabla existe con todas las columnas esperadas', async () => {
    const { data, error } = await supabase
      .from('knowledge_sources')
      .select('id, slug, title, authors, url_source, block_key, jurisdiction, priority_rank, is_authoritative_for, legal_basis, source_hash, ingested_at, chunk_count, ingest_cost_usd, status, error_message')
      .limit(0);
    expect(error).toBeNull();
  });

  it('CHECK jurisdiction rechaza valores fuera del enum', async () => {
    const { error } = await supabase.from('knowledge_sources').insert({
      slug: 'test-invalid-jur',
      title: 'X', url_source: 'https://x', block_key: 'rules',
      jurisdiction: 'INVALID', legal_basis: 'x'
    });
    expect(error?.code).toMatch(/23514/); // CHECK violation
  });

  it('CHECK status rechaza valores fuera del enum', async () => {
    const { error } = await supabase.from('knowledge_sources').insert({
      slug: 'test-invalid-status',
      title: 'X', url_source: 'https://x', block_key: 'rules',
      jurisdiction: 'usga', legal_basis: 'x', status: 'WHATEVER'
    });
    expect(error?.code).toMatch(/23514/);
  });

  it('UNIQUE slug rechaza duplicados', async () => {
    await supabase.from('knowledge_sources').insert({
      slug: 'test-dup', title: 'X', url_source: 'https://x',
      block_key: 'rules', jurisdiction: 'usga', legal_basis: 'x'
    });
    const { error } = await supabase.from('knowledge_sources').insert({
      slug: 'test-dup', title: 'Y', url_source: 'https://y',
      block_key: 'rules', jurisdiction: 'usga', legal_basis: 'y'
    });
    expect(error?.code).toMatch(/23505/);
    await supabase.from('knowledge_sources').delete().eq('slug', 'test-dup');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (tabla no existe)**

```bash
npm test src/__tests__/migrations/knowledge_sources.test.ts
```

Expected: 4 tests FAIL with "relation knowledge_sources does not exist".

- [ ] **Step 3: Crear migración**

```sql
-- supabase/migrations/20260528_ola1e_knowledge_sources.sql
CREATE TABLE knowledge_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,
  title           text NOT NULL,
  authors         text[] NOT NULL DEFAULT '{}',
  url_source      text NOT NULL,
  url_local_pdf   text,
  block_key       text NOT NULL,
  jurisdiction    text NOT NULL CHECK (jurisdiction IN
                    ('usga','ra','whs_global','usga_committee','fedegolf_chile')),
  priority_rank   int NOT NULL DEFAULT 100,
  is_authoritative_for text[] NOT NULL DEFAULT '{}',
  legal_basis     text NOT NULL,
  source_hash     text,
  ingested_at     timestamptz,
  chunk_count     int NOT NULL DEFAULT 0,
  ingest_cost_usd numeric(8,4) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','ingesting','ready','stale','error','unavailable')),
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_sources_block ON knowledge_sources (block_key);
CREATE INDEX idx_knowledge_sources_jurisdiction ON knowledge_sources (jurisdiction);
CREATE INDEX idx_knowledge_sources_status ON knowledge_sources (status);

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_sources_read ON knowledge_sources FOR SELECT USING (true);
CREATE POLICY knowledge_sources_write ON knowledge_sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- reusa set_updated_at() si ya existe del proyecto; si no, crear:
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_knowledge_sources_updated_at
  BEFORE UPDATE ON knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 4: Aplicar migración a Supabase prod**

```bash
node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/20260528_ola1e_knowledge_sources.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX` (×3), `ALTER TABLE`, `CREATE POLICY` (×2), `CREATE FUNCTION`, `CREATE TRIGGER`. Sin errores.

- [ ] **Step 5: Re-run tests — expect PASS**

```bash
npm test src/__tests__/migrations/knowledge_sources.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260528_ola1e_knowledge_sources.sql src/__tests__/migrations/knowledge_sources.test.ts
git commit -m "feat(db): tabla knowledge_sources + RLS + tests TDD"
```

---

### Task 4: Migration `knowledge_chunks` con pgvector

**Files:**
- Create: `supabase/migrations/20260528_ola1e_knowledge_chunks.sql`
- Create: `src/__tests__/migrations/knowledge_chunks.test.ts`

- [ ] **Step 1: Test failing**

```typescript
// src/__tests__/migrations/knowledge_chunks.test.ts
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

describe('knowledge_chunks schema', () => {
  it('tabla existe con columnas y embedding vector(1536)', async () => {
    const { error } = await sb.from('knowledge_chunks').select(
      'id, source_id, block_key, breadcrumb, rule_anchor, content, contextual_prefix, content_for_embed, embedding, chunk_hash, page_start, page_end, token_count'
    ).limit(0);
    expect(error).toBeNull();
  });

  it('UNIQUE (source_id, chunk_hash) rechaza duplicados', async () => {
    // crear source
    const { data: src } = await sb.from('knowledge_sources').insert({
      slug: 'test-chunks-dup', title: 'X', url_source: 'https://x',
      block_key: 'rules', jurisdiction: 'usga', legal_basis: 'x'
    }).select().single();

    await sb.from('knowledge_chunks').insert({
      source_id: src!.id, block_key: 'rules', breadcrumb: 'Rule 1',
      content: 'x', content_for_embed: 'x', chunk_hash: 'abc', token_count: 1
    });
    const { error } = await sb.from('knowledge_chunks').insert({
      source_id: src!.id, block_key: 'rules', breadcrumb: 'Rule 1',
      content: 'y', content_for_embed: 'y', chunk_hash: 'abc', token_count: 1
    });
    expect(error?.code).toMatch(/23505/);
    await sb.from('knowledge_sources').delete().eq('id', src!.id);
  });

  it('ON DELETE CASCADE elimina chunks cuando se borra el source', async () => {
    const { data: src } = await sb.from('knowledge_sources').insert({
      slug: 'test-cascade', title: 'X', url_source: 'https://x',
      block_key: 'rules', jurisdiction: 'usga', legal_basis: 'x'
    }).select().single();

    await sb.from('knowledge_chunks').insert({
      source_id: src!.id, block_key: 'rules', breadcrumb: 'R',
      content: 'x', content_for_embed: 'x', chunk_hash: 'h1', token_count: 1
    });

    await sb.from('knowledge_sources').delete().eq('id', src!.id);

    const { data: orphans } = await sb.from('knowledge_chunks')
      .select('id').eq('source_id', src!.id);
    expect(orphans).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test src/__tests__/migrations/knowledge_chunks.test.ts
```

- [ ] **Step 3: Crear migración**

```sql
-- supabase/migrations/20260528_ola1e_knowledge_chunks.sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE knowledge_chunks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id           uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  block_key           text NOT NULL,
  breadcrumb          text NOT NULL,
  rule_anchor         text,
  content             text NOT NULL,
  contextual_prefix   text,
  content_for_embed   text NOT NULL,
  embedding           vector(1536),
  tsv                 tsvector GENERATED ALWAYS AS
                        (to_tsvector('english', coalesce(content,''))) STORED,
  chunk_hash          text NOT NULL,
  page_start          int,
  page_end            int,
  token_count         int NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, chunk_hash)
);

CREATE INDEX idx_knowledge_chunks_embedding
  ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX idx_knowledge_chunks_tsv ON knowledge_chunks USING gin (tsv);
CREATE INDEX idx_knowledge_chunks_source ON knowledge_chunks (source_id);
CREATE INDEX idx_knowledge_chunks_block ON knowledge_chunks (block_key);

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_chunks_read ON knowledge_chunks FOR SELECT USING (true);
CREATE POLICY knowledge_chunks_write ON knowledge_chunks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

- [ ] **Step 4: Aplicar a prod**

```bash
node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/20260528_ola1e_knowledge_chunks.sql
```

- [ ] **Step 5: Re-run tests — expect PASS**

```bash
npm test src/__tests__/migrations/knowledge_chunks.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260528_ola1e_knowledge_chunks.sql src/__tests__/migrations/knowledge_chunks.test.ts
git commit -m "feat(db): tabla knowledge_chunks con pgvector + tsvector + tests"
```

---

### Task 5: Migration `rag_query_log`

**Files:**
- Create: `supabase/migrations/20260528_ola1e_rag_query_log.sql`
- Create: `src/__tests__/migrations/rag_query_log.test.ts`

- [ ] **Step 1: Test failing — verificar columnas, RLS, índices**

```typescript
// src/__tests__/migrations/rag_query_log.test.ts
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

describe('rag_query_log schema', () => {
  it('tabla con columnas esperadas', async () => {
    const { error } = await sb.from('rag_query_log').select(
      'id, user_id, query, jurisdictions_filter, top_k_requested, hybrid_alpha, total_candidates, returned_count, top_score, bottom_score, cited_chunk_ids, latency_ms, cost_usd, embedding_model, reranker_model, error_code'
    ).limit(0);
    expect(error).toBeNull();
  });

  it('acepta insert con null en query_embedding y error_code', async () => {
    const { data, error } = await sb.from('rag_query_log').insert({
      query: 'test', top_k_requested: 5, hybrid_alpha: 0.7,
      total_candidates: 0, returned_count: 0, cited_chunk_ids: [],
      latency_ms: 100, cost_usd: 0.0001,
      embedding_model: 'text-embedding-3-small', reranker_model: 'bge-reranker-v2-m3'
    }).select().single();
    expect(error).toBeNull();
    expect(data?.error_code).toBeNull();
    await sb.from('rag_query_log').delete().eq('id', data!.id);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Crear migración** (idéntico al §3 del spec, sin reduplicar acá)

```sql
-- supabase/migrations/20260528_ola1e_rag_query_log.sql
CREATE TABLE rag_query_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  query                text NOT NULL,
  query_embedding      vector(1536),
  jurisdictions_filter text[],
  top_k_requested      int NOT NULL,
  hybrid_alpha         numeric(3,2) NOT NULL,
  total_candidates     int NOT NULL,
  returned_count       int NOT NULL,
  top_score            numeric(8,6),
  bottom_score         numeric(8,6),
  cited_chunk_ids      uuid[] NOT NULL,
  latency_ms           int NOT NULL,
  cost_usd             numeric(10,8) NOT NULL,
  embedding_model      text NOT NULL,
  reranker_model       text NOT NULL,
  error_code           text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rag_query_log_user ON rag_query_log (user_id);
CREATE INDEX idx_rag_query_log_created ON rag_query_log (created_at DESC);
CREATE INDEX idx_rag_query_log_errors ON rag_query_log (error_code) WHERE error_code IS NOT NULL;

ALTER TABLE rag_query_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY rag_query_log_user_read ON rag_query_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY rag_query_log_admin_all ON rag_query_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

- [ ] **Step 4: Aplicar + verificar test PASS**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528_ola1e_rag_query_log.sql src/__tests__/migrations/rag_query_log.test.ts
git commit -m "feat(db): tabla rag_query_log para observabilidad de retrieval"
```

---

### Task 6: Función SQL `search_chunks_hybrid`

**Files:**
- Create: `supabase/migrations/20260528_ola1e_search_chunks_hybrid.sql`
- Create: `src/__tests__/migrations/search_chunks_hybrid.test.ts`

- [ ] **Step 1: Test failing — RPC call**

```typescript
// src/__tests__/migrations/search_chunks_hybrid.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
let sourceId: string;

const fakeEmbedding = Array(1536).fill(0).map((_, i) => Math.sin(i) / 100);

beforeAll(async () => {
  const { data } = await sb.from('knowledge_sources').insert({
    slug: 'test-hybrid', title: 'Test', url_source: 'https://x',
    block_key: 'rules', jurisdiction: 'usga', legal_basis: 'x', status: 'ready'
  }).select().single();
  sourceId = data!.id;
  await sb.from('knowledge_chunks').insert([
    { source_id: sourceId, block_key: 'rules', breadcrumb: 'R1', content: 'free relief from cart path',
      content_for_embed: 'free relief from cart path', chunk_hash: 'h1', token_count: 6, embedding: fakeEmbedding },
    { source_id: sourceId, block_key: 'rules', breadcrumb: 'R2', content: 'water hazard penalty drop',
      content_for_embed: 'water hazard penalty drop', chunk_hash: 'h2', token_count: 5, embedding: fakeEmbedding },
  ]);
});

afterAll(async () => {
  await sb.from('knowledge_sources').delete().eq('id', sourceId);
});

describe('search_chunks_hybrid RPC', () => {
  it('devuelve chunks ordenados por final_score', async () => {
    const { data, error } = await sb.rpc('search_chunks_hybrid', {
      query_embedding: fakeEmbedding, query_text: 'cart path relief',
      alpha: 0.7, top_k: 5, jurisdictions: null, block_filter: 'rules'
    });
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('final_score');
    expect(data[0]).toHaveProperty('vec_score');
    expect(data[0]).toHaveProperty('bm25_score');
  });

  it('respeta filtro de block_filter', async () => {
    const { data } = await sb.rpc('search_chunks_hybrid', {
      query_embedding: fakeEmbedding, query_text: 'whatever',
      alpha: 0.7, top_k: 5, jurisdictions: null, block_filter: 'NONEXISTENT'
    });
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Crear función SQL**

```sql
-- supabase/migrations/20260528_ola1e_search_chunks_hybrid.sql
CREATE OR REPLACE FUNCTION search_chunks_hybrid(
  query_embedding vector(1536),
  query_text      text,
  alpha           numeric DEFAULT 0.7,
  top_k           int     DEFAULT 20,
  jurisdictions   text[]  DEFAULT NULL,
  block_filter    text    DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  source_id     uuid,
  breadcrumb    text,
  content       text,
  vec_score     numeric,
  bm25_score    numeric,
  final_score   numeric
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  WITH vec AS (
    SELECT c.id, (1 - (c.embedding <=> query_embedding))::numeric AS vs
    FROM knowledge_chunks c
    WHERE (block_filter IS NULL OR c.block_key = block_filter)
      AND (jurisdictions IS NULL OR EXISTS (
            SELECT 1 FROM knowledge_sources s
            WHERE s.id = c.source_id AND s.jurisdiction = ANY(jurisdictions)))
    ORDER BY c.embedding <=> query_embedding
    LIMIT 50
  ),
  bm AS (
    SELECT c.id, ts_rank_cd(c.tsv, plainto_tsquery('english', query_text))::numeric AS bs
    FROM knowledge_chunks c
    WHERE (block_filter IS NULL OR c.block_key = block_filter)
      AND c.tsv @@ plainto_tsquery('english', query_text)
    ORDER BY bs DESC
    LIMIT 50
  ),
  unioned AS (
    SELECT COALESCE(vec.id, bm.id) AS id,
           COALESCE(vec.vs, 0) AS vs,
           COALESCE(bm.bs, 0) AS bs
    FROM vec FULL OUTER JOIN bm ON vec.id = bm.id
  ),
  max_bm AS (SELECT GREATEST(MAX(bs), 0.001) AS m FROM unioned)
  SELECT c.id, c.source_id, c.breadcrumb, c.content,
         u.vs AS vec_score,
         (u.bs / mb.m)::numeric AS bm25_score,
         (alpha * u.vs + (1 - alpha) * (u.bs / mb.m))::numeric AS final_score
  FROM unioned u
  JOIN knowledge_chunks c ON c.id = u.id
  CROSS JOIN max_bm mb
  ORDER BY final_score DESC
  LIMIT top_k;
END;
$$;
```

- [ ] **Step 4: Aplicar + tests PASS**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528_ola1e_search_chunks_hybrid.sql src/__tests__/migrations/search_chunks_hybrid.test.ts
git commit -m "feat(db): RPC search_chunks_hybrid con scoring híbrido vector+BM25"
```

---

## FASE B — Pipeline de ingesta (Día 2)

### Task 7: `lib/download-pdf.mjs`

**Files:**
- Create: `scripts/cerebro-v3/lib/download-pdf.mjs`
- Create: `scripts/cerebro-v3/lib/__tests__/download-pdf.test.mjs`
- Create: `scripts/cerebro-v3/.cache/.gitkeep` (cache dir)

- [ ] **Step 1: Test failing**

```javascript
// scripts/cerebro-v3/lib/__tests__/download-pdf.test.mjs
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { downloadPdf, computeSha256 } from '../download-pdf.mjs';
import { rm, stat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CACHE_DIR = resolve('scripts/cerebro-v3/.cache/pdfs-test');

afterAll(async () => { await rm(CACHE_DIR, { recursive: true, force: true }); });

describe('downloadPdf', () => {
  it('descarga un PDF, calcula sha256, cachea', async () => {
    const url = 'https://www.usga.org/content/dam/usga/pdf/rules/2023-Rules-of-Golf.pdf';
    const { path, hash, fromCache } = await downloadPdf(url, { cacheDir: CACHE_DIR });
    expect(fromCache).toBe(false);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    const buf = await readFile(path);
    expect(buf.length).toBeGreaterThan(100_000); // PDF real
  }, 60_000);

  it('segunda llamada devuelve fromCache=true', async () => {
    const url = 'https://www.usga.org/content/dam/usga/pdf/rules/2023-Rules-of-Golf.pdf';
    const { fromCache } = await downloadPdf(url, { cacheDir: CACHE_DIR });
    expect(fromCache).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module no existe)

- [ ] **Step 3: Implementación**

```javascript
// scripts/cerebro-v3/lib/download-pdf.mjs
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

export function computeSha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function slugFromUrl(url) {
  return url.replace(/[^a-z0-9]+/gi, '_').slice(0, 80) + '.pdf';
}

export async function downloadPdf(url, opts = {}) {
  const cacheDir = opts.cacheDir ?? resolve('scripts/cerebro-v3/.cache/pdfs');
  await mkdir(cacheDir, { recursive: true });
  const filePath = join(cacheDir, slugFromUrl(url));

  try {
    const s = await stat(filePath);
    if (s.size > 0) {
      const buf = await readFile(filePath);
      return { path: filePath, hash: computeSha256(buf), fromCache: true };
    }
  } catch { /* cache miss */ }

  const maxRetries = 3;
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error('PDF too small');
      await writeFile(filePath, buf);
      return { path: filePath, hash: computeSha256(buf), fromCache: false };
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test scripts/cerebro-v3/lib/__tests__/download-pdf.test.mjs
```

- [ ] **Step 5: Commit + add cache dir a .gitignore**

```bash
echo "scripts/cerebro-v3/.cache/" >> .gitignore
git add scripts/cerebro-v3/lib/download-pdf.mjs scripts/cerebro-v3/lib/__tests__/download-pdf.test.mjs .gitignore
git commit -m "feat(cerebro-v3): download-pdf con sha256 + cache local + retry"
```

---

### Task 8: `lib/parse-structural.mjs`

**Files:**
- Create: `scripts/cerebro-v3/lib/parse-structural.mjs`
- Create: `scripts/cerebro-v3/lib/__tests__/parse-structural.test.mjs`
- Create: `scripts/cerebro-v3/lib/__tests__/fixtures/sample-rules.txt`

- [ ] **Step 1: Crear fixture sintético**

```
// scripts/cerebro-v3/lib/__tests__/fixtures/sample-rules.txt
Rule 1
General Provisions

1.1
Scope of the Rules
The Rules of Golf apply to playing golf...

1.1a
Authority of the Committee
The Committee has authority...

1.2
Standards of Player Conduct
Players must act with integrity...

Rule 2
The Course

2.1
Definitions
The course is the entire area...
```

- [ ] **Step 2: Test failing**

```javascript
// scripts/cerebro-v3/lib/__tests__/parse-structural.test.mjs
import { describe, it, expect } from 'vitest';
import { parseStructural } from '../parse-structural.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

describe('parseStructural', () => {
  it('extrae chunks con breadcrumb jerárquico', async () => {
    const text = await readFile(resolve('scripts/cerebro-v3/lib/__tests__/fixtures/sample-rules.txt'), 'utf8');
    const chunks = parseStructural(text, { docTitle: 'Test Rules' });

    expect(chunks.length).toBeGreaterThan(0);

    const rule1 = chunks.find(c => c.breadcrumb === 'Rule 1');
    expect(rule1).toBeDefined();

    const r11 = chunks.find(c => c.breadcrumb === 'Rule 1 > 1.1');
    expect(r11).toBeDefined();
    expect(r11.ruleAnchor).toBe('1.1');

    const r11a = chunks.find(c => c.breadcrumb === 'Rule 1 > 1.1 > 1.1a');
    expect(r11a).toBeDefined();
    expect(r11a.ruleAnchor).toBe('1.1a');
  });

  it('cada chunk tiene chunk_hash determinístico', () => {
    const text = 'Rule 1\nGeneral\n\n1.1\nScope\nThe Rules...';
    const c1 = parseStructural(text, { docTitle: 'T' });
    const c2 = parseStructural(text, { docTitle: 'T' });
    expect(c1.map(c => c.chunkHash)).toEqual(c2.map(c => c.chunkHash));
  });

  it('splittea chunks que exceden 800 tokens por párrafos', () => {
    const longContent = 'word '.repeat(900);
    const text = `Rule 1\nGeneral\n\n1.1\nScope\n${longContent}\n\nAnother paragraph here.`;
    const chunks = parseStructural(text, { docTitle: 'T' });
    const r11Chunks = chunks.filter(c => c.breadcrumb.startsWith('Rule 1 > 1.1'));
    expect(r11Chunks.length).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implementación**

```javascript
// scripts/cerebro-v3/lib/parse-structural.mjs
import { createHash } from 'node:crypto';

const RULE_RE = /^Rule (\d+)\s*$/m;
const SUBRULE_RE = /^(\d+)\.(\d+)\s*$/m;
const PARAGRAPH_RE = /^(\d+)\.(\d+)([a-z])\s*$/m;

const APPROX_TOKENS_PER_CHAR = 0.25; // ~4 chars/token
const MAX_TOKENS_PER_CHUNK = 800;

function estimateTokens(text) {
  return Math.ceil(text.length * APPROX_TOKENS_PER_CHAR);
}

function hashChunk(breadcrumb, content) {
  return createHash('sha256').update(`${breadcrumb}\n${content}`).digest('hex').slice(0, 16);
}

export function parseStructural(text, opts = {}) {
  const lines = text.split('\n');
  const chunks = [];
  let currentRule = null;
  let currentSub = null;
  let currentPara = null;
  let buffer = [];
  let titleBuffer = '';

  const flush = () => {
    const content = buffer.join('\n').trim();
    if (!content) { buffer = []; return; }
    const breadcrumb = currentPara
      ? `Rule ${currentRule} > ${currentSub} > ${currentPara}`
      : currentSub
        ? `Rule ${currentRule} > ${currentSub}`
        : currentRule
          ? `Rule ${currentRule}`
          : 'Preamble';
    const ruleAnchor = currentPara ?? currentSub ?? null;

    if (estimateTokens(content) <= MAX_TOKENS_PER_CHUNK) {
      chunks.push({ breadcrumb, ruleAnchor, content, chunkHash: hashChunk(breadcrumb, content), tokenCount: estimateTokens(content) });
    } else {
      // Split por párrafos (doble newline)
      const paragraphs = content.split(/\n\s*\n/);
      let acc = '';
      for (const p of paragraphs) {
        if (estimateTokens(acc + '\n\n' + p) > MAX_TOKENS_PER_CHUNK && acc) {
          chunks.push({ breadcrumb, ruleAnchor, content: acc.trim(), chunkHash: hashChunk(breadcrumb, acc), tokenCount: estimateTokens(acc) });
          acc = p;
        } else {
          acc = acc ? acc + '\n\n' + p : p;
        }
      }
      if (acc.trim()) {
        chunks.push({ breadcrumb, ruleAnchor, content: acc.trim(), chunkHash: hashChunk(breadcrumb, acc), tokenCount: estimateTokens(acc) });
      }
    }
    buffer = [];
  };

  for (const line of lines) {
    const ruleMatch = line.match(/^Rule (\d+)\s*$/);
    const paraMatch = line.match(/^(\d+)\.(\d+)([a-z])\s*$/);
    const subMatch = line.match(/^(\d+)\.(\d+)\s*$/);

    if (ruleMatch) {
      flush();
      currentRule = ruleMatch[1];
      currentSub = null;
      currentPara = null;
    } else if (paraMatch) {
      flush();
      currentRule = paraMatch[1];
      currentSub = `${paraMatch[1]}.${paraMatch[2]}`;
      currentPara = `${paraMatch[1]}.${paraMatch[2]}${paraMatch[3]}`;
    } else if (subMatch) {
      flush();
      currentRule = subMatch[1];
      currentSub = `${subMatch[1]}.${subMatch[2]}`;
      currentPara = null;
    } else {
      buffer.push(line);
    }
  }
  flush();

  return chunks;
}
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add scripts/cerebro-v3/lib/parse-structural.mjs scripts/cerebro-v3/lib/__tests__/parse-structural.test.mjs scripts/cerebro-v3/lib/__tests__/fixtures/sample-rules.txt
git commit -m "feat(cerebro-v3): parse-structural — PDF→chunks con breadcrumb USGA/R&A"
```

---

### Task 9: `lib/contextual-prefix.mjs`

**Files:**
- Create: `scripts/cerebro-v3/lib/contextual-prefix.mjs`
- Create: `scripts/cerebro-v3/lib/__tests__/contextual-prefix.test.mjs`

- [ ] **Step 1: Test failing (mock Anthropic)**

```javascript
// scripts/cerebro-v3/lib/__tests__/contextual-prefix.test.mjs
import { describe, it, expect, vi } from 'vitest';
import { generateContextualPrefix } from '../contextual-prefix.mjs';

describe('generateContextualPrefix', () => {
  it('llama Haiku con prompt esperado y retorna prefix', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'This chunk discusses cart path relief under Rule 16.' }],
      usage: { input_tokens: 50, output_tokens: 12 }
    });
    const fakeClient = { messages: { create: mockCreate } };

    const { prefix, costUsd } = await generateContextualPrefix(fakeClient, {
      docTitle: 'Rules of Golf 2023',
      breadcrumb: 'Rule 16 > 16.1',
      content: 'A player may take free relief...'
    });

    expect(prefix).toBe('This chunk discusses cart path relief under Rule 16.');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100
    }));
    expect(costUsd).toBeGreaterThan(0);
  });

  it('failure devuelve prefix vacío + costUsd=0', async () => {
    const fakeClient = { messages: { create: vi.fn().mockRejectedValue(new Error('rate limit')) } };
    const { prefix, costUsd, error } = await generateContextualPrefix(fakeClient, {
      docTitle: 'T', breadcrumb: 'B', content: 'C'
    });
    expect(prefix).toBe('');
    expect(costUsd).toBe(0);
    expect(error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implementación**

```javascript
// scripts/cerebro-v3/lib/contextual-prefix.mjs
const HAIKU_INPUT_COST_PER_M = 0.80;    // USD per 1M input tokens
const HAIKU_OUTPUT_COST_PER_M = 4.00;   // USD per 1M output tokens

const SYSTEM_PROMPT =
  'You generate a one-sentence contextual prefix that situates a document chunk within its parent document. The prefix is prepended to the chunk before embedding to improve retrieval accuracy. Output ONLY the prefix sentence, max 50 tokens, no preamble.';

export async function generateContextualPrefix(client, { docTitle, breadcrumb, content }) {
  const userMsg = `Document: ${docTitle}\nSection breadcrumb: ${breadcrumb}\nChunk content: ${content.slice(0, 2000)}`;
  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }]
    });
    const prefix = res.content?.[0]?.text?.trim() ?? '';
    const costUsd =
      (res.usage.input_tokens / 1_000_000) * HAIKU_INPUT_COST_PER_M +
      (res.usage.output_tokens / 1_000_000) * HAIKU_OUTPUT_COST_PER_M;
    return { prefix, costUsd, error: null };
  } catch (error) {
    return { prefix: '', costUsd: 0, error };
  }
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/cerebro-v3/lib/contextual-prefix.mjs scripts/cerebro-v3/lib/__tests__/contextual-prefix.test.mjs
git commit -m "feat(cerebro-v3): contextual-prefix via Haiku con fallback graceful"
```

---

### Task 10: `lib/embed-openai.mjs`

**Files:**
- Create: `scripts/cerebro-v3/lib/embed-openai.mjs`
- Create: `scripts/cerebro-v3/lib/__tests__/embed-openai.test.mjs`

- [ ] **Step 1: Test failing**

```javascript
// scripts/cerebro-v3/lib/__tests__/embed-openai.test.mjs
import { describe, it, expect, vi } from 'vitest';
import { embedBatch } from '../embed-openai.mjs';

describe('embedBatch', () => {
  it('llama OpenAI con batch de 100 max', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      data: Array(50).fill(null).map((_, i) => ({ embedding: Array(1536).fill(0.1), index: i })),
      usage: { total_tokens: 5000 }
    });
    const fakeClient = { embeddings: { create: mockCreate } };

    const texts = Array(50).fill('test content');
    const { embeddings, costUsd } = await embedBatch(fakeClient, texts);

    expect(embeddings.length).toBe(50);
    expect(embeddings[0].length).toBe(1536);
    expect(costUsd).toBeGreaterThan(0);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'text-embedding-3-small',
      input: texts
    }));
  });

  it('splittea batches > 100 en múltiples calls', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      data: Array(100).fill(null).map((_, i) => ({ embedding: Array(1536).fill(0.1), index: i })),
      usage: { total_tokens: 10000 }
    });
    const fakeClient = { embeddings: { create: mockCreate } };
    const texts = Array(150).fill('x');
    const { embeddings } = await embedBatch(fakeClient, texts);
    expect(embeddings.length).toBe(150);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implementación**

```javascript
// scripts/cerebro-v3/lib/embed-openai.mjs
const COST_PER_1K_TOKENS = 0.00002;
const MAX_BATCH = 100;

export async function embedBatch(client, texts, { model = 'text-embedding-3-small' } = {}) {
  const embeddings = [];
  let totalCost = 0;

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const slice = texts.slice(i, i + MAX_BATCH);
    let attempt = 0;
    let lastErr;
    while (attempt < 3) {
      try {
        const res = await client.embeddings.create({ model, input: slice });
        const sorted = res.data.sort((a, b) => a.index - b.index);
        embeddings.push(...sorted.map(d => d.embedding));
        totalCost += (res.usage.total_tokens / 1000) * COST_PER_1K_TOKENS;
        break;
      } catch (e) {
        lastErr = e;
        attempt++;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
    if (attempt === 3) throw lastErr;
  }

  return { embeddings, costUsd: totalCost };
}
```

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/cerebro-v3/lib/embed-openai.mjs scripts/cerebro-v3/lib/__tests__/embed-openai.test.mjs
git commit -m "feat(cerebro-v3): embed-openai batched + retry exponencial"
```

---

### Task 11: `lib/upsert-supabase.mjs`

**Files:**
- Create: `scripts/cerebro-v3/lib/upsert-supabase.mjs`
- Create: `scripts/cerebro-v3/lib/__tests__/upsert-supabase.test.mjs`

- [ ] **Step 1: Test failing**

```javascript
// scripts/cerebro-v3/lib/__tests__/upsert-supabase.test.mjs
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { upsertChunks } from '../upsert-supabase.mjs';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let sourceId;

beforeAll(async () => {
  const { data } = await sb.from('knowledge_sources').insert({
    slug: 'test-upsert', title: 'X', url_source: 'https://x',
    block_key: 'rules', jurisdiction: 'usga', legal_basis: 'x'
  }).select().single();
  sourceId = data.id;
});
afterAll(async () => { await sb.from('knowledge_sources').delete().eq('id', sourceId); });

describe('upsertChunks', () => {
  it('upsert idempotente — re-run no duplica', async () => {
    const chunks = [
      { breadcrumb: 'R1', ruleAnchor: '1', content: 'hello',
        contextualPrefix: 'ctx', contentForEmbed: 'ctx\n\nhello',
        chunkHash: 'h1', tokenCount: 2, embedding: Array(1536).fill(0.1) }
    ];
    await upsertChunks(sb, sourceId, 'rules', chunks);
    await upsertChunks(sb, sourceId, 'rules', chunks);
    const { count } = await sb.from('knowledge_chunks').select('*', { count: 'exact', head: true }).eq('source_id', sourceId);
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implementación**

```javascript
// scripts/cerebro-v3/lib/upsert-supabase.mjs
export async function upsertChunks(sb, sourceId, blockKey, chunks) {
  if (!chunks.length) return { inserted: 0 };
  const rows = chunks.map(c => ({
    source_id: sourceId,
    block_key: blockKey,
    breadcrumb: c.breadcrumb,
    rule_anchor: c.ruleAnchor ?? null,
    content: c.content,
    contextual_prefix: c.contextualPrefix ?? null,
    content_for_embed: c.contentForEmbed,
    embedding: c.embedding,
    chunk_hash: c.chunkHash,
    page_start: c.pageStart ?? null,
    page_end: c.pageEnd ?? null,
    token_count: c.tokenCount
  }));
  const { error } = await sb.from('knowledge_chunks').upsert(rows, {
    onConflict: 'source_id,chunk_hash',
    ignoreDuplicates: false
  });
  if (error) throw error;
  return { inserted: rows.length };
}
```

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/cerebro-v3/lib/upsert-supabase.mjs scripts/cerebro-v3/lib/__tests__/upsert-supabase.test.mjs
git commit -m "feat(cerebro-v3): upsert-supabase idempotente hash-based"
```

---

### Task 12: Orchestrator `ingest-rules.mjs` + CLI

**Files:**
- Create: `scripts/cerebro-v3/ingest-rules.mjs`
- Modify: `package.json` — agregar `pdf-parse` o `pdfjs-dist` para extraer texto del PDF

- [ ] **Step 1: Instalar `pdf-parse`**

```bash
npm install pdf-parse
```

- [ ] **Step 2: Crear orchestrator**

```javascript
// scripts/cerebro-v3/ingest-rules.mjs
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import { downloadPdf, computeSha256 } from './lib/download-pdf.mjs';
import { parseStructural } from './lib/parse-structural.mjs';
import { generateContextualPrefix } from './lib/contextual-prefix.mjs';
import { embedBatch } from './lib/embed-openai.mjs';
import { upsertChunks } from './lib/upsert-supabase.mjs';

const args = process.argv.slice(2);
const SLUG_FILTER = args.find(a => a.startsWith('--slug='))?.split('=')[1];
const ALL = args.includes('--all');
const DRY_RUN = args.includes('--dry-run');

if (!SLUG_FILTER && !ALL) {
  console.error('Usage: --all | --slug=<slug> [--dry-run]');
  process.exit(1);
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const config = JSON.parse(await readFile(resolve('scripts/cerebro-v3/sources.config.json'), 'utf8'));
const targets = SLUG_FILTER ? config.filter(c => c.slug === SLUG_FILTER) : config;

if (!targets.length) {
  console.error(`No matching sources for slug=${SLUG_FILTER}`);
  process.exit(1);
}

for (const src of targets) {
  console.log(`\n══ Ingesting ${src.slug} ══`);

  // Upsert source row
  let sourceRow;
  if (!DRY_RUN) {
    const { data } = await sb.from('knowledge_sources').upsert({
      slug: src.slug, title: src.title, authors: src.authors,
      url_source: src.url_source, block_key: src.block_key,
      jurisdiction: src.jurisdiction, priority_rank: src.priority_rank,
      is_authoritative_for: src.is_authoritative_for, legal_basis: src.legal_basis,
      status: 'ingesting'
    }, { onConflict: 'slug' }).select().single();
    sourceRow = data;
  }

  try {
    // 1. Download
    const { path, hash, fromCache } = await downloadPdf(src.url_source);
    console.log(`  ↓ Downloaded (${fromCache ? 'cache' : 'fresh'}) hash=${hash.slice(0,8)}`);

    // 2. Extract text
    const buf = await readFile(path);
    const parsed = await pdfParse(buf);

    // 3. Parse structural
    const chunks = parseStructural(parsed.text, { docTitle: src.title });
    console.log(`  ⊟ ${chunks.length} chunks parsed`);

    // 4. Contextual prefixes
    let prefixCost = 0;
    for (const c of chunks) {
      const { prefix, costUsd } = await generateContextualPrefix(anthropic, {
        docTitle: src.title, breadcrumb: c.breadcrumb, content: c.content
      });
      c.contextualPrefix = prefix;
      c.contentForEmbed = prefix ? `${prefix}\n\n${c.content}` : c.content;
      prefixCost += costUsd;
    }
    console.log(`  ✎ Contextual prefixes generated (${prefixCost.toFixed(4)} USD)`);

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] would embed ${chunks.length} chunks. Stopping.`);
      continue;
    }

    // 5. Embed
    const { embeddings, costUsd: embedCost } = await embedBatch(openai, chunks.map(c => c.contentForEmbed));
    chunks.forEach((c, i) => { c.embedding = embeddings[i]; });
    console.log(`  ⊡ Embeddings (${embedCost.toFixed(4)} USD)`);

    // 6. Upsert
    await upsertChunks(sb, sourceRow.id, src.block_key, chunks);
    console.log(`  ↑ Upserted ${chunks.length} chunks`);

    // 7. Mark ready
    await sb.from('knowledge_sources').update({
      status: 'ready',
      ingested_at: new Date().toISOString(),
      chunk_count: chunks.length,
      ingest_cost_usd: prefixCost + embedCost,
      source_hash: hash,
      error_message: null
    }).eq('id', sourceRow.id);
    console.log(`  ✓ Done. Total cost: ${(prefixCost + embedCost).toFixed(4)} USD`);

  } catch (e) {
    console.error(`  ✗ FAILED: ${e.message}`);
    if (!DRY_RUN && sourceRow) {
      await sb.from('knowledge_sources').update({
        status: 'error', error_message: e.message
      }).eq('id', sourceRow.id);
    }
  }
}

console.log('\n══ Done ══');
```

- [ ] **Step 3: Dry-run con 1 source para validar**

```bash
node --env-file=.env.local scripts/cerebro-v3/ingest-rules.mjs --slug=usga-rules-2023 --dry-run
```

Expected: download + parse + prefix (con costo logueado), STOP antes de embed/upsert. Sin errores.

- [ ] **Step 4: Commit (sin correr ingesta real — Task 25 hace eso)**

```bash
git add scripts/cerebro-v3/ingest-rules.mjs package.json package-lock.json
git commit -m "feat(cerebro-v3): orchestrator ingest-rules.mjs con dry-run + status tracking"
```

---

## FASE C — Retrieval engine (Día 3)

### Task 13: `retrieval/types.ts` + `retrieval/embed-query.ts`

**Files:**
- Create: `src/golf/coach/v3/retrieval/types.ts`
- Create: `src/golf/coach/v3/retrieval/embed-query.ts`
- Create: `src/golf/coach/v3/retrieval/__tests__/embed-query.test.ts`

- [ ] **Step 1: Crear types**

```typescript
// src/golf/coach/v3/retrieval/types.ts
export type Jurisdiction = 'usga' | 'ra' | 'whs_global' | 'usga_committee' | 'fedegolf_chile';

export interface SearchKnowledgeOptions {
  jurisdictions?: Jurisdiction[];
  blockKey?: string;
  topK?: number;
  topCandidates?: number;
  alpha?: number;
  userId?: string;
}

export interface ChunkCandidate {
  id: string;
  sourceId: string;
  breadcrumb: string;
  content: string;
  vecScore: number;
  bm25Score: number;
  hybridScore: number;
}

export interface RankedChunk {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceJurisdiction: Jurisdiction;
  breadcrumb: string;
  ruleAnchor: string | null;
  content: string;
  scores: {
    vec: number;
    bm25: number;
    hybrid: number;
    rerank: number;
    final: number;
  };
}
```

- [ ] **Step 2: Test failing para embed-query**

```typescript
// src/golf/coach/v3/retrieval/__tests__/embed-query.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { embedQuery, _resetCacheForTests } from '../embed-query';

describe('embedQuery', () => {
  beforeEach(() => _resetCacheForTests());

  it('cache miss → llama OpenAI', async () => {
    const fakeOpenAI = { embeddings: { create: vi.fn().mockResolvedValue({
      data: [{ embedding: Array(1536).fill(0.1), index: 0 }],
      usage: { total_tokens: 5 }
    }) } };
    const { embedding, fromCache } = await embedQuery('test query', { client: fakeOpenAI as any });
    expect(fromCache).toBe(false);
    expect(embedding.length).toBe(1536);
    expect(fakeOpenAI.embeddings.create).toHaveBeenCalledTimes(1);
  });

  it('cache hit → no llama OpenAI', async () => {
    const fakeOpenAI = { embeddings: { create: vi.fn().mockResolvedValue({
      data: [{ embedding: Array(1536).fill(0.1), index: 0 }],
      usage: { total_tokens: 5 }
    }) } };
    await embedQuery('same query', { client: fakeOpenAI as any });
    const { fromCache } = await embedQuery('same query', { client: fakeOpenAI as any });
    expect(fromCache).toBe(true);
    expect(fakeOpenAI.embeddings.create).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implementación con LRU**

```typescript
// src/golf/coach/v3/retrieval/embed-query.ts
import OpenAI from 'openai';
import { createHash } from 'node:crypto';

const CACHE_MAX = 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry { embedding: number[]; ts: number; }

const cache = new Map<string, CacheEntry>();
let sharedClient: OpenAI | null = null;

function hashKey(query: string): string {
  return createHash('sha256').update(query).digest('hex');
}

function pruneCache() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.ts > CACHE_TTL_MS) cache.delete(k);
  }
  while (cache.size > CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}

export function _resetCacheForTests() { cache.clear(); }

export interface EmbedQueryOpts {
  client?: OpenAI;
  model?: string;
}

export async function embedQuery(query: string, opts: EmbedQueryOpts = {}): Promise<{ embedding: number[]; fromCache: boolean }> {
  const key = hashKey(query);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts <= CACHE_TTL_MS) {
    return { embedding: hit.embedding, fromCache: true };
  }
  const client = opts.client ?? (sharedClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }));
  const res = await client.embeddings.create({
    model: opts.model ?? 'text-embedding-3-small',
    input: [query]
  });
  const embedding = res.data[0].embedding;
  cache.set(key, { embedding, ts: Date.now() });
  pruneCache();
  return { embedding, fromCache: false };
}
```

- [ ] **Step 5: Tests PASS**

- [ ] **Step 6: Commit**

```bash
git add src/golf/coach/v3/retrieval/types.ts src/golf/coach/v3/retrieval/embed-query.ts src/golf/coach/v3/retrieval/__tests__/embed-query.test.ts
git commit -m "feat(cerebro-v3): retrieval/types + embed-query con LRU cache TTL 10min"
```

---

### Task 14: `retrieval/hybrid-search.ts`

**Files:**
- Create: `src/golf/coach/v3/retrieval/hybrid-search.ts`
- Create: `src/golf/coach/v3/retrieval/__tests__/hybrid-search.test.ts`

- [ ] **Step 1: Test failing**

```typescript
// src/golf/coach/v3/retrieval/__tests__/hybrid-search.test.ts
import { describe, it, expect, vi } from 'vitest';
import { hybridSearch } from '../hybrid-search';

describe('hybridSearch', () => {
  it('llama RPC search_chunks_hybrid con args correctos', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: [
        { id: 'c1', source_id: 's1', breadcrumb: 'R1', content: 'x',
          vec_score: 0.9, bm25_score: 0.5, final_score: 0.78 }
      ],
      error: null
    });
    const fakeSb = { rpc: mockRpc };
    const candidates = await hybridSearch(fakeSb as any, Array(1536).fill(0.1), 'cart path', {
      alpha: 0.7, topCandidates: 20, jurisdictions: ['usga'], blockKey: 'rules'
    });
    expect(mockRpc).toHaveBeenCalledWith('search_chunks_hybrid', expect.objectContaining({
      alpha: 0.7, top_k: 20, jurisdictions: ['usga'], block_filter: 'rules'
    }));
    expect(candidates.length).toBe(1);
    expect(candidates[0].hybridScore).toBe(0.78);
  });

  it('error de RPC propaga la excepción', async () => {
    const fakeSb = { rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('rpc fail') }) };
    await expect(hybridSearch(fakeSb as any, Array(1536).fill(0), 'q', {})).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implementación**

```typescript
// src/golf/coach/v3/retrieval/hybrid-search.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChunkCandidate, Jurisdiction } from './types';

export interface HybridSearchOpts {
  alpha?: number;
  topCandidates?: number;
  jurisdictions?: Jurisdiction[];
  blockKey?: string;
}

export async function hybridSearch(
  sb: SupabaseClient,
  queryEmbedding: number[],
  queryText: string,
  opts: HybridSearchOpts = {}
): Promise<ChunkCandidate[]> {
  const { data, error } = await sb.rpc('search_chunks_hybrid', {
    query_embedding: queryEmbedding,
    query_text: queryText,
    alpha: opts.alpha ?? 0.7,
    top_k: opts.topCandidates ?? 20,
    jurisdictions: opts.jurisdictions ?? null,
    block_filter: opts.blockKey ?? null
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    sourceId: r.source_id,
    breadcrumb: r.breadcrumb,
    content: r.content,
    vecScore: Number(r.vec_score),
    bm25Score: Number(r.bm25_score),
    hybridScore: Number(r.final_score)
  }));
}
```

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/v3/retrieval/hybrid-search.ts src/golf/coach/v3/retrieval/__tests__/hybrid-search.test.ts
git commit -m "feat(cerebro-v3): hybrid-search wrapper de RPC con tipos tipados"
```

---

### Task 15: `retrieval/contextual-rerank.ts` con fallback

**Files:**
- Create: `src/golf/coach/v3/retrieval/contextual-rerank.ts`
- Create: `src/golf/coach/v3/retrieval/__tests__/contextual-rerank.test.ts`

- [ ] **Step 1: Test failing**

```typescript
// src/golf/coach/v3/retrieval/__tests__/contextual-rerank.test.ts
import { describe, it, expect, vi } from 'vitest';
import { contextualRerank, _setRerankerInstanceForTests } from '../contextual-rerank';
import type { ChunkCandidate } from '../types';

const fakeCandidates: ChunkCandidate[] = [
  { id: 'a', sourceId: 's', breadcrumb: 'R1', content: 'about water hazards', vecScore: 0.9, bm25Score: 0.5, hybridScore: 0.78 },
  { id: 'b', sourceId: 's', breadcrumb: 'R2', content: 'unrelated etiquette', vecScore: 0.4, bm25Score: 0.1, hybridScore: 0.3 }
];

describe('contextualRerank', () => {
  it('con modelo cargado, reordena por rerank score', async () => {
    _setRerankerInstanceForTests({
      async __call__(_args: any) { return [{ score: 0.95 }, { score: 0.1 }]; }
    } as any);
    const result = await contextualRerank(fakeCandidates, 'water rule', 2);
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('a');
    expect(result[0].rerankScore).toBeGreaterThan(result[1].rerankScore);
  });

  it('sin modelo cargado, fallback devuelve top-K del hybridScore', async () => {
    _setRerankerInstanceForTests(null);
    const result = await contextualRerank(fakeCandidates, 'water rule', 2);
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('a');
    expect(result[0].rerankAvailable).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implementación con lazy load + fallback**

```typescript
// src/golf/coach/v3/retrieval/contextual-rerank.ts
import type { ChunkCandidate } from './types';
import { captureError } from '@/lib/error-tracking';

let rerankerInstance: any = null;
let rerankerLoadAttempted = false;

export function _setRerankerInstanceForTests(instance: any) {
  rerankerInstance = instance;
  rerankerLoadAttempted = true;
}

async function loadReranker(): Promise<any> {
  if (rerankerInstance || rerankerLoadAttempted) return rerankerInstance;
  rerankerLoadAttempted = true;
  try {
    const { pipeline } = await import('@xenova/transformers');
    rerankerInstance = await pipeline('text-classification', 'Xenova/bge-reranker-v2-m3');
    return rerankerInstance;
  } catch (e) {
    captureError(e, { context: 'reranker-load-failed' });
    return null;
  }
}

export interface RerankedCandidate extends ChunkCandidate {
  rerankScore: number;
  rerankAvailable: boolean;
}

export async function contextualRerank(
  candidates: ChunkCandidate[],
  query: string,
  topK: number = 5
): Promise<RerankedCandidate[]> {
  if (!candidates.length) return [];
  const model = await loadReranker();
  if (!model) {
    return candidates
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, topK)
      .map(c => ({ ...c, rerankScore: c.hybridScore, rerankAvailable: false }));
  }
  try {
    const pairs = candidates.map(c => ({ text: query, text_pair: c.content }));
    const results = await model(pairs);
    const scored = candidates.map((c, i) => ({
      ...c,
      rerankScore: results[i].score,
      rerankAvailable: true
    }));
    return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topK);
  } catch (e) {
    captureError(e, { context: 'reranker-runtime-failed' });
    return candidates
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, topK)
      .map(c => ({ ...c, rerankScore: c.hybridScore, rerankAvailable: false }));
  }
}
```

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/v3/retrieval/contextual-rerank.ts src/golf/coach/v3/retrieval/__tests__/contextual-rerank.test.ts
git commit -m "feat(cerebro-v3): contextual-rerank con bge-reranker-v2-m3 + fallback graceful"
```

---

### Task 16: `retrieval/weighted-scoring.ts` + `retrieval/query-logger.ts`

**Files:**
- Create: `src/golf/coach/v3/retrieval/weighted-scoring.ts`
- Create: `src/golf/coach/v3/retrieval/query-logger.ts`
- Create: tests para ambos

- [ ] **Step 1: Tests failing**

```typescript
// src/golf/coach/v3/retrieval/__tests__/weighted-scoring.test.ts
import { describe, it, expect } from 'vitest';
import { applyBlockWeights } from '../weighted-scoring';

describe('applyBlockWeights', () => {
  it('multiplica rerank por block_weight', () => {
    const ranked = [{ id: 'a', rerankScore: 0.8, blockKey: 'rules' } as any];
    const result = applyBlockWeights(ranked, { rules: 0.1 });
    expect(result[0].finalScore).toBeCloseTo(0.08);
  });
  it('block sin peso → finalScore = rerankScore (peso 1.0)', () => {
    const ranked = [{ id: 'a', rerankScore: 0.8, blockKey: 'unknown' } as any];
    const result = applyBlockWeights(ranked, { rules: 0.1 });
    expect(result[0].finalScore).toBe(0.8);
  });
});

// src/golf/coach/v3/retrieval/__tests__/query-logger.test.ts
import { describe, it, expect, vi } from 'vitest';
import { logRagQuery } from '../query-logger';

describe('logRagQuery', () => {
  it('insert async, no await en caller', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sb = { from: () => ({ insert }) } as any;
    logRagQuery(sb, {
      query: 'x', topKRequested: 5, hybridAlpha: 0.7,
      totalCandidates: 10, returnedCount: 5, citedChunkIds: ['a'],
      latencyMs: 100, costUsd: 0.0001,
      embeddingModel: 'text-embedding-3-small', rerankerModel: 'bge-reranker-v2-m3'
    });
    await new Promise(r => setImmediate(r));
    expect(insert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implementación**

```typescript
// src/golf/coach/v3/retrieval/weighted-scoring.ts
import type { RankedChunk } from './types';

export function applyBlockWeights<T extends { rerankScore: number; blockKey?: string }>(
  ranked: T[],
  weights: Record<string, number>
): Array<T & { finalScore: number }> {
  return ranked.map(r => {
    const w = r.blockKey && weights[r.blockKey] != null ? weights[r.blockKey] : 1.0;
    return { ...r, finalScore: r.rerankScore * w };
  });
}
```

```typescript
// src/golf/coach/v3/retrieval/query-logger.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { captureError } from '@/lib/error-tracking';

export interface RagLogPayload {
  userId?: string;
  query: string;
  jurisdictionsFilter?: string[];
  topKRequested: number;
  hybridAlpha: number;
  totalCandidates: number;
  returnedCount: number;
  topScore?: number;
  bottomScore?: number;
  citedChunkIds: string[];
  latencyMs: number;
  costUsd: number;
  embeddingModel: string;
  rerankerModel: string;
  errorCode?: string;
}

export function logRagQuery(sb: SupabaseClient, p: RagLogPayload): void {
  sb.from('rag_query_log').insert({
    user_id: p.userId ?? null,
    query: p.query,
    jurisdictions_filter: p.jurisdictionsFilter ?? null,
    top_k_requested: p.topKRequested,
    hybrid_alpha: p.hybridAlpha,
    total_candidates: p.totalCandidates,
    returned_count: p.returnedCount,
    top_score: p.topScore ?? null,
    bottom_score: p.bottomScore ?? null,
    cited_chunk_ids: p.citedChunkIds,
    latency_ms: p.latencyMs,
    cost_usd: p.costUsd,
    embedding_model: p.embeddingModel,
    reranker_model: p.rerankerModel,
    error_code: p.errorCode ?? null
  }).then(({ error }) => {
    if (error) captureError(error, { context: 'rag-query-log-insert-failed' });
  });
}
```

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/v3/retrieval/weighted-scoring.ts src/golf/coach/v3/retrieval/query-logger.ts src/golf/coach/v3/retrieval/__tests__/weighted-scoring.test.ts src/golf/coach/v3/retrieval/__tests__/query-logger.test.ts
git commit -m "feat(cerebro-v3): weighted-scoring + query-logger fire-and-forget"
```

---

### Task 17: `retrieval/index.ts` — `searchKnowledgeChunks` orchestrator

**Files:**
- Create: `src/golf/coach/v3/retrieval/index.ts`
- Create: `src/golf/coach/v3/retrieval/__tests__/search-knowledge-chunks.test.ts`

- [ ] **Step 1: Test failing — end-to-end con mocks**

```typescript
// src/golf/coach/v3/retrieval/__tests__/search-knowledge-chunks.test.ts
import { describe, it, expect, vi } from 'vitest';
import { searchKnowledgeChunks, _setDepsForTests } from '../index';

describe('searchKnowledgeChunks', () => {
  it('happy path: embed → hybrid → rerank → hydrate → log', async () => {
    const fakeEmbedQuery = vi.fn().mockResolvedValue({ embedding: Array(1536).fill(0.1), fromCache: false });
    const fakeHybrid = vi.fn().mockResolvedValue([
      { id: 'c1', sourceId: 's1', breadcrumb: 'R1', content: 'water hazard', vecScore: 0.9, bm25Score: 0.5, hybridScore: 0.78 }
    ]);
    const fakeRerank = vi.fn().mockImplementation(async (cands) => cands.map((c: any) => ({ ...c, rerankScore: 0.95, rerankAvailable: true })));
    const fakeSb = {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      from: () => ({
        select: () => ({ in: () => ({ then: (r: any) => r({ data: [{ id: 's1', title: 'USGA Rules', jurisdiction: 'usga' }] }) }) }),
        insert: vi.fn().mockResolvedValue({ error: null })
      })
    };
    _setDepsForTests({ sb: fakeSb as any, embedQueryFn: fakeEmbedQuery, hybridSearchFn: fakeHybrid as any, contextualRerankFn: fakeRerank as any });

    const result = await searchKnowledgeChunks('what is a water hazard?', { topK: 5 });
    expect(result.length).toBe(1);
    expect(result[0].sourceTitle).toBe('USGA Rules');
    expect(result[0].scores.rerank).toBe(0.95);
  });

  it('error_code=no_results cuando no hay candidates', async () => {
    const fakeEmbedQuery = vi.fn().mockResolvedValue({ embedding: Array(1536).fill(0.1), fromCache: false });
    const fakeHybrid = vi.fn().mockResolvedValue([]);
    const fakeRerank = vi.fn();
    const insert = vi.fn().mockResolvedValue({ error: null });
    const fakeSb = { rpc: vi.fn(), from: () => ({ insert }) };
    _setDepsForTests({ sb: fakeSb as any, embedQueryFn: fakeEmbedQuery, hybridSearchFn: fakeHybrid as any, contextualRerankFn: fakeRerank as any });

    const result = await searchKnowledgeChunks('asdfgh nonsense', { topK: 5 });
    expect(result).toEqual([]);
    await new Promise(r => setImmediate(r));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ error_code: 'no_results' }));
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implementación**

```typescript
// src/golf/coach/v3/retrieval/index.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { embedQuery } from './embed-query';
import { hybridSearch } from './hybrid-search';
import { contextualRerank } from './contextual-rerank';
import { logRagQuery } from './query-logger';
import type { SearchKnowledgeOptions, RankedChunk, Jurisdiction } from './types';

const EMBED_COST_PER_1K = 0.00002;

let sharedSb: SupabaseClient | null = null;
let embedQueryFn = embedQuery;
let hybridSearchFn = hybridSearch;
let contextualRerankFn = contextualRerank;

export function _setDepsForTests(deps: Partial<{ sb: SupabaseClient; embedQueryFn: any; hybridSearchFn: any; contextualRerankFn: any }>) {
  if (deps.sb !== undefined) sharedSb = deps.sb;
  if (deps.embedQueryFn) embedQueryFn = deps.embedQueryFn;
  if (deps.hybridSearchFn) hybridSearchFn = deps.hybridSearchFn;
  if (deps.contextualRerankFn) contextualRerankFn = deps.contextualRerankFn;
}

function getSb(): SupabaseClient {
  if (sharedSb) return sharedSb;
  sharedSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return sharedSb;
}

export async function searchKnowledgeChunks(
  query: string,
  opts: SearchKnowledgeOptions = {}
): Promise<RankedChunk[]> {
  const sb = getSb();
  const start = Date.now();
  const topK = opts.topK ?? 5;
  const topCandidates = opts.topCandidates ?? 20;
  const alpha = opts.alpha ?? 0.7;
  let totalCost = 0;
  let errorCode: string | undefined;

  try {
    const { embedding } = await embedQueryFn(query);
    totalCost += EMBED_COST_PER_1K * (query.length / 4) / 1000;

    const candidates = await hybridSearchFn(sb, embedding, query, {
      alpha, topCandidates, jurisdictions: opts.jurisdictions, blockKey: opts.blockKey ?? 'rules'
    });

    if (!candidates.length) {
      errorCode = 'no_results';
      logRagQuery(sb, {
        userId: opts.userId, query, jurisdictionsFilter: opts.jurisdictions,
        topKRequested: topK, hybridAlpha: alpha, totalCandidates: 0, returnedCount: 0,
        citedChunkIds: [], latencyMs: Date.now() - start, costUsd: totalCost,
        embeddingModel: 'text-embedding-3-small', rerankerModel: 'bge-reranker-v2-m3',
        errorCode
      });
      return [];
    }

    const reranked = await contextualRerankFn(candidates, query, topK);

    // Hydrate sources
    const sourceIds = Array.from(new Set(reranked.map(r => r.sourceId)));
    const { data: sources } = await sb.from('knowledge_sources').select('id, title, jurisdiction').in('id', sourceIds);
    const srcMap = new Map((sources ?? []).map(s => [s.id, s]));

    const result: RankedChunk[] = reranked.map(r => {
      const src = srcMap.get(r.sourceId);
      return {
        id: r.id,
        sourceId: r.sourceId,
        sourceTitle: src?.title ?? 'Unknown',
        sourceJurisdiction: (src?.jurisdiction ?? 'usga') as Jurisdiction,
        breadcrumb: r.breadcrumb,
        ruleAnchor: null,
        content: r.content,
        scores: {
          vec: r.vecScore, bm25: r.bm25Score, hybrid: r.hybridScore,
          rerank: r.rerankScore, final: r.rerankScore
        }
      };
    });

    logRagQuery(sb, {
      userId: opts.userId, query, jurisdictionsFilter: opts.jurisdictions,
      topKRequested: topK, hybridAlpha: alpha,
      totalCandidates: candidates.length, returnedCount: result.length,
      topScore: result[0]?.scores.final, bottomScore: result[result.length - 1]?.scores.final,
      citedChunkIds: result.map(r => r.id),
      latencyMs: Date.now() - start, costUsd: totalCost,
      embeddingModel: 'text-embedding-3-small', rerankerModel: 'bge-reranker-v2-m3'
    });

    return result;
  } catch (e) {
    errorCode = 'pipeline_error';
    logRagQuery(sb, {
      userId: opts.userId, query, topKRequested: topK, hybridAlpha: alpha,
      totalCandidates: 0, returnedCount: 0, citedChunkIds: [],
      latencyMs: Date.now() - start, costUsd: totalCost,
      embeddingModel: 'text-embedding-3-small', rerankerModel: 'bge-reranker-v2-m3',
      errorCode
    });
    throw e;
  }
}

export type { RankedChunk, SearchKnowledgeOptions, Jurisdiction } from './types';
```

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/v3/retrieval/index.ts src/golf/coach/v3/retrieval/__tests__/search-knowledge-chunks.test.ts
git commit -m "feat(cerebro-v3): searchKnowledgeChunks orchestrator end-to-end + DI para tests"
```

---

## FASE D — Coach integration (Día 3-4)

### Task 18: Tool definition + system prompt extension

**Files:**
- Create: `src/golf/coach/v3/tools/search-knowledge-chunks-tool.ts`
- Create: `src/golf/coach/v3/prompts/sections/rag.ts`
- Modify: `src/golf/coach/v3/prompts/system.ts` (importar sección RAG)
- Create: tests

- [ ] **Step 1: Test failing**

```typescript
// src/golf/coach/v3/tools/__tests__/search-knowledge-chunks-tool.test.ts
import { describe, it, expect } from 'vitest';
import { SEARCH_KNOWLEDGE_TOOL } from '../search-knowledge-chunks-tool';

describe('SEARCH_KNOWLEDGE_TOOL', () => {
  it('schema válido Anthropic', () => {
    expect(SEARCH_KNOWLEDGE_TOOL.name).toBe('search_knowledge_chunks');
    expect(SEARCH_KNOWLEDGE_TOOL.input_schema.required).toContain('query');
    const enumVals = SEARCH_KNOWLEDGE_TOOL.input_schema.properties.jurisdictions.items.enum;
    expect(enumVals).toContain('usga');
    expect(enumVals).toContain('fedegolf_chile');
  });
});

// src/golf/coach/v3/prompts/sections/__tests__/rag.test.ts
import { describe, it, expect } from 'vitest';
import { RAG_SECTION } from '../rag';

describe('RAG_SECTION', () => {
  it('incluye anti-hallucination contract', () => {
    expect(RAG_SECTION).toContain('search_knowledge_chunks');
    expect(RAG_SECTION).toContain('No encontré una regla específica');
    expect(RAG_SECTION).toContain('https://www.usga.org/rules.html');
    expect(RAG_SECTION).toContain('FedeGolf Chile');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implementación**

```typescript
// src/golf/coach/v3/tools/search-knowledge-chunks-tool.ts
import type Anthropic from '@anthropic-ai/sdk';

export const SEARCH_KNOWLEDGE_TOOL: Anthropic.Tool = {
  name: 'search_knowledge_chunks',
  description:
    'Search the official golf rules and regulations corpus (USGA, R&A, WHS, FedeGolf Chile). ' +
    'Use this WHENEVER the user asks about a specific rule, handicap calculation, penalty, drop, ' +
    'relief, or any other official ruling. Returns relevant chunks with breadcrumb citations.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language query in Spanish or English.' },
      jurisdictions: {
        type: 'array',
        items: { type: 'string', enum: ['usga','ra','whs_global','usga_committee','fedegolf_chile'] },
        description: 'Optional filter. Omit for all sources. Use ["fedegolf_chile"] for Chile-specific tournament rules.'
      }
    },
    required: ['query']
  }
};
```

```typescript
// src/golf/coach/v3/prompts/sections/rag.ts
export const RAG_SECTION = `
═══════════════════════════════════════════════════════════════
GOLF RULES & REGULATIONS (RAG)
═══════════════════════════════════════════════════════════════
You have access to a tool \`search_knowledge_chunks\` that searches
the official golf rules corpus: Rules of Golf 2023, Clarifications,
WHS Manual 2024, Committee Procedures, and FedeGolf Chile reglamento.

USE THIS TOOL WHENEVER the user asks about:
  • A specific rule ("¿puedo levantar mi bola si...?")
  • A handicap calculation question
  • Penalties, drops, free relief, hazards, water, OB
  • Local rules / tournament rules
  • Etiquette and pace of play

DO NOT invent rule numbers or wording. If search_knowledge_chunks
returns FEWER than 2 chunks with final_score > 0.4, respond:
  "No encontré una regla específica en mis fuentes oficiales para
   esto. Te recomiendo consultar la Rules of Golf app oficial
   USGA/R&A: https://www.usga.org/rules.html"

CITATION FORMAT: \`[Regla 8.1b — USGA Rules of Golf 2023]\`

CONFLICT RESOLUTION: If two sources contradict (e.g. USGA vs
FedeGolf Chile), name BOTH explicitly and recommend the FedeGolf
adaptation for Chilean tournaments. Example:
  "USGA Rule 18.2b dice X. FedeGolf Chile adapta esto con Y
   para torneos locales en Chile. Para tu torneo aplica Y."

NEVER answer rule questions without first calling the tool.
`;
```

```typescript
// src/golf/coach/v3/prompts/system.ts — modificar para importar RAG_SECTION
import { RAG_SECTION } from './sections/rag';
// ... composición existente del system prompt ...
export function buildSystemPrompt(opts: {...}): string {
  return [
    BASE_IDENTITY,
    // ... otras secciones existentes
    RAG_SECTION,
  ].join('\n\n');
}
```

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/v3/tools/search-knowledge-chunks-tool.ts src/golf/coach/v3/prompts/sections/rag.ts src/golf/coach/v3/tools/__tests__ src/golf/coach/v3/prompts/sections/__tests__ src/golf/coach/v3/prompts/system.ts
git commit -m "feat(cerebro-v3): tool definition + RAG section en system prompt v3"
```

---

### Task 19: Integration en `/api/taiger/chat/route.ts`

**Files:**
- Modify: `src/app/api/taiger/chat/route.ts`
- Create: `src/app/api/taiger/chat/__tests__/tool-search-knowledge.test.ts`

- [ ] **Step 1: Test failing — verifica que el handler procesa tool_use de search_knowledge_chunks**

```typescript
// src/app/api/taiger/chat/__tests__/tool-search-knowledge.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleToolUse } from '../route'; // export helper for tests

describe('handleToolUse search_knowledge_chunks', () => {
  it('llama searchKnowledgeChunks y devuelve formato tool_result', async () => {
    vi.mock('@/golf/coach/v3/retrieval', () => ({
      searchKnowledgeChunks: vi.fn().mockResolvedValue([
        { id: 'c1', sourceTitle: 'USGA Rules', sourceJurisdiction: 'usga', breadcrumb: 'R 18.2b', content: 'penalty for OB...', scores: { final: 0.92 } }
      ])
    }));
    const result = await handleToolUse({
      tool_use_id: 'tu1',
      name: 'search_knowledge_chunks',
      input: { query: 'OB rule' }
    }, { userId: 'user-123' });
    expect(result.tool_use_id).toBe('tu1');
    expect(JSON.parse(result.content)).toHaveProperty('chunks');
  });
});
```

- [ ] **Step 2: Modificar `route.ts` — registrar tool y exportar `handleToolUse`**

(Edit relevante a `src/app/api/taiger/chat/route.ts`, sumando el tool al array `tools` del request Anthropic y agregando un handler de `tool_use` blocks.)

```typescript
// dentro de route.ts (cambios principales)
import { SEARCH_KNOWLEDGE_TOOL } from '@/golf/coach/v3/tools/search-knowledge-chunks-tool';
import { searchKnowledgeChunks } from '@/golf/coach/v3/retrieval';

// helper exportado para tests:
export async function handleToolUse(block: { tool_use_id: string; name: string; input: any }, ctx: { userId?: string }) {
  if (block.name === 'search_knowledge_chunks') {
    const chunks = await searchKnowledgeChunks(block.input.query, {
      jurisdictions: block.input.jurisdictions,
      userId: ctx.userId,
      topK: 5
    });
    return {
      type: 'tool_result',
      tool_use_id: block.tool_use_id,
      content: JSON.stringify({ chunks })
    };
  }
  return null;
}

// en el handler principal:
const cerebroV3Enabled = await checkCerebroV3Flag(userId);
const tools = cerebroV3Enabled ? [SEARCH_KNOWLEDGE_TOOL] : [];

const res = await anthropic.messages.create({
  model: ..., system: ..., messages: ..., tools, max_tokens: 4096
});

// loop tool_use:
while (res.stop_reason === 'tool_use') {
  const toolBlocks = res.content.filter(b => b.type === 'tool_use');
  const toolResults = await Promise.all(toolBlocks.map(b => handleToolUse(b, { userId })));
  // re-invocar con tool_results en messages...
}
```

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Commit**

```bash
git add src/app/api/taiger/chat/route.ts src/app/api/taiger/chat/__tests__/tool-search-knowledge.test.ts
git commit -m "feat(cerebro-v3): integrar tool search_knowledge_chunks en /api/taiger/chat con feature flag"
```

---

### Task 20: Anti-hallucination smoke test

**Files:**
- Create: `scripts/cerebro-v3/smoke-rag.mjs`

- [ ] **Step 1: Crear smoke script**

```javascript
// scripts/cerebro-v3/smoke-rag.mjs
import { searchKnowledgeChunks } from '../../src/golf/coach/v3/retrieval/index.ts';

const RULE_QUERIES = [
  { q: 'puedo limpiar mi bola en el rough', expectChunks: true },
  { q: 'cuál es la penalidad por fuera de límites', expectChunks: true },
  { q: 'puedo tomar alivio gratuito de un cart path', expectChunks: true },
  { q: 'cómo se calcula el handicap diferencial', expectChunks: true },
  { q: 'qué pasa si pierdo una bola en agua', expectChunks: true },
  // hasta 20 queries
];

const NONSENSE_QUERIES = [
  'cuál es el secreto del swing perfecto según Tiger Woods',
  'qué dijo Jack Nicklaus en el British Open de 1986',
  'cuál es la mejor marca de bola',
  'asdfgh nonsense lkjhg',
  'recetas para cocinar después de jugar golf',
];

let pass = 0, fail = 0;

for (const { q, expectChunks } of RULE_QUERIES) {
  const result = await searchKnowledgeChunks(q, { topK: 5 });
  const ok = expectChunks ? result.length >= 2 && result[0].scores.final > 0.4 : true;
  console.log(`${ok ? '✓' : '✗'} ${q}  (${result.length} chunks, top=${result[0]?.scores.final?.toFixed(2) ?? '-'})`);
  ok ? pass++ : fail++;
}

console.log('\n--- Anti-hallucination (espera 0 chunks o disclaimer) ---');
for (const q of NONSENSE_QUERIES) {
  const result = await searchKnowledgeChunks(q, { topK: 5 });
  const above = result.filter(r => r.scores.final > 0.4);
  const ok = above.length < 2; // anti-hallucination trigger
  console.log(`${ok ? '✓' : '✗'} ${q}  (${above.length} chunks above 0.4)`);
  ok ? pass++ : fail++;
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: Commit (corre después de ingesta)**

```bash
git add scripts/cerebro-v3/smoke-rag.mjs
git commit -m "feat(cerebro-v3): smoke-rag.mjs — banco 20 queries + 5 anti-hallucination"
```

---

## FASE E — Admin UI (Día 4)

### Task 21: Endpoints REST `/api/admin/cerebro/sources`

**Files:**
- Create: `src/app/api/admin/cerebro/sources/route.ts` (GET list, POST add)
- Create: tests

- [ ] **Step 1: Test failing**

```typescript
// src/app/api/admin/cerebro/sources/__tests__/route.test.ts
import { describe, it, expect } from 'vitest';
import { GET, POST } from '../route';

// Mock admin auth + supabase
describe('GET /api/admin/cerebro/sources', () => {
  it('rechaza sin auth admin', async () => {
    const req = new Request('http://x/api/admin/cerebro/sources');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('200 + lista con auth válido', async () => {
    // setup mock con admin user...
    // ... (depende del patrón existente en /admin/cerebro/pesos)
  });
});
```

- [ ] **Step 2: Implementación**

```typescript
// src/app/api/admin/cerebro/sources/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/cerebro/admin-auth'; // ya existe en Ola 0

export async function GET(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb.from('knowledge_sources').select('*').order('priority_rank', { ascending: false });
  return NextResponse.json({ sources: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await sb.from('knowledge_sources').insert({
    slug: body.slug, title: body.title, authors: body.authors ?? [],
    url_source: body.url_source, block_key: body.block_key,
    jurisdiction: body.jurisdiction, priority_rank: body.priority_rank ?? 100,
    is_authoritative_for: body.is_authoritative_for ?? [],
    legal_basis: body.legal_basis ?? 'unknown', status: 'pending'
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ source: data });
}
```

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/cerebro/sources/route.ts src/app/api/admin/cerebro/sources/__tests__
git commit -m "feat(cerebro-v3): endpoints GET/POST /api/admin/cerebro/sources con admin auth"
```

---

### Task 22: Endpoints `[slug]/reindex` + `[slug]/chunks`

**Files:**
- Create: `src/app/api/admin/cerebro/sources/[slug]/route.ts` (PATCH)
- Create: `src/app/api/admin/cerebro/sources/[slug]/reindex/route.ts` (POST)
- Create: `src/app/api/admin/cerebro/sources/[slug]/chunks/route.ts` (GET)

- [ ] **Step 1: PATCH `[slug]/route.ts`**

```typescript
// src/app/api/admin/cerebro/sources/[slug]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/cerebro/admin-auth';

const ALLOWED_FIELDS = ['priority_rank', 'status', 'is_authoritative_for', 'legal_basis'];

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const update: Record<string, unknown> = {};
  for (const k of ALLOWED_FIELDS) if (k in body) update[k] = body[k];
  if (!Object.keys(update).length) return NextResponse.json({ error: 'no fields' }, { status: 400 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await sb.from('knowledge_sources').update(update).eq('slug', params.slug).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ source: data });
}
```

- [ ] **Step 2: POST `[slug]/reindex/route.ts`**

```typescript
// src/app/api/admin/cerebro/sources/[slug]/reindex/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/cerebro/admin-auth';

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { error } = await sb.from('knowledge_sources')
    .update({ status: 'ingesting', error_message: null })
    .eq('slug', params.slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // En 1e: solo marca status. Cron real conectado en sub-ola posterior con Vercel Queues.
  return NextResponse.json({ enqueued: true, slug: params.slug });
}
```

- [ ] **Step 3: GET `[slug]/chunks/route.ts`**

```typescript
// src/app/api/admin/cerebro/sources/[slug]/chunks/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/cerebro/admin-auth';

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: source } = await sb.from('knowledge_sources').select('id').eq('slug', params.slug).single();
  if (!source) return NextResponse.json({ error: 'source not found' }, { status: 404 });

  const { data: chunks } = await sb.from('knowledge_chunks')
    .select('id, breadcrumb, content, rule_anchor, token_count')
    .eq('source_id', source.id)
    .limit(10);

  const preview = (chunks ?? []).map(c => ({
    ...c,
    content: c.content.slice(0, 200) + (c.content.length > 200 ? '...' : '')
  }));
  return NextResponse.json({ chunks: preview });
}
```

- [ ] **Step 4: Tests siguen el patrón de Task 21 (mock admin auth, verificar 401 sin auth, 200 con auth válido)**

```typescript
// src/app/api/admin/cerebro/sources/[slug]/__tests__/route.test.ts (PATCH)
import { describe, it, expect } from 'vitest';
import { PATCH } from '../route';

describe('PATCH /api/admin/cerebro/sources/[slug]', () => {
  it('rechaza sin auth', async () => {
    const req = new Request('http://x/api/admin/cerebro/sources/test', {
      method: 'PATCH', body: JSON.stringify({ priority_rank: 200 })
    });
    const res = await PATCH(req, { params: { slug: 'test' } });
    expect(res.status).toBe(401);
  });
});
```

Crear tests análogos para reindex y chunks routes.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/cerebro/sources/[slug]
git commit -m "feat(cerebro-v3): endpoints PATCH/reindex/chunks por slug + tests"
```

---

### Task 23: Page `/admin/cerebro/fuentes`

**Files:**
- Create: `src/app/admin/cerebro/fuentes/page.tsx`
- Create: e2e test `e2e/admin-cerebro-fuentes.spec.ts`

- [ ] **Step 1: Página con tabla + acciones**

```typescript
// src/app/admin/cerebro/fuentes/page.tsx
'use client';
import { useEffect, useState } from 'react';

interface Source {
  id: string; slug: string; title: string; block_key: string; jurisdiction: string;
  status: string; chunk_count: number; ingested_at: string | null; ingest_cost_usd: number;
}

export default function FuentesAdminPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/cerebro/sources').then(r => r.json()).then(d => {
      setSources(d.sources ?? []);
      setLoading(false);
    });
  }, []);

  async function reindex(slug: string) {
    await fetch(`/api/admin/cerebro/sources/${slug}/reindex`, { method: 'POST' });
    location.reload();
  }

  if (loading) return <div className="p-6">Cargando...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl mb-4">Fuentes de conocimiento — Cerebro V3</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th>Slug</th><th>Title</th><th>Block</th><th>Jurisdiction</th>
            <th>Status</th><th>Chunks</th><th>Cost (USD)</th><th>Last ingest</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sources.map(s => (
            <tr key={s.id} className="border-b">
              <td>{s.slug}</td>
              <td>{s.title}</td>
              <td>{s.block_key}</td>
              <td>{s.jurisdiction}</td>
              <td><span className={`px-2 py-1 rounded text-xs ${s.status === 'ready' ? 'bg-green-200' : s.status === 'error' ? 'bg-red-200' : 'bg-gray-200'}`}>{s.status}</span></td>
              <td>{s.chunk_count}</td>
              <td>${Number(s.ingest_cost_usd).toFixed(4)}</td>
              <td>{s.ingested_at ? new Date(s.ingested_at).toLocaleString() : '—'}</td>
              <td>
                <button onClick={() => reindex(s.slug)} className="text-blue-600 underline">Reindex</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: e2e smoke test**

```typescript
// e2e/admin-cerebro-fuentes.spec.ts
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/admin';

test('admin ve fuentes ingestadas', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/cerebro/fuentes');
  await expect(page.getByRole('heading', { name: /Fuentes de conocimiento/ })).toBeVisible();
  await expect(page.locator('table')).toBeVisible();
});
```

- [ ] **Step 3: tsc + tests + commit**

```bash
npx tsc --noEmit && npm test
git add src/app/admin/cerebro/fuentes/page.tsx e2e/admin-cerebro-fuentes.spec.ts
git commit -m "feat(cerebro-v3): /admin/cerebro/fuentes con tabla + reindex"
```

---

## FASE F — Ingestion run + validation (Día 5)

### Task 24: Banco de pruebas `eval-rag-bench.mjs`

**Files:**
- Create: `scripts/cerebro-v3/eval-rag-bench.mjs`
- Create: `scripts/cerebro-v3/eval-rag-bench.queries.json`

- [ ] **Step 1: Definir 20 queries con expected_chunk_ids opcionales (después de la ingesta)**

```json
// scripts/cerebro-v3/eval-rag-bench.queries.json
[
  { "id": "q01", "query": "puedo limpiar mi bola en el rough", "expect_topic": "rule_14_lifting_cleaning" },
  { "id": "q02", "query": "cuál es la penalidad por fuera de límites", "expect_topic": "rule_18_OB" },
  { "id": "q03", "query": "tomar alivio gratuito de un cart path", "expect_topic": "rule_16_abnormal" },
  { "id": "q04", "query": "cómo se calcula el handicap diferencial", "expect_topic": "whs_differential" },
  { "id": "q05", "query": "qué pasa si pierdo una bola en agua", "expect_topic": "rule_17_penalty_areas" },
  { "id": "q06", "query": "puedo cambiar la bola entre hoyos", "expect_topic": "rule_4_equipment" },
  { "id": "q07", "query": "qué hago si mi bola cae en bunker", "expect_topic": "rule_12_bunkers" },
  { "id": "q08", "query": "puedo mover una piedra cerca de mi bola", "expect_topic": "rule_15_loose_impediments" },
  { "id": "q09", "query": "regla de obstrucción inamovible", "expect_topic": "rule_16_immovable_obstruction" },
  { "id": "q10", "query": "qué pasa si mi swing toca arena en el bunker", "expect_topic": "rule_12_grounding_club" },
  { "id": "q11", "query": "máximo de palos en la bolsa", "expect_topic": "rule_4_14_clubs" },
  { "id": "q12", "query": "puedo recibir consejos durante el juego", "expect_topic": "rule_10_advice" },
  { "id": "q13", "query": "qué es el match play", "expect_topic": "rule_3_match_play" },
  { "id": "q14", "query": "cuándo se actualiza mi handicap WHS", "expect_topic": "whs_revision" },
  { "id": "q15", "query": "regla del out of bounds", "expect_topic": "rule_18_OB" },
  { "id": "q16", "query": "agua casual qué es", "expect_topic": "rule_16_temporary_water" },
  { "id": "q17", "query": "puedo identificar mi bola en juego", "expect_topic": "rule_7_identification" },
  { "id": "q18", "query": "qué hago con una bola embebida", "expect_topic": "rule_16_embedded" },
  { "id": "q19", "query": "puedo dropear una bola desde el hombro", "expect_topic": "rule_14_drop_height_knee" },
  { "id": "q20", "query": "qué pasa si juego con un palo no conforme", "expect_topic": "rule_4_nonconforming" }
]
```

- [ ] **Step 2: Script**

```javascript
// scripts/cerebro-v3/eval-rag-bench.mjs
import { readFile } from 'node:fs/promises';
import { searchKnowledgeChunks } from '../../src/golf/coach/v3/retrieval/index.ts';

const queries = JSON.parse(await readFile('scripts/cerebro-v3/eval-rag-bench.queries.json', 'utf8'));

let pass = 0, fail = 0;
const results = [];

for (const { id, query, expect_topic } of queries) {
  const chunks = await searchKnowledgeChunks(query, { topK: 5 });
  const ok = chunks.length >= 2 && chunks[0].scores.final > 0.4;
  ok ? pass++ : fail++;
  results.push({ id, query, ok, topScore: chunks[0]?.scores.final, top1: chunks[0]?.breadcrumb });
  console.log(`${ok ? '✓' : '✗'} ${id}  ${query}  top=${chunks[0]?.scores.final?.toFixed(2)}  (${chunks[0]?.breadcrumb})`);
}

console.log(`\n${pass}/${pass + fail} (${(pass*100/(pass+fail)).toFixed(1)}%) PASS`);
const passRate = pass / (pass + fail);
if (passRate < 0.9) {
  console.error(`Gate FAILED: ${passRate * 100}% < 90% requirement`);
  process.exit(1);
}
```

- [ ] **Step 3: Commit (corre en Task 26)**

```bash
git add scripts/cerebro-v3/eval-rag-bench.mjs scripts/cerebro-v3/eval-rag-bench.queries.json
git commit -m "feat(cerebro-v3): eval-rag-bench — 20 queries de regresión"
```

---

### Task 25: Correr ingesta real all sources

**Files:** N/A (operación de datos)

- [ ] **Step 1: Verificar fuentes accesibles**

```bash
node scripts/cerebro-v3/verify-sources.mjs
```

Si FedeGolf falla: marcar manualmente `status='unavailable'` después.

- [ ] **Step 2: Dry-run completo**

```bash
node --env-file=.env.local scripts/cerebro-v3/ingest-rules.mjs --all --dry-run
```

Expected: parses + prefixes generados, sin upserts. Costo estimado mostrado.

- [ ] **Step 3: Ingesta real**

```bash
node --env-file=.env.local scripts/cerebro-v3/ingest-rules.mjs --all
```

Expected: 5-6 fuentes con `status='ready'`, ≥8000 chunks totales, costo total <$2 USD.

- [ ] **Step 4: Si FedeGolf falla**

```sql
UPDATE knowledge_sources
SET status='unavailable', error_message='URL not publicly accessible at ingest time'
WHERE slug='fedegolf-chile-reglamento';
```

Via run-sql.mjs.

- [ ] **Step 5: Verificar tabla**

```bash
node --env-file=.env.local scripts/check-knowledge.mjs # script ad-hoc o psql
```

Expected: SELECT count(*) FROM knowledge_chunks → 8000+. SELECT count(*), status FROM knowledge_sources GROUP BY status → ready: 5-6.

- [ ] **Step 6: Sin commit (operación de datos prod). Anotar en doc de la sesión.**

---

### Task 26: Correr smoke + banco de pruebas

- [ ] **Step 1: Smoke RAG**

```bash
node --env-file=.env.local scripts/cerebro-v3/smoke-rag.mjs
```

Expected: ≥90% pass (20 queries + 5 anti-hallucination).

- [ ] **Step 2: Banco de pruebas**

```bash
node --env-file=.env.local scripts/cerebro-v3/eval-rag-bench.mjs
```

Expected: ≥18/20 pass.

- [ ] **Step 3: Si falla**: capturar query, agregar al fixture de tests, ajustar parser/embedding/alpha y re-ingerir.

- [ ] **Step 4: Documentar resultado en SPRINT_LOG y commitear**

```bash
git add docs/SPRINT_LOG.md
git commit -m "docs(sprint-log): Ola 1e ingest results + bench score"
```

---

### Task 27: Skill custom `golf-rules-official` con book-to-skill

**Files:**
- Create: `~/.claude/skills/golf-rules-official/SKILL.md` y archivos asociados

- [ ] **Step 1: Invocar book-to-skill via Skill tool**

```
Skill({
  skill: "book-to-skill",
  args: "input=scripts/cerebro-v3/.cache/pdfs/usga_rules_2023.pdf output=~/.claude/skills/golf-rules-official name='Golf Rules Official' description='USGA/R&A Rules of Golf 2023 reference for development queries'"
})
```

(Si book-to-skill no soporta múltiples docs en un solo run, se invoca una vez por PDF y se mergea el contenido manualmente en un único SKILL.md.)

- [ ] **Step 2: Verificar skill instalada**

```bash
ls ~/.claude/skills/golf-rules-official/
cat ~/.claude/skills/golf-rules-official/SKILL.md | head -30
```

Expected: `SKILL.md` con frontmatter `name`, `description`, `metadata`, contenido extraído de los PDFs.

- [ ] **Step 3: Smoke test invocando la skill desde Claude Code**

Hacer una query de prueba en una sesión nueva: "según la regla 18.2, ¿qué pasa con una bola perdida?" — la skill debería aparecer como invocable.

- [ ] **Step 4: Documentar en docs/cerebro-v3-estado.md que el skill existe**

```bash
# en main
git add docs/cerebro-v3-estado.md
git commit -m "docs(cerebro-v3): skill golf-rules-official disponible para dev queries"
```

(El skill vive en `~/.claude/`, no se commitea al repo del proyecto.)

---

## FASE G — Close (Día 5)

### Task 28: Code review por `superpowers:code-reviewer`

- [ ] **Step 1: Dispatch agent**

```
Agent({
  description: "Code review sub-ola 1e cerebro v3",
  subagent_type: "superpowers:code-reviewer",
  prompt: "Review the diff of branch chore/cerebro-v3-ola-1e-claude against origin/main. Focus: RLS policies, anti-hallucination contract, retrieval engine fallbacks, cost tracking accuracy, observabilidad de errores. Return pass/fail with severity (critical/important/minor)."
})
```

- [ ] **Step 2: Aplicar findings críticos + importantes**

Cada finding crítico bloquea merge. Importantes se resuelven o documentan explícitamente.

- [ ] **Step 3: Commits separados por categoría**

```bash
git commit -m "fix(review): resolver críticos del code-reviewer agent — <descripción>"
git commit -m "fix(review): resolver importantes del code-reviewer agent — <descripción>"
```

---

### Task 29: `/pre-push` + demo en vivo + PR + merge

- [ ] **Step 1: /pre-push completo**

```bash
# Skill custom del proyecto
/pre-push
```

Expected: tsc 0, npm test 1800+ pass, build OK, health check pass, smoke pass.

- [ ] **Step 2: Push + abrir PR**

```bash
git push origin chore/cerebro-v3-ola-1e-claude
gh pr create --title "feat(cerebro-v3): sub-ola 1e — reglas oficiales en knowledge_chunks" --body "$(cat <<'EOF'
## Summary
- Ingesta de reglas oficiales USGA/R&A/WHS/FedeGolf en `knowledge_chunks` con pgvector + tsvector.
- Pipeline build-time con contextual retrieval + hybrid search + bge-reranker-v2-m3 local.
- Tool call `search_knowledge_chunks` integrado al coach v3 (feature flag).
- Admin UI `/admin/cerebro/fuentes` con re-indexado manual.
- Anti-hallucination contract estricto + observabilidad completa via `rag_query_log`.

## Test plan
- [ ] tsc 0, npm test 1800+, build OK.
- [ ] Ingesta de 5-6 fuentes con status='ready' y ≥8000 chunks.
- [ ] Banco de pruebas: ≥18/20 queries con cita correcta.
- [ ] Smoke anti-hallucination: 5/5 disclaimers correctos.
- [ ] Demo en vivo con Juanjo.
- [ ] Code review por superpowers:code-reviewer: 0 críticos sin resolver.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Demo en vivo con Juanjo**

Pantalla compartida:
1. Abrir `/admin/cerebro/fuentes` → mostrar 5-6 fuentes con status ready.
2. Abrir coach del usuario, preguntar "¿puedo tomar alivio gratuito de un cart path?" → ver cita.
3. Preguntar algo no-rule "¿cómo está el clima hoy?" → ver que NO invoca el tool.
4. Preguntar regla específica en español con jerga chilena → ver que cita FedeGolf si aplica.
5. Mostrar `rag_query_log` en BD con las queries logueadas.

- [ ] **Step 4: Merge**

```bash
gh pr merge <PR#> --squash --delete-branch
```

- [ ] **Step 5: Update `docs/cerebro-v3-estado.md`**

Cerrar sub-ola 1e, apuntar próximo paso a sub-ola 1b.

- [ ] **Step 6: Commit doc en main + push**

```bash
# en main, no en worktree
git checkout main
git pull
# editar docs/cerebro-v3-estado.md
git add docs/cerebro-v3-estado.md
git commit -m "docs(cerebro-v3): cierre Ola 1e — reglas oficiales en RAG (PR #<n>)"
git push origin main
```

---

## Self-review checklist

**Spec coverage:**
- ✅ §2 arquitectura 5 capas — Tasks 3-6 (schema), 7-12 (pipeline), 13-17 (retrieval), 18-19 (coach), 21-23 (admin UI).
- ✅ §3 schema BD — Tasks 3-6.
- ✅ §4 pipeline ingesta — Tasks 7-12 + 25.
- ✅ §5 retrieval engine — Tasks 13-17.
- ✅ §6 integración coach — Tasks 18-19.
- ✅ §7 admin UI — Tasks 21-23.
- ✅ §8 observabilidad — Task 5 (rag_query_log) + Task 16 (logger) + Task 23 (admin UI).
- ✅ §9 testing — Tests en cada task + Task 24 banco + Task 26 smoke.
- ✅ §10 anti-hallucination — Tasks 18 (prompt) + 20 (smoke) + 26 (verificación).
- ✅ §11 skill custom — Task 27.
- ✅ §12 costos — Tracking en Tasks 9, 10, 12.
- ✅ §13 riesgos — Mitigaciones en Tasks 15 (rerank fallback), 25 (FedeGolf no disponible), 7 (download retry).
- ✅ §14 criterios éxito — Task 29 (gates).

**Placeholder scan:** ningún "TBD" / "TODO" en el plan.

**Type consistency:**
- `ChunkCandidate` definido en Task 13, usado en Tasks 14, 15.
- `RankedChunk` definido en Task 13, usado en Task 17.
- `searchKnowledgeChunks` definido en Task 17, usado en Tasks 19, 20, 24.
- `SEARCH_KNOWLEDGE_TOOL` definido en Task 18, usado en Task 19.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-28-cerebro-v3-ola-1e.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
