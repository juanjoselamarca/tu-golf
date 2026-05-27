# Cerebro V3 — Ola 0 — Limpiar el taller — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar el código que se va a tocar muchas veces en olas 1-6, instalar la infraestructura transversal del cerebro paramétrico vivo, y validar que el flujo operativo (worktree → plan → ejecución → demo → review → merge) funciona end-to-end.

**Architecture:** Refactor preventivo de `prompts.ts` y `compute-plan-outcome.ts` a submódulos manteniendo exports compatibles (zero breaking change). Crear directorio `src/golf/coach/v3/` como home del nuevo cerebro coexistiendo con el v2 actual. Instalar tablas de infraestructura (`cerebro_weights`, `cerebro_events`, `cost_tracking`, `evaluation_runs`, `llm_models`) con trigger Postgres + Supabase Realtime channel para invalidación distribuida de cache cross-process. UI admin básica `/admin/cerebro/pesos` con sliders manuales (sin lógica adaptive todavía — sólo override manual). Harness baseline que corre el cerebro v2 actual contra 5 perfiles sintéticos para tener referencia comparable en olas siguientes.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + Realtime + pgvector), Vitest, Playwright, Tailwind CSS, AI SDK v6 (preparación para ola 1).

**Worktree:** `.claude/worktrees/cerebro-v3-ola-0/` en branch `chore/cerebro-v3-ola-0-claude`.

**Estimado:** 3-4 días de trabajo concentrado.

**Pre-requisitos ya completados (NO redos):**
- ✅ Spec maestro `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md` aprobado y pusheado (`d116fd3`).
- ✅ `CLAUDE.md` con sección "Protocolo Cerebro V3" (commit `18e21d6`).
- ✅ `docs/cerebro-v3-estado.md` creado (commit `18e21d6`).
- ✅ 4 memorias del proyecto creadas/actualizadas.

**Spec mapping:** este plan implementa los entregables listados en §3 Ola 0 del spec maestro.

---

## Mapa de archivos a crear/modificar

**Crear (nuevos):**
- `src/golf/coach/v3/index.ts` — barrel export del cerebro v3 (vacío inicialmente)
- `src/golf/coach/v3/README.md` — explica que vive aquí el cerebro v3
- `src/golf/coach/prompts/identidad.ts` — submódulo refactorizado
- `src/golf/coach/prompts/contexto.ts` — submódulo refactorizado
- `src/golf/coach/prompts/plantillas.ts` — submódulo refactorizado
- `src/golf/coach/prompts/anti_hallucination.ts` — submódulo refactorizado
- `src/golf/coach/prompts/index.ts` — barrel que re-exporta TAIGER_SYSTEM_PROMPT compuesto
- `src/golf/coach/metrics/back9-front9.ts` — métrica aislada (preservando lógica)
- `src/golf/coach/metrics/first-hole.ts`
- `src/golf/coach/metrics/par3-vs-par.ts`
- `src/golf/coach/metrics/post-bogey.ts`
- `src/golf/coach/metrics/double-or-worse.ts`
- `src/golf/coach/metrics/last4-vs-rest.ts`
- `src/golf/coach/metrics/consistency-cv.ts`
- `src/golf/coach/metrics/index.ts` — barrel
- `src/golf/coach/metrics/types.ts` — `ComputedMetric` shared
- `src/lib/cerebro/weights.ts` — capa de lectura/escritura de `cerebro_weights`
- `src/lib/cerebro/weights-cache.ts` — cache distribuido con Supabase Realtime
- `src/lib/cerebro/events.ts` — capa de escritura a `cerebro_events`
- `src/lib/cerebro/llm-models.ts` — lectura de `llm_models` con fallback
- `src/app/admin/cerebro/pesos/page.tsx` — UI admin con sliders
- `src/app/admin/cerebro/pesos/SlidersPanel.tsx` — componente sliders
- `src/app/admin/cerebro/pesos/TestNowPanel.tsx` — preview en vivo
- `src/app/api/admin/cerebro/weights/route.ts` — endpoint GET/PUT
- `src/app/api/admin/cerebro/test-now/route.ts` — endpoint POST
- `supabase/migrations/037_cerebro_v3_observability.sql` — schema de tablas
- `scripts/evaluate-cerebro.mjs` — harness baseline
- `scripts/cerebro/synthetic-profiles.json` — 5 perfiles sintéticos
- `scripts/cerebro/canary-cases.json` — 30+ casos canario

**Modificar:**
- `src/golf/coach/prompts.ts` (464 LOC) → se reemplaza por barrel export desde `src/golf/coach/prompts/index.ts`
- `src/golf/coach/compute-plan-outcome.ts` (417 LOC) → se reemplaza por barrel export desde `src/golf/coach/metrics/index.ts` + función orquestadora liviana
- `src/types/database.ts` — agregar tipos de las nuevas tablas

**Tests (nuevos):**
- `src/golf/coach/prompts/__tests__/snapshot.test.ts`
- `src/golf/coach/metrics/__tests__/regression.test.ts`
- `src/lib/cerebro/__tests__/weights.test.ts`
- `src/lib/cerebro/__tests__/weights-cache.test.ts`
- `src/lib/cerebro/__tests__/llm-models.test.ts`
- `src/__tests__/admin/cerebro-pesos-page.test.ts`
- `src/__tests__/api/admin-cerebro-weights.test.ts`

---

## Task 1: Setup del worktree y baseline verde

**Files:**
- Verificar: `.claude/worktrees/cerebro-v3-ola-0/`

- [ ] **Step 1: Cambiar working directory al worktree**

```bash
cd .claude/worktrees/cerebro-v3-ola-0
git status
git branch --show-current
```

Expected: branch `chore/cerebro-v3-ola-0-claude`, working tree clean.

- [ ] **Step 2: Instalar deps (junction de node_modules si Windows)**

```bash
# Si node_modules no existe en el worktree (esperable):
ls node_modules 2>/dev/null || cmd /c mklink /J node_modules ..\..\..\node_modules
ls node_modules/.package-lock.json
```

Expected: junction creada exitosamente, archivo `.package-lock.json` accesible.

- [ ] **Step 3: Verificar baseline verde — tsc**

```bash
npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: Verificar baseline verde — tests**

```bash
npm test -- --run
```

Expected: todos los tests pasan. Si alguno falla, **PARAR** y avisar a Juanjo antes de seguir.

- [ ] **Step 5: Confirmar acceso a Supabase**

```bash
node --env-file=.env.local -e "const{createClient}=require('@supabase/supabase-js');const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);sb.from('profiles').select('id').limit(1).then(r=>console.log('OK',r.data?.length))"
```

Expected: `OK 1`.

- [ ] **Step 6: Commit checkpoint vacío (anchor del worktree)**

```bash
git commit --allow-empty -m "chore(cerebro-v3): inicio Ola 0 - Limpiar el taller"
```

---

## Task 2: Crear estructura de carpetas v3 + metrics + cerebro/

**Files:**
- Create: `src/golf/coach/v3/index.ts`
- Create: `src/golf/coach/v3/README.md`
- Create: `src/golf/coach/metrics/index.ts`
- Create: `src/golf/coach/metrics/types.ts`
- Create: `src/lib/cerebro/index.ts`

- [ ] **Step 1: Crear directorios y barrel exports vacíos**

```bash
mkdir -p src/golf/coach/v3 src/golf/coach/metrics src/lib/cerebro
```

- [ ] **Step 2: Escribir `src/golf/coach/v3/README.md`**

```markdown
# Cerebro V3 — Home

Este directorio aloja el nuevo cerebro del coach tAIger+ (cerebro v3).
Coexiste con el cerebro v2 actual (`src/golf/coach/*`) hasta que cada ola
del v3 esté validada con feature flag `cerebro_v3_enabled` activo para
el usuario.

Spec maestro: `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md`.
Estado vivo: `docs/cerebro-v3-estado.md`.
```

- [ ] **Step 3: Escribir `src/golf/coach/v3/index.ts`**

```typescript
// Barrel del cerebro v3. Vacío en Ola 0, se va llenando en olas siguientes.
export {}
```

- [ ] **Step 4: Escribir `src/golf/coach/metrics/types.ts`**

```typescript
export type ComputedMetric = {
  value: number | null
  reason: string
  metadata?: Record<string, unknown>
}
```

- [ ] **Step 5: Escribir `src/golf/coach/metrics/index.ts` (barrel vacío inicialmente)**

```typescript
export type { ComputedMetric } from './types'
// Los exports de cada métrica se agregan en Task 5.
```

- [ ] **Step 6: Escribir `src/lib/cerebro/index.ts` (barrel vacío inicialmente)**

```typescript
// Barrel del cerebro paramétrico vivo. Se llena en Tasks 8-11.
export {}
```

- [ ] **Step 7: Verificar tsc sigue verde**

```bash
npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 8: Commit**

```bash
git add src/golf/coach/v3 src/golf/coach/metrics src/lib/cerebro
git commit -m "chore(cerebro-v3): estructura inicial de v3/, metrics/, lib/cerebro/"
```

---

## Task 3: Snapshot test del system prompt actual (anclar comportamiento)

**Files:**
- Create: `src/golf/coach/prompts/__tests__/snapshot.test.ts`

- [ ] **Step 1: Crear test snapshot que captura el prompt actual**

```typescript
// src/golf/coach/prompts/__tests__/snapshot.test.ts
import { describe, it, expect } from 'vitest'
import { TAIGER_SYSTEM_PROMPT } from '../../prompts'

describe('TAIGER_SYSTEM_PROMPT snapshot', () => {
  it('preserva el prompt actual antes del refactor', () => {
    expect(TAIGER_SYSTEM_PROMPT).toMatchSnapshot()
  })

  it('contiene la sección de identidad de tAIger+', () => {
    expect(TAIGER_SYSTEM_PROMPT).toContain('tAIger+')
  })

  it('contiene la sección de anti-hallucination "MANEJO DE DATOS"', () => {
    expect(TAIGER_SYSTEM_PROMPT).toContain('MANEJO DE DATOS')
  })
})
```

- [ ] **Step 2: Correr el test para generar el snapshot inicial**

```bash
npm test -- --run src/golf/coach/prompts/__tests__/snapshot.test.ts
```

Expected: 3 tests PASS (el primer snapshot se crea automáticamente).

- [ ] **Step 3: Commit del snapshot**

```bash
git add src/golf/coach/prompts/__tests__
git commit -m "test(cerebro-v3): snapshot del system prompt actual antes del refactor"
```

---

## Task 4: Snapshot tests de las 7 métricas actuales (anclar cómputos)

**Files:**
- Create: `src/golf/coach/metrics/__tests__/regression.test.ts`

- [ ] **Step 1: Crear test de regresión con inputs fijos**

```typescript
// src/golf/coach/metrics/__tests__/regression.test.ts
import { describe, it, expect } from 'vitest'
import * as v2 from '../../compute-plan-outcome'

// Input fijo representativo: ronda 18 hoyos, par 72, jugador hcp 18.
const SAMPLE_ROUND = {
  total_gross: 88,
  par_cancha: 72,
  holes_played: 18,
  hole_scores: [4,5,6,4,5,5,4,5,6, 5,4,6,5,7,5,4,5,6],
  par_per_hole: { '1':4,'2':4,'3':5,'4':3,'5':4,'6':4,'7':4,'8':4,'9':5, '10':4,'11':4,'12':3,'13':5,'14':4,'15':4,'16':4,'17':3,'18':5 },
}
const RECENT_ROUNDS = [
  { ...SAMPLE_ROUND, total_gross: 89 },
  { ...SAMPLE_ROUND, total_gross: 90 },
  { ...SAMPLE_ROUND, total_gross: 87 },
  { ...SAMPLE_ROUND, total_gross: 88 },
  { ...SAMPLE_ROUND, total_gross: 86 },
]

describe('métricas v2 — regresión post-refactor', () => {
  it('computeBack9MinusFront9 produce un número estable', () => {
    const r = v2.computeBack9MinusFront9(SAMPLE_ROUND.hole_scores)
    expect(r).toMatchSnapshot()
  })

  it('computeFirstHole produce un número estable', () => {
    const r = v2.computeFirstHole(SAMPLE_ROUND.hole_scores, SAMPLE_ROUND.par_per_hole)
    expect(r).toMatchSnapshot()
  })

  it('computePar3VsPar produce un número estable', () => {
    const r = v2.computePar3VsPar(SAMPLE_ROUND.hole_scores, SAMPLE_ROUND.par_per_hole)
    expect(r).toMatchSnapshot()
  })

  it('computePostBogeyAvg produce un número estable', () => {
    const r = v2.computePostBogeyAvg(SAMPLE_ROUND.hole_scores, SAMPLE_ROUND.par_per_hole)
    expect(r).toMatchSnapshot()
  })

  it('computeDoubleOrWorsePct produce un número estable', () => {
    const r = v2.computeDoubleOrWorsePct(SAMPLE_ROUND.hole_scores, SAMPLE_ROUND.par_per_hole)
    expect(r).toMatchSnapshot()
  })

  it('computeLast4MinusRest produce un número estable', () => {
    const r = v2.computeLast4MinusRest(SAMPLE_ROUND.hole_scores)
    expect(r).toMatchSnapshot()
  })

  it('computeConsistencyCV (sobre rondas recientes 18h) produce un número estable', () => {
    const r = v2.computeConsistencyCV(RECENT_ROUNDS)
    expect(r).toMatchSnapshot()
  })
})
```

- [ ] **Step 2: Correr para generar snapshots**

```bash
npm test -- --run src/golf/coach/metrics/__tests__/regression.test.ts
```

Expected: 7 PASS. Snapshots persistidos.

> **Nota:** si alguna firma de función no coincide (ej. parámetro extra), ajustar el test antes del refactor — el comportamiento debe quedar congelado por nombre y firma reales del v2 actual. Si hay desviación, leer `src/golf/coach/compute-plan-outcome.ts` y matchear.

- [ ] **Step 3: Commit**

```bash
git add src/golf/coach/metrics/__tests__
git commit -m "test(cerebro-v3): snapshots de regresión de las 7 métricas v2"
```

---

## Task 5: Migración SQL 037 — parte 1 (cerebro_weights + trigger)

**Files:**
- Create: `supabase/migrations/037_cerebro_v3_observability.sql`

- [ ] **Step 1: Escribir migración con cerebro_weights + trigger Postgres**

```sql
-- supabase/migrations/037_cerebro_v3_observability.sql
-- Ola 0 del cerebro v3 — infraestructura transversal.

BEGIN;

-- 1) Pesos paramétricos vivos (modificables en vivo desde admin)
CREATE TABLE IF NOT EXISTS cerebro_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_type text NOT NULL CHECK (parameter_type IN ('block','pattern','source','user_cluster')),
  parameter_key text NOT NULL,
  current_weight numeric(5,4) NOT NULL CHECK (current_weight BETWEEN 0 AND 1),
  previous_weight numeric(5,4),
  user_cluster_id uuid,
  source text NOT NULL CHECK (source IN ('auto','manual','seed')),
  version integer NOT NULL DEFAULT 1,
  locked_until timestamptz,
  last_auto_update_at timestamptz,
  last_manual_override_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parameter_type, parameter_key, user_cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_cerebro_weights_lookup
  ON cerebro_weights (parameter_type, parameter_key)
  WHERE user_cluster_id IS NULL;

-- 2) Trigger para invalidación distribuida via pg_notify (Supabase Realtime escucha sobre canales NOTIFY)
CREATE OR REPLACE FUNCTION notify_cerebro_weights_change() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('cerebro_weights_updated', json_build_object(
    'parameter_type', NEW.parameter_type,
    'parameter_key', NEW.parameter_key,
    'updated_at', NEW.updated_at
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cerebro_weights_notify ON cerebro_weights;
CREATE TRIGGER trg_cerebro_weights_notify
AFTER INSERT OR UPDATE ON cerebro_weights
FOR EACH ROW EXECUTE FUNCTION notify_cerebro_weights_change();

-- 3) RLS — solo admin escribe; lectura pública (no son datos personales)
ALTER TABLE cerebro_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cerebro_weights_read_public"
  ON cerebro_weights FOR SELECT USING (true);

CREATE POLICY "cerebro_weights_write_admin"
  ON cerebro_weights FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

COMMIT;
```

- [ ] **Step 2: Aplicar migración a Supabase con `run-sql.mjs`**

```bash
node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/037_cerebro_v3_observability.sql
```

Expected: salida `OK migration applied`.

- [ ] **Step 3: Smoke test directo contra la tabla**

```bash
node --env-file=.env.local -e "const{createClient}=require('@supabase/supabase-js');const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);(async()=>{await sb.from('cerebro_weights').insert({parameter_type:'block',parameter_key:'test_smoke',current_weight:0.5,source:'seed'});const{data}=await sb.from('cerebro_weights').select('*').eq('parameter_key','test_smoke');console.log(JSON.stringify(data,null,2));await sb.from('cerebro_weights').delete().eq('parameter_key','test_smoke');console.log('cleanup OK')})()"
```

Expected: la row aparece con `current_weight: 0.5`; cleanup remueve.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/037_cerebro_v3_observability.sql
git commit -m "feat(cerebro-v3): migración 037 parte 1 - cerebro_weights + trigger Postgres"
```

---

## Task 6: Migración 037 — parte 2 (cerebro_events + cost_tracking + evaluation_runs)

**Files:**
- Modify: `supabase/migrations/037_cerebro_v3_observability.sql`

- [ ] **Step 1: Agregar tres tablas al final de la migración (antes del COMMIT)**

```sql
-- 4) Event log del cerebro (alimenta el tablero del coach)
CREATE TABLE IF NOT EXISTS cerebro_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_payload jsonb NOT NULL,
  weights_snapshot jsonb,
  latency_ms integer,
  cost_usd numeric(8,5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cerebro_events_user_time ON cerebro_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cerebro_events_type_time ON cerebro_events (event_type, created_at DESC);

ALTER TABLE cerebro_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cerebro_events_read_admin"
  ON cerebro_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "cerebro_events_insert_service"
  ON cerebro_events FOR INSERT TO service_role WITH CHECK (true);

-- 5) Cost tracking por feature y proveedor
CREATE TABLE IF NOT EXISTS cost_tracking (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  feature text NOT NULL,
  provider text NOT NULL,
  tokens_input integer,
  tokens_output integer,
  cost_usd numeric(8,5) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_user_day ON cost_tracking (user_id, created_at);

ALTER TABLE cost_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cost_tracking_read_admin"
  ON cost_tracking FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 6) Banco de pruebas — runs de evaluación
CREATE TABLE IF NOT EXISTS evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by text NOT NULL,
  ola_version text,
  profiles_evaluated text[],
  results jsonb NOT NULL,
  pass boolean NOT NULL,
  evaluator_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE evaluation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evaluation_runs_admin"
  ON evaluation_runs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

- [ ] **Step 2: Re-aplicar migración (es idempotente por los `IF NOT EXISTS`)**

```bash
node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/037_cerebro_v3_observability.sql
```

Expected: aplica sin error (las tablas nuevas se crean; cerebro_weights ya existía).

- [ ] **Step 3: Smoke contra las 3 tablas nuevas**

```bash
node --env-file=.env.local -e "const{createClient}=require('@supabase/supabase-js');const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);(async()=>{for(const t of ['cerebro_events','cost_tracking','evaluation_runs']){const{error}=await sb.from(t).select('id').limit(1);console.log(t,error?error.message:'OK')}})()"
```

Expected: las 3 tablas responden `OK`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/037_cerebro_v3_observability.sql
git commit -m "feat(cerebro-v3): migración 037 parte 2 - cerebro_events + cost_tracking + evaluation_runs"
```

---

## Task 7: Migración 037 — parte 3 (llm_models + seed)

**Files:**
- Modify: `supabase/migrations/037_cerebro_v3_observability.sql`

- [ ] **Step 1: Agregar tabla `llm_models` + seed antes del COMMIT**

```sql
-- 7) Versionado de LLM con fallback explícito
CREATE TABLE IF NOT EXISTS llm_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('primary_chat','reasoning','evaluator','embedding','rerank')),
  status text NOT NULL CHECK (status IN ('active','fallback','deprecated','retired')),
  context_window integer,
  cost_per_1m_tokens_input numeric(8,4),
  cost_per_1m_tokens_output numeric(8,4),
  embedding_dim integer,
  fallback_to_model_id text,
  config jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE llm_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "llm_models_read_public"
  ON llm_models FOR SELECT USING (true);
CREATE POLICY "llm_models_write_admin"
  ON llm_models FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed de los 5 roles iniciales
INSERT INTO llm_models (model_id, role, status, context_window, cost_per_1m_tokens_input, cost_per_1m_tokens_output, embedding_dim, fallback_to_model_id, config)
VALUES
  ('anthropic/claude-sonnet-4-6', 'primary_chat', 'active', 200000, 3.0, 15.0, NULL, 'anthropic/claude-haiku-4-5', '{}'),
  ('anthropic/claude-opus-4-7', 'reasoning', 'active', 200000, 15.0, 75.0, NULL, 'anthropic/claude-sonnet-4-6', '{}'),
  ('anthropic/claude-haiku-4-5', 'evaluator', 'active', 200000, 0.25, 1.25, NULL, NULL, '{}'),
  ('openai/text-embedding-3-small', 'embedding', 'active', NULL, 0.02, NULL, 1536, NULL, '{}'),
  ('cohere/rerank-multilingual-v3.0', 'rerank', 'active', NULL, NULL, NULL, NULL, NULL, '{}')
ON CONFLICT (model_id) DO NOTHING;
```

- [ ] **Step 2: Aplicar**

```bash
node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/037_cerebro_v3_observability.sql
```

Expected: OK, 5 rows insertadas (o 0 si ya existían).

- [ ] **Step 3: Smoke**

```bash
node --env-file=.env.local -e "const{createClient}=require('@supabase/supabase-js');const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);(async()=>{const{data}=await sb.from('llm_models').select('model_id,role,status,fallback_to_model_id').order('role');console.table(data)})()"
```

Expected: tabla con 5 filas, todas `status=active`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/037_cerebro_v3_observability.sql
git commit -m "feat(cerebro-v3): migración 037 parte 3 - llm_models + seed inicial 5 roles"
```

---

## Task 8: Migración 037 — parte 4 (feature flag cerebro_v3_enabled)

**Files:**
- Modify: `supabase/migrations/037_cerebro_v3_observability.sql`

- [ ] **Step 1: Agregar columna a profiles antes del COMMIT**

```sql
-- 8) Feature flag por usuario para rollback seguro entre cerebro v2 y v3
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cerebro_v3_enabled boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Aplicar**

```bash
node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/037_cerebro_v3_observability.sql
```

Expected: OK.

- [ ] **Step 3: Activar el flag para Juanjo (usuario #1 con cerebro_v3_enabled = true)**

```bash
node --env-file=.env.local -e "const{createClient}=require('@supabase/supabase-js');const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);(async()=>{const{data,error}=await sb.from('profiles').update({cerebro_v3_enabled:true}).eq('email','juanjoselamarca@gmail.com').select('id,email,cerebro_v3_enabled');console.log(JSON.stringify({data,error},null,2))})()"
```

Expected: 1 row con `cerebro_v3_enabled: true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/037_cerebro_v3_observability.sql
git commit -m "feat(cerebro-v3): migración 037 parte 4 - feature flag cerebro_v3_enabled en profiles"
```

---

## Task 9: Refactor preventivo de `prompts.ts` — paso 1 (subir snapshot)

**Files:**
- Verificar: `src/golf/coach/prompts/__tests__/snapshot.test.ts` (creado en Task 3)

- [ ] **Step 1: Confirmar que el snapshot del Task 3 sigue verde**

```bash
npm test -- --run src/golf/coach/prompts/__tests__/snapshot.test.ts
```

Expected: 3 PASS. Si falla, **PARAR** — el refactor no puede empezar con baseline inestable.

---

## Task 10: Refactor `prompts.ts` — paso 2 (extraer submódulos)

**Files:**
- Create: `src/golf/coach/prompts/identidad.ts`
- Create: `src/golf/coach/prompts/contexto.ts`
- Create: `src/golf/coach/prompts/plantillas.ts`
- Create: `src/golf/coach/prompts/anti_hallucination.ts`
- Create: `src/golf/coach/prompts/index.ts`
- Modify: `src/golf/coach/prompts.ts` (se reemplaza por re-export del barrel)

- [ ] **Step 1: Leer el contenido actual de `prompts.ts`**

```bash
cat src/golf/coach/prompts.ts
```

Identificar mentalmente 4 secciones lógicas:
- **identidad**: definición del rol "Eres tAIger+..."
- **contexto**: cómo se inyecta `HISTORIAL DE SESIONES`, `ÚLTIMA SESIÓN`, etc.
- **plantillas**: estructura de respuesta esperada
- **anti_hallucination**: reglas de "no inventar", "MANEJO DE DATOS FALTANTES"

> **Nota:** las secciones reales pueden ser cortadas distinto al leer. Lo que importa es que cada submódulo exporte un string template y que `index.ts` los componga en `TAIGER_SYSTEM_PROMPT` en el mismo orden y contenido textual exacto.

- [ ] **Step 2: Crear `src/golf/coach/prompts/identidad.ts`**

```typescript
// Extraído de src/golf/coach/prompts.ts — sección "Eres tAIger+..."
export const IDENTIDAD = `[copiar texto literal de la sección de identidad del prompt actual]`
```

> **Importante:** este step describe el patrón. El contenido real se copia del archivo actual sin modificar una sola palabra. El test snapshot lo va a verificar.

- [ ] **Step 3: Crear `src/golf/coach/prompts/contexto.ts`**

```typescript
// Extraído de prompts.ts — funciones que construyen el bloque de contexto (sessions, ultima sesion).
// Si hay funciones helper como buildContextString, también se mueven aquí.
export const CONTEXTO_HEADERS = `[texto literal del header de contexto, si existe]`

// Si la implementación actual exporta funciones (como buildContextString), se reproducen aquí
// con la MISMA firma y comportamiento.
```

- [ ] **Step 4: Crear `src/golf/coach/prompts/plantillas.ts`**

```typescript
// Extraído de prompts.ts — plantilla de respuesta esperada (6 piezas u otras).
export const PLANTILLAS = `[texto literal]`
```

- [ ] **Step 5: Crear `src/golf/coach/prompts/anti_hallucination.ts`**

```typescript
// Extraído de prompts.ts — sección "MANEJO DE DATOS FALTANTES O INCONSISTENTES" + cualquier regla de no-inventar.
export const ANTI_HALLUCINATION = `[texto literal]`
```

- [ ] **Step 6: Crear `src/golf/coach/prompts/index.ts` que recompone el prompt**

```typescript
import { IDENTIDAD } from './identidad'
import { CONTEXTO_HEADERS } from './contexto'
import { PLANTILLAS } from './plantillas'
import { ANTI_HALLUCINATION } from './anti_hallucination'

// Recompone TAIGER_SYSTEM_PROMPT en el mismo orden que tenía el archivo monolítico.
export const TAIGER_SYSTEM_PROMPT = [
  IDENTIDAD,
  CONTEXTO_HEADERS,
  PLANTILLAS,
  ANTI_HALLUCINATION,
].join('\n\n')

// Re-exportar cualquier función helper que tuviera el original (ej. buildContextString)
export * from './contexto'
```

- [ ] **Step 7: Modificar `src/golf/coach/prompts.ts` para re-exportar desde el barrel**

```typescript
// Mantenemos la ruta de import existente (todos los lugares que hacen
// `import { TAIGER_SYSTEM_PROMPT } from '@/golf/coach/prompts'` siguen funcionando).
export * from './prompts/index'
```

- [ ] **Step 8: Correr el snapshot test — debe seguir PASS**

```bash
npm test -- --run src/golf/coach/prompts/__tests__/snapshot.test.ts
```

Expected: 3 PASS. **Si el snapshot cambió**, alguna palabra se perdió en la copia — leer el diff del snapshot, encontrar la pieza faltante, y arreglar antes de seguir.

- [ ] **Step 9: Correr todo el test suite — nada más debe romperse**

```bash
npm test -- --run
```

Expected: todos PASS.

- [ ] **Step 10: Commit**

```bash
git add src/golf/coach/prompts src/golf/coach/prompts.ts
git commit -m "refactor(cerebro-v3): prompts.ts a submódulos identidad/contexto/plantillas/anti_hallucination"
```

---

## Task 11: Refactor preventivo de `compute-plan-outcome.ts` — paso 1 (snapshot verde)

**Files:**
- Verificar: `src/golf/coach/metrics/__tests__/regression.test.ts`

- [ ] **Step 1: Confirmar snapshots verdes**

```bash
npm test -- --run src/golf/coach/metrics/__tests__/regression.test.ts
```

Expected: 7 PASS.

---

## Task 12: Refactor `compute-plan-outcome.ts` — paso 2 (cada métrica a su archivo)

**Files:**
- Create: `src/golf/coach/metrics/back9-front9.ts`
- Create: `src/golf/coach/metrics/first-hole.ts`
- Create: `src/golf/coach/metrics/par3-vs-par.ts`
- Create: `src/golf/coach/metrics/post-bogey.ts`
- Create: `src/golf/coach/metrics/double-or-worse.ts`
- Create: `src/golf/coach/metrics/last4-vs-rest.ts`
- Create: `src/golf/coach/metrics/consistency-cv.ts`
- Modify: `src/golf/coach/metrics/index.ts`
- Modify: `src/golf/coach/compute-plan-outcome.ts` (se reemplaza por barrel + orquestador delgado)

- [ ] **Step 1: Leer el actual `compute-plan-outcome.ts`**

```bash
cat src/golf/coach/compute-plan-outcome.ts
```

Identificar:
- 7 funciones de cómputo individuales (firma + body)
- La función orquestadora (si existe) que arma `metric_value`, `delta_vs_baseline`, etc.
- Helpers internos compartidos (ej. parsing de `par_per_hole` JSONB → array)

- [ ] **Step 2: Crear cada métrica como módulo aislado**

Para cada métrica, archivo del estilo:

```typescript
// src/golf/coach/metrics/back9-front9.ts
import type { ComputedMetric } from './types'

export function computeBack9MinusFront9(holeScores: number[]): ComputedMetric {
  // Copiar la lógica EXACTA del compute-plan-outcome.ts actual.
  // No "mejorar" nada. No "cleanup". Sólo extraer.
  if (holeScores.length < 18) return { value: null, reason: 'requires 18 holes' }
  const front = holeScores.slice(0, 9).reduce((a, b) => a + b, 0)
  const back = holeScores.slice(9, 18).reduce((a, b) => a + b, 0)
  return { value: back - front, reason: `back9=${back} front9=${front}` }
}
```

> Repetir el patrón para las 7 métricas. El cuerpo de cada función se copia textualmente desde `compute-plan-outcome.ts`. El test de regresión va a verificar bit-a-bit que el resultado es el mismo.

- [ ] **Step 3: Actualizar `src/golf/coach/metrics/index.ts` con los exports**

```typescript
export type { ComputedMetric } from './types'
export { computeBack9MinusFront9 } from './back9-front9'
export { computeFirstHole } from './first-hole'
export { computePar3VsPar } from './par3-vs-par'
export { computePostBogeyAvg } from './post-bogey'
export { computeDoubleOrWorsePct } from './double-or-worse'
export { computeLast4MinusRest } from './last4-vs-rest'
export { computeConsistencyCV } from './consistency-cv'
```

- [ ] **Step 4: Reemplazar `compute-plan-outcome.ts` por barrel re-export + orquestador delgado**

```typescript
// src/golf/coach/compute-plan-outcome.ts
// Después del refactor de Ola 0: este archivo es un orquestador delgado.
// Las 7 métricas viven en src/golf/coach/metrics/.

export * from './metrics'

// Si el archivo original exportaba además una función orquestadora tipo
// computePlanOutcome(plan, round, recentRounds), se mantiene aquí:
import {
  computeBack9MinusFront9,
  computeFirstHole,
  computePar3VsPar,
  computePostBogeyAvg,
  computeDoubleOrWorsePct,
  computeLast4MinusRest,
  computeConsistencyCV,
} from './metrics'

// ... (la firma exacta de computePlanOutcome se preserva, llamando a las nuevas funciones modulares)
```

> **Importante:** preservar TODAS las exports actuales para no romper consumidores. Si hay tests que importan `computePlanOutcome` o cualquier helper, esos imports siguen funcionando vía el barrel.

- [ ] **Step 5: Correr snapshots — DEBEN seguir verdes**

```bash
npm test -- --run src/golf/coach/metrics/__tests__/regression.test.ts
```

Expected: 7 PASS. Si alguno cambió, hay un bit que se perdió en la extracción — buscar diferencia y arreglar.

- [ ] **Step 6: Correr todo el suite**

```bash
npm test -- --run
```

Expected: todos PASS.

- [ ] **Step 7: Commit**

```bash
git add src/golf/coach/metrics src/golf/coach/compute-plan-outcome.ts
git commit -m "refactor(cerebro-v3): compute-plan-outcome.ts a 7 módulos en metrics/"
```

---

## Task 13: Capa de acceso a `cerebro_weights` (TDD)

**Files:**
- Create: `src/lib/cerebro/__tests__/weights.test.ts`
- Create: `src/lib/cerebro/weights.ts`

- [ ] **Step 1: Escribir el test failing**

```typescript
// src/lib/cerebro/__tests__/weights.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getAllWeights, getWeightByKey, setWeight } from '../weights'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

describe('cerebro/weights', () => {
  beforeAll(async () => {
    await sb.from('cerebro_weights').delete().eq('parameter_key', 'test_unit')
    await sb.from('cerebro_weights').insert({
      parameter_type: 'block',
      parameter_key: 'test_unit',
      current_weight: 0.35,
      source: 'seed',
    })
  })

  afterAll(async () => {
    await sb.from('cerebro_weights').delete().eq('parameter_key', 'test_unit')
  })

  it('getAllWeights devuelve la fila seed', async () => {
    const all = await getAllWeights()
    expect(all.some(w => w.parameter_key === 'test_unit')).toBe(true)
  })

  it('getWeightByKey devuelve el valor correcto', async () => {
    const w = await getWeightByKey('block', 'test_unit')
    expect(w?.current_weight).toBeCloseTo(0.35)
  })

  it('setWeight actualiza el valor y mueve previous_weight', async () => {
    await setWeight('block', 'test_unit', 0.42, 'manual')
    const w = await getWeightByKey('block', 'test_unit')
    expect(w?.current_weight).toBeCloseTo(0.42)
    expect(w?.previous_weight).toBeCloseTo(0.35)
    expect(w?.source).toBe('manual')
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

```bash
npm test -- --run src/lib/cerebro/__tests__/weights.test.ts
```

Expected: FAIL con "Cannot find module '../weights'".

- [ ] **Step 3: Implementar mínimo**

```typescript
// src/lib/cerebro/weights.ts
import { createClient } from '@supabase/supabase-js'

const supabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type CerebroWeight = {
  id: string
  parameter_type: 'block' | 'pattern' | 'source' | 'user_cluster'
  parameter_key: string
  current_weight: number
  previous_weight: number | null
  source: 'auto' | 'manual' | 'seed'
  version: number
  updated_at: string
}

export async function getAllWeights(): Promise<CerebroWeight[]> {
  const { data, error } = await supabase().from('cerebro_weights').select('*')
  if (error) throw error
  return data ?? []
}

export async function getWeightByKey(
  type: CerebroWeight['parameter_type'],
  key: string,
): Promise<CerebroWeight | null> {
  const { data, error } = await supabase()
    .from('cerebro_weights')
    .select('*')
    .eq('parameter_type', type)
    .eq('parameter_key', key)
    .is('user_cluster_id', null)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function setWeight(
  type: CerebroWeight['parameter_type'],
  key: string,
  newWeight: number,
  source: 'auto' | 'manual',
): Promise<void> {
  const existing = await getWeightByKey(type, key)
  const payload = {
    parameter_type: type,
    parameter_key: key,
    current_weight: newWeight,
    previous_weight: existing?.current_weight ?? null,
    source,
    version: (existing?.version ?? 0) + 1,
    last_auto_update_at: source === 'auto' ? new Date().toISOString() : existing?.last_auto_update_at ?? null,
    last_manual_override_at: source === 'manual' ? new Date().toISOString() : existing?.last_manual_override_at ?? null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase().from('cerebro_weights').upsert(payload, {
    onConflict: 'parameter_type,parameter_key,user_cluster_id',
  })
  if (error) throw error
}
```

- [ ] **Step 4: Correr el test — debe pasar**

```bash
npm test -- --run src/lib/cerebro/__tests__/weights.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Actualizar barrel `src/lib/cerebro/index.ts`**

```typescript
export * from './weights'
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/cerebro
git commit -m "feat(cerebro-v3): capa de acceso a cerebro_weights con TDD"
```

---

## Task 14: Cache distribuido con Supabase Realtime (TDD)

**Files:**
- Create: `src/lib/cerebro/__tests__/weights-cache.test.ts`
- Create: `src/lib/cerebro/weights-cache.ts`

- [ ] **Step 1: Escribir test failing**

```typescript
// src/lib/cerebro/__tests__/weights-cache.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCachedWeights, invalidateLocal, _resetCacheForTest } from '../weights-cache'

vi.mock('../weights', () => ({
  getAllWeights: vi.fn(async () => [
    { id: '1', parameter_type: 'block', parameter_key: 'pga', current_weight: 0.35, previous_weight: null, source: 'seed', version: 1, updated_at: new Date().toISOString() },
  ]),
}))

describe('cerebro/weights-cache', () => {
  beforeEach(() => {
    _resetCacheForTest()
  })

  it('primera llamada hace fetch a BD', async () => {
    const { getAllWeights } = await import('../weights')
    const w = await getCachedWeights()
    expect(w).toHaveLength(1)
    expect(getAllWeights).toHaveBeenCalledTimes(1)
  })

  it('llamadas siguientes dentro del TTL devuelven cache (no fetch a BD)', async () => {
    const { getAllWeights } = await import('../weights')
    await getCachedWeights()
    await getCachedWeights()
    await getCachedWeights()
    expect(getAllWeights).toHaveBeenCalledTimes(1)
  })

  it('invalidateLocal fuerza fetch en la siguiente llamada', async () => {
    const { getAllWeights } = await import('../weights')
    await getCachedWeights()
    invalidateLocal()
    await getCachedWeights()
    expect(getAllWeights).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Verificar que falla**

```bash
npm test -- --run src/lib/cerebro/__tests__/weights-cache.test.ts
```

Expected: FAIL con "Cannot find module '../weights-cache'".

- [ ] **Step 3: Implementar el cache distribuido**

```typescript
// src/lib/cerebro/weights-cache.ts
import { createClient } from '@supabase/supabase-js'
import { getAllWeights, type CerebroWeight } from './weights'

const TTL_MS = 60_000  // 60 segundos

let cache: { weights: CerebroWeight[]; loadedAt: number } | null = null
let channelSubscribed = false

function ensureChannelSubscribed() {
  if (channelSubscribed) return
  if (typeof window !== 'undefined') return  // sólo server-side
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    sb.channel('cerebro_weights_updated')
      .on('broadcast', { event: 'change' }, () => {
        cache = null
      })
      .subscribe()
    channelSubscribed = true
  } catch (e) {
    // En tests, Realtime puede no estar disponible — fail silently.
    // El cache TTL de 60s sigue siendo el safety net.
  }
}

export async function getCachedWeights(): Promise<CerebroWeight[]> {
  ensureChannelSubscribed()
  const now = Date.now()
  if (cache && now - cache.loadedAt < TTL_MS) {
    return cache.weights
  }
  const weights = await getAllWeights()
  cache = { weights, loadedAt: now }
  return weights
}

export function invalidateLocal(): void {
  cache = null
}

// Solo para tests — resetea estado del cache y la subscripción.
export function _resetCacheForTest(): void {
  cache = null
  channelSubscribed = false
}
```

- [ ] **Step 4: Correr el test — debe pasar**

```bash
npm test -- --run src/lib/cerebro/__tests__/weights-cache.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Actualizar barrel**

```typescript
// src/lib/cerebro/index.ts
export * from './weights'
export * from './weights-cache'
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/cerebro
git commit -m "feat(cerebro-v3): cache distribuido de weights con TTL + Supabase Realtime channel"
```

---

## Task 15: Capa de acceso a `llm_models` con fallback (TDD)

**Files:**
- Create: `src/lib/cerebro/__tests__/llm-models.test.ts`
- Create: `src/lib/cerebro/llm-models.ts`

- [ ] **Step 1: Test failing**

```typescript
// src/lib/cerebro/__tests__/llm-models.test.ts
import { describe, it, expect } from 'vitest'
import { resolveModelByRole } from '../llm-models'

describe('cerebro/llm-models', () => {
  it('devuelve el modelo active para primary_chat', async () => {
    const m = await resolveModelByRole('primary_chat')
    expect(m).not.toBeNull()
    expect(m?.status).toBe('active')
    expect(m?.role).toBe('primary_chat')
  })

  it('devuelve el modelo active para evaluator', async () => {
    const m = await resolveModelByRole('evaluator')
    expect(m?.model_id).toContain('haiku')
  })

  it('devuelve null para un rol desconocido', async () => {
    // @ts-expect-error tipo inválido a propósito
    const m = await resolveModelByRole('inexistente')
    expect(m).toBeNull()
  })
})
```

- [ ] **Step 2: Verificar fail**

```bash
npm test -- --run src/lib/cerebro/__tests__/llm-models.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/cerebro/llm-models.ts
import { createClient } from '@supabase/supabase-js'

const supabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export type LLMModelRole = 'primary_chat' | 'reasoning' | 'evaluator' | 'embedding' | 'rerank'

export type LLMModel = {
  id: string
  model_id: string
  role: LLMModelRole
  status: 'active' | 'fallback' | 'deprecated' | 'retired'
  context_window: number | null
  cost_per_1m_tokens_input: number | null
  cost_per_1m_tokens_output: number | null
  embedding_dim: number | null
  fallback_to_model_id: string | null
  config: Record<string, unknown> | null
}

export async function resolveModelByRole(role: LLMModelRole): Promise<LLMModel | null> {
  const { data, error } = await supabase()
    .from('llm_models')
    .select('*')
    .eq('role', role)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function resolveFallbackChain(role: LLMModelRole): Promise<string[]> {
  // Devuelve la cadena de fallback empezando por el modelo active.
  // Útil para AI Gateway que intenta provider tras provider.
  const primary = await resolveModelByRole(role)
  if (!primary) return []
  const chain = [primary.model_id]
  let current = primary
  while (current.fallback_to_model_id) {
    const { data } = await supabase()
      .from('llm_models')
      .select('*')
      .eq('model_id', current.fallback_to_model_id)
      .maybeSingle()
    if (!data) break
    chain.push(data.model_id)
    current = data
  }
  return chain
}
```

- [ ] **Step 4: Test debe pasar**

```bash
npm test -- --run src/lib/cerebro/__tests__/llm-models.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Barrel + commit**

```typescript
// src/lib/cerebro/index.ts
export * from './weights'
export * from './weights-cache'
export * from './llm-models'
```

```bash
git add src/lib/cerebro
git commit -m "feat(cerebro-v3): capa de acceso a llm_models con resolveFallbackChain"
```

---

## Task 16: Endpoint GET/PUT `/api/admin/cerebro/weights`

**Files:**
- Create: `src/app/api/admin/cerebro/weights/route.ts`
- Create: `src/__tests__/api/admin-cerebro-weights.test.ts`

- [ ] **Step 1: Test failing**

```typescript
// src/__tests__/api/admin-cerebro-weights.test.ts
import { describe, it, expect } from 'vitest'
import { GET, PUT } from '@/app/api/admin/cerebro/weights/route'
import { NextRequest } from 'next/server'

describe('GET /api/admin/cerebro/weights', () => {
  it('devuelve lista de pesos vigentes', async () => {
    const req = new NextRequest('http://localhost/api/admin/cerebro/weights')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.weights)).toBe(true)
  })
})

describe('PUT /api/admin/cerebro/weights', () => {
  it('actualiza un peso y devuelve confirmación', async () => {
    const req = new NextRequest('http://localhost/api/admin/cerebro/weights', {
      method: 'PUT',
      body: JSON.stringify({
        parameter_type: 'block',
        parameter_key: 'test_api',
        new_weight: 0.25,
      }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PUT(req)
    expect([200, 401, 403]).toContain(res.status)  // OK o sin auth (válido en test)
  })
})
```

- [ ] **Step 2: Fail**

```bash
npm test -- --run src/__tests__/api/admin-cerebro-weights.test.ts
```

- [ ] **Step 3: Implementar handler**

```typescript
// src/app/api/admin/cerebro/weights/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAllWeights, setWeight } from '@/lib/cerebro/weights'
import { invalidateLocal } from '@/lib/cerebro/weights-cache'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PutSchema = z.object({
  parameter_type: z.enum(['block', 'pattern', 'source', 'user_cluster']),
  parameter_key: z.string().min(1).max(100),
  new_weight: z.number().min(0).max(1),
})

async function isAdmin(req: NextRequest): Promise<boolean> {
  // En Ola 0 chequeo simple: cookie de Supabase + role admin en profiles.
  // Se profundiza en olas siguientes si hace falta.
  const token = req.cookies.get('sb-access-token')?.value
  if (!token) return false
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: user } = await sb.auth.getUser(token)
  if (!user?.user) return false
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.user.id).single()
  return profile?.role === 'admin'
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const weights = await getAllWeights()
  return NextResponse.json({ weights })
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const parsed = PutSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 })
  const { parameter_type, parameter_key, new_weight } = parsed.data
  await setWeight(parameter_type, parameter_key, new_weight, 'manual')
  invalidateLocal()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Test debe pasar (o devolver 403 esperado en sin-auth)**

```bash
npm test -- --run src/__tests__/api/admin-cerebro-weights.test.ts
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/cerebro/weights src/__tests__/api/admin-cerebro-weights.test.ts
git commit -m "feat(cerebro-v3): endpoint admin GET/PUT /api/admin/cerebro/weights"
```

---

## Task 17: Endpoint POST `/api/admin/cerebro/test-now`

**Files:**
- Create: `src/app/api/admin/cerebro/test-now/route.ts`

- [ ] **Step 1: Implementar el handler que invalida cache y responde con desglose**

```typescript
// src/app/api/admin/cerebro/test-now/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { invalidateLocal } from '@/lib/cerebro/weights-cache'
import { getAllWeights } from '@/lib/cerebro/weights'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

async function isAdmin(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get('sb-access-token')?.value
  if (!token) return false
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: user } = await sb.auth.getUser(token)
  if (!user?.user) return false
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.user.id).single()
  return profile?.role === 'admin'
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  invalidateLocal()
  const weights = await getAllWeights()
  return NextResponse.json({
    invalidated_at: new Date().toISOString(),
    weights_active: weights.map(w => ({
      type: w.parameter_type,
      key: w.parameter_key,
      weight: w.current_weight,
    })),
  })
}
```

- [ ] **Step 2: Smoke test rápido contra prod local**

```bash
# Inicia next dev en otra terminal: npm run dev
# Después:
curl -X POST http://localhost:3000/api/admin/cerebro/test-now
```

Expected: 403 (sin auth) o 200 con desglose si autenticado como admin. Cualquiera de los dos confirma que el endpoint está montado.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/cerebro/test-now
git commit -m "feat(cerebro-v3): endpoint admin POST /api/admin/cerebro/test-now"
```

---

## Task 18: Página admin `/admin/cerebro/pesos` con sliders

**Files:**
- Create: `src/app/admin/cerebro/pesos/page.tsx`
- Create: `src/app/admin/cerebro/pesos/SlidersPanel.tsx`

- [ ] **Step 1: Crear página server component que carga pesos iniciales**

```tsx
// src/app/admin/cerebro/pesos/page.tsx
import { getAllWeights } from '@/lib/cerebro/weights'
import { SlidersPanel } from './SlidersPanel'

export const dynamic = 'force-dynamic'

export default async function CerebroPesosPage() {
  const weights = await getAllWeights()
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Pesos del Cerebro V3</h1>
        <p className="text-sm text-neutral-500">
          Ajusta los pesos en vivo. El cambio se propaga a todas las instancias
          en menos de 60 segundos vía Supabase Realtime.
        </p>
      </header>
      <SlidersPanel initialWeights={weights} />
    </main>
  )
}
```

- [ ] **Step 2: Crear el componente client con sliders**

```tsx
// src/app/admin/cerebro/pesos/SlidersPanel.tsx
'use client'
import { useState } from 'react'
import type { CerebroWeight } from '@/lib/cerebro/weights'

type Props = { initialWeights: CerebroWeight[] }

export function SlidersPanel({ initialWeights }: Props) {
  const [weights, setWeights] = useState(initialWeights)
  const [saving, setSaving] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<unknown>(null)

  async function save(w: CerebroWeight) {
    setSaving(w.parameter_key)
    try {
      await fetch('/api/admin/cerebro/weights', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          parameter_type: w.parameter_type,
          parameter_key: w.parameter_key,
          new_weight: w.current_weight,
        }),
      })
    } finally {
      setSaving(null)
    }
  }

  async function testNow() {
    const r = await fetch('/api/admin/cerebro/test-now', { method: 'POST' })
    setTestResult(await r.json())
  }

  return (
    <div className="space-y-4">
      {weights.map(w => (
        <div key={w.id} className="rounded-lg border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-medium">{w.parameter_key}</div>
              <div className="text-xs text-neutral-500">{w.parameter_type}</div>
            </div>
            <div className="text-lg font-mono">{(w.current_weight * 100).toFixed(0)}%</div>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={w.current_weight}
            onChange={e => setWeights(prev => prev.map(p =>
              p.id === w.id ? { ...p, current_weight: Number(e.target.value) } : p
            ))}
            onMouseUp={() => save(w)}
            onTouchEnd={() => save(w)}
            className="w-full"
            disabled={saving === w.parameter_key}
          />
        </div>
      ))}
      <button
        onClick={testNow}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
      >
        Test ahora — invalida cache + muestra pesos vigentes
      </button>
      {testResult ? (
        <pre className="rounded-md bg-neutral-50 p-3 text-xs overflow-x-auto">
          {JSON.stringify(testResult, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: Levantar dev server y verificar visualmente**

```bash
npm run dev
# Abrir http://localhost:3000/admin/cerebro/pesos en navegador (con sesión admin)
```

Expected: si hay pesos seed → se muestran como sliders. Si está vacío → muestra "no hay pesos".

- [ ] **Step 4: Si no hay pesos seed, agregar 5 seed (bloques)**

```bash
node --env-file=.env.local -e "const{createClient}=require('@supabase/supabase-js');const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);(async()=>{const seeds=[{parameter_type:'block',parameter_key:'pga_data',current_weight:0.35,source:'seed'},{parameter_type:'block',parameter_key:'distributions',current_weight:0.15,source:'seed'},{parameter_type:'block',parameter_key:'strategy',current_weight:0.20,source:'seed'},{parameter_type:'block',parameter_key:'psychology',current_weight:0.20,source:'seed'},{parameter_type:'block',parameter_key:'rules',current_weight:0.10,source:'seed'}];const{error}=await sb.from('cerebro_weights').upsert(seeds,{onConflict:'parameter_type,parameter_key,user_cluster_id'});console.log(error??'OK 5 seeds')})()"
```

Expected: `OK 5 seeds`.

- [ ] **Step 5: Recargar la página — los 5 sliders aparecen**

- [ ] **Step 6: Mover un slider y verificar que persiste en BD**

```bash
node --env-file=.env.local -e "const{createClient}=require('@supabase/supabase-js');const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);sb.from('cerebro_weights').select('parameter_key,current_weight,version,last_manual_override_at').order('updated_at',{ascending:false}).then(r=>console.table(r.data))"
```

Expected: el peso movido tiene `version` incrementada y `last_manual_override_at` reciente.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/cerebro
git commit -m "feat(cerebro-v3): UI admin /admin/cerebro/pesos con sliders + test-now"
```

---

## Task 19: Harness baseline `scripts/evaluate-cerebro.mjs`

**Files:**
- Create: `scripts/cerebro/synthetic-profiles.json`
- Create: `scripts/cerebro/canary-cases.json`
- Create: `scripts/evaluate-cerebro.mjs`

- [ ] **Step 1: Crear perfiles sintéticos**

```json
// scripts/cerebro/synthetic-profiles.json
[
  { "name": "Aldo", "handicap": 5, "target": 3, "frequency": "2x_week", "type": "ambicioso" },
  { "name": "Beatriz", "handicap": 12, "target": 9, "frequency": "1x_week", "type": "recreativa-competitiva" },
  { "name": "Carlos", "handicap": 18, "target": 12, "frequency": "1x_2weeks", "type": "recreativo-serio" },
  { "name": "Dolores", "handicap": 22, "target": 18, "frequency": "1x_month", "type": "recreativa-social" },
  { "name": "Esteban", "handicap": 28, "target": 22, "frequency": "starter", "type": "aprendiz" }
]
```

- [ ] **Step 2: Crear casos canario (30+, abreviado)**

```json
// scripts/cerebro/canary-cases.json
[
  { "id": "sg-no-data", "question": "¿Cuántos strokes gained tuve hoy?", "must_not_invent": ["strokes gained", "shot tracking"], "must_say_one_of": ["no medimos golpe a golpe", "no tenemos esa información"] },
  { "id": "rotella-quote", "question": "¿Qué dice Rotella sobre el bogey?", "must_cite_source": true },
  { "id": "no-handicap", "question": "Soy nuevo, no tengo handicap", "must_have_fallback": true },
  { "id": "unrealistic-target", "question": "Quiero bajar de 25 a 0 en 3 meses", "must_be_realistic": true },
  { "id": "rule-14-3", "question": "¿Cuál es la regla 14-3?", "must_use_rules_skill": true }
]
```

- [ ] **Step 3: Crear el harness baseline (corre coach v2 actual)**

```javascript
// scripts/evaluate-cerebro.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const profiles = JSON.parse(await fs.readFile(path.join(__dirname, 'cerebro/synthetic-profiles.json'), 'utf8'))
const cases = JSON.parse(await fs.readFile(path.join(__dirname, 'cerebro/canary-cases.json'), 'utf8'))

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const APP_URL = process.env.APP_URL || 'https://golfersplus.vercel.app'

async function callCoach(profile, question) {
  // En Ola 0, baseline = pegamos al endpoint del coach v2 actual.
  // El plan de Ola 1 incluye un cliente más sofisticado que use el harness.
  const r = await fetch(`${APP_URL}/api/taiger/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profile_override: profile,
      messages: [{ role: 'user', content: question }],
    }),
  }).catch(e => ({ ok: false, error: e.message }))
  if (!r.ok) return { error: r.error ?? `HTTP ${r.status}` }
  return await r.json().catch(() => ({ error: 'non-json response' }))
}

function gradeResponse(testCase, response) {
  const text = JSON.stringify(response).toLowerCase()
  const issues = []
  if (testCase.must_not_invent) {
    for (const word of testCase.must_not_invent) {
      if (text.includes(word.toLowerCase())) {
        // Solo OK si dijo "no" al respecto
        const negation = ['no medimos', 'no tenemos', 'no contamos con']
        if (!negation.some(n => text.includes(n))) {
          issues.push(`mentioned forbidden "${word}" without negation`)
        }
      }
    }
  }
  if (testCase.must_say_one_of && !testCase.must_say_one_of.some(p => text.includes(p.toLowerCase()))) {
    issues.push('did not include any of the required phrases')
  }
  return { pass: issues.length === 0, issues }
}

async function runHarness() {
  const results = []
  for (const profile of profiles) {
    for (const c of cases) {
      const resp = await callCoach(profile, c.question)
      const grade = gradeResponse(c, resp)
      results.push({
        profile: profile.name,
        case_id: c.id,
        pass: grade.pass,
        issues: grade.issues,
        response_snippet: JSON.stringify(resp).slice(0, 200),
      })
      process.stdout.write(grade.pass ? '.' : 'F')
    }
  }
  process.stdout.write('\n')
  const passed = results.filter(r => r.pass).length
  console.log(`\nBaseline harness: ${passed}/${results.length} pass`)

  // Persistir el run en evaluation_runs
  const { error } = await supabase.from('evaluation_runs').insert({
    triggered_by: 'baseline_ola_0',
    ola_version: 'baseline_v2',
    profiles_evaluated: profiles.map(p => p.name),
    results,
    pass: passed === results.length,
    evaluator_notes: 'Baseline run de Ola 0 contra cerebro v2 actual. No representa target, sirve como referencia para olas siguientes.',
  })
  if (error) console.error('Error persistiendo run:', error.message)
  else console.log('Run persistido en evaluation_runs')
}

runHarness().catch(e => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 4: Correr el harness contra prod**

```bash
node --env-file=.env.local scripts/evaluate-cerebro.mjs
```

Expected: salida con N/M pass. **Cualquier número que salga es el baseline** — no falla la task si el coach actual rompe canarios; eso es justamente lo que vamos a mejorar.

- [ ] **Step 5: Verificar persistencia en BD**

```bash
node --env-file=.env.local -e "const{createClient}=require('@supabase/supabase-js');const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);sb.from('evaluation_runs').select('id,triggered_by,ola_version,pass,created_at').order('created_at',{ascending:false}).limit(3).then(r=>console.table(r.data))"
```

Expected: la fila más reciente con `triggered_by='baseline_ola_0'`.

- [ ] **Step 6: Commit**

```bash
git add scripts/evaluate-cerebro.mjs scripts/cerebro
git commit -m "feat(cerebro-v3): harness baseline scripts/evaluate-cerebro.mjs + 5 perfiles + 5+ casos canario"
```

---

## Task 20: Pre-push completo + verificación end-to-end

**Files:**
- Verificar todos los anteriores.

- [ ] **Step 1: Correr `npx tsc --noEmit`**

```bash
npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 2: Correr suite completo**

```bash
npm test -- --run
```

Expected: todo PASS, incluidos snapshots de prompts y métricas.

- [ ] **Step 3: Correr build**

```bash
npm run build
```

Expected: build exitoso.

- [ ] **Step 4: Health check**

```bash
curl -s https://golfersplus.vercel.app/api/admin/health-check | head -50
```

Expected: passed > 0, no FAIL nuevos. (Si hay FAIL pre-existentes documentados, no bloquean.)

- [ ] **Step 5: Push del worktree**

```bash
git push -u origin chore/cerebro-v3-ola-0-claude
```

- [ ] **Step 6: Crear PR**

```bash
gh pr create --title "feat(cerebro-v3): Ola 0 - Limpiar el taller" --body "$(cat <<'EOF'
## Summary
Implementa la Ola 0 del cerebro v3 según `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md` §3 Ola 0.

- Refactor preventivo de `prompts.ts` (464 LOC) a 4 submódulos con snapshot test que ancla comportamiento
- Refactor preventivo de `compute-plan-outcome.ts` (417 LOC) a 7 módulos por métrica con snapshots de regresión
- Estructura `src/golf/coach/v3/` como home del nuevo cerebro
- Migración 037: tablas `cerebro_weights` (con trigger Postgres + Supabase Realtime), `cerebro_events`, `cost_tracking`, `evaluation_runs`, `llm_models` (seed 5 modelos)
- Feature flag `profiles.cerebro_v3_enabled` (Juanjo: true, resto: false)
- Capa de acceso TDD: `src/lib/cerebro/weights.ts`, `weights-cache.ts` (cache distribuido), `llm-models.ts` (con fallback chain)
- UI admin `/admin/cerebro/pesos` con sliders en vivo + botón "test now"
- Endpoints `/api/admin/cerebro/weights` (GET/PUT) y `/test-now` (POST)
- Harness baseline `scripts/evaluate-cerebro.mjs` con 5 perfiles sintéticos + 5 casos canario, persiste en `evaluation_runs`

Cerebro v2 sigue 100% funcional. Feature flag controla rollout.

## Test plan
- [x] tsc verde
- [x] vitest verde (incluye snapshots de prompts y métricas)
- [x] build verde
- [x] migración 037 aplicada y verificada en Supabase
- [x] UI admin sirve y persiste cambios
- [x] cerebro_v3_enabled = true para Juanjo
- [x] baseline harness corrido y persistido en evaluation_runs
- [ ] demo en vivo con Juanjo (manual)
- [ ] code review por superpowers:code-reviewer agent (manual, antes de merge)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Invocar reviewer agent**

```
Agent({
  subagent_type: "superpowers:code-reviewer",
  description: "Review PR Ola 0",
  prompt: "Review PR chore/cerebro-v3-ola-0-claude contra spec docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md §3 Ola 0. Evaluar: ¿cobertura de entregables? ¿refactor preserva comportamiento? ¿SQL seguro? ¿RLS correcto? ¿endpoints con auth? ¿harness ejecutable?"
})
```

- [ ] **Step 8: Si reviewer arroja issues críticos, corregir y commitear ANTES de mergear.**

- [ ] **Step 9: Demo en vivo con Juanjo (no merge sin esto)**

Mostrar:
- `/admin/cerebro/pesos` cargado en navegador con los 5 sliders
- Mover un slider, ver que persiste
- "Test ahora" muestra los pesos vigentes
- Output del harness baseline

- [ ] **Step 10: Si Juanjo OK → merge a main**

```bash
gh pr merge --merge --delete-branch
```

- [ ] **Step 11: Actualizar `docs/cerebro-v3-estado.md` con cierre de Ola 0**

Marcar Ola 0 como `✅ mergeada YYYY-MM-DD, PR #N`. Apuntar próximo paso a Ola 1.

- [ ] **Step 12: Commit del estado actualizado en main**

```bash
git checkout main
git pull origin main
# Editar docs/cerebro-v3-estado.md
git add docs/cerebro-v3-estado.md
git commit -m "docs(cerebro-v3): cierre Ola 0 en estado vivo"
git push origin main
```

---

## Self-Review (checklist post-escritura)

**Spec coverage:**
- ✅ Refactor `prompts.ts` → Tasks 9-10
- ✅ Refactor `compute-plan-outcome.ts` → Tasks 11-12
- ✅ `src/golf/coach/v3/` creado → Task 2
- ✅ Migración 037 con todas las tablas + trigger → Tasks 5-8
- ✅ Mecanismo de invalidación distribuida → Tasks 5, 14
- ✅ UI admin sliders → Task 18
- ✅ Feature flag → Task 8
- ✅ Harness baseline → Task 19
- ✅ Cerebro paramétrico vivo (los 7 garantías relevantes para Ola 0: lectura por request, cache + invalidación, UI preview, weights_snapshot por respuesta) → Tasks 13, 14, 18
- ✅ Modelo routing (tabla `llm_models` + resolveModelByRole) → Tasks 7, 15

**Placeholders:** sólo en Task 10 step 2-5 (extracción manual del contenido de `prompts.ts`) — esto es intencional, el contenido se copia literal del archivo actual y el snapshot test verifica.

**Type consistency:** `ComputedMetric` definido en Task 2 step 4, usado en Task 12 step 2 con la misma firma. `CerebroWeight` definido en Task 13 step 3, usado en Tasks 14, 16, 18 con la misma estructura. `LLMModelRole` definido en Task 15 step 3, usado consistentemente.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-27-cerebro-v3-ola-0.md`.**

Dos opciones de ejecución:

1. **Subagent-driven (recomendado por la skill)** — dispatch fresh subagent por task, review entre tasks, iteración rápida.
2. **Inline execution** — ejecutar las 20 tasks en esta sesión con checkpoints.

Decisión: **inline execution** porque el CTO (yo) es quien lleva el contexto del proyecto entero y el demo a Juanjo es por ola, no por task. Subagent-driven sería bueno si el contexto fuera self-contained — pero acá el contexto del spec + memorias + estado es vital y no se transmite limpio a un subagente fresco por cada task.

Próxima task: **invocar `superpowers:executing-plans`** con este plan como input.
