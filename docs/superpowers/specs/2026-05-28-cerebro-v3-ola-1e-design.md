# Cerebro V3 — Sub-Ola 1e: Reglas Oficiales en `knowledge_chunks`

**Estado:** diseño aprobado, listo para plan de implementación.
**Autor:** Claude (CTO) — sesión 2026-05-28.
**Sub-ola padre:** Ola 1 — "El coach estudia el mundo" del spec maestro `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md`.
**Duración estimada:** 5 días.
**Costo one-time:** ~$1.02 USD.
**Branch destino:** `chore/cerebro-v3-ola-1e-claude` (worktree dedicado).

---

## 0. Contexto y motivación

Sub-ola 1e ingiere las **reglas oficiales del golf** en una base RAG vectorial accesible al coach v3 vía tool call. Es la primera sub-ola de Ola 1 ("El coach estudia el mundo") por tres razones:

1. **Dataset acotado, conocido y autocontenido.** PDFs USGA/R&A/WHS/FedeGolf — texto estructurado, sin scraping de terceros, sin ambigüedad legal.
2. **Valida la infra RAG completa antes de escalar.** Si las 3 capas (hybrid + contextual + rerank) funcionan acá, después se escalan a 1a–1d con confianza.
3. **Reglas oficiales son zero-tolerance a hallucination.** Si el coach inventa una regla, le arruina el día a un jugador. Es el dominio ideal para validar el contrato anti-hallucination que después se aplica a todo cerebro v3.

Esta sub-ola merge a `main` como su propio PR con demo en vivo, code review, y merge gateado.

---

## 1. Alcance

### Dentro

- 6 fuentes oficiales ingestadas: Rules of Golf 2023, Clarifications, Player's Edition, Committee/Local Rules Model, WHS Manual 2024, FedeGolf Chile reglamento local (si está públicamente disponible — si no, se documenta y se posterga sin bloquear).
- Schema BD nuevo: `knowledge_sources`, `knowledge_chunks`, `rag_query_log`.
- Pipeline de ingesta `scripts/cerebro-v3/ingest-rules.mjs` build-time + idempotente.
- Retrieval engine completo: hybrid search + contextual retrieval + re-ranking + weighted scoring.
- Tool call `search_knowledge_chunks` integrado al coach v3 con anti-hallucination contract.
- Admin UI `/admin/cerebro/fuentes` con re-indexado manual.
- Skill custom `golf-rules-official` generada con book-to-skill, para uso de Claude/dev (no del coach del usuario).
- Observabilidad completa: `rag_query_log`, métricas en admin, alertas Sentry.
- Tests unitarios + integración + canarios + smoke anti-hallucination.

### Fuera (queda para sub-olas posteriores)

- Scraping de pgatour.com / ESPN / Sports Reference → sub-ola 1a.
- Distribuciones USGA/R&A reports + Course DB → sub-ola 1b.
- Decade blog + Broadie papers + podcasts → sub-ola 1c.
- Rotella / Nilsson / Parent / McCabe / Valiante → sub-ola 1d.
- Re-ingesta automática vía cron mensual → se evalúa post-1e.
- Fine-tuning de embeddings sobre corpus golf → V3+ (memoria `feedback_taiger_no_book_to_skill_v1`).

---

## 2. Arquitectura — 5 capas

```
┌─────────────────────────────────────────────────────────────┐
│  Coach v3 (LLM Claude) — invoca tool call                  │
│  search_knowledge_chunks(query, jurisdictions?, top_k?)    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Capa 4 — Retrieval Engine                                 │
│  src/golf/coach/v3/retrieval/                              │
│  • hybrid-search.ts    (vector + BM25, α = 0.7)            │
│  • contextual-rerank.ts (bge-reranker-v2-m3, top-20→top-5) │
│  • weighted-scoring.ts  (block_weight × score)             │
│  • query-logger.ts      (rag_query_log inserts)            │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Capa 3 — Postgres (Supabase)                              │
│  • knowledge_sources       (catálogo + jurisdicción)        │
│  • knowledge_chunks        (pgvector + tsvector + breadcrumb)│
│  • rag_query_log           (telemetría retrieval)           │
└──────────────────────────────▲──────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────┐
│  Capa 2 — Pipeline de Ingesta                              │
│  scripts/cerebro-v3/ingest-rules.mjs                       │
│  • download-pdf      (curl + hash + cache local)            │
│  • parse-structural  (Rule → Sub-rule → Paragraph)          │
│  • contextual-prefix (Haiku genera contexto por chunk)      │
│  • embed-openai      (text-embedding-3-small, batch 100)    │
│  • upsert-supabase   (hash-based dedup)                     │
└──────────────────────────────▲──────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────┐
│  Capa 1 — Admin UI                                          │
│  /admin/cerebro/fuentes                                     │
│  • Tabla con fuentes ingestadas + estado + costo            │
│  • Botón "Re-indexar" por fuente (encola ingest job)        │
│  • Botón "Agregar fuente" (URL + jurisdicción + dominio)    │
└──────────────────────────────────────────────────────────────┘
```

### Resolución de jurisdicción / inconsistencias

`knowledge_sources` modela jurisdicción + prioridad para que el coach pueda resolver conflictos entre fuentes:

- `jurisdiction` enum: `usga`, `ra`, `whs_global`, `usga_committee`, `fedegolf_chile`.
- `priority_rank` int: en conflicto, gana el mayor.
- `is_authoritative_for` text[]: dominios donde esa fuente manda (ej. `fedegolf_chile` autoritativo para `handicap_chile`, `usga` autoritativo para `rules_global`).

Si dos chunks devuelven respuestas contradictorias para la misma query, el coach las nombra explícitamente: *"USGA Rule 18.2b dice X. FedeGolf Chile adapta esto con Y para torneos locales. Para tu caso aplica Y."*

---

## 3. Schema de base de datos

### Migración `YYYYMMDD_ola1e_knowledge_base.sql`

```sql
-- ════════════════════════════════════════════════════════════════
-- knowledge_sources: catálogo de fuentes externas
-- ════════════════════════════════════════════════════════════════
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

-- Trigger updated_at
CREATE TRIGGER trg_knowledge_sources_updated_at
  BEFORE UPDATE ON knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- knowledge_chunks: chunks vectorizados + búsqueda híbrida
-- ════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════
-- rag_query_log: observabilidad de retrieval
-- ════════════════════════════════════════════════════════════════
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

### Función SQL de hybrid search

```sql
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

---

## 4. Pipeline de ingesta

### Estructura

```
scripts/cerebro-v3/
├── ingest-rules.mjs              # entry point
├── sources.config.json           # catálogo declarativo
└── lib/
    ├── download-pdf.mjs          # curl + sha256 + retry + cache local en .cache/pdfs/
    ├── parse-structural.mjs      # PDF → chunks estructurales
    ├── contextual-prefix.mjs     # Haiku genera prefix por chunk
    ├── embed-openai.mjs          # text-embedding-3-small batched
    └── upsert-supabase.mjs       # idempotente, hash-based
```

### Comando

```bash
# Ingiere todas las fuentes definidas en sources.config.json:
node --env-file=.env.local scripts/cerebro-v3/ingest-rules.mjs --all

# Re-indexa una fuente específica:
node --env-file=.env.local scripts/cerebro-v3/ingest-rules.mjs --slug=usga-rules-2023

# Dry run (parse + chunk + cost estimate, sin BD writes):
node --env-file=.env.local scripts/cerebro-v3/ingest-rules.mjs --slug=usga-rules-2023 --dry-run
```

### Variables de entorno requeridas (.env.local)

| Variable | Uso |
|---|---|
| `OPENAI_API_KEY` | Embeddings text-embedding-3-small |
| `ANTHROPIC_API_KEY` | Haiku para contextual prefixes |
| `SUPABASE_URL` | Cliente Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS para upserts en knowledge_* |

### `sources.config.json`

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

> **Nota legal:** las URLs de los PDFs FedeGolf Chile pueden cambiar; se valida disponibilidad al inicio de la sub-ola. Si no son públicos, esa entrada se marca `status='unavailable'` y se posterga sin bloquear la sub-ola.

### Parser estructural

Regex multiline para detectar jerarquía Rule → Sub-rule → Paragraph en PDFs USGA/R&A:

- `^Rule (\d+)$` → abre chunk de nivel 1.
- `^(\d+)\.(\d+)\s` → abre sub-rule de nivel 2.
- `^(\d+)\.(\d+)([a-z])\s` → abre paragraph de nivel 3.

Cada chunk preserva su breadcrumb (`Rule 8 > 8.1 > 8.1b`). Si un chunk excede 800 tokens (raro en reglas), se split por párrafos preservando breadcrumb compartido. Tests con fixtures PDF sintéticos.

**Fallback genérico:** si el PDF no es USGA/R&A estructurado (FedeGolf puede ser distinto), parser genérico de 500 tokens con overlap 50, marcando `rule_anchor = NULL`. Log warning en cada chunk del fallback para detectar gaps.

### Contextual prefix

Modelo: Haiku 4.5. Prompt fijo:

```
Generate a 1-sentence contextual prefix (max 50 tokens) that situates this chunk within the document. The prefix will be prepended to the chunk before embedding to improve retrieval accuracy.

Document: {title}
Section breadcrumb: {breadcrumb}
Chunk content: {content}

Output ONLY the prefix sentence, no preamble.
```

Cache por `chunk_hash` → no regenera en re-runs. Failure → log + chunk se embed sin prefix (degradación graceful).

### Embeddings

- Modelo: `text-embedding-3-small` (OpenAI), 1536 dim.
- Batch: 100 chunks por request, retry exponencial (3 intentos, backoff 1s/2s/4s), timeout 30s.
- Input por chunk: `contextual_prefix + '\n\n' + content` (almacenado en columna `content_for_embed`).
- Total para 1e: ~9000 chunks × ~500 tok ≈ 4.5M tok × $0.00002/1k = **~$0.90 USD**.

### Upsert

```sql
INSERT INTO knowledge_chunks (...)
VALUES (...)
ON CONFLICT (source_id, chunk_hash) DO UPDATE SET
  embedding = EXCLUDED.embedding,
  contextual_prefix = EXCLUDED.contextual_prefix,
  content_for_embed = EXCLUDED.content_for_embed,
  token_count = EXCLUDED.token_count;
```

Re-runs solo recalculan chunks cuyo hash cambió (típicamente 0 entre runs idénticos).

---

## 5. Retrieval engine

### Módulos en `src/golf/coach/v3/retrieval/`

```
retrieval/
├── index.ts                   # searchKnowledgeChunks(query, opts)
├── hybrid-search.ts           # llama RPC search_chunks_hybrid
├── contextual-rerank.ts       # bge-reranker-v2-m3 via transformers.js
├── weighted-scoring.ts        # aplica block_weight a final_score
├── query-logger.ts            # rag_query_log inserts async
├── embed-query.ts             # cache LRU + OpenAI embed
└── types.ts                   # ChunkCandidate, RankedChunk, opts
```

### API pública

```ts
export interface SearchKnowledgeOptions {
  jurisdictions?: Array<'usga'|'ra'|'whs_global'|'usga_committee'|'fedegolf_chile'>;
  blockKey?: string;
  topK?: number;          // default 5 (post-rerank)
  topCandidates?: number; // default 20 (pre-rerank)
  alpha?: number;         // default 0.7
  userId?: string;        // para logging
}

export interface RankedChunk {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceJurisdiction: string;
  breadcrumb: string;
  ruleAnchor: string | null;
  content: string;
  scores: { vec: number; bm25: number; hybrid: number; rerank: number; final: number };
}

export async function searchKnowledgeChunks(
  query: string,
  opts?: SearchKnowledgeOptions
): Promise<RankedChunk[]>;
```

### Pipeline interno

1. **Embed query**: cache LRU in-memory (key = sha256(query), TTL 10 min, max 1000 entries). Cache miss → OpenAI API.
2. **Hybrid search**: llama RPC `search_chunks_hybrid` con top_candidates=20.
3. **Contextual rerank**: pasa 20 candidatos a bge-reranker-v2-m3 (transformers.js, ONNX runtime). Devuelve top-K reordenados.
4. **Weighted scoring**: si `block_weight` está disponible para el bloque (de `cerebro_weights`), aplica `final = rerank_score × block_weight`. Para 1e con un solo bloque (`rules`), este paso es identidad.
5. **Hydrate**: join con `knowledge_sources` para llenar `sourceTitle`, `sourceJurisdiction`.
6. **Log async**: insert en `rag_query_log` (no await, fire-and-forget con `.catch(captureError)`).
7. **Return**: top-K `RankedChunk[]`.

### Re-ranker config

- Modelo: `Xenova/bge-reranker-v2-m3` via `@xenova/transformers`.
- Runtime: Node.js 24 LTS en Vercel Function (Fluid Compute). Configurado en `vercel.ts` con `memory: 3008` para cargar el modelo (~500MB).
- Inicialización: lazy load en cold start. Singleton en `globalThis.__rerankerInstance`.
- Latencia esperada: ~80ms para reranking de 20 candidatos en warm Fluid Compute instance.

### Fallback chain

| Falla | Comportamiento |
|---|---|
| OpenAI embed timeout/error | Sentry capture, throw — el coach maneja con disclaimer |
| Supabase RPC error | Sentry capture, throw |
| Re-ranker model load fail | Loggear `error_code='rerank_unavailable'`, devolver top-K del hybrid score |
| 0 candidatos del hybrid | `error_code='no_results'`, devolver `[]` |

---

## 6. Integración con coach v3

### Tool definition (Anthropic)

```ts
const SEARCH_KNOWLEDGE_TOOL: Anthropic.Tool = {
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
        items: {
          type: 'string',
          enum: ['usga','ra','whs_global','usga_committee','fedegolf_chile']
        },
        description: 'Optional filter. Omit for all sources. Use ["fedegolf_chile"] for Chile-specific tournament rules.'
      }
    },
    required: ['query']
  }
};
```

### Sección del system prompt v3

```
═══════════════════════════════════════════════════════════════
GOLF RULES & REGULATIONS (RAG)
═══════════════════════════════════════════════════════════════
You have access to a tool `search_knowledge_chunks` that searches
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

CITATION FORMAT: `[Regla 8.1b — USGA Rules of Golf 2023]`

CONFLICT RESOLUTION: If two sources contradict (e.g. USGA vs
FedeGolf Chile), name BOTH explicitly and recommend the FedeGolf
adaptation for Chilean tournaments. Example:
  "USGA Rule 18.2b dice X. FedeGolf Chile adapta esto con Y
   para torneos locales en Chile. Para tu torneo aplica Y."

NEVER answer rule questions without first calling the tool.
```

### Integración en `src/app/api/taiger/chat/route.ts`

- Importar `searchKnowledgeChunks` y registrarlo como `tool_use` handler.
- Pasar `userId` al tool para logging en `rag_query_log`.
- Anthropic SDK ya soporta tool calling — no requiere cambios estructurales en el handler. Solo agregar el tool al array `tools` del request.
- Feature flag: tool solo activo si `cerebro_v3_enabled = true` para el usuario.

---

## 7. Admin UI `/admin/cerebro/fuentes`

### Layout

| Slug | Title | Block | Jurisdiction | Status | Chunks | Last Ingest | Cost (USD) | Actions |
|---|---|---|---|---|---|---|---|---|
| usga-rules-2023 | Rules of Golf 2023 | rules | usga | ready | 1842 | 2026-05-29 14:32 | $0.18 | [Reindex] [View chunks] [Disable] |
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

### Acciones

- **Reindex**: POST `/api/admin/cerebro/sources/[slug]/reindex` → encola job en background (Vercel cron-style trigger). Status → `ingesting`.
- **View chunks**: drilldown a 10 chunks de muestra con `breadcrumb` + 200 chars de preview.
- **Disable**: PATCH `status='stale'`. Retrieval lo excluye via WHERE filter en RPC.
- **Add source** (botón global): modal con URL, slug, jurisdicción, dominio. POST `/api/admin/cerebro/sources` → INSERT + encola.

### Endpoints

```
GET    /api/admin/cerebro/sources                 # lista
POST   /api/admin/cerebro/sources                 # alta
PATCH  /api/admin/cerebro/sources/[slug]          # update status, dominio, prioridad
POST   /api/admin/cerebro/sources/[slug]/reindex  # encola job
GET    /api/admin/cerebro/sources/[slug]/chunks   # sample
```

Todos protegidos por `cerebro_v3_enabled` + admin middleware (mismo patrón que `/admin/cerebro/pesos`).

### Métricas mostradas en /admin/cerebro/fuentes (panel superior)

- Total chunks ingestados.
- Costo acumulado.
- Queries últimas 24h.
- Latency P50/P95.
- Hit rate (queries con ≥2 chunks score > 0.4).
- Top 5 queries con `error_code='no_results'` (gap de cobertura).

---

## 8. Observabilidad y alertas

### Métricas (admin panel)

- Queries totales / día / semana.
- P50, P95, P99 latency.
- Hit rate.
- Costo total y por fuente.
- Distribución de scores (histograma).
- Queries fallidas (top 20 con `error_code != NULL`).

### Alertas Sentry

| Trigger | Severity |
|---|---|
| Retrieval P95 > 2s en últimos 100 queries | warning |
| >30% queries con `error_code != NULL` en última hora | critical |
| Embedding API failure rate > 5% | critical |
| Re-ranker cold start > 10s | warning |
| `knowledge_sources` con `status='error'` durante >1h | critical |

---

## 9. Testing strategy

### Unit tests (`src/golf/coach/v3/retrieval/__tests__/`)

- `parse-structural.test.ts` — fixtures PDF sintético → chunks esperados con breadcrumbs correctos.
- `hybrid-search.test.ts` — mock supabase RPC, verifica que pasa `alpha`, `top_k`, `jurisdictions` correctos.
- `contextual-rerank.test.ts` — verifica fallback funciona sin modelo cargado.
- `weighted-scoring.test.ts` — verifica multiplicación correcta `score × block_weight`.
- `embed-query.test.ts` — cache LRU funciona, cache miss llama API.
- `search-knowledge-chunks.test.ts` — happy path + edge cases (query vacío, jurisdicción inválida, BD vacía, todos los fallbacks).

### Integration tests (`src/__tests__/integration/`)

- `rag-pipeline-e2e.test.ts` — pipeline completo con 1 PDF fixture (~5 chunks) → BD test → retrieval → resultado esperado.
- `rag-anti-hallucination.test.ts` — 5 queries sin respuesta en corpus → coach NO inventa.

### SQL function tests (`supabase/__tests__/`)

- `search-chunks-hybrid.test.sql` — corrido con `pgTAP` o invocado desde vitest vía supabase client. Casos: solo vector match, solo BM25 match, ambos, filtro de jurisdicción, top_k respetado.

### Snapshot regression (`src/__tests__/snapshots/`)

- `rag-retrieval.snapshot.test.ts` — 10 queries conocidas → top-5 chunk IDs estables. Bloqueante en CI.

### Canarios anti-regresión (`src/__tests__/canary-rag.test.ts`)

- Hybrid score nunca cae a cosine puro silenciosamente.
- Re-rank fallback no se activa por timeout < 1s.
- Logger nunca bloquea el retorno principal.
- `error_code` se setea correctamente en cada failure mode.

### Smoke pre-merge

`node --env-file=.env.local scripts/cerebro-v3/smoke-rag.mjs`:
- 20 queries tipo de reglas → verifica que ≥18 (90%) devuelven chunks con score > 0.4 y la cita esperada.
- 5 queries sin respuesta → verifica disclaimer 5/5.

---

## 10. Anti-hallucination contract

| Condición | Respuesta del coach |
|---|---|
| 0 chunks devueltos | Disclaimer fijo + link Rules app oficial |
| 1 chunk con score > 0.4 | Cita el chunk + advierte "fuente única" |
| ≥2 chunks score > 0.4 | Cita normal, formato `[Regla X.Y — Fuente, Año]` |
| Conflicto (USGA vs FedeGolf Chile) | Nombra ambos, prioriza FedeGolf para torneo Chile |
| `search_knowledge_chunks` throw | Disclaimer + Sentry capture |

Smoke test pre-merge verifica los 5 casos.

---

## 11. Skill custom `golf-rules-official`

- Generada con `book-to-skill` a partir de Rules of Golf 2023 + WHS Manual 2024.
- Destino: `~/.claude/skills/golf-rules-official/SKILL.md`.
- Uso: **Claude/dev** consultando reglas mientras programa. NO se usa en runtime del coach del usuario (eso va por RAG).
- Excepción explícita a la regla "no book-to-skill v1" (memoria `feedback_taiger_no_book_to_skill_v1`): aplica solo a libros de instrucción, no a reglas oficiales.

---

## 12. Costos

| Item | One-time | Recurrente |
|---|---|---|
| Embeddings ingesta inicial (9000 × ~500 tok × $0.00002/1k) | ~$0.90 | $0 (cacheado) |
| Contextual prefixes (Haiku, 9000 × ~50 tok × $0.25/1M output) | ~$0.12 | $0 |
| Re-ingesta anual (cambios de reglas) | — | ~$1/año |
| Embeddings queries (1/query usuario, ~50 tok) | $0 | ~$0.000001/query |
| Re-ranker | $0 | $0 (local ONNX) |
| Almacenamiento Supabase (9000 chunks × 1536 floats × 4 bytes) | ~55 MB | dentro de plan free |

**Total ingesta inicial: ~$1.02 USD.**
**Costo runtime esperado: <$5/mes con 100 usuarios activos.**

---

## 13. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| PDFs FedeGolf no son públicos | Media | Bajo | Marcar `status='unavailable'`, no bloquear sub-ola. Volver en sub-ola posterior con permiso o adaptando jurisdicción a R&A genérico. |
| Parser estructural rompe en PDFs con tablas/imágenes | Media | Medio | Fallback a parser por tamaño (500 tok, overlap 50). Log warning. |
| transformers.js no carga en Vercel Function | Baja | Medio | Fallback a sin rerank. Plan B: API HuggingFace Inference. Plan C: microservicio aparte. |
| pgvector lento con 9000 chunks | Baja | Bajo | ivfflat lists=100 alcanza. Si crece >100k (1c/1d), migrar a HNSW. |
| OpenAI rate limit en ingesta batch | Baja | Bajo | Retry exponencial + checkpointing por chunk_hash. Re-runs safe. |
| Drift entre `source_hash` y PDF upstream | Alta | Bajo | Admin UI muestra `last_check_at`. Cron mensual chequea ETag, marca `status='stale'` si difiere. Re-indexado opt-in. |
| RLS bloquea reads desde coach (anon vs service_role) | Media | Alto | Tests de integración explícitos con cliente anon. `knowledge_chunks_read` policy permite SELECT a todos (lectura pública). |

---

## 14. Criterios de éxito (gates de merge)

1. `npx tsc --noEmit`: 0 errores.
2. `npm test`: 1800+ tests pass (incluyendo nuevos de 1e).
3. `npm run build`: OK.
4. Ingesta limpia: `node scripts/cerebro-v3/ingest-rules.mjs --all` corre sin error, ≥5 fuentes con `status='ready'`, ≥8000 chunks totales, costo logueado.
5. Banco de pruebas (20 preguntas tipo de reglas): coach v3 cita correctamente ≥18 (90%). Comparado con coach v2 (que no tiene RAG): v3 debe ganar en "calidad de cita" (evaluador LLM).
6. **Anti-hallucination smoke** (5 preguntas sin respuesta en corpus): coach devuelve disclaimer en 5/5.
7. Demo en vivo con Juanjo: abrir `/admin/cerebro/fuentes`, ver fuentes ingestadas, pedirle al coach una regla específica y ver cita correcta + manejo de conflicto USGA/FedeGolf.
8. Code review por `superpowers:code-reviewer` agent: 0 críticos sin resolver.
9. `/pre-push` completo (incluye health check + canary tests + smoke pre-push del CLAUDE.md de Golfers+).
10. Feature flag `cerebro_v3_enabled = true` solo para Juanjo durante validación; coach v2 sigue activo para todos los demás usuarios sin cambios visibles.

---

## 15. Desviaciones esperadas del spec maestro

| Spec maestro decía | Sub-ola 1e dice | Razón |
|---|---|---|
| 2-3 días | 5 días | RAG completo (no básico) + admin UI + observabilidad |
| 5 PDFs (sin FedeGolf) | 6 PDFs (con FedeGolf si disponible) | Decisión Juanjo 2026-05-28: "todos los anteriores" |
| RAG simple en 1e, avanzado en 1c | RAG completo desde 1e | Decisión Juanjo 2026-05-28: "infra impecable, app elite" |
| `cerebro_weights` ya existente | Aplica `block_weight` para 'rules' en weighted-scoring | Compatible con capa paramétrica de Ola 0 |

---

## 16. Próximos pasos (post-merge de 1e)

1. Capturar lecciones de 1e en `docs/cerebro-v3-estado.md`.
2. Brainstorming + spec de sub-ola 1b (Distribuciones — USGA/R&A reports, Course DB, Stagner Substack). Sigue el mismo patrón pero con scraping web responsable.
3. Decidir si activar cron mensual de re-ingesta para reglas (probable que sí, baja frecuencia, alto valor).
4. Si el modelo bge-reranker funcionó bien en producción: ratificar para 1c-1d. Si no: migrar a Plan B (API HuggingFace).
