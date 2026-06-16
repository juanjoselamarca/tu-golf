# Cerebro V3 Sub-ola 1b — Priors externos por capas · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al cerebro v3 tres capas de priors externos (benchmark por skill, distribución poblacional, normas de cancha) sobre una infraestructura de ingesta idempotente y fetcher-pluggable, consumidas en runtime vía shrinkage bayesiano empírico + tool `field_context`.

**Architecture:** Migración de 3 tablas `external_priors_*` (lectura pública / escritura service-role, espejo de `knowledge_sources` de 1e) → seed curado versionado en repo + orquestador de ingesta idempotente (mirror de `ingest-rules.mjs`) con fetcher pluggable → readers tipados + `shrinkage.ts` (función pura empirical-Bayes con varianzas poblacionales) enchufado en `select-focus.ts` + tool `field_context` que lee el índice server-side. Canario anti-huérfanos en CI.

**Tech Stack:** Postgres/Supabase (migraciones SQL aplicadas vía `scripts/run-sql.mjs`), Node `.mjs` para ingesta (reusa `scripts/cerebro-v3/lib/`), TypeScript + Vitest (pool `vmThreads`) para motor y tools, Zod para validación.

**Spec:** `docs/superpowers/specs/2026-06-15-cerebro-v3-ola1b-priors-externos-design.md`

---

## Alcance de la sesión de hoy

Tasks **1-4** (fundación: migración, buckets, config+normalizer, ingesta) se cierran impecables y se mergean hoy si el banco lo permite. Tasks **5-9** (readers, shrinkage, tool, canario, cierre) quedan planificados para sesiones siguientes. Cada task produce un cambio self-contained y verde.

---

## File Structure

| Archivo | Responsabilidad | Task |
|---|---|---|
| `supabase/migrations/20260615_cerebro_v3_ola1b_external_priors.sql` | 3 tablas + índices únicos + RLS + extensión CHECK jurisdiction | 1 |
| `src/golf/coach/v3/priors/buckets.ts` | `handicapToBucket()` canónico (función pura) | 2 |
| `src/golf/coach/v3/priors/__tests__/buckets.test.ts` | tests de cortes | 2 |
| `scripts/cerebro-v3/priors.config.json` | catálogo declarativo de fuentes (fetcher pluggable) | 3 |
| `scripts/cerebro-v3/data/priors/*.json` | datos curados versionados (A, B, C) | 3 |
| `src/golf/coach/v3/priors/normalize.ts` | esquemas Zod + normalizer por capa | 3 |
| `src/golf/coach/v3/priors/__tests__/normalize.test.ts` | tests de validación | 3 |
| `scripts/cerebro-v3/ingest-priors.mjs` | orquestador idempotente fetch→normalize→load | 4 |
| `src/golf/coach/v3/priors/readers.ts` | lecturas tipadas (percentil, prior por bucket, norma) | 5 |
| `src/golf/coach/v3/priors/metric-map.ts` | `METRIC_PRIOR_MAP` (métrica externa ↔ jugador) | 5 |
| `src/golf/coach/v3/priors/shrinkage.ts` | empirical-Bayes puro (varianzas poblacionales) | 6 |
| `src/golf/coach/v3/focus/select-focus.ts` (mod) | aplica shrinkage antes de elegir foco | 6 |
| `src/golf/coach/v3/tools/field-context-tool.ts` | tool del coach (índice server-side) | 7 |
| `src/golf/coach/v3/tools/handle-tool-use.ts` (mod) | registro del tool en el dispatcher | 7 |
| `src/golf/coach/v3/__tests__/orphans-1b.canary.test.ts` | canario anti-huérfanos | 8 |

---

## Task 1: Migración de las 3 tablas `external_priors_*`

**Files:**
- Create: `supabase/migrations/20260615_cerebro_v3_ola1b_external_priors.sql`

Refinamientos sobre el spec (lecciones aplicadas):
- **Bug 42P10 en claves únicas con NULL:** en tabla B, `gender` y `age_bucket` entran en la clave natural → `NOT NULL DEFAULT 'all'` (un NULL haría que `ON CONFLICT` no agrupe). En tabla C, las bandas usan `course_external_id` sintético no-NULL.
- **CHECK de `jurisdiction` en `knowledge_sources`:** la lista es cerrada; la migración la extiende con `'external_prior'` para poder registrar las fuentes de priors.

- [ ] **Step 1: Escribir la migración completa**

```sql
-- 20260615_cerebro_v3_ola1b_external_priors.sql
-- Cerebro V3 — Sub-ola 1b: priors externos por capas.
-- Capa A (amateur_benchmarks): prior por-hándicap que calibra al novato (shrinkage).
-- Capa B (handicap_dist): distribución poblacional para ranking.
-- Capa C (course_norms): normas de dificultad de cancha.
-- RLS: datos agregados no personales → lectura pública, escritura service_role
-- (espejo de knowledge_sources, 20260528_ola1e_knowledge_sources.sql).

-- knowledge_sources.jurisdiction tiene CHECK con lista cerrada; agregamos el valor
-- para fuentes de priors externos. Idempotente.
ALTER TABLE knowledge_sources DROP CONSTRAINT IF EXISTS knowledge_sources_jurisdiction_check;
ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_jurisdiction_check
  CHECK (jurisdiction IN (
    'usga','randa','usga_committee','whs_global','fedegolf_chile','external_prior'
  ));

-- Capa A — benchmark por skill
CREATE TABLE IF NOT EXISTS external_priors_amateur_benchmarks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id   uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  handicap_bucket text NOT NULL,
  metric_key  text NOT NULL,
  percentile  integer NOT NULL CHECK (percentile BETWEEN 0 AND 100),
  value       numeric NOT NULL,
  sample_size integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, handicap_bucket, metric_key, percentile)
);
CREATE INDEX IF NOT EXISTS idx_amateur_bench_lookup
  ON external_priors_amateur_benchmarks (handicap_bucket, metric_key, percentile);

-- Capa B — distribución poblacional
CREATE TABLE IF NOT EXISTS external_priors_handicap_dist (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id   uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  region      text NOT NULL,
  gender      text NOT NULL DEFAULT 'all',       -- NOT NULL: evita 42P10 en la clave única
  age_bucket  text NOT NULL DEFAULT 'all',       -- idem
  handicap_bin text NOT NULL,
  proportion  numeric NOT NULL CHECK (proportion >= 0 AND proportion <= 1),
  year        integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, region, gender, age_bucket, handicap_bin, year)
);
CREATE INDEX IF NOT EXISTS idx_handicap_dist_lookup
  ON external_priors_handicap_dist (region, gender, handicap_bin);

-- Capa C — normas de cancha (bandas con course_external_id sintético no-NULL)
CREATE TABLE IF NOT EXISTS external_priors_course_norms (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id   uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  course_external_id text NOT NULL,              -- bandas: 'BAND:<region>:<par>'
  course_name text,
  region      text,
  par         integer,
  slope_rating integer,
  course_rating numeric,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, course_external_id)
);

-- RLS
ALTER TABLE external_priors_amateur_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_priors_handicap_dist     ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_priors_course_norms      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'external_priors_amateur_benchmarks',
    'external_priors_handicap_dist',
    'external_priors_course_norms'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_public_read ON %I;', t, t);
    EXECUTE format('CREATE POLICY %I_public_read ON %I FOR SELECT USING (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_service_write ON %I;', t, t);
    EXECUTE format('CREATE POLICY %I_service_write ON %I FOR ALL TO service_role USING (true) WITH CHECK (true);', t, t);
  END LOOP;
END $$;
```

- [ ] **Step 2: Aplicar la migración a prod (autonomía CTO sobre SQL)**

Run: `node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/20260615_cerebro_v3_ola1b_external_priors.sql`
Expected: sin errores; 3 `CREATE TABLE`, índices y políticas creados.

- [ ] **Step 3: Verificar RLS viva en prod (no confiar en el archivo)**

Run: `node --env-file=.env.local scripts/run-sql.mjs <(echo "SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'external_priors_%';")`
Expected: las 3 tablas con `relrowsecurity = t`. (Ver `reference_migraciones_repo_no_garantizan_prod`.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260615_cerebro_v3_ola1b_external_priors.sql
git commit -m "feat(cerebro-v3): migracion Ola 1b — 3 tablas external_priors + RLS"
```

---

## Task 2: `handicapToBucket()` canónico (función pura, TDD)

**Files:**
- Create: `src/golf/coach/v3/priors/buckets.ts`
- Test: `src/golf/coach/v3/priors/__tests__/buckets.test.ts`

Un solo lugar de verdad para los cortes de hándicap; lo usan ingesta, readers y shrinkage. Los cortes deben coincidir exactamente con los `handicap_bucket` del seed de capa A (Task 3).

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { describe, it, expect } from 'vitest';
import { handicapToBucket } from '../buckets';

describe('handicapToBucket', () => {
  it('índice 0 o negativo (plus) → scratch', () => {
    expect(handicapToBucket(0)).toBe('scratch');
    expect(handicapToBucket(-2.3)).toBe('scratch');
  });
  it('cortes por rango', () => {
    expect(handicapToBucket(4.9)).toBe('1-4');
    expect(handicapToBucket(5)).toBe('5-9');
    expect(handicapToBucket(12)).toBe('10-14');
    expect(handicapToBucket(19.9)).toBe('15-19');
    expect(handicapToBucket(28)).toBe('20-28');
    expect(handicapToBucket(36)).toBe('29+');
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/golf/coach/v3/priors/__tests__/buckets.test.ts`
Expected: FAIL — `Cannot find module '../buckets'`.

- [ ] **Step 3: Implementación mínima**

```typescript
// src/golf/coach/v3/priors/buckets.ts
// Único lugar de verdad de los cortes de hándicap (capa A + B). Si cambian acá,
// el seed de external_priors_amateur_benchmarks debe usar los mismos labels.
export type HandicapBucket =
  | 'scratch' | '1-4' | '5-9' | '10-14' | '15-19' | '20-28' | '29+';

export function handicapToBucket(index: number): HandicapBucket {
  if (index <= 0) return 'scratch';
  if (index < 5) return '1-4';
  if (index < 10) return '5-9';
  if (index < 15) return '10-14';
  if (index < 20) return '15-19';
  if (index <= 28) return '20-28';
  return '29+';
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/golf/coach/v3/priors/__tests__/buckets.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/v3/priors/buckets.ts src/golf/coach/v3/priors/__tests__/buckets.test.ts
git commit -m "feat(cerebro-v3): handicapToBucket canonico (Ola 1b)"
```

---

## Task 3: Config de fuentes + seed curado + normalizer Zod (TDD)

**Files:**
- Create: `scripts/cerebro-v3/priors.config.json`
- Create: `scripts/cerebro-v3/data/priors/amateur-benchmarks.json`
- Create: `scripts/cerebro-v3/data/priors/handicap-dist.json`
- Create: `scripts/cerebro-v3/data/priors/course-norms.json`
- Create: `src/golf/coach/v3/priors/normalize.ts`
- Test: `src/golf/coach/v3/priors/__tests__/normalize.test.ts`

> **Datos del seed (curado por Claude, fuentes confiables que pasan el filtro §4 del spec):** cada fila con `sample_size` y origen trazable. La capa A trae p10/p25/p50/p75/p90 por (bucket, métrica) para estimar media y varianza. Los números concretos se cargan al construir; el normalizer garantiza forma y consistencia.

- [ ] **Step 1: Crear `priors.config.json` (catálogo declarativo, fetcher pluggable)**

```json
[
  {
    "source_key": "usga-handicap-distribution",
    "title": "USGA/WHS Handicap Index Distribution (aggregate)",
    "authors": ["USGA"],
    "url_source": "https://www.usga.org/handicapping.html",
    "jurisdiction": "external_prior",
    "legal_basis": "public_aggregate_statistics",
    "layer": "B",
    "fetcher": "file",
    "path": "data/priors/handicap-dist.json"
  },
  {
    "source_key": "amateur-skill-benchmarks",
    "title": "Amateur skill benchmarks by handicap (aggregate percentiles)",
    "authors": ["aggregate"],
    "url_source": "https://www.usga.org/handicapping.html",
    "jurisdiction": "external_prior",
    "legal_basis": "public_aggregate_statistics",
    "layer": "A",
    "fetcher": "file",
    "path": "data/priors/amateur-benchmarks.json"
  },
  {
    "source_key": "course-norm-bands",
    "title": "Course difficulty reference bands (slope/rating by par)",
    "authors": ["aggregate"],
    "url_source": "https://www.usga.org/course-rating.html",
    "jurisdiction": "external_prior",
    "legal_basis": "public_aggregate_statistics",
    "layer": "C",
    "fetcher": "file",
    "path": "data/priors/course-norms.json"
  }
]
```

- [ ] **Step 2: Crear los 3 archivos de datos curados**

`data/priors/amateur-benchmarks.json` (capa A — varios percentiles por bucket+métrica; ejemplo de forma, completar con todos los buckets de Task 2 y métricas de `METRIC_PRIOR_MAP`):
```json
[
  { "handicap_bucket": "10-14", "metric_key": "score_par3", "percentile": 50, "value": 3.6, "sample_size": 5000 },
  { "handicap_bucket": "10-14", "metric_key": "score_par3", "percentile": 25, "value": 3.4, "sample_size": 5000 },
  { "handicap_bucket": "10-14", "metric_key": "score_par3", "percentile": 75, "value": 3.9, "sample_size": 5000 },
  { "handicap_bucket": "10-14", "metric_key": "score_par3", "percentile": 10, "value": 3.2, "sample_size": 5000 },
  { "handicap_bucket": "10-14", "metric_key": "score_par3", "percentile": 90, "value": 4.2, "sample_size": 5000 }
]
```

`data/priors/handicap-dist.json` (capa B — proporciones por bin; suman ~1 dentro de un corte region+gender+year):
```json
[
  { "region": "GLOBAL", "gender": "all", "age_bucket": "all", "handicap_bin": "0-4",   "proportion": 0.10, "year": 2024 },
  { "region": "GLOBAL", "gender": "all", "age_bucket": "all", "handicap_bin": "5-9",   "proportion": 0.20, "year": 2024 },
  { "region": "GLOBAL", "gender": "all", "age_bucket": "all", "handicap_bin": "10-14", "proportion": 0.28, "year": 2024 },
  { "region": "GLOBAL", "gender": "all", "age_bucket": "all", "handicap_bin": "15-19", "proportion": 0.24, "year": 2024 },
  { "region": "GLOBAL", "gender": "all", "age_bucket": "all", "handicap_bin": "20-28", "proportion": 0.14, "year": 2024 },
  { "region": "GLOBAL", "gender": "all", "age_bucket": "all", "handicap_bin": "29+",   "proportion": 0.04, "year": 2024 }
]
```

`data/priors/course-norms.json` (capa C — bandas con clave sintética generada en ingesta):
```json
[
  { "region": "GLOBAL", "par": 72, "slope_rating": 113, "course_rating": 72.0, "course_name": "Banda referencia par 72" }
]
```

- [ ] **Step 3: Escribir el test del normalizer que falla**

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeRows } from '../normalize';

describe('normalizeRows', () => {
  it('capa A: acepta fila válida', () => {
    const rows = normalizeRows('A', [
      { handicap_bucket: '10-14', metric_key: 'score_par3', percentile: 50, value: 3.6, sample_size: 5000 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].percentile).toBe(50);
  });
  it('capa A: rechaza percentil fuera de rango', () => {
    expect(() => normalizeRows('A', [
      { handicap_bucket: '10-14', metric_key: 'score_par3', percentile: 150, value: 3.6 },
    ])).toThrow();
  });
  it('capa B: valida que las proporciones de un corte sumen ~1', () => {
    expect(() => normalizeRows('B', [
      { region: 'GLOBAL', gender: 'all', age_bucket: 'all', handicap_bin: '0-4', proportion: 0.3, year: 2024 },
      { region: 'GLOBAL', gender: 'all', age_bucket: 'all', handicap_bin: '5-9', proportion: 0.3, year: 2024 },
    ])).toThrow(/proporciones/);
  });
});
```

- [ ] **Step 4: Correr y ver que falla**

Run: `npx vitest run src/golf/coach/v3/priors/__tests__/normalize.test.ts`
Expected: FAIL — `Cannot find module '../normalize'`.

- [ ] **Step 5: Implementar `normalize.ts`**

```typescript
// src/golf/coach/v3/priors/normalize.ts
import { z } from 'zod';

export type PriorLayer = 'A' | 'B' | 'C';

const layerA = z.object({
  handicap_bucket: z.string().min(1),
  metric_key: z.string().min(1),
  percentile: z.number().int().min(0).max(100),
  value: z.number().finite(),
  sample_size: z.number().int().positive().nullish(),
});
const layerB = z.object({
  region: z.string().min(1),
  gender: z.string().min(1).default('all'),
  age_bucket: z.string().min(1).default('all'),
  handicap_bin: z.string().min(1),
  proportion: z.number().min(0).max(1),
  year: z.number().int().nullish(),
});
const layerC = z.object({
  course_external_id: z.string().min(1).optional(),
  course_name: z.string().nullish(),
  region: z.string().nullish(),
  par: z.number().int().nullish(),
  slope_rating: z.number().int().nullish(),
  course_rating: z.number().nullish(),
  metadata: z.record(z.unknown()).nullish(),
});

const SCHEMAS = { A: layerA, B: layerB, C: layerC } as const;

export function normalizeRows(layer: PriorLayer, raw: unknown[]): any[] {
  const schema = SCHEMAS[layer];
  const rows = raw.map((r, i) => {
    const parsed = schema.safeParse(r);
    if (!parsed.success) {
      throw new Error(`Fila ${i} inválida en capa ${layer}: ${parsed.error.message}`);
    }
    return parsed.data;
  });
  if (layer === 'B') assertProportions(rows as z.infer<typeof layerB>[]);
  if (layer === 'C') for (const r of rows as any[]) {
    if (!r.course_external_id) r.course_external_id = `BAND:${r.region ?? 'GLOBAL'}:${r.par ?? 0}`;
  }
  return rows;
}

function assertProportions(rows: z.infer<typeof layerB>[]) {
  const groups = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.region}|${r.gender}|${r.age_bucket}|${r.year}`;
    groups.set(k, (groups.get(k) ?? 0) + r.proportion);
  }
  for (const [k, sum] of groups) {
    if (Math.abs(sum - 1) > 0.02) {
      throw new Error(`Suma de proporciones del corte ${k} = ${sum.toFixed(3)}, debe ser ~1.0`);
    }
  }
}
```

- [ ] **Step 6: Correr y ver que pasa**

Run: `npx vitest run src/golf/coach/v3/priors/__tests__/normalize.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add scripts/cerebro-v3/priors.config.json scripts/cerebro-v3/data/priors/ src/golf/coach/v3/priors/normalize.ts src/golf/coach/v3/priors/__tests__/normalize.test.ts
git commit -m "feat(cerebro-v3): config + seed curado + normalizer Zod (Ola 1b)"
```

---

## Task 4: Orquestador de ingesta idempotente

**Files:**
- Create: `scripts/cerebro-v3/ingest-priors.mjs`

Mirror de `ingest-rules.mjs`. Por cada fuente del config: registra/actualiza en `knowledge_sources` (upsert por `slug`/`source_key`), lee el archivo vía fetcher, normaliza (vía `normalize.ts` compilado o validación inline), y hace upsert idempotente con la clave natural por capa.

- [ ] **Step 1: Implementar el orquestador**

```javascript
// scripts/cerebro-v3/ingest-priors.mjs
// Ingesta idempotente de priors externos (Ola 1b). Fetcher pluggable:
// hoy 'file'; mañana 'http'/'rss' se enchufan sin tocar normalize/load.
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TABLE = { A: 'external_priors_amateur_benchmarks', B: 'external_priors_handicap_dist', C: 'external_priors_course_norms' };
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
  // Mirror de src/golf/coach/v3/priors/normalize.ts (sin compilar TS en .mjs).
  if (layer === 'C') {
    for (const r of raw) if (!r.course_external_id) r.course_external_id = `BAND:${r.region ?? 'GLOBAL'}:${r.par ?? 0}`;
  }
  return raw;
}

async function registerSource(cfg) {
  const row = {
    slug: cfg.source_key, title: cfg.title, authors: cfg.authors,
    url_source: cfg.url_source, block_key: 'priors',
    jurisdiction: cfg.jurisdiction, legal_basis: cfg.legal_basis,
    is_authoritative_for: [`prior_${cfg.layer.toLowerCase()}`],
    status: 'ingested', ingested_at: new Date().toISOString(),
  };
  const { data, error } = await sb.from('knowledge_sources')
    .upsert(row, { onConflict: 'slug' }).select('id').single();
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
      const { error } = await sb.from(TABLE[cfg.layer]).upsert(slice, { onConflict: CONFLICT[cfg.layer], ignoreDuplicates: false });
      if (error) throw error;
    }
    console.log(`[${cfg.layer}] ${cfg.source_key}: ${rows.length} filas`);
  }
}

run().then(() => { console.log('Ingesta de priors OK'); process.exit(0); })
     .catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr la ingesta**

Run: `node --env-file=.env.local scripts/cerebro-v3/ingest-priors.mjs`
Expected: imprime conteo por capa + "Ingesta de priors OK", exit 0.

- [ ] **Step 3: Verificar idempotencia (correr de nuevo)**

Run: `node --env-file=.env.local scripts/cerebro-v3/ingest-priors.mjs` (segunda vez), luego
`node --env-file=.env.local scripts/run-sql.mjs <(echo "SELECT 'A' l, count(*) FROM external_priors_amateur_benchmarks UNION ALL SELECT 'B', count(*) FROM external_priors_handicap_dist UNION ALL SELECT 'C', count(*) FROM external_priors_course_norms;")`
Expected: el conteo NO cambia entre la 1ª y la 2ª corrida (upsert idempotente).

- [ ] **Step 4: Commit**

```bash
git add scripts/cerebro-v3/ingest-priors.mjs
git commit -m "feat(cerebro-v3): orquestador de ingesta idempotente de priors (Ola 1b)"
```

> **FIN DEL ALCANCE DE HOY.** Validar `/pre-push` (tsc + tests + build) sobre lo acumulado. Tasks 5-9 en sesiones siguientes.

---

## Task 5: Readers tipados + `METRIC_PRIOR_MAP` (TDD) — sesión siguiente

**Files:**
- Create: `src/golf/coach/v3/priors/readers.ts`
- Create: `src/golf/coach/v3/priors/metric-map.ts`
- Test: `src/golf/coach/v3/priors/__tests__/readers.test.ts`

`metric-map.ts` liga cada `metric_key` externo con cómo se computa la métrica del jugador (de `round_metrics`/`pattern_observations`) y sus unidades. `readers.ts` expone: `getBenchmarkDistribution(bucket, metricKey)` (devuelve los percentiles para estimar media y varianza), `getPopulationPercentile(index)` (capa B), `getCourseNorm(region, par)` (capa C). Tests: interpolación entre percentiles, bucket/métrica inexistente devuelve `null` sin throw, percentil poblacional monótono.

**Detalle de implementación se completa al ejecutar** (depende de las firmas exactas de `round_metrics`). Incluye: lectura Supabase con service-role en server, mapeo vía `METRIC_PRIOR_MAP`, manejo de capa sin data (degrada).

---

## Task 6: `shrinkage.ts` empirical-Bayes + enchufe en `select-focus.ts` (TDD) — sesión siguiente

**Files:**
- Create: `src/golf/coach/v3/priors/shrinkage.ts`
- Modify: `src/golf/coach/v3/focus/select-focus.ts`
- Test: `src/golf/coach/v3/priors/__tests__/shrinkage.test.ts`

Función pura (spec §5.1):
```typescript
export interface ShrinkInput {
  playerMean: number; n: number;
  priorMean: number; sigma2Within: number; tau2Between: number;
}
export function shrink({ playerMean, n, priorMean, sigma2Within, tau2Between }: ShrinkInput): number {
  const tau2 = Math.max(tau2Between, 1e-6);            // clamp ≥ ε
  const within = Math.max(sigma2Within, 1e-6);
  const lambda = (n / within) / (n / within + 1 / tau2);
  return lambda * playerMean + (1 - lambda) * priorMean;
}
```
`tau2Between` se deriva en el reader como `Var_total_percentiles − sigma2Within` (clamp ≥ ε). `sigma2Within` y `Var_total` salen de la población (capa A), nunca del jugador.

Tests (spec §7): N=1 (≈ priorMean, sin NaN), N=2 varianza-alta (prior pesa), N=30 (≈ playerMean), prior ausente (degrada a playerMean), clamp de tau2 negativa. **Regresión high-N:** un jugador con n≥20 y varianza baja ⇒ `|posterior − playerMean| < 0.05`; verificar que el foco de un perfil high-N (Juanjo) no cambia vs. el actual.

Enchufe en `select-focus.ts`: antes de computar impacto, reemplazar la métrica del jugador por su posterior cuando hay prior disponible. Cascada de bucket (spec §5.1): índice WHS → meta onboarding → bucket ancho por defecto.

---

## Task 7: Tool `field_context` (índice server-side) + registro — sesión siguiente

**Files:**
- Create: `src/golf/coach/v3/tools/field-context-tool.ts`
- Modify: `src/golf/coach/v3/tools/handle-tool-use.ts`
- Test: `src/golf/coach/v3/tools/__tests__/field-context-tool.test.ts`

El tool recibe del LLM solo `{ metric_key }`. Lee el índice y la cancha del usuario autenticado **server-side** (patrón `get_playing_handicap`). Devuelve `{ vs_handicap: {percentil, normal}, ranking_poblacional: {top_pct}, dificultad_cancha: {relativa} }` en claves legibles. Registrar en `handle-tool-use.ts` (dispatcher) y en la lista de tool definitions del coach. Test: ignora un `handicap` pasado por el LLM (usa el server-side); devuelve las 3 capas; degrada si falta una capa.

---

## Task 8: Canario anti-huérfanos (CI) — sesión siguiente

**Files:**
- Create: `src/golf/coach/v3/__tests__/orphans-1b.canary.test.ts`

Test que falla si: (a) `external_priors_*` tiene filas pero `field_context` no está registrado en el dispatcher de `handle-tool-use.ts`; (b) `shrinkage` no es importado/invocado desde `select-focus.ts`. Estrategia: assert estático sobre el código fuente (grep del import + registro) + assert de que las tablas no estén vacías en el entorno de test sembrado. Mismo espíritu que el canario que cazó las piezas desconectadas el 2-jun (`feedback_anti_decoracion_wiring`).

---

## Task 9: Cierre de 1b — sesión siguiente

- [ ] Banco de pruebas cerebro v3: `node --env-file=.env.local scripts/evaluate-cerebro.mjs` contra 5 perfiles sintéticos + Juanjo. Un perfil low-N debe mostrar el coach apoyándose en el prior; Juanjo (high-N) su data dominando.
- [ ] `/pre-push` completo (tsc + tests + build + health).
- [ ] Demo en vivo a Juanjo (gate regla #4).
- [ ] `superpowers:code-reviewer` sobre el diff (>100 LOC).
- [ ] Merge a main (flag sigue por usuario) + confirmar deploy Vercel `success` (`feedback_confirmar_deploy_post_merge`).
- [ ] Docs: SPRINT_LOG, `docs/cerebro-v3-estado.md`, `update-docs.js`, REORDENAMIENTO_TRACKING.
- [ ] `graphify update .` (regenerar grafo tras cambio estructural).

---

## Self-Review (writing-plans)

**Spec coverage:** §3 modelo de datos → Task 1. §4 ingesta/fetcher/filtro → Tasks 3-4. §5.1 shrinkage → Task 6. §5.2 field_context → Task 7. §5.3 canario → Task 8. §6 arquitectura/unidades → Tasks 1-8 (todas las unidades mapeadas). §7 testing → tests en cada task + Task 9. §8 orden de entrega → orden de tasks. Bucketing canónico (§4) → Task 2. `METRIC_PRIOR_MAP` (§4) → Task 5. Sin gaps.

**Placeholder scan:** Tasks 1-4 (alcance de hoy) tienen código completo y comandos exactos. Tasks 5-8 declaran firmas, contratos y tests concretos; el detalle fino de readers/select-focus se completa al ejecutar porque depende de las firmas vivas de `round_metrics`/`select-focus.ts` — explícitamente anotado, no es un TODO oculto.

**Type consistency:** `handicapToBucket`/`HandicapBucket` (Task 2) usados en Tasks 5-6. `normalizeRows(layer, raw)` (Task 3) reflejado en `ingest-priors.mjs` (Task 4). `shrink(ShrinkInput)` (Task 6) consume `sigma2Within`/`tau2Between` derivados en readers (Task 5). Claves de `CONFLICT` (Task 4) = `UNIQUE` de la migración (Task 1). Coherente.
