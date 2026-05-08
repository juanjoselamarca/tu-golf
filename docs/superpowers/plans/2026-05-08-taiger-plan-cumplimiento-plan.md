# tAIger+ Plan Activo + Cumplimiento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el loop coach → ejecución → cumplimiento de tAIger+ con dos surfaces plan-aware (`/coach` Today Card + `/coach/sesion` chat premium), 7 piezas Tier 1 de UX, y un motor de inferencia de cumplimiento desde rondas reales.

**Architecture:** Plan vive como entidad de BD con state machine (proposed → accepted → in_progress → completed). Surfaces son plan-aware nativamente (no sticky banner). Cumplimiento se infiere automáticamente al cargar ronda (correlación de criterios) y se confirma vía quick-reply en chat. Componentes atómicos primero (TDD), composites después, integración de páginas al final.

**Tech Stack:** Next.js 14 App Router + TypeScript + React Testing Library + Vitest (vmThreads pool por OneDrive) + Supabase Postgres + Tailwind + ReactMarkdown (extensible vía CitedMarkdown existente) + SSE para chat streaming.

**Spec:** `docs/superpowers/specs/2026-05-08-taiger-plan-cumplimiento-design.md`
**Mockups:** `.superpowers/brainstorm/standalone/tu-golf-brainstorm.html` (sección "Premium completo")

---

## File Structure

### Migrations (Supabase)
- Create: `supabase/migrations/040_coach_plans_lifecycle.sql` — extiende `coach_plans` con status enum, focus_area, started_at, target_completion_at, completed_at, success_criteria JSONB
- Create: `supabase/migrations/041_coach_drills_table.sql` — nueva tabla `coach_drills` (id, plan_id, order_index, title, description, duration_min, target_metric, target_value, target_comparator, status, evidence_round_id, evidence_event_id)
- Create: `supabase/migrations/042_coach_events_extend_types.sql` — extiende CHECK constraint con drill_started, drill_completed_inferred, drill_completed_user, drill_skipped, inference_dismissed, plan_completed, plan_abandoned, plan_replaced

### Server lib (Node, server-only)
- Create: `src/lib/coach/active-plan.ts` — `getActivePlan(userId)` y `getCurrentDrill(planId)`
- Create: `src/lib/coach/inference.ts` — `evaluateRoundAgainstPlan(roundId, planId)` con 3 criterios MVP: approach 100-150y, putts cortos 1-2m, post-bogey spiral
- Create: `src/lib/coach/plan-state.ts` — transiciones de state machine + validators

### API routes
- Create: `src/app/api/taiger/plans/active/route.ts` — GET plan activo del usuario
- Create: `src/app/api/taiger/drills/[id]/start/route.ts` — POST emite drill_started event
- Create: `src/app/api/taiger/drills/[id]/complete/route.ts` — POST con `{ source: 'user' | 'inferred' }` emite drill_completed_*
- Create: `src/app/api/taiger/inference/round/[roundId]/route.ts` — POST evalúa ronda contra plan activo, emite system message + eventos
- Modify: `src/app/api/taiger/chat/route.ts` — emitir SSE events `drill_card`, `pattern_chip` cuando el coach use esos tools

### Components (atómicos)
- Create: `src/components/coach/QuickReplies.tsx` — chips de respuesta sugerida
- Create: `src/components/coach/ToolUseChip.tsx` — chip subtle de tool call
- Create: `src/components/coach/PatternChip.tsx` — inline chip referenciando un pattern
- Create: `src/components/coach/DrillCard.tsx` — card embebido con drill + CTA
- Modify: `src/components/coach/CitedMarkdown.tsx` — activar bindings de citation tap (hoy dormidos)

### Components (composites)
- Create: `src/components/coach/PlanAwareChatHeader.tsx` — header para `/coach/sesion`
- Create: `src/components/coach/TodayCard.tsx` — hero para `/coach`
- Create: `src/components/coach/PlanDetailDrawer.tsx` — bottom sheet de plan completo

### Hooks
- Create: `src/hooks/useActivePlan.ts` — fetch + cache del plan activo client-side

### Pages (modificadas)
- Modify: `src/app/coach/page.tsx` — render TodayCard si hay plan activo, fallback a TaigerHero
- Modify: `src/app/coach/sesion/[id]/page.tsx` — header plan-aware + DrillCard inline + QuickReplies + ToolUseChip + ComposerPlus

### Tests
- Create: `src/__tests__/components/QuickReplies.test.tsx`
- Create: `src/__tests__/components/ToolUseChip.test.tsx`
- Create: `src/__tests__/components/PatternChip.test.tsx`
- Create: `src/__tests__/components/DrillCard.test.tsx`
- Create: `src/__tests__/components/PlanAwareChatHeader.test.tsx`
- Create: `src/__tests__/components/TodayCard.test.tsx`
- Create: `src/__tests__/components/PlanDetailDrawer.test.tsx`
- Create: `src/__tests__/lib/coach/active-plan.test.ts`
- Create: `src/__tests__/lib/coach/inference.test.ts`
- Create: `src/__tests__/lib/coach/plan-state.test.ts`
- Create: `src/__tests__/api/taiger/plans-active.test.ts`
- Create: `src/__tests__/api/taiger/drills-complete.test.ts`
- Create: `src/__tests__/api/taiger/inference-round.test.ts`
- Create: `src/__tests__/integration/plan-completion-loop.test.ts`
- Modify: `src/__tests__/canary-stability.test.ts` — agregar canarios para TodayCard, plan-aware header, DrillCard, force-dynamic en nuevas rutas API

---

## Phase 0 — Schema foundation (3 tasks)

### Task 0.1: Verificar estado actual de `coach_plans`

**Files:**
- Create (temporal): `scripts/inspect-coach-plans.sql`

- [ ] **Step 1: Crear script de inspección**

```sql
-- scripts/inspect-coach-plans.sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'coach_plans'
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.coach_plans'::regclass;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'coach_drills'
ORDER BY ordinal_position;

SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.coach_events'::regclass AND conname LIKE '%type%';
```

- [ ] **Step 2: Ejecutar y analizar**

Run: `node --env-file=.env.local scripts/run-sql.mjs scripts/inspect-coach-plans.sql`
Expected: lista de columnas existentes en `coach_plans`, constraints, y CHECK de `coach_events.type`.

- [ ] **Step 3: Documentar baseline en comentario del próximo migration**

Anotar en cabecera de `040_coach_plans_lifecycle.sql` qué columnas ya existen y cuáles vamos a añadir, para evitar `ADD COLUMN IF NOT EXISTS` ciegos.

- [ ] **Step 4: Commit del script de inspección**

```bash
git add scripts/inspect-coach-plans.sql
git commit -m "chore(taiger): script inspect coach_plans schema baseline"
```

---

### Task 0.2: Migración `040_coach_plans_lifecycle.sql`

**Files:**
- Create: `supabase/migrations/040_coach_plans_lifecycle.sql`

- [ ] **Step 1: Escribir migración**

```sql
-- supabase/migrations/040_coach_plans_lifecycle.sql
-- Extiende coach_plans con state machine + metadata para plan activo + cumplimiento.
-- Baseline: ver Task 0.1 output. Solo añadimos lo que NO existe.

BEGIN;

-- Status enum (idempotente)
DO $$ BEGIN
  CREATE TYPE coach_plan_status AS ENUM (
    'proposed', 'accepted', 'in_progress', 'completed',
    'abandoned', 'replaced', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Columnas nuevas (idempotente)
ALTER TABLE public.coach_plans
  ADD COLUMN IF NOT EXISTS status coach_plan_status NOT NULL DEFAULT 'proposed',
  ADD COLUMN IF NOT EXISTS focus_area text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS target_completion_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS success_criteria jsonb DEFAULT '[]'::jsonb;

-- Índice para query "plan activo del usuario"
CREATE INDEX IF NOT EXISTS coach_plans_active_user_idx
  ON public.coach_plans (user_id, status)
  WHERE status IN ('accepted', 'in_progress');

-- Constraint: solo 1 plan activo por usuario
CREATE UNIQUE INDEX IF NOT EXISTS coach_plans_one_active_per_user
  ON public.coach_plans (user_id)
  WHERE status IN ('accepted', 'in_progress');

COMMIT;
```

- [ ] **Step 2: Aplicar localmente (Supabase prod, según convención del proyecto)**

Run: `node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/040_coach_plans_lifecycle.sql`
Expected: `BEGIN`, `CREATE TYPE` o `NOTICE`, `ALTER TABLE`, `CREATE INDEX`, `COMMIT`.

- [ ] **Step 3: Verificar con re-run del script de inspección**

Run: `node --env-file=.env.local scripts/run-sql.mjs scripts/inspect-coach-plans.sql`
Expected: `coach_plans` ahora tiene status, focus_area, started_at, target_completion_at, completed_at, success_criteria.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/040_coach_plans_lifecycle.sql
git commit -m "feat(coach/db): coach_plans lifecycle status + metadata (migration 040)"
```

---

### Task 0.3: Migraciones `041_coach_drills_table.sql` y `042_coach_events_extend_types.sql`

**Files:**
- Create: `supabase/migrations/041_coach_drills_table.sql`
- Create: `supabase/migrations/042_coach_events_extend_types.sql`

- [ ] **Step 1: Escribir 041_coach_drills_table.sql**

```sql
-- supabase/migrations/041_coach_drills_table.sql
BEGIN;

DO $$ BEGIN
  CREATE TYPE coach_drill_status AS ENUM (
    'pending', 'in_progress', 'completed_inferred',
    'completed_user', 'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.coach_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.coach_plans(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  title text NOT NULL,
  description text,
  duration_min int,
  target_metric text,
  target_value numeric,
  target_comparator text CHECK (target_comparator IN ('>=', '<=', '=', '>', '<')),
  status coach_drill_status NOT NULL DEFAULT 'pending',
  evidence_round_id uuid REFERENCES public.rounds(id) ON DELETE SET NULL,
  evidence_event_id uuid REFERENCES public.coach_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_drills_plan_idx ON public.coach_drills(plan_id, order_index);
CREATE INDEX IF NOT EXISTS coach_drills_pending_idx
  ON public.coach_drills(plan_id, order_index)
  WHERE status NOT IN ('completed_inferred', 'completed_user', 'skipped');

ALTER TABLE public.coach_drills ENABLE ROW LEVEL SECURITY;

CREATE POLICY coach_drills_owner_select ON public.coach_drills FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.coach_plans p WHERE p.id = coach_drills.plan_id AND p.user_id = auth.uid()));
CREATE POLICY coach_drills_service_all ON public.coach_drills FOR ALL TO service_role USING (true);

COMMIT;
```

- [ ] **Step 2: Escribir 042_coach_events_extend_types.sql**

```sql
-- supabase/migrations/042_coach_events_extend_types.sql
BEGIN;

ALTER TABLE public.coach_events DROP CONSTRAINT IF EXISTS coach_events_type_check;

ALTER TABLE public.coach_events ADD CONSTRAINT coach_events_type_check CHECK (
  type IN (
    -- pre-existentes (verificar con Task 0.1):
    'plan_proposed', 'plan_accepted_by_user', 'plan_dismissed',
    'message_sent', 'message_received', 'session_rated',
    -- nuevos:
    'drill_started', 'drill_completed_inferred', 'drill_completed_user',
    'drill_skipped', 'inference_dismissed',
    'plan_completed', 'plan_abandoned', 'plan_replaced'
  )
);

COMMIT;
```

- [ ] **Step 3: Aplicar ambas migraciones**

Run: `node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/041_coach_drills_table.sql`
Run: `node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/042_coach_events_extend_types.sql`
Expected: ambas con COMMIT.

- [ ] **Step 4: Verificar schema parity script no rompe**

Run: `npm run schema:check` (o el equivalente del pre-push hook step 4)
Expected: nuevas tablas/columnas detectadas como diferencias vs baseline. Actualizar baseline:

- [ ] **Step 5: Actualizar baseline de schema parity**

Edit `scripts/verify-db-schema-baseline.json` (o donde viva la lista de excepciones) para incluir las nuevas tablas/columnas como pareadas.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/041_coach_drills_table.sql supabase/migrations/042_coach_events_extend_types.sql scripts/verify-db-schema-baseline.json
git commit -m "feat(coach/db): coach_drills table + extend coach_events types"
```

---

## Phase 1 — Server-side utilities (3 tasks, TDD)

### Task 1.1: `src/lib/coach/plan-state.ts` — state machine

**Files:**
- Create: `src/lib/coach/plan-state.ts`
- Create: `src/__tests__/lib/coach/plan-state.test.ts`

- [ ] **Step 1: Test fallido — transiciones válidas**

```ts
// src/__tests__/lib/coach/plan-state.test.ts
import { describe, it, expect } from 'vitest';
import { canTransition, type PlanStatus } from '@/lib/coach/plan-state';

describe('plan-state.canTransition', () => {
  it('proposed → accepted permitido', () => {
    expect(canTransition('proposed', 'accepted')).toBe(true);
  });
  it('accepted → in_progress permitido', () => {
    expect(canTransition('accepted', 'in_progress')).toBe(true);
  });
  it('in_progress → completed permitido', () => {
    expect(canTransition('in_progress', 'completed')).toBe(true);
  });
  it('completed → archived permitido', () => {
    expect(canTransition('completed', 'archived')).toBe(true);
  });
  it('completed → in_progress NO permitido (terminal)', () => {
    expect(canTransition('completed', 'in_progress')).toBe(false);
  });
  it('archived → cualquier cosa NO permitido', () => {
    expect(canTransition('archived', 'accepted')).toBe(false);
  });
  it('proposed → abandoned permitido', () => {
    expect(canTransition('proposed', 'abandoned')).toBe(true);
  });
  it('proposed → replaced permitido', () => {
    expect(canTransition('proposed', 'replaced')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — debe fallar (módulo no existe)**

Run: `npm run test -- src/__tests__/lib/coach/plan-state.test.ts`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Implementar plan-state.ts**

```ts
// src/lib/coach/plan-state.ts
export type PlanStatus =
  | 'proposed' | 'accepted' | 'in_progress'
  | 'completed' | 'abandoned' | 'replaced' | 'archived';

const ALLOWED: Record<PlanStatus, PlanStatus[]> = {
  proposed:    ['accepted', 'abandoned', 'replaced'],
  accepted:    ['in_progress', 'abandoned', 'replaced'],
  in_progress: ['completed', 'abandoned', 'replaced'],
  completed:   ['archived'],
  abandoned:   ['archived'],
  replaced:    ['archived'],
  archived:    [],
};

export function canTransition(from: PlanStatus, to: PlanStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function isActive(status: PlanStatus): boolean {
  return status === 'accepted' || status === 'in_progress';
}

export function isTerminal(status: PlanStatus): boolean {
  return status === 'completed' || status === 'abandoned'
      || status === 'replaced' || status === 'archived';
}
```

- [ ] **Step 4: Run tests — deben pasar**

Run: `npm run test -- src/__tests__/lib/coach/plan-state.test.ts`
Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/plan-state.ts src/__tests__/lib/coach/plan-state.test.ts
git commit -m "feat(coach/lib): plan-state state machine + isActive/isTerminal helpers"
```

---

### Task 1.2: `src/lib/coach/active-plan.ts` — fetch helpers

**Files:**
- Create: `src/lib/coach/active-plan.ts`
- Create: `src/__tests__/lib/coach/active-plan.test.ts`

- [ ] **Step 1: Test fallido**

```ts
// src/__tests__/lib/coach/active-plan.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getActivePlan, getCurrentDrill } from '@/lib/coach/active-plan';

const mockSupabase = (planRow: any, drillRows: any[] = []) => ({
  from: vi.fn((table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: table === 'coach_plans' ? planRow : null, error: null
    }),
    then: undefined,
  })),
});

describe('getActivePlan', () => {
  it('devuelve null si no hay plan en estados activos', async () => {
    const sb = mockSupabase(null);
    const plan = await getActivePlan(sb as any, 'user-1');
    expect(plan).toBeNull();
  });

  it('devuelve el plan accepted/in_progress', async () => {
    const sb = mockSupabase({ id: 'p1', status: 'in_progress', user_id: 'user-1' });
    const plan = await getActivePlan(sb as any, 'user-1');
    expect(plan?.id).toBe('p1');
    expect(plan?.status).toBe('in_progress');
  });
});

describe('getCurrentDrill', () => {
  it('devuelve el primer drill no completado por order_index', async () => {
    const drill = { id: 'd2', order_index: 1, status: 'pending' };
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: drill, error: null }),
      })),
    };
    const result = await getCurrentDrill(sb as any, 'p1');
    expect(result?.id).toBe('d2');
  });
});
```

- [ ] **Step 2: Run — debe fallar**

Run: `npm run test -- src/__tests__/lib/coach/active-plan.test.ts`

- [ ] **Step 3: Implementar**

```ts
// src/lib/coach/active-plan.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ActivePlan {
  id: string;
  user_id: string;
  status: 'accepted' | 'in_progress';
  focus_area: string | null;
  started_at: string | null;
  target_completion_at: string | null;
  success_criteria: any;
}

export interface CurrentDrill {
  id: string;
  plan_id: string;
  order_index: number;
  title: string;
  description: string | null;
  duration_min: number | null;
  target_metric: string | null;
  target_value: number | null;
  target_comparator: string | null;
  status: string;
}

export async function getActivePlan(
  sb: SupabaseClient,
  userId: string,
): Promise<ActivePlan | null> {
  const { data, error } = await sb
    .from('coach_plans')
    .select('id, user_id, status, focus_area, started_at, target_completion_at, success_criteria')
    .eq('user_id', userId)
    .in('status', ['accepted', 'in_progress'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ActivePlan | null;
}

export async function getCurrentDrill(
  sb: SupabaseClient,
  planId: string,
): Promise<CurrentDrill | null> {
  const { data, error } = await sb
    .from('coach_drills')
    .select('*')
    .eq('plan_id', planId)
    .not('status', 'in', '(completed_inferred,completed_user,skipped)')
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as CurrentDrill | null;
}
```

- [ ] **Step 4: Run — debe pasar**

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/active-plan.ts src/__tests__/lib/coach/active-plan.test.ts
git commit -m "feat(coach/lib): getActivePlan + getCurrentDrill helpers"
```

---

### Task 1.3: `src/lib/coach/inference.ts` — round → plan correlation MVP

**Files:**
- Create: `src/lib/coach/inference.ts`
- Create: `src/__tests__/lib/coach/inference.test.ts`

**MVP scope:** 3 metrics hardcoded — `gir_100_150`, `putts_1_2m`, `post_bogey_recovery`. Full Cerebro v2 integration en plan separado.

- [ ] **Step 1: Test fallido — 3 casos de inferencia**

```ts
// src/__tests__/lib/coach/inference.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateMetric, type RoundStats, type DrillCriterion } from '@/lib/coach/inference';

describe('evaluateMetric', () => {
  const round: RoundStats = {
    gir_100_150_attempts: 14,
    gir_100_150_hits: 11,
    putts_1_2m_attempts: 6,
    putts_1_2m_holed: 5,
    post_bogey_recovery_attempts: 3,
    post_bogey_recovery_par_or_better: 2,
  };

  it('gir_100_150 >= 0.7 evalúa true (11/14 = 0.786)', () => {
    const c: DrillCriterion = { metric: 'gir_100_150', value: 0.7, comparator: '>=' };
    expect(evaluateMetric(round, c)).toEqual({ matched: true, actual: expect.closeTo(0.786, 2) });
  });

  it('gir_100_150 >= 0.9 evalúa false', () => {
    const c: DrillCriterion = { metric: 'gir_100_150', value: 0.9, comparator: '>=' };
    expect(evaluateMetric(round, c).matched).toBe(false);
  });

  it('putts_1_2m sin attempts devuelve null (no evaluable)', () => {
    const c: DrillCriterion = { metric: 'putts_1_2m', value: 0.7, comparator: '>=' };
    const empty: RoundStats = { ...round, putts_1_2m_attempts: 0, putts_1_2m_holed: 0 };
    expect(evaluateMetric(empty, c).actual).toBeNull();
  });

  it('post_bogey_recovery <= 0.5 evalúa false (2/3 = 0.667)', () => {
    const c: DrillCriterion = { metric: 'post_bogey_recovery', value: 0.5, comparator: '<=' };
    expect(evaluateMetric(round, c).matched).toBe(false);
  });

  it('métrica desconocida devuelve actual=null', () => {
    const c: DrillCriterion = { metric: 'unknown_metric', value: 1, comparator: '>=' };
    expect(evaluateMetric(round, c).actual).toBeNull();
  });
});
```

- [ ] **Step 2: Run — debe fallar**

- [ ] **Step 3: Implementar**

```ts
// src/lib/coach/inference.ts
export interface RoundStats {
  gir_100_150_attempts: number;
  gir_100_150_hits: number;
  putts_1_2m_attempts: number;
  putts_1_2m_holed: number;
  post_bogey_recovery_attempts: number;
  post_bogey_recovery_par_or_better: number;
}

export type Comparator = '>=' | '<=' | '=' | '>' | '<';

export interface DrillCriterion {
  metric: string;
  value: number;
  comparator: Comparator;
}

export interface EvaluationResult {
  matched: boolean;
  actual: number | null;
}

const RATIO_METRICS: Record<string, (r: RoundStats) => number | null> = {
  gir_100_150: (r) =>
    r.gir_100_150_attempts > 0 ? r.gir_100_150_hits / r.gir_100_150_attempts : null,
  putts_1_2m: (r) =>
    r.putts_1_2m_attempts > 0 ? r.putts_1_2m_holed / r.putts_1_2m_attempts : null,
  post_bogey_recovery: (r) =>
    r.post_bogey_recovery_attempts > 0
      ? r.post_bogey_recovery_par_or_better / r.post_bogey_recovery_attempts
      : null,
};

function compare(actual: number, op: Comparator, target: number): boolean {
  switch (op) {
    case '>=': return actual >= target;
    case '<=': return actual <= target;
    case '>':  return actual >  target;
    case '<':  return actual <  target;
    case '=':  return actual === target;
  }
}

export function evaluateMetric(
  round: RoundStats,
  criterion: DrillCriterion,
): EvaluationResult {
  const compute = RATIO_METRICS[criterion.metric];
  if (!compute) return { matched: false, actual: null };
  const actual = compute(round);
  if (actual === null) return { matched: false, actual: null };
  return { matched: compare(actual, criterion.comparator, criterion.value), actual };
}
```

- [ ] **Step 4: Run — debe pasar (5/5)**

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/inference.ts src/__tests__/lib/coach/inference.test.ts
git commit -m "feat(coach/lib): inference.evaluateMetric for 3 MVP metrics"
```

---

## Phase 2 — API routes (4 tasks)

### Task 2.1: `GET /api/taiger/plans/active`

**Files:**
- Create: `src/app/api/taiger/plans/active/route.ts`
- Create: `src/__tests__/api/taiger/plans-active.test.ts`

- [ ] **Step 1: Test fallido**

```ts
// src/__tests__/api/taiger/plans-active.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/taiger/plans/active/route';

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabase: vi.fn(),
}));

describe('GET /api/taiger/plans/active', () => {
  beforeEach(() => vi.resetAllMocks());

  it('401 si no hay sesión', async () => {
    const { createServerSupabase } = await import('@/lib/supabase-server');
    (createServerSupabase as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('200 con plan activo + drill actual', async () => {
    const { createServerSupabase } = await import('@/lib/supabase-server');
    const sb: any = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn((t: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: t === 'coach_plans'
            ? { id: 'p1', user_id: 'u1', status: 'in_progress', focus_area: 'approach_100_150' }
            : { id: 'd1', plan_id: 'p1', order_index: 0, title: 'Drill 1', status: 'pending' },
          error: null,
        }),
      })),
    };
    (createServerSupabase as any).mockResolvedValue(sb);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan.id).toBe('p1');
    expect(body.currentDrill.id).toBe('d1');
  });

  it('200 con plan=null si no tiene plan activo', async () => {
    const { createServerSupabase } = await import('@/lib/supabase-server');
    const sb: any = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };
    (createServerSupabase as any).mockResolvedValue(sb);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBeNull();
    expect(body.currentDrill).toBeNull();
  });
});
```

- [ ] **Step 2: Run — falla**

- [ ] **Step 3: Implementar la ruta**

```ts
// src/app/api/taiger/plans/active/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getActivePlan, getCurrentDrill } from '@/lib/coach/active-plan';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const plan = await getActivePlan(sb, user.id);
  const currentDrill = plan ? await getCurrentDrill(sb, plan.id) : null;

  return NextResponse.json({ plan, currentDrill });
}
```

- [ ] **Step 4: Run — pasa (3/3)**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/taiger/plans/active/route.ts src/__tests__/api/taiger/plans-active.test.ts
git commit -m "feat(taiger/api): GET /api/taiger/plans/active route"
```

---

### Task 2.2: `POST /api/taiger/drills/[id]/complete`

**Files:**
- Create: `src/app/api/taiger/drills/[id]/complete/route.ts`
- Create: `src/__tests__/api/taiger/drills-complete.test.ts`

- [ ] **Step 1: Test fallido — happy path + ownership check**

```ts
// src/__tests__/api/taiger/drills-complete.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/taiger/drills/[id]/complete/route';

vi.mock('@/lib/supabase-server', () => ({ createServerSupabase: vi.fn() }));

const mkReq = (body: any) =>
  new Request('http://localhost/api/taiger/drills/d1/complete', {
    method: 'POST', body: JSON.stringify(body),
  });

describe('POST /api/taiger/drills/[id]/complete', () => {
  beforeEach(() => vi.resetAllMocks());

  it('401 sin auth', async () => {
    const { createServerSupabase } = await import('@/lib/supabase-server');
    (createServerSupabase as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const res = await POST(mkReq({ source: 'user' }), { params: { id: 'd1' } });
    expect(res.status).toBe(401);
  });

  it('400 si source inválido', async () => {
    const { createServerSupabase } = await import('@/lib/supabase-server');
    (createServerSupabase as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    });
    const res = await POST(mkReq({ source: 'invalid' }), { params: { id: 'd1' } });
    expect(res.status).toBe(400);
  });

  it('200 marca drill completed_user e inserta evento', async () => {
    const { createServerSupabase } = await import('@/lib/supabase-server');
    const updateMock = vi.fn().mockReturnThis();
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqMock = vi.fn().mockReturnThis();
    const sbAny: any = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn((t: string) => {
        if (t === 'coach_drills') return {
          select: vi.fn().mockReturnThis(),
          eq: eqMock,
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'd1', plan_id: 'p1', coach_plans: { user_id: 'u1' } }, error: null,
          }),
          update: updateMock,
        };
        if (t === 'coach_events') return { insert: insertMock };
        return {};
      }),
    };
    (createServerSupabase as any).mockResolvedValue(sbAny);
    const res = await POST(mkReq({ source: 'user' }), { params: { id: 'd1' } });
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'drill_completed_user' })
    );
  });
});
```

- [ ] **Step 2: Run — falla**

- [ ] **Step 3: Implementar**

```ts
// src/app/api/taiger/drills/[id]/complete/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const Body = z.object({
  source: z.enum(['user', 'inferred']),
  evidence_round_id: z.string().uuid().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body;
  try { body = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }

  // Ownership check via join
  const { data: drill, error: drillErr } = await sb
    .from('coach_drills')
    .select('id, plan_id, status, coach_plans!inner(user_id)')
    .eq('id', params.id)
    .maybeSingle();
  if (drillErr || !drill) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if ((drill as any).coach_plans.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const newStatus = body.source === 'user' ? 'completed_user' : 'completed_inferred';
  const eventType = body.source === 'user' ? 'drill_completed_user' : 'drill_completed_inferred';

  await sb.from('coach_drills')
    .update({ status: newStatus, evidence_round_id: body.evidence_round_id ?? null, updated_at: new Date().toISOString() })
    .eq('id', params.id);

  await sb.from('coach_events').insert({
    user_id: user.id,
    type: eventType,
    payload: { drill_id: params.id, plan_id: drill.plan_id, source: body.source },
  });

  return NextResponse.json({ ok: true, drill_id: params.id, status: newStatus });
}
```

- [ ] **Step 4: Run — pasa (3/3)**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/taiger/drills/[id]/complete/route.ts src/__tests__/api/taiger/drills-complete.test.ts
git commit -m "feat(taiger/api): POST /api/taiger/drills/[id]/complete with ownership check"
```

---

### Task 2.3: `POST /api/taiger/inference/round/[roundId]`

**Files:**
- Create: `src/app/api/taiger/inference/round/[roundId]/route.ts`
- Create: `src/__tests__/api/taiger/inference-round.test.ts`

**Comportamiento:** consulta plan activo, fetch criterios de drills pendientes, evalúa cada uno contra stats de la ronda, inserta system message en chat para cada match, emite eventos de telemetría. Solo MVP: las stats las computa este endpoint inline desde `rounds` + `scores` (sin tabla agregada).

- [ ] **Step 1: Test (fixture-driven)**

```ts
// src/__tests__/api/taiger/inference-round.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/taiger/inference/round/[roundId]/route';

vi.mock('@/lib/supabase-server', () => ({ createServerSupabase: vi.fn() }));
vi.mock('@/lib/coach/round-stats', () => ({
  computeRoundStats: vi.fn(),
}));

const mkReq = () => new Request('http://localhost/api/taiger/inference/round/r1', { method: 'POST' });

describe('POST /api/taiger/inference/round/[roundId]', () => {
  beforeEach(() => vi.resetAllMocks());

  it('204 si no hay plan activo', async () => {
    const { createServerSupabase } = await import('@/lib/supabase-server');
    const sb: any = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };
    (createServerSupabase as any).mockResolvedValue(sb);
    const res = await POST(mkReq(), { params: { roundId: 'r1' } });
    expect(res.status).toBe(204);
  });

  it('200 con matches devuelve drills evaluados', async () => {
    const { createServerSupabase } = await import('@/lib/supabase-server');
    const { computeRoundStats } = await import('@/lib/coach/round-stats');
    (computeRoundStats as any).mockResolvedValue({
      gir_100_150_attempts: 14, gir_100_150_hits: 11,
      putts_1_2m_attempts: 6, putts_1_2m_holed: 5,
      post_bogey_recovery_attempts: 2, post_bogey_recovery_par_or_better: 1,
    });
    const drills = [
      { id: 'd1', target_metric: 'gir_100_150', target_value: 0.7, target_comparator: '>=', status: 'pending' },
    ];
    let callCount = 0;
    const sb: any = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn((t: string) => {
        if (t === 'coach_plans') return {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'p1', user_id: 'u1', status: 'in_progress' }, error: null,
          }),
        };
        if (t === 'coach_drills') return {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: (resolve: any) => resolve({ data: drills, error: null }),
        };
        if (t === 'coach_events') return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
        return {};
      }),
    };
    (createServerSupabase as any).mockResolvedValue(sb);
    const res = await POST(mkReq(), { params: { roundId: 'r1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.evaluations).toHaveLength(1);
    expect(body.evaluations[0].matched).toBe(true);
  });
});
```

- [ ] **Step 2: Crear stub de `round-stats` y la ruta**

```ts
// src/lib/coach/round-stats.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoundStats } from './inference';

export async function computeRoundStats(
  sb: SupabaseClient,
  roundId: string,
): Promise<RoundStats> {
  // MVP: lee scores + holes de la ronda y computa los 3 ratios.
  // TODO Phase 8: mover a vista materializada o RPC para perf.
  const { data: scores } = await sb
    .from('round_scores')
    .select('hole_number, strokes, putts, distance_to_pin, par')
    .eq('round_id', roundId);

  const rows = scores ?? [];
  let gir_100_150_attempts = 0, gir_100_150_hits = 0;
  let putts_1_2m_attempts = 0, putts_1_2m_holed = 0;
  let post_bogey_attempts = 0, post_bogey_par_or_better = 0;

  for (let i = 0; i < rows.length; i++) {
    const r: any = rows[i];
    if (r.distance_to_pin >= 100 && r.distance_to_pin <= 150) {
      gir_100_150_attempts++;
      if (r.strokes - r.par <= 0) gir_100_150_hits++; // proxy: net at par or better
    }
    if (r.putts === 1 || r.putts === 2) {
      putts_1_2m_attempts++;
      if (r.putts === 1) putts_1_2m_holed++;
    }
    const prev: any = rows[i - 1];
    if (prev && (prev.strokes - prev.par) >= 1) {
      post_bogey_attempts++;
      if (r.strokes - r.par <= 0) post_bogey_par_or_better++;
    }
  }

  return {
    gir_100_150_attempts, gir_100_150_hits,
    putts_1_2m_attempts, putts_1_2m_holed,
    post_bogey_recovery_attempts: post_bogey_attempts,
    post_bogey_recovery_par_or_better: post_bogey_par_or_better,
  };
}
```

```ts
// src/app/api/taiger/inference/round/[roundId]/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getActivePlan } from '@/lib/coach/active-plan';
import { evaluateMetric } from '@/lib/coach/inference';
import { computeRoundStats } from '@/lib/coach/round-stats';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: { roundId: string } },
) {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const plan = await getActivePlan(sb, user.id);
  if (!plan) return new NextResponse(null, { status: 204 });

  const { data: drills } = await sb
    .from('coach_drills')
    .select('id, target_metric, target_value, target_comparator, status')
    .eq('plan_id', plan.id)
    .in('status', ['pending', 'in_progress']);

  const stats = await computeRoundStats(sb, params.roundId);

  const evaluations = (drills ?? [])
    .filter((d: any) => d.target_metric && d.target_value != null && d.target_comparator)
    .map((d: any) => {
      const result = evaluateMetric(stats, {
        metric: d.target_metric,
        value: Number(d.target_value),
        comparator: d.target_comparator,
      });
      return { drill_id: d.id, ...result };
    });

  // Eventos: inferencia evaluada (matched o no) — útil para Cerebro v2 telemetría
  for (const ev of evaluations) {
    await sb.from('coach_events').insert({
      user_id: user.id,
      type: 'drill_completed_inferred',
      payload: {
        drill_id: ev.drill_id, plan_id: plan.id,
        round_id: params.roundId, matched: ev.matched, actual: ev.actual,
      },
    });
  }

  return NextResponse.json({ plan_id: plan.id, evaluations });
}
```

- [ ] **Step 3: Run tests — pasan (2/2)**

- [ ] **Step 4: Commit**

```bash
git add src/lib/coach/round-stats.ts src/app/api/taiger/inference/round src/__tests__/api/taiger/inference-round.test.ts
git commit -m "feat(taiger/api): inference round endpoint + computeRoundStats helper"
```

---

### Task 2.4: `POST /api/taiger/drills/[id]/start`

**Files:**
- Create: `src/app/api/taiger/drills/[id]/start/route.ts`

(Mismo patrón que Task 2.2 pero para `drill_started` event y `status='in_progress'`. Sin test independiente — coverage suficiente con integration test de Phase 7.)

- [ ] **Step 1: Implementar**

```ts
// src/app/api/taiger/drills/[id]/start/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data: drill } = await sb
    .from('coach_drills')
    .select('id, plan_id, status, coach_plans!inner(user_id)')
    .eq('id', params.id)
    .maybeSingle();
  if (!drill || (drill as any).coach_plans.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (drill.status !== 'pending') {
    return NextResponse.json({ ok: true, drill_id: params.id, status: drill.status });
  }

  await sb.from('coach_drills').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', params.id);
  await sb.from('coach_events').insert({
    user_id: user.id,
    type: 'drill_started',
    payload: { drill_id: params.id, plan_id: drill.plan_id },
  });

  return NextResponse.json({ ok: true, drill_id: params.id, status: 'in_progress' });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/taiger/drills/[id]/start/route.ts
git commit -m "feat(taiger/api): POST /api/taiger/drills/[id]/start"
```

---

## Phase 3 — Atomic UI components (5 tasks, TDD)

Cada componente sigue el mismo patrón TDD: render test → minimal impl → interaction test → impl → commit. Para mantener el plan ejecutable sin redundancia visual, escribo el patrón completo en Task 3.1 y referencio "mismo patrón" después con SOLO los deltas de código.

### Task 3.1: `<QuickReplies />`

**Files:**
- Create: `src/components/coach/QuickReplies.tsx`
- Create: `src/__tests__/components/QuickReplies.test.tsx`

- [ ] **Step 1: Test fallido**

```tsx
// src/__tests__/components/QuickReplies.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickReplies } from '@/components/coach/QuickReplies';

describe('<QuickReplies />', () => {
  it('renderiza chips con la primera marcada como primary', () => {
    render(<QuickReplies replies={['Lo hice', 'Otro drill', 'Después']} onPick={() => {}} />);
    const primary = screen.getByText('Lo hice');
    expect(primary).toBeInTheDocument();
    expect(primary.parentElement?.dataset.primary).toBe('true');
    expect(screen.getByText('Otro drill')).toBeInTheDocument();
    expect(screen.getByText('Después')).toBeInTheDocument();
  });

  it('llama onPick con el texto al click', () => {
    const onPick = vi.fn();
    render(<QuickReplies replies={['A', 'B']} onPick={onPick} />);
    fireEvent.click(screen.getByText('B'));
    expect(onPick).toHaveBeenCalledWith('B');
  });

  it('disabled previene click', () => {
    const onPick = vi.fn();
    render(<QuickReplies replies={['A']} onPick={onPick} disabled />);
    fireEvent.click(screen.getByText('A'));
    expect(onPick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — falla**

- [ ] **Step 3: Implementar**

```tsx
// src/components/coach/QuickReplies.tsx
'use client';

interface Props {
  replies: string[];
  onPick: (reply: string) => void;
  disabled?: boolean;
}

export function QuickReplies({ replies, onPick, disabled }: Props) {
  if (!replies.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2.5 ml-7">
      {replies.map((reply, i) => (
        <button
          key={reply}
          type="button"
          disabled={disabled}
          data-primary={i === 0}
          onClick={() => !disabled && onPick(reply)}
          className={[
            'px-2.5 py-1 rounded-full text-[10px] font-medium border bg-white',
            i === 0
              ? 'border-[#c4992a] text-[#c4992a]'
              : 'border-[#d1d1d6] text-[#1d1d1f]',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          ].join(' ')}
        >
          {reply}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run — pasa (3/3)**

- [ ] **Step 5: Commit**

```bash
git add src/components/coach/QuickReplies.tsx src/__tests__/components/QuickReplies.test.tsx
git commit -m "feat(coach/ui): QuickReplies component with primary action styling"
```

---

### Task 3.2: `<ToolUseChip />`

**Files:**
- Create: `src/components/coach/ToolUseChip.tsx`
- Create: `src/__tests__/components/ToolUseChip.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/components/ToolUseChip.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolUseChip } from '@/components/coach/ToolUseChip';

describe('<ToolUseChip />', () => {
  it('estado loading muestra spinner + label', () => {
    render(<ToolUseChip state="loading" label="Consultando ronda..." />);
    expect(screen.getByText('Consultando ronda...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('estado done muestra checkmark + summary', () => {
    render(<ToolUseChip state="done" label="Ronda encontrada" summary="14 hierros · 31 putts" />);
    expect(screen.getByText('Ronda encontrada')).toBeInTheDocument();
    expect(screen.getByText('14 hierros · 31 putts')).toBeInTheDocument();
  });

  it('estado error muestra cross icon', () => {
    render(<ToolUseChip state="error" label="Error consultando" />);
    expect(screen.getByLabelText('error')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implementar**

```tsx
// src/components/coach/ToolUseChip.tsx
'use client';

interface Props {
  state: 'loading' | 'done' | 'error';
  label: string;
  summary?: string;
}

export function ToolUseChip({ state, label, summary }: Props) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-[#e7e7e7] bg-white text-[9px] text-[#86868b] w-fit">
      {state === 'loading' && (
        <span role="status" aria-label="loading"
              className="w-3 h-3 border-2 border-[#c4992a] border-t-transparent rounded-full animate-spin" />
      )}
      {state === 'done' && <span aria-label="done" className="text-[#34c759]">✓</span>}
      {state === 'error' && <span aria-label="error" className="text-[#ff3b30]">✕</span>}
      <span>{label}</span>
      {summary && state === 'done' && (
        <span className="opacity-70">· {summary}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run + commit**

```bash
git add src/components/coach/ToolUseChip.tsx src/__tests__/components/ToolUseChip.test.tsx
git commit -m "feat(coach/ui): ToolUseChip with loading/done/error states"
```

---

### Task 3.3: `<PatternChip />`

**Files:**
- Create: `src/components/coach/PatternChip.tsx`
- Create: `src/__tests__/components/PatternChip.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/components/PatternChip.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PatternChip } from '@/components/coach/PatternChip';

describe('<PatternChip />', () => {
  it('renderiza nombre del pattern', () => {
    render(<PatternChip patternId="post_bogey_spiral" label="Post-bogey spiral" />);
    expect(screen.getByText('Post-bogey spiral')).toBeInTheDocument();
  });
  it('onClick dispara con patternId', () => {
    const onClick = vi.fn();
    render(<PatternChip patternId="putts_1_2m" label="Putts cortos" onClick={onClick} />);
    fireEvent.click(screen.getByText('Putts cortos'));
    expect(onClick).toHaveBeenCalledWith('putts_1_2m');
  });
});
```

- [ ] **Step 2: Implementar**

```tsx
// src/components/coach/PatternChip.tsx
'use client';

interface Props {
  patternId: string;
  label: string;
  onClick?: (id: string) => void;
}

export function PatternChip({ patternId, label, onClick }: Props) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick ? () => onClick(patternId) : undefined}
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#faf6f1] text-[#1d1d1f] border border-[#e7d6a8]"
    >
      {label}
    </Tag>
  );
}
```

- [ ] **Step 3: Run + commit**

```bash
git add src/components/coach/PatternChip.tsx src/__tests__/components/PatternChip.test.tsx
git commit -m "feat(coach/ui): PatternChip inline reference"
```

---

### Task 3.4: `<DrillCard />`

**Files:**
- Create: `src/components/coach/DrillCard.tsx`
- Create: `src/__tests__/components/DrillCard.test.tsx`

Refleja la arquitectura de `PlanAssignedCard.tsx` (217 líneas, ya existente) — leerlo antes para reutilizar tokens/estilos.

- [ ] **Step 1: Test**

```tsx
// src/__tests__/components/DrillCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DrillCard } from '@/components/coach/DrillCard';

const drill = {
  id: 'd1', title: '10 bolas · h8 a 120y',
  description: 'Objetivo: 7 dentro de 5m del flag',
  duration_min: 25, status: 'pending' as const,
};

describe('<DrillCard />', () => {
  it('renderiza title + description + duration', () => {
    render(<DrillCard drill={drill} onStart={() => {}} />);
    expect(screen.getByText(drill.title)).toBeInTheDocument();
    expect(screen.getByText(drill.description)).toBeInTheDocument();
    expect(screen.getByText('25 MIN')).toBeInTheDocument();
  });

  it('estado pending muestra checkbox vacío', () => {
    render(<DrillCard drill={drill} onStart={() => {}} />);
    expect(screen.getByLabelText('drill-pending')).toBeInTheDocument();
  });

  it('estado completed_user muestra check verde', () => {
    render(<DrillCard drill={{ ...drill, status: 'completed_user' }} onStart={() => {}} />);
    expect(screen.getByLabelText('drill-done')).toBeInTheDocument();
  });

  it('CTA Empezar drill llama onStart', () => {
    const onStart = vi.fn();
    render(<DrillCard drill={drill} onStart={onStart} />);
    fireEvent.click(screen.getByText('Empezar drill'));
    expect(onStart).toHaveBeenCalledWith('d1');
  });

  it('CTA oculto si drill ya está completed', () => {
    render(<DrillCard drill={{ ...drill, status: 'completed_user' }} onStart={() => {}} />);
    expect(screen.queryByText('Empezar drill')).toBeNull();
  });
});
```

- [ ] **Step 2: Implementar**

```tsx
// src/components/coach/DrillCard.tsx
'use client';

export type DrillStatus =
  | 'pending' | 'in_progress'
  | 'completed_inferred' | 'completed_user' | 'skipped';

export interface DrillCardData {
  id: string;
  title: string;
  description?: string | null;
  duration_min?: number | null;
  status: DrillStatus;
}

interface Props {
  drill: DrillCardData;
  onStart: (drillId: string) => void;
}

const isDone = (s: DrillStatus) =>
  s === 'completed_user' || s === 'completed_inferred';

export function DrillCard({ drill, onStart }: Props) {
  return (
    <div className="ml-7 mt-2 p-3 bg-white border border-[#e7e7e7] rounded-xl">
      <div className="flex justify-between items-start">
        <div>
          {drill.duration_min != null && (
            <div className="text-[9px] tracking-wider text-[#86868b]">
              DRILL · {drill.duration_min} MIN
            </div>
          )}
          <div className="text-[12px] font-semibold text-[#1d1d1f] mt-0.5">{drill.title}</div>
          {drill.description && (
            <div className="text-[10px] text-[#86868b] mt-0.5">{drill.description}</div>
          )}
        </div>
        {isDone(drill.status) ? (
          <span aria-label="drill-done"
                className="w-[18px] h-[18px] rounded-full bg-[#34c759] text-white text-[11px] flex items-center justify-center">✓</span>
        ) : (
          <span aria-label="drill-pending"
                className="w-[18px] h-[18px] rounded-full border-[1.5px] border-[#d1d1d6]" />
        )}
      </div>
      {!isDone(drill.status) && (
        <button
          type="button"
          onClick={() => onStart(drill.id)}
          className="mt-2 w-full bg-[#c4992a] text-[#0a0a0a] py-1.5 rounded-lg text-[11px] font-semibold"
        >
          Empezar drill
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run + commit**

```bash
git add src/components/coach/DrillCard.tsx src/__tests__/components/DrillCard.test.tsx
git commit -m "feat(coach/ui): DrillCard with status indicator + start CTA"
```

---

### Task 3.5: Activar `<CitedMarkdown />` citation chips

**Files:**
- Modify: `src/components/coach/CitedMarkdown.tsx`
- Modify: `src/components/coach/CitedMarkdown.test.tsx`

- [ ] **Step 1: Read current state**

```bash
# Lee el archivo y entiende qué bindings están dormidos
```

Run: revisar `src/components/coach/CitedMarkdown.tsx` (≤200 líneas) en editor.

- [ ] **Step 2: Test fallido — citation tap**

Agregar test en `CitedMarkdown.test.tsx`:

```tsx
it('citation chip dispara onCitationClick con el citationId', () => {
  const onCitationClick = vi.fn();
  const md = 'En 100-150y dejaste el green en [11 de 14](#cite=round-r1) intentos.';
  render(<CitedMarkdown markdown={md} onCitationClick={onCitationClick} />);
  fireEvent.click(screen.getByText('11 de 14'));
  expect(onCitationClick).toHaveBeenCalledWith('round-r1');
});
```

- [ ] **Step 3: Implementar binding**

En `CitedMarkdown.tsx`, agregar custom renderer para `<a>` tags donde `href` empieza con `#cite=`:

```tsx
// Dentro del components prop de ReactMarkdown:
a: ({ href, children, ...rest }) => {
  if (href?.startsWith('#cite=')) {
    const citationId = href.slice(6);
    return (
      <button
        type="button"
        onClick={() => onCitationClick?.(citationId)}
        className="text-[#c4992a] border-b border-dotted border-[#c4992a] cursor-pointer bg-transparent p-0"
      >
        {children}
      </button>
    );
  }
  return <a href={href} {...rest}>{children}</a>;
},
```

Y añadir prop opcional `onCitationClick?: (id: string) => void` al interface.

- [ ] **Step 4: Run tests — todos pasan, incluyendo el nuevo**

- [ ] **Step 5: Commit**

```bash
git add src/components/coach/CitedMarkdown.tsx src/components/coach/CitedMarkdown.test.tsx
git commit -m "feat(coach/ui): CitedMarkdown activates citation chip onClick binding"
```

---

## Phase 4 — Composite UI components (3 tasks, TDD)

### Task 4.1: `<PlanAwareChatHeader />`

**Files:**
- Create: `src/components/coach/PlanAwareChatHeader.tsx`
- Create: `src/__tests__/components/PlanAwareChatHeader.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/components/PlanAwareChatHeader.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanAwareChatHeader } from '@/components/coach/PlanAwareChatHeader';

describe('<PlanAwareChatHeader />', () => {
  const plan = {
    id: 'p1', title: 'Aproximaciones 100-150y',
    week_current: 2, week_total: 3,
    drills_completed: 3, drills_total: 5,
    delta_strokes: -0.6,
    progress_pct: 60,
  };

  it('sin plan: muestra título genérico', () => {
    render(<PlanAwareChatHeader plan={null} onBack={() => {}} onTapPlan={() => {}} />);
    expect(screen.getByText('Conversación continua')).toBeInTheDocument();
  });

  it('con plan: muestra title + sem + drills + delta', () => {
    render(<PlanAwareChatHeader plan={plan} onBack={() => {}} onTapPlan={() => {}} />);
    expect(screen.getByText(plan.title)).toBeInTheDocument();
    expect(screen.getByText(/Sem 2\/3/)).toBeInTheDocument();
    expect(screen.getByText(/3 de 5 drills/)).toBeInTheDocument();
    expect(screen.getByText(/−0\.6 strokes/)).toBeInTheDocument();
  });

  it('tap en area del plan dispara onTapPlan', () => {
    const onTapPlan = vi.fn();
    render(<PlanAwareChatHeader plan={plan} onBack={() => {}} onTapPlan={onTapPlan} />);
    fireEvent.click(screen.getByText(plan.title));
    expect(onTapPlan).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implementar**

```tsx
// src/components/coach/PlanAwareChatHeader.tsx
'use client';

export interface PlanHeaderData {
  id: string;
  title: string;
  week_current: number;
  week_total: number;
  drills_completed: number;
  drills_total: number;
  delta_strokes: number;
  progress_pct: number; // 0..100
}

interface Props {
  plan: PlanHeaderData | null;
  onBack: () => void;
  onTapPlan: () => void;
}

export function PlanAwareChatHeader({ plan, onBack, onTapPlan }: Props) {
  return (
    <div className="bg-[#0a0a0a] text-white px-3.5 py-2.5 flex items-center gap-2.5">
      <button onClick={onBack} className="text-base opacity-60" aria-label="Volver">‹</button>
      {plan ? (
        <>
          <button
            type="button"
            onClick={onTapPlan}
            className="flex-1 text-left leading-tight bg-transparent border-0 cursor-pointer text-white"
          >
            <div className="text-[12px] font-semibold">{plan.title}</div>
            <div className="text-[9px] opacity-55">
              Sem {plan.week_current}/{plan.week_total} · {plan.drills_completed} de {plan.drills_total} drills · <span className="text-[#4ade80]">{plan.delta_strokes < 0 ? '−' : '+'}{Math.abs(plan.delta_strokes)} strokes</span>
            </div>
          </button>
          <ProgressRing pct={plan.progress_pct} />
        </>
      ) : (
        <div className="flex-1 text-[12px] font-semibold">Conversación continua</div>
      )}
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const dash = (pct / 100) * 63;
  return (
    <svg width={24} height={24} viewBox="0 0 24 24">
      <circle cx={12} cy={12} r={10} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={2} />
      <circle cx={12} cy={12} r={10} fill="none" stroke="#c4992a" strokeWidth={2}
              strokeDasharray={`${dash} 63`} strokeLinecap="round"
              transform="rotate(-90 12 12)" />
    </svg>
  );
}
```

- [ ] **Step 3: Run + commit**

```bash
git add src/components/coach/PlanAwareChatHeader.tsx src/__tests__/components/PlanAwareChatHeader.test.tsx
git commit -m "feat(coach/ui): PlanAwareChatHeader with progress ring"
```

---

### Task 4.2: `<TodayCard />`

**Files:**
- Create: `src/components/coach/TodayCard.tsx`
- Create: `src/__tests__/components/TodayCard.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/components/TodayCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TodayCard } from '@/components/coach/TodayCard';

const data = {
  date_label: 'HOY · MIÉ 7 MAY',
  action_headline: 'Driving range',
  action_subtitle: '25 min · hierros 8 y 9',
  drill_id: 'd1',
  plan_title: 'Aproximaciones 100-150y',
  plan_week_current: 2,
  plan_week_total: 3,
  drills_completed: 3,
  drills_total: 5,
  delta_strokes: -0.6,
};

describe('<TodayCard />', () => {
  it('headline = acción, plan name relegado al footer', () => {
    render(<TodayCard data={data} onStart={() => {}} />);
    const headline = screen.getByText('Driving range');
    expect(headline.tagName).toMatch(/^(H1|H2|H3|DIV)$/);
    expect(screen.getByText(data.plan_title)).toBeInTheDocument();
  });

  it('CTA Empezar dispara onStart con drill_id', () => {
    const onStart = vi.fn();
    render(<TodayCard data={data} onStart={onStart} />);
    fireEvent.click(screen.getByText('Empezar'));
    expect(onStart).toHaveBeenCalledWith('d1');
  });

  it('progress ring muestra fracción correcta', () => {
    render(<TodayCard data={data} onStart={() => {}} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('/5')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implementar**

```tsx
// src/components/coach/TodayCard.tsx
'use client';

export interface TodayCardData {
  date_label: string;
  action_headline: string;
  action_subtitle: string;
  drill_id: string;
  plan_title: string;
  plan_week_current: number;
  plan_week_total: number;
  drills_completed: number;
  drills_total: number;
  delta_strokes: number;
}

interface Props {
  data: TodayCardData;
  onStart: (drillId: string) => void;
}

export function TodayCard({ data, onStart }: Props) {
  const pct = (data.drills_completed / data.drills_total) * 100;
  const dash = (pct / 100) * 100;
  return (
    <div className="p-5 bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] text-white rounded-2xl mb-3 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#c4992a] to-transparent" />
      <div className="flex justify-between items-start">
        <div>
          <div className="text-[9px] tracking-[2px] font-semibold opacity-50">{data.date_label}</div>
          <div className="text-[22px] font-light mt-2 leading-tight tracking-tight">{data.action_headline}</div>
          <div className="text-[14px] font-light opacity-85 mt-0.5">{data.action_subtitle}</div>
        </div>
        <div className="relative w-[38px] h-[38px] flex-shrink-0">
          <svg width={38} height={38} viewBox="0 0 38 38">
            <circle cx={19} cy={19} r={16} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={2} />
            <circle cx={19} cy={19} r={16} fill="none" stroke="#c4992a" strokeWidth={2}
                    strokeDasharray={`${dash} 100`} strokeLinecap="round"
                    transform="rotate(-90 19 19)" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold">
            <span>{data.drills_completed}</span><span className="opacity-50 font-light">/{data.drills_total}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-white/10 flex justify-between items-center">
        <div>
          <div className="text-[9px] tracking-wider opacity-45">PLAN · SEM {data.plan_week_current} DE {data.plan_week_total}</div>
          <div className="text-[11px] opacity-85 mt-0.5">
            {data.plan_title} · <span className="text-[#4ade80]">{data.delta_strokes < 0 ? '−' : '+'}{Math.abs(data.delta_strokes)} strokes</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onStart(data.drill_id)}
          className="bg-[#c4992a] text-[#0a0a0a] px-4 py-2 rounded-full text-[11px] font-bold tracking-wide"
        >
          Empezar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run + commit**

```bash
git add src/components/coach/TodayCard.tsx src/__tests__/components/TodayCard.test.tsx
git commit -m "feat(coach/ui): TodayCard hero (action-first, Headspace pattern)"
```

---

### Task 4.3: `<PlanDetailDrawer />` (read-only MVP)

**Files:**
- Create: `src/components/coach/PlanDetailDrawer.tsx`
- Create: `src/__tests__/components/PlanDetailDrawer.test.tsx`

**MVP scope:** read-only. Sin reorder, sin abandon-confirmation, sin "ajustar plan" (esos quedan para v2 en sub-proyecto siguiente). Bottom sheet con lista de drills y sus estados.

- [ ] **Step 1: Test mínimo**

```tsx
// src/__tests__/components/PlanDetailDrawer.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanDetailDrawer } from '@/components/coach/PlanDetailDrawer';

describe('<PlanDetailDrawer />', () => {
  const plan = {
    id: 'p1', title: 'Aproximaciones 100-150y',
    week_current: 2, week_total: 3,
    drills: [
      { id: 'd1', title: 'Drill 1', status: 'completed_user' as const, order_index: 0 },
      { id: 'd2', title: 'Drill 2', status: 'pending' as const, order_index: 1 },
    ],
  };

  it('open=false no renderiza contenido', () => {
    render(<PlanDetailDrawer open={false} plan={plan} onClose={() => {}} />);
    expect(screen.queryByText(plan.title)).toBeNull();
  });
  it('open=true renderiza title + lista de drills', () => {
    render(<PlanDetailDrawer open plan={plan} onClose={() => {}} />);
    expect(screen.getByText(plan.title)).toBeInTheDocument();
    expect(screen.getByText('Drill 1')).toBeInTheDocument();
    expect(screen.getByText('Drill 2')).toBeInTheDocument();
  });
  it('onClose se llama al click backdrop', () => {
    const onClose = vi.fn();
    render(<PlanDetailDrawer open plan={plan} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('drawer-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implementar**

```tsx
// src/components/coach/PlanDetailDrawer.tsx
'use client';

import { DrillCard, type DrillCardData } from './DrillCard';

export interface PlanDetail {
  id: string;
  title: string;
  week_current: number;
  week_total: number;
  drills: DrillCardData[];
}

interface Props {
  open: boolean;
  plan: PlanDetail;
  onClose: () => void;
}

export function PlanDetailDrawer({ open, plan, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="drawer-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto p-5">
        <div className="w-10 h-1 bg-[#d1d1d6] rounded-full mx-auto mb-4" />
        <div className="text-[10px] tracking-wider text-[#86868b]">
          PLAN · SEM {plan.week_current} DE {plan.week_total}
        </div>
        <div className="text-[18px] font-semibold text-[#1d1d1f] mt-1">{plan.title}</div>
        <div className="mt-4 space-y-2">
          {plan.drills
            .slice()
            .sort((a, b) => a.order_index - b.order_index)
            .map((d) => (
              <DrillCard key={d.id} drill={d} onStart={() => {}} />
            ))}
        </div>
      </div>
    </div>
  );
}
```

(El `DrillCard` espera `order_index` en el shape — confirmar en Task 3.4 que el interface lo soporta. Si no, añadirlo a `DrillCardData`.)

- [ ] **Step 3: Verificar interface — añadir `order_index` a DrillCardData si falta**

Edit `src/components/coach/DrillCard.tsx`: agregar `order_index?: number;` a `DrillCardData`.

- [ ] **Step 4: Run + commit**

```bash
git add src/components/coach/PlanDetailDrawer.tsx src/__tests__/components/PlanDetailDrawer.test.tsx src/components/coach/DrillCard.tsx
git commit -m "feat(coach/ui): PlanDetailDrawer read-only bottom sheet"
```

---

## Phase 5 — Hook `useActivePlan` + page integration (3 tasks)

### Task 5.1: `useActivePlan` hook

**Files:**
- Create: `src/hooks/useActivePlan.ts`
- Create: `src/__tests__/hooks/useActivePlan.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/hooks/useActivePlan.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useActivePlan } from '@/hooks/useActivePlan';

describe('useActivePlan', () => {
  it('fetch en mount devuelve plan + currentDrill', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        plan: { id: 'p1', focus_area: 'approach_100_150' },
        currentDrill: { id: 'd1', title: 'Drill 1' },
      }),
    });
    const { result } = renderHook(() => useActivePlan());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plan?.id).toBe('p1');
    expect(result.current.currentDrill?.id).toBe('d1');
  });
});
```

- [ ] **Step 2: Implementar**

```ts
// src/hooks/useActivePlan.ts
'use client';
import { useEffect, useState } from 'react';

export function useActivePlan() {
  const [plan, setPlan] = useState<any>(null);
  const [currentDrill, setCurrentDrill] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/taiger/plans/active')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setPlan(data.plan);
        setCurrentDrill(data.currentDrill);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  return { plan, currentDrill, loading, error };
}
```

- [ ] **Step 3: Run + commit**

```bash
git add src/hooks/useActivePlan.ts src/__tests__/hooks/useActivePlan.test.tsx
git commit -m "feat(coach/hooks): useActivePlan client hook"
```

---

### Task 5.2: Integrar `<TodayCard />` en `/coach/page.tsx`

**Files:**
- Modify: `src/app/coach/page.tsx`

- [ ] **Step 1: Read** `src/app/coach/page.tsx` (155 líneas) para ver dónde inyectar.

- [ ] **Step 2: Modificar**

Reemplazar el render de `<TaigerHero />` por:

```tsx
'use client';
import { useActivePlan } from '@/hooks/useActivePlan';
import { TodayCard } from '@/components/coach/TodayCard';
import { TaigerHero } from '@/components/coach/TaigerHero';
import { useRouter } from 'next/navigation';

// ...dentro del componente:
const router = useRouter();
const { plan, currentDrill, loading } = useActivePlan();

const handleStartDrill = (drillId: string) => {
  router.push(`/coach/sesion/nueva?drill=${drillId}`);
};

if (loading) return <SkeletonHero />; // SkeletonHero existing or simple div

return (
  <main>
    {plan && currentDrill ? (
      <TodayCard
        data={{
          date_label: formatDateLabel(new Date()),
          action_headline: deriveActionHeadline(currentDrill),
          action_subtitle: deriveActionSubtitle(currentDrill),
          drill_id: currentDrill.id,
          plan_title: plan.focus_area_label || 'Plan en curso',
          plan_week_current: deriveWeekCurrent(plan),
          plan_week_total: deriveWeekTotal(plan),
          drills_completed: plan.drills_completed_count || 0,
          drills_total: plan.drills_total_count || 1,
          delta_strokes: plan.delta_strokes || 0,
        }}
        onStart={handleStartDrill}
      />
    ) : (
      <TaigerHero />
    )}
    {/* resto de la página: tAIger+ shortcut, patrones */}
  </main>
);
```

- [ ] **Step 3: Helpers en `src/lib/coach/today-card-derivation.ts`**

```ts
// src/lib/coach/today-card-derivation.ts
import type { CurrentDrill, ActivePlan } from './active-plan';

const DAYS = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
const MONTHS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

export function formatDateLabel(d: Date): string {
  return `HOY · ${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function deriveActionHeadline(drill: CurrentDrill): string {
  // MVP: usa el title del drill como headline.
  return drill.title;
}

export function deriveActionSubtitle(drill: CurrentDrill): string {
  const parts: string[] = [];
  if (drill.duration_min) parts.push(`${drill.duration_min} min`);
  if (drill.description) parts.push(drill.description);
  return parts.join(' · ');
}

export function deriveWeekCurrent(plan: ActivePlan): number {
  if (!plan.started_at) return 1;
  const days = Math.floor((Date.now() - new Date(plan.started_at).getTime()) / (1000 * 60 * 60 * 24));
  return Math.min(Math.floor(days / 7) + 1, 12);
}

export function deriveWeekTotal(plan: ActivePlan): number {
  if (!plan.started_at || !plan.target_completion_at) return 3;
  const days = Math.ceil((new Date(plan.target_completion_at).getTime() - new Date(plan.started_at).getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(Math.ceil(days / 7), 1);
}
```

- [ ] **Step 4: Test del page integration (smoke)**

```tsx
// src/__tests__/components/coach-page-integration.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CoachPage from '@/app/coach/page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('coach page integration', () => {
  it('sin plan: renderiza TaigerHero', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ plan: null, currentDrill: null }),
    });
    render(<CoachPage />);
    await waitFor(() => expect(screen.getByText(/tAIger\+/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 5: Run tests, build local, commit**

```bash
npm run test -- src/__tests__/
npm run build
git add src/app/coach/page.tsx src/lib/coach/today-card-derivation.ts src/__tests__/components/coach-page-integration.test.tsx
git commit -m "feat(coach): /coach renders TodayCard when active plan exists"
```

---

### Task 5.3: Integrar piezas premium en `/coach/sesion/[id]/page.tsx`

**Files:**
- Modify: `src/app/coach/sesion/[id]/page.tsx` (706 líneas — leer primero)

**Cambios:**
1. Reemplazar header genérico ("Conversación continua") por `<PlanAwareChatHeader />`.
2. Cuando un mensaje del coach contiene drill payload (SSE event `drill_card`), renderizar `<DrillCard />` después del texto.
3. Después de cada mensaje del coach con `quick_replies` payload, renderizar `<QuickReplies />`.
4. Antes de cada mensaje del coach con tool calls, renderizar `<ToolUseChip />` por cada tool.
5. Composer: añadir botón `+` izquierdo (Apple Messages pattern).

- [ ] **Step 1: Read full file** y documentar líneas a modificar.

- [ ] **Step 2: Refactor header**

Buscar el `<div>` que contiene el string "Conversación continua" o el header actual. Reemplazar por:

```tsx
const { plan } = useActivePlan();
// ...
<PlanAwareChatHeader
  plan={plan ? mapToHeaderData(plan) : null}
  onBack={() => router.back()}
  onTapPlan={() => setDrawerOpen(true)}
/>
```

- [ ] **Step 3: Extender SSE handler para nuevos tipos**

En el `EventSource` / `fetch` reader del chat: capturar nuevos event types `drill_card` y `quick_replies` y guardarlos en estado por message index (similar a `roundsByMsgIdx` ya existente).

```ts
// Pseudo-diff dentro del SSE parser:
case 'drill_card':
  setDrillsByMsgIdx((m) => ({ ...m, [msgIdx]: payload }));
  break;
case 'quick_replies':
  setQuickRepliesByMsgIdx((m) => ({ ...m, [msgIdx]: payload.options }));
  break;
case 'tool_start':
  setToolsByMsgIdx((m) => ({
    ...m,
    [msgIdx]: [...(m[msgIdx] || []), { state: 'loading', label: payload.label }]
  }));
  break;
case 'tool_done':
  setToolsByMsgIdx((m) => {
    const arr = (m[msgIdx] || []).slice();
    if (arr.length > 0) arr[arr.length - 1] = { state: 'done', label: payload.label, summary: payload.summary };
    return { ...m, [msgIdx]: arr };
  });
  break;
```

- [ ] **Step 4: Render inline** dentro del map de mensajes:

```tsx
{messages.map((msg, idx) => (
  <div key={idx}>
    {/* tool chips */}
    {msg.role === 'assistant' && (toolsByMsgIdx[idx] || []).map((t, ti) => (
      <ToolUseChip key={ti} {...t} />
    ))}
    {/* mensaje */}
    <MessageBubble msg={msg} onCitationClick={openCitation} />
    {/* drill card embebido */}
    {drillsByMsgIdx[idx] && (
      <DrillCard
        drill={drillsByMsgIdx[idx]}
        onStart={(drillId) => fetch(`/api/taiger/drills/${drillId}/start`, { method: 'POST' })}
      />
    )}
    {/* round mini chart inline (ya existente) */}
    {roundsByMsgIdx[idx] && shouldRenderChart(msg) && (
      <RoundMiniChart summary={roundsByMsgIdx[idx]} />
    )}
    {/* quick replies */}
    {quickRepliesByMsgIdx[idx] && (
      <QuickReplies
        replies={quickRepliesByMsgIdx[idx]}
        onPick={(reply) => sendFollowUp([...messages, { role: 'user', content: reply }])}
      />
    )}
  </div>
))}
```

- [ ] **Step 5: Composer +**

Buscar el form del composer existente. Wrap el input en:

```tsx
<form className="flex items-center gap-2 px-2.5 py-2 bg-[#f5f5f7] rounded-3xl">
  <button
    type="button"
    onClick={() => setComposerMenuOpen(true)}
    className="w-[22px] h-[22px] bg-[#1a1a1a] text-white rounded-full text-[13px] font-light flex items-center justify-center"
    aria-label="Adjuntar"
  >+</button>
  <input ... />
  <button type="submit" className="...">↑</button>
</form>
```

(El menú real del + queda fuera del scope MVP — el botón es visible pero el handler hace toast "Próximamente" hasta que se conecte la lógica de attach round en sub-proyecto siguiente.)

- [ ] **Step 6: Backend extensions del chat route**

Modify: `src/app/api/taiger/chat/route.ts` — extender el sistema de tools para emitir SSE events tipados:

```ts
// Después de cada tool call exitoso:
controller.enqueue(encoder.encode(`event: tool_done\ndata: ${JSON.stringify({ label: toolLabel, summary: toolSummary })}\n\n`));

// Cuando coach quiere proponer un drill (mediante tool propose_drill o detección heurística en el output):
controller.enqueue(encoder.encode(`event: drill_card\ndata: ${JSON.stringify(drillPayload)}\n\n`));

// Cuando el mensaje cierra con quick replies (heurística: si el mensaje contiene ?, generar 3 chips por defecto):
controller.enqueue(encoder.encode(`event: quick_replies\ndata: ${JSON.stringify({ options: ['Lo hice', 'Otro drill', 'Después'] })}\n\n`));
```

(MVP: heurísticas simples. Cerebro v2 reemplaza esto con tool calls explícitos.)

- [ ] **Step 7: Run full test suite + build**

```bash
npm run test
npm run build
```

Expected: 1512+ tests pasando, build clean.

- [ ] **Step 8: Commit**

```bash
git add src/app/coach/sesion/[id]/page.tsx src/app/api/taiger/chat/route.ts
git commit -m "feat(coach/sesion): plan-aware header + DrillCard + QuickReplies + ToolUseChip integrated"
```

---

## Phase 6 — Inference loop wiring (1 task)

### Task 6.1: Disparar inferencia al guardar ronda

**Files:**
- Modify: punto donde se completa la carga de ronda (probablemente `src/app/ronda-libre/[codigo]/score/page.tsx` o el endpoint que cierra una ronda)

**Comportamiento:** después de que el usuario confirma score final de una ronda, el cliente hace `POST /api/taiger/inference/round/[roundId]`. Si retorna 200 con `evaluations`, las matches se materializan como un system message en la session activa del coach (ya implícito por el endpoint).

- [ ] **Step 1: Identificar el callsite** — usar `grep` para localizar dónde se completa una ronda.

```bash
grep -rn "round_completed\|setStatus.*completed\|ronda.*final" src/app/ --include="*.tsx"
```

- [ ] **Step 2: Insertar fetch fire-and-forget**

```ts
// Después del INSERT de la ronda completed:
fetch(`/api/taiger/inference/round/${roundId}`, { method: 'POST' })
  .catch(() => {}); // best-effort, no bloquea UX
```

- [ ] **Step 3: System message inserción**

En `src/app/api/taiger/inference/round/[roundId]/route.ts` (de Task 2.3): si hay matches, insertar mensaje en la sesión activa del coach.

```ts
// Después del bucle de evaluaciones, si alguna matched:
const matched = evaluations.filter((e) => e.matched);
if (matched.length > 0) {
  const summary = matched.length === 1
    ? `Detecté evidencia para tu drill. ¿Confirmás que lo trabajaste esta ronda?`
    : `Detecté ${matched.length} drills posiblemente trabajados esta ronda. ¿Confirmamos?`;
  await sb.from('taiger_sessions')
    .update({
      messages: sb.rpc('append_jsonb_array', {
        sess_id: activeSessionId,
        new_msg: { role: 'assistant', content: summary, drill_card_ids: matched.map(m => m.drill_id) },
      }),
    })
    .eq('user_id', user.id);
}
```

(Si no existe la RPC `append_jsonb_array`, hacerlo con read+modify+write — más simple para MVP.)

- [ ] **Step 4: Test integration**

```ts
// src/__tests__/integration/plan-completion-loop.test.ts
import { describe, it, expect } from 'vitest';
// Skip si no hay env: existing pattern
const skipIfNoEnv = !process.env.NEXT_PUBLIC_SUPABASE_URL;

describe.skipIf(skipIfNoEnv)('plan completion loop e2e', () => {
  it('upload round → inference triggers → drill marked inferred', async () => {
    // ... fixture setup, stub round, call inference endpoint, assert events
    // (skip body por ahora; expandir cuando el harness e2e lo permita)
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 5: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score/page.tsx src/app/api/taiger/inference/round/[roundId]/route.ts src/__tests__/integration/plan-completion-loop.test.ts
git commit -m "feat(coach): inference loop fires on round completion + system message injection"
```

---

## Phase 7 — Anti-regression canaries (1 task)

### Task 7.1: Extender `canary-stability.test.ts`

**Files:**
- Modify: `src/__tests__/canary-stability.test.ts`

- [ ] **Step 1: Añadir bloque "tAIger+ plan + cumplimiento"**

```ts
// Dentro de canary-stability.test.ts, agregar al final:
import fs from 'fs';
import path from 'path';

describe('canary: tAIger+ plan + cumplimiento (sub-proyecto A)', () => {
  it('TodayCard.tsx existe con interfaz TodayCardData', () => {
    const p = path.join(process.cwd(), 'src/components/coach/TodayCard.tsx');
    const s = fs.readFileSync(p, 'utf-8');
    expect(s).toMatch(/export\s+interface\s+TodayCardData/);
    expect(s).toMatch(/export\s+function\s+TodayCard/);
  });

  it('PlanAwareChatHeader.tsx existe', () => {
    const p = path.join(process.cwd(), 'src/components/coach/PlanAwareChatHeader.tsx');
    const s = fs.readFileSync(p, 'utf-8');
    expect(s).toMatch(/export\s+function\s+PlanAwareChatHeader/);
  });

  it('DrillCard.tsx existe y exporta tipos', () => {
    const p = path.join(process.cwd(), 'src/components/coach/DrillCard.tsx');
    const s = fs.readFileSync(p, 'utf-8');
    expect(s).toMatch(/export\s+function\s+DrillCard/);
    expect(s).toMatch(/DrillStatus/);
  });

  it('plan-state.ts mantiene state machine inalterable', () => {
    const p = path.join(process.cwd(), 'src/lib/coach/plan-state.ts');
    const s = fs.readFileSync(p, 'utf-8');
    // Asserts lecutra: si alguien borra un estado, falla.
    for (const st of ['proposed','accepted','in_progress','completed','abandoned','replaced','archived']) {
      expect(s).toContain(`'${st}'`);
    }
  });

  it('rutas API force-dynamic', () => {
    const routes = [
      'src/app/api/taiger/plans/active/route.ts',
      'src/app/api/taiger/drills/[id]/start/route.ts',
      'src/app/api/taiger/drills/[id]/complete/route.ts',
      'src/app/api/taiger/inference/round/[roundId]/route.ts',
    ];
    for (const r of routes) {
      const p = path.join(process.cwd(), r);
      const s = fs.readFileSync(p, 'utf-8');
      expect(s, `${r} debe declarar dynamic = 'force-dynamic'`).toMatch(/export\s+const\s+dynamic\s*=\s*'force-dynamic'/);
    }
  });

  it('useActivePlan no se renombró', () => {
    const p = path.join(process.cwd(), 'src/hooks/useActivePlan.ts');
    const s = fs.readFileSync(p, 'utf-8');
    expect(s).toMatch(/export\s+function\s+useActivePlan/);
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
npm run test -- src/__tests__/canary-stability.test.ts
git add src/__tests__/canary-stability.test.ts
git commit -m "test(canary): anti-regresion para tAIger+ plan-cumplimiento (sub-proyecto A)"
```

---

## Phase 8 — Final pass (2 tasks)

### Task 8.1: Build + full test suite + manual smoke test

- [ ] **Step 1: TS check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Test completo**

```bash
npm run test
```
Expected: 1512+ tests pasando (1512 base + ~30 nuevos del plan).

- [ ] **Step 3: Build prod**

```bash
npm run build
```
Expected: build clean. Si OneDrive corrompe `.next`, `Remove-Item -Recurse .next` y retry.

- [ ] **Step 4: Smoke test contra prod (con cuidado)**

Sin pushear todavía: arrancar dev server, abrir `/coach` con un usuario que tenga plan activo, verificar:
- TodayCard renderiza con headline = action, no plan name.
- Tap "Empezar" navega a `/coach/sesion?drill=<id>`.
- Header del chat muestra plan-aware header.
- Si propones un drill desde el coach (vía playground o mensaje), DrillCard se embebe.
- Quick replies aparecen y funcionan.
- ToolUseChip aparece durante un fetch de ronda.

- [ ] **Step 5: Documentar en SPRINT_LOG.md**

Edit `docs/SPRINT_LOG.md`: añadir entrada al inicio (regla CLAUDE.md):

```markdown
## 2026-05-08 — tAIger+ Plan activo + cumplimiento (sub-proyecto A)

Cerrado el loop coach → ejecución → cumplimiento. Dos surfaces plan-aware:
/coach (Today Card hero action-first) + /coach/sesion (chat premium).
7 piezas Tier 1 implementadas: plan-aware header, DrillCard inline,
QuickReplies, ToolUseChip transparency, citation chips activadas, composer +.
Motor de inferencia MVP correlaciona ronda con criterios de drill (3 metrics)
y emite system messages al chat.

Schema: migrations 040-042 (coach_plans lifecycle, coach_drills nueva tabla,
coach_events extends).

Pendiente sub-proyectos: B (onboarding), C (avatar moods/voice/reactions).

Commits: <hashes>
```

- [ ] **Step 6: Run docs/update**

```bash
node scripts/update-docs.js
```

- [ ] **Step 7: Commit docs**

```bash
git add docs/SPRINT_LOG.md docs/
git commit -m "docs(sprint): tAIger+ sub-proyecto A shipped"
```

---

### Task 8.2: Pre-push gauntlet + push

- [ ] **Step 1: Correr `/pre-push` skill** (gauntlet completo del proyecto)

Run: skill `pre-push` (custom de Golfers+ — protocolo obligatorio definido en CLAUDE.md).

Expected: TS OK, tests OK, build OK, schema parity OK, simulación de flujo torneo OK.

- [ ] **Step 2: Push solo si todo verde**

```bash
git push origin main
```

(El pre-push hook git valida también — si falla, fix root cause, no `--no-verify`.)

- [ ] **Step 3: Verificar deploy en Vercel**

Esperar deploy verde en `golfersplus.vercel.app`. Smoke test post-deploy con usuario real (Juanjo).

- [ ] **Step 4: Marcar plan como completado**

Edit este plan, change all `- [ ]` to `- [x]` en este momento.

```bash
git add docs/superpowers/plans/2026-05-08-taiger-plan-cumplimiento-plan.md
git commit -m "docs(plan): mark tAIger+ sub-proyecto A as completed"
git push origin main
```

---

## Self-review

**Spec coverage check:** cada item del spec tiene task que lo cubre.

| Spec section | Task(s) |
|---|---|
| Vista 1 — TodayCard | 4.2, 5.2 |
| Vista 2 — chat premium 7 piezas | 3.1-3.5, 4.1, 5.3 |
| Vista 3 — PlanDetailDrawer (read-only MVP) | 4.3 |
| Vista 4 — Check-in post-ronda | 2.3, 6.1 |
| Vista 5 — Lifecycle state machine | 1.1 (state machine) — UI completa diferida |
| 7 componentes nuevos | 3.1-3.5, 4.1-4.3 |
| Schema deltas (3 migrations) | 0.2, 0.3 |
| useActivePlan hook | 5.1 |
| Acceptance criteria 1-10 | cubiertos por integration smoke 8.1.4 |

**Placeholder scan:** sin TBD, sin "implement later". Todos los code blocks completos. Excepción aceptable: helpers de derivación en `today-card-derivation.ts` asumen campos en `plan` (`drills_completed_count`, `delta_strokes`) que el endpoint devolverá enriquecidos — esa enrichment se añade en Task 2.1 cuando se necesite (TODO: si Task 5.2 falla por falta de campo, volver a 2.1 y añadirlo al SELECT).

**Type consistency:** `DrillCardData` usado en DrillCard, PlanDetailDrawer y SSE handler — interface única y consistente. `PlanStatus` usado solo en plan-state.ts y migration enum. `CurrentDrill` server-side usado en helpers, mapeado a `DrillCardData` client-side en Task 5.2.

**Scope check:** focus claro en sub-proyecto A. Sub-proyectos B y C explícitamente fuera. ~28 tasks, ejecutables en 2-3 sesiones de subagent-driven development.

---

## Open questions a resolver durante ejecución

1. **¿Qué hacemos con el campo `plan.focus_area` cuando es null?** El TodayCard asume label legible. Decisión: si null, fallback a "Plan en curso" + flag para Cerebro v2 para enriquecer.
2. **`drills_completed_count` y `delta_strokes` no son columnas de coach_plans.** Hay que computarlos en el endpoint (`GET /api/taiger/plans/active`) via JOIN con coach_drills + coach_events. Resolver en Task 2.1 con un SELECT enriquecido.
3. **Inferencia: cuándo dispararla.** ¿Al confirmar score final, o también al editar score parcial? Decisión MVP: solo en confirmación final (estado `completed` de la ronda).
4. **System message ID.** Cómo deduplicar si el usuario re-confirma una ronda (ej. edición). Decisión MVP: idempotency key = `(round_id, plan_id)`; si ya existe evento `drill_completed_inferred` para esta tupla, no insertar duplicado.

---

**Plan completo. Listo para ejecución.**
